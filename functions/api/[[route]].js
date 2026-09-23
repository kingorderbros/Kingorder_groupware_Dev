/**
 * 법인차량 API — Cloudflare Pages Functions (개발환경 · 2026-09-16)
 *
 * 시연본의 server.js(Node · data/*.json 파일 저장)를 그대로 옮겼습니다. 저장은 Supabase 표 두 개에 합니다.
 *   vehicle_logs(id text pk, data jsonb)          운행일지
 *   vehicle_reservations(id text pk, data jsonb)  차량 예약
 * 차량 · 운전자 목록은 화면이 저장소(app_store)에 둔 값(gwVehicles.v1 · gwUsers.v1)을 읽습니다 — 서버에 따로 박아 두지 않습니다.
 *
 * 환경변수 (Cloudflare Pages › Settings › Environment variables · 로컬은 .dev.vars)
 *   SUPABASE_URL                Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY   service_role 키 — **서버에서만** 씁니다. 브라우저 설정(app-config.js)에 넣지 않습니다.
 *
 * 엔드포인트 (server.js 와 같음)
 *   GET  /api/health
 *   GET  /api/vehicles                     GET /api/drivers[?reservedOnly=1]
 *   GET  /api/reservations[?driver=이름]   POST /api/reservations   POST /api/reservations/action
 *   GET  /api/vehicle-logs[?status=&driver=]  POST /api/vehicle-logs   POST /api/vehicle-logs/complete
 *
 * 로그인 계정 관리 (2026-09-16 · Supabase Auth 관리자 API — service_role 이 필요해 서버에서만)
 *   GET    /api/auth/status      아직 로그인 계정이 하나도 없는지 (처음 설정 안내용)
 *   POST   /api/auth/bootstrap   { email }             계정이 하나도 없을 때만 — 첫 관리자 계정 + 임시 비밀번호
 *   POST   /api/auth/users       { email, name }       계정 만들기 · 이미 있으면 임시 비밀번호로 초기화 → { password }
 *   PATCH  /api/auth/users       { email, newEmail, name }  로그인 이메일 · 이름 변경
 *   DELETE /api/auth/users       { email }             계정 삭제
 *   bootstrap · status 를 뺀 나머지는 **관리자 그룹 로그인 토큰**(Authorization: Bearer) 이 있어야 합니다.
 *   임시 비밀번호로 만든 계정은 user_metadata.must_change_password = true 라 첫 로그인 때 바꾸게 됩니다.
 *
 * 구글 캘린더 연동 (2026-09-23 · 자세한 것은 _gcal.js)
 *   GET  /api/calendar/callback    구글이 허용을 마치고 되돌아오는 곳 (로그인 토큰 없음 — state 로 확인)
 *   GET  /api/calendar/status      연결 상태 · 캘린더 준비 정도 · 구글 주소가 없는 직원
 *   POST /api/calendar/connect     허용 화면 주소 만들기 → 화면이 새 창으로 엽니다
 *   POST /api/calendar/disconnect  연결 끊기 (구글의 캘린더·일정은 그대로 둡니다)
 *   POST /api/calendar/setup       캘린더 만들기 · 직원에게 공유 — { limit } 만큼씩 나눠서
 *   callback 을 뺀 나머지는 관리자만 (requireAdmin).
 *   환경변수 GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET 이 더 필요합니다.
 */

import * as gcal from './_gcal.js';

const ACTIVE_RESERVE_STATUSES = ['신청완료', '승인대기중', '승인완료', '반납요청'];
const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v) || 0);
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const bad = (msg) => json(400, { ok: false, error: msg });

// ---------- Supabase REST (PostgREST) — 의존성 없이 fetch 로 ----------
function db(env) {
    const base = str(env.SUPABASE_URL).replace(/\/+$/, '');
    const key = str(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!base || !key) throw new Error('SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const call = async (method, path, body, extra) => {
        const res = await fetch(`${base}/rest/v1/${path}`, { method, headers: Object.assign({}, headers, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) });
        if (!res.ok) throw new Error(`Supabase ${method} ${path} → ${res.status} ${await res.text()}`);
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    };
    return {
        rows: async (table) => (await call('GET', `${table}?select=id,data&order=id.asc`)).map(r => Object.assign({ id: r.id }, r.data)),
        upsert: (table, id, data) => call('POST', table, [{ id, data }], { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        storeValue: async (key) => { const r = await call('GET', `app_store?select=value&key=eq.${encodeURIComponent(key)}`); return r && r[0] ? r[0].value : null; }
    };
}
// ---------- Supabase Auth 관리자 API (GoTrue /auth/v1/admin) ----------
function authAdmin(env) {
    const base = str(env.SUPABASE_URL).replace(/\/+$/, '');
    const key = str(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!base || !key) throw new Error('SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const call = async (method, path, body) => {
        const res = await fetch(`${base}/auth/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await res.text();
        let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
        if (!res.ok) { const e = new Error((data && (data.msg || data.message || data.error_description || data.error)) || `Supabase Auth ${method} ${path} → ${res.status}`); e.status = res.status; throw e; }
        return data;
    };
    const findByEmail = async (email) => {
        const want = str(email).toLowerCase();
        for (let page = 1; page <= 25; page++) {                 // 사내 계정은 수십 명 — 페이지를 훑어도 충분합니다
            const r = await call('GET', `/admin/users?page=${page}&per_page=200`);
            const users = (r && r.users) || [];
            const hit = users.find(u => str(u.email).toLowerCase() === want);
            if (hit) return hit;
            if (users.length < 200) return null;
        }
        return null;
    };
    return {
        call, findByEmail,
        isEmpty: async () => { const r = await call('GET', '/admin/users?page=1&per_page=1'); return !((r && r.users) || []).length; },
        // 지금 요청을 보낸 사람 — 브라우저가 보낸 로그인 토큰으로 확인합니다
        whoami: async (request) => {
            const token = str(request.headers.get('Authorization')).replace(/^Bearer\s+/i, '');
            if (!token) return null;
            const res = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
            if (!res.ok) return null;
            const u = await res.json();
            return u && u.email ? u : null;
        }
    };
}
// 임시 비밀번호 — 화면(js/kob-auth.js)과 같은 규칙. 헷갈리는 글자(0 O o l 1 I) 제외, 영문+숫자 10자
function tempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const a = new Uint32Array(10); crypto.getRandomValues(a);
    let pw = Array.from(a, n => chars[n % chars.length]).join('');
    if (!/[0-9]/.test(pw)) pw = pw.slice(0, 9) + '7';
    if (!/[A-Za-z]/.test(pw)) pw = 'k' + pw.slice(1);
    return pw;
}
// 관리자 그룹 · 소속없는 관리자 · 직책 관리자 · 겸직 관리자 — /api/auth/users 와 같은 기준 (2026-09-21)
async function requireAdmin(env, store, request) {
    const me = await authAdmin(env).whoami(request);
    if (!me) return { error: json(401, { ok: false, error: '로그인이 필요합니다.' }) };
    const users = (await store.storeValue('gwUsers.v1')) || [];
    const rec = (Array.isArray(users) ? users : []).find(u => str(u.email).toLowerCase() === str(me.email).toLowerCase());
    const ok = rec && (rec.groupId === 'admin' || rec.dept === 'admin' || rec.level === 'admin' || rec.isAdmin === true);
    if (!ok) return { error: json(403, { ok: false, error: '관리자만 할 수 있습니다.' }) };
    return { me, rec, users: Array.isArray(users) ? users : [] };
}

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(e));

const escapeForHtml = (v) => str(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 구글에 있어야 할 캘린더 목록을 셉니다 — 화면의 CALENDARS 구성과 같은 축입니다.
//   공유 3종(전사 · 영업진행 · 설치A/S) + 부서마다 1개 + 구글 주소가 있는 직원마다 1개
const GCAL_HIDDEN_DEPTS = ['vendor', 'admin', 'company'];
const googleAddrOf = (u) => str(u && u.googleEmail).toLowerCase();
function calendarPlan(users, depts) {
    const people = (users || []).filter(u => str(u.dept) !== 'vendor');
    const everyone = people.map(googleAddrOf).filter(Boolean);
    const missingGoogle = people.filter(u => !googleAddrOf(u)).map(u => ({ name: str(u.name), email: str(u.email) }));
    const wanted = [
        { key: 'cal:company', kind: 'company', label: '킹오더 전사일정', shareTo: everyone },
        { key: 'cal:sales-share', kind: 'sales-share', label: '킹오더 영업일정·진행상황', shareTo: everyone },
        { key: 'cal:install-as', kind: 'install-as', label: '킹오더 설치·A/S 일정', shareTo: everyone }
    ];
    (depts || []).filter(d => !GCAL_HIDDEN_DEPTS.includes(str(d.id))).forEach(d => {
        wanted.push({
            key: 'cal:team:' + str(d.id), kind: 'team', dept: str(d.id),
            label: '킹오더 ' + str(d.name) + ' 일정',
            shareTo: people.filter(u => str(u.dept) === str(d.id)).map(googleAddrOf).filter(Boolean)
        });
    });
    people.forEach(u => {
        const addr = googleAddrOf(u);
        if (!addr) return;
        wanted.push({
            key: 'cal:personal:' + str(u.email).toLowerCase(), kind: 'personal', member: str(u.email).toLowerCase(),
            label: '킹오더 일정 – ' + str(u.name), shareTo: [addr]
        });
    });
    return { wanted, missingGoogle };
}

const nextId = (rows, prefix, width) => {
    const max = rows.reduce((m, r) => Math.max(m, parseInt(String(r.id).replace(/\D/g, ''), 10) || 0), 0);
    return prefix + String(max + 1).padStart(width, '0');
};

// ---------- 운행일지 정리 (server.js normalizeLog 그대로) ----------
function computeStatus(endKm) { return endKm > 0 ? '완료' : '진행중'; }
function normalizeLog(input, id) {
    const date = str(input.date), vehicle = str(input.vehicle), driver = str(input.driver);
    if (!date) throw new Error('운행일자(date)는 필수입니다.');
    if (!vehicle) throw new Error('차량(vehicle)은 필수입니다.');
    if (!driver) throw new Error('운전자(driver)는 필수입니다.');
    const from = str(input.from), to = str(input.to);
    if (!from) throw new Error('출발지(from)는 필수입니다.');
    if (!to) throw new Error('도착지(to)는 필수입니다.');
    const startKm = num(input.startKm), endKm = num(input.endKm);
    if (!(startKm > 0)) throw new Error('출발 주행거리(startKm)는 필수입니다.');
    if (endKm && startKm && endKm < startKm) throw new Error('도착 주행거리는 출발보다 작을 수 없습니다.');
    const status = computeStatus(endKm);
    return {
        id, date, vehicle, driver, from, to, startKm, endKm,
        departTime: str(input.departTime), arriveTime: str(input.arriveTime),
        passengers: str(input.passengers), fuel: num(input.fuel), toll: num(input.toll), memo: str(input.memo),
        status,
        source: (str(input.source) === 'direct') ? 'direct' : 'mobile',   // 모바일 입력 / 관리자 직접 입력
        createdAt: new Date().toISOString(),
        completedAt: status === '완료' ? new Date().toISOString() : ''
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    const method = request.method;
    const body = async () => { try { return await request.json(); } catch (e) { return {}; } };

    if (path === '/api/health') return json(200, { ok: true, time: new Date().toISOString(), env: env.KOB_ENV || 'dev' });

    let store;
    try { store = db(env); } catch (e) { return json(500, { ok: false, error: e.message }); }

    try {
        // ---------- 로그인 계정 ----------
        if (path.startsWith('/api/auth/')) {
            const auth = authAdmin(env);
            if (path === '/api/auth/status' && method === 'GET') {
                return json(200, { ok: true, empty: await auth.isEmpty() });
            }
            if (path === '/api/auth/bootstrap' && method === 'POST') {
                // 계정이 하나도 없을 때 한 번만 — 화면의 관리자(gwUsers.v1 의 dept 'admin') 이메일로 첫 계정을 만듭니다
                const input = await body();
                const email = str(input.email).toLowerCase();
                if (!validEmail(email)) return bad('이메일 형식이 아닙니다.');
                if (!(await auth.isEmpty())) return json(409, { ok: false, error: '처음 설정은 이미 끝났습니다. 로그인해 주세요.' });
                const users = (await store.storeValue('gwUsers.v1')) || [];
                const rec = (Array.isArray(users) ? users : []).find(u => str(u.email).toLowerCase() === email);
                if (!rec || rec.groupId !== 'admin') return json(403, { ok: false, error: '관리자 그룹 계정의 이메일만 처음 설정에 쓸 수 있습니다.' });
                const password = tempPassword();
                await auth.call('POST', '/admin/users', { email, password, email_confirm: true, user_metadata: { name: str(rec.name), must_change_password: true } });
                return json(200, { ok: true, password });
            }
            if (path === '/api/auth/users') {
                // 관리자 그룹(gwUsers.v1 의 groupId 'admin') 으로 로그인한 사람만
                const me = await auth.whoami(request);
                if (!me) return json(401, { ok: false, error: '로그인이 필요합니다.' });
                const users = (await store.storeValue('gwUsers.v1')) || [];
                const meRec = (Array.isArray(users) ? users : []).find(u => str(u.email).toLowerCase() === str(me.email).toLowerCase());
                // 관리자 그룹, 소속 없는 관리자 계정(dept 'admin'), 직책 관리자, 겸직 관리자(isAdmin) 모두 됩니다 (2026-09-21)
                const meAdmin = meRec && (meRec.groupId === 'admin' || meRec.dept === 'admin' || meRec.level === 'admin' || meRec.isAdmin === true);
                if (!meAdmin) return json(403, { ok: false, error: '관리자만 계정을 관리할 수 있습니다.' });

                const input = await body();
                const email = str(input.email).toLowerCase();
                if (!validEmail(email)) return bad('이메일 형식이 아닙니다.');
                const existing = await auth.findByEmail(email);

                if (method === 'POST') {
                    // 만들기 — 이미 있으면 임시 비밀번호로 초기화 (비밀번호 초기화 버튼도 이 길을 씁니다)
                    const password = tempPassword();
                    const meta = Object.assign({}, existing ? existing.user_metadata : {}, { name: str(input.name), must_change_password: true });
                    if (existing) await auth.call('PUT', `/admin/users/${existing.id}`, { password, email_confirm: true, user_metadata: meta });
                    else await auth.call('POST', '/admin/users', { email, password, email_confirm: true, user_metadata: meta });
                    return json(200, { ok: true, password, created: !existing });
                }
                if (method === 'PATCH') {
                    if (!existing) return json(200, { ok: true, existed: false });   // 아직 비밀번호를 발급하지 않은 계정 — 바꿀 것이 없습니다
                    const newEmail = str(input.newEmail).toLowerCase();
                    const patch = { user_metadata: Object.assign({}, existing.user_metadata, { name: str(input.name) }) };
                    if (newEmail && newEmail !== email) {
                        if (!validEmail(newEmail)) return bad('새 이메일 형식이 아닙니다.');
                        if (await auth.findByEmail(newEmail)) return bad('이미 다른 계정이 쓰는 이메일입니다.');
                        patch.email = newEmail; patch.email_confirm = true;
                    }
                    await auth.call('PUT', `/admin/users/${existing.id}`, patch);
                    return json(200, { ok: true, existed: true });
                }
                if (method === 'DELETE') {
                    if (str(me.email).toLowerCase() === email) return bad('지금 로그인한 본인 계정은 지울 수 없습니다.');
                    if (existing) await auth.call('DELETE', `/admin/users/${existing.id}`);
                    return json(200, { ok: true, existed: !!existing });
                }
            }
            return json(404, { ok: false, error: '없는 주소입니다: ' + path });
        }

        // ---------- 구글 캘린더 연동 (2026-09-23) ----------
        if (path.startsWith('/api/calendar/')) {
            const g = gcal.gcalStore(env);

            // 구글이 허용을 마치고 되돌아오는 곳 — 로그인 토큰이 없으므로 state 로 확인합니다
            if (path === '/api/calendar/callback' && method === 'GET') {
                const page = (title, msg, ok) => new Response(
                    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>` +
                    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
                    `<style>body{font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;padding:40px;text-align:center;color:#1f2937}` +
                    `h1{font-size:20px;margin:0 0 12px}p{color:#6b7280;line-height:1.7}` +
                    `.m{font-size:48px}b{color:${ok ? '#059669' : '#dc2626'}}</style></head>` +
                    `<body><div class="m">${ok ? '&#9989;' : '&#9888;&#65039;'}</div><h1><b>${title}</b></h1><p>${msg}</p>` +
                    `<p><button onclick="window.close()" style="padding:10px 20px;font-size:15px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer">창 닫기</button></p>` +
                    `</body></html>`,
                    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

                const err = url.searchParams.get('error');
                if (err) return page('연결하지 못했습니다', `구글에서 허용하지 않았습니다 (${escapeForHtml(err)}). 그룹웨어에서 다시 눌러 주세요.`, false);
                const code = str(url.searchParams.get('code'));
                const state = str(url.searchParams.get('state'));
                if (!code || !state) return page('연결하지 못했습니다', '필요한 값이 오지 않았습니다. 그룹웨어에서 다시 눌러 주세요.', false);

                const saved = await g.takeState();
                if (!saved || saved.refresh_token !== state) return page('연결하지 못했습니다', '연결 요청을 확인하지 못했습니다. 그룹웨어에서 다시 눌러 주세요.', false);
                if (Date.now() - new Date(saved.connected_at).getTime() > 10 * 60 * 1000) return page('시간이 지났습니다', '연결 요청은 10분 안에 끝내야 합니다. 그룹웨어에서 다시 눌러 주세요.', false);

                let tok;
                try { tok = await gcal.exchangeCode(env, gcal.redirectUriOf(request), code); }
                catch (e) { return page('연결하지 못했습니다', escapeForHtml(e.message), false); }
                if (!tok.refresh_token) return page('연결하지 못했습니다', '구글이 다시 들어갈 증서를 주지 않았습니다. 구글 계정 › 보안 › 서드파티 앱에서 이 앱의 권한을 지운 뒤 다시 시도해 주세요.', false);

                // 어느 계정으로 허용했는지 확인합니다
                let who = '';
                try {
                    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } });
                    if (r.ok) who = str((await r.json()).email);
                } catch (e) { /* 주소를 못 읽어도 연결 자체는 됩니다 */ }

                await g.saveAccount({ google_email: who, refresh_token: tok.refresh_token, scope: str(tok.scope), connected_by: str(saved.connected_by), connected_at: new Date().toISOString(), last_error: null });
                gcal.forgetToken();
                return page('구글 캘린더에 연결되었습니다', `${escapeForHtml(who || '구글 계정')} 으로 연결했습니다. 이 창을 닫고 그룹웨어로 돌아가 주세요.`, true);
            }

            // 보내기 — 관리자만이 아니라 **로그인한 사람이면** 됩니다. 일정을 저장한 직후 화면이 부릅니다.
            // 누가 부르든 하는 일은 같습니다(지난번 이후 바뀐 일정을 전부 훑어 보냅니다).
            if (path === '/api/calendar/push' && method === 'POST') {
                const me = await authAdmin(env).whoami(request);
                if (!me) return json(401, { ok: false, error: '로그인이 필요합니다.' });
                try {
                    const ctx = await gcal.buildContext(env, g);
                    return json(200, { ok: true, push: await gcal.syncPush(env, g, ctx) });
                } catch (e) {
                    if (e.code === 'not-connected') return json(200, { ok: true, skipped: '구글 계정이 연결되지 않았습니다.' });
                    return json(500, { ok: false, error: e.message });
                }
            }

            // 여기부터는 관리자만
            const who = await requireAdmin(env, store, request);
            if (who.error) return who.error;

            // 지금 상태 — 연결 여부 · 캘린더 몇 개 준비됐는지 · 구글 주소가 없는 직원
            if (path === '/api/calendar/status' && method === 'GET') {
                let acc = await g.account();
                if (acc && acc.refresh_token && !str(acc.google_email)) {
                    try { const em = await gcal.connectedEmail(env, g); if (em) { await g.saveAccount({ google_email: em }); acc.google_email = em; } }
                    catch (e) { /* 못 읽어도 연결 자체는 쓸 수 있습니다 */ }
                }
                const cals = (await g.calendars()) || [];
                const plan = calendarPlan(who.users, (await store.storeValue('gwOrgDepts.v1')) || []);
                const madeKeys = new Set(cals.filter(c => c.google_calendar_id).map(c => c.key));
                return json(200, {
                    ok: true,
                    configured: !!str(env.GOOGLE_CLIENT_ID),
                    connected: !!(acc && acc.refresh_token),
                    googleEmail: acc ? str(acc.google_email) : '',
                    connectedAt: acc ? acc.connected_at : null,
                    lastError: acc ? acc.last_error : null,
                    calendars: cals.map(c => ({ key: c.key, kind: c.kind, label: c.label, ready: !!c.google_calendar_id, shareState: c.share_state, error: c.last_error })),
                    planned: plan.wanted.length,
                    ready: plan.wanted.filter(w => madeKeys.has(w.key)).length,
                    missingGoogle: plan.missingGoogle
                });
            }

            // 연결 시작 — 허용 화면 주소를 만들어 돌려줍니다 (화면이 새 창으로 엽니다)
            if (path === '/api/calendar/connect' && method === 'POST') {
                if (!str(env.GOOGLE_CLIENT_ID) || !str(env.GOOGLE_CLIENT_SECRET)) {
                    return json(500, { ok: false, error: 'GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET 환경변수가 아직 없습니다. Cloudflare 설정에 넣어 주세요.' });
                }
                const state = crypto.randomUUID();
                await g.saveState(state, str(who.me.email));
                return json(200, { ok: true, url: gcal.oauthUrl(env, gcal.redirectUriOf(request), state), redirectUri: gcal.redirectUriOf(request) });
            }

            // 연결 끊기 — 증서만 지웁니다. 구글에 만든 캘린더와 일정은 그대로 둡니다.
            if (path === '/api/calendar/disconnect' && method === 'POST') {
                await g.clearAccount();
                gcal.forgetToken();
                return json(200, { ok: true });
            }

            // 캘린더 만들기 · 직원에게 공유하기 — 한 번에 다 하지 않고 나눠서 합니다
            if (path === '/api/calendar/setup' && method === 'POST') {
                const input = await body();
                const budget = Math.min(Math.max(parseInt(input.limit, 10) || 25, 1), 60);
                const depts = (await store.storeValue('gwOrgDepts.v1')) || [];
                const plan = calendarPlan(who.users, depts);
                const existing = new Map(((await g.calendars()) || []).map(c => [c.key, c]));

                const made = [], shared = [], failed = [];
                let used = 0, remaining = 0;

                for (const want of plan.wanted) {
                    if (used >= budget) { remaining++; continue; }
                    let row = existing.get(want.key);
                    try {
                        if (!row || !row.google_calendar_id) {
                            const cal = await gcal.createCalendar(env, g, want.label, '킹오더브라더스 그룹웨어가 관리하는 캘린더입니다. 그룹웨어 일정캘린더와 양쪽으로 맞춰집니다.');
                            used++;
                            row = { key: want.key, kind: want.kind, label: want.label, dept: want.dept || null, member_email: want.member || null, google_calendar_id: cal.id, share_state: 'none', last_error: null };
                            await g.saveCalendar(row);
                            existing.set(want.key, row);
                            made.push({ key: want.key, label: want.label });
                        }
                        // 공유 — 이미 공유된 사람은 건너뜁니다
                        if (used < budget && want.shareTo.length) {
                            const acl = await gcal.listAcl(env, g, row.google_calendar_id);
                            used++;
                            const have = new Set(((acl && acl.items) || []).map(i => str(i.scope && i.scope.value).toLowerCase()));
                            for (const em of want.shareTo) {
                                if (used >= budget) { remaining++; break; }
                                if (have.has(em.toLowerCase())) continue;
                                await gcal.shareCalendar(env, g, row.google_calendar_id, em, 'writer');
                                used++;
                                shared.push({ key: want.key, email: em });
                            }
                            await g.saveCalendar({ key: want.key, share_state: 'ok', last_error: null });
                        }
                    } catch (e) {
                        if (e.code === 'not-connected') return json(409, { ok: false, error: '먼저 [구글 캘린더 연결] 을 눌러 주세요.' });
                        failed.push({ key: want.key, error: e.message });
                        try { await g.saveCalendar({ key: want.key, kind: want.kind, label: want.label, last_error: e.message }); } catch (e2) { /* 기록 실패는 넘어갑니다 */ }
                    }
                }
                return json(200, { ok: true, made, shared, failed, remaining, missingGoogle: plan.missingGoogle, done: remaining === 0 && !failed.length });
            }

            // 받아오기 · 한꺼번에 — 관리자가 손으로 확인할 때 씁니다 (평소에는 1분마다 저절로 돕니다)
            if ((path === '/api/calendar/pull' || path === '/api/calendar/sync') && method === 'POST') {
                try {
                    if (path === '/api/calendar/sync') return json(200, Object.assign({ ok: true }, await gcal.syncBoth(env)));
                    const ctx = await gcal.buildContext(env, g);
                    return json(200, { ok: true, pull: await gcal.syncPull(env, g, ctx) });
                } catch (e) {
                    if (e.code === 'not-connected') return json(409, { ok: false, error: '먼저 [구글 캘린더 연결] 을 눌러 주세요.' });
                    return json(500, { ok: false, error: e.message });
                }
            }

            return json(404, { ok: false, error: '없는 주소입니다: ' + path });
        }

        if (path === '/api/vehicles' && method === 'GET') {
            const list = (await store.storeValue('gwVehicles.v1')) || [];
            // 화면(법인차량관리)이 쓰는 모양 그대로 — 모바일은 plate · model 로 표시합니다
            return json(200, { vehicles: (Array.isArray(list) ? list : []).filter(v => !v.status || v.status === '운행가능').map(v => ({ id: v.id, plate: v.plate, model: v.model, label: `${v.plate || ''} (${v.model || ''})` })) });   // 화면의 vehicleLabel() 과 같은 모양
        }
        if (path === '/api/drivers' && method === 'GET') {
            if (str(url.searchParams.get('reservedOnly'))) {
                const reserves = await store.rows('vehicle_reservations');
                return json(200, { drivers: [...new Set(reserves.filter(r => r.status !== '취소' && r.applicant).map(r => r.applicant))] });
            }
            const users = (await store.storeValue('gwUsers.v1')) || [];
            return json(200, { drivers: (Array.isArray(users) ? users : []).map(u => u.name).filter(Boolean) });
        }
        if (path === '/api/reservations' && method === 'GET') {
            const driver = str(url.searchParams.get('driver'));
            let list = (await store.rows('vehicle_reservations')).filter(r => r.status !== '취소');
            if (driver) list = list.filter(r => r.applicant === driver);
            list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            return json(200, { reservations: list });
        }
        if (path === '/api/reservations' && method === 'POST') {
            const input = await body();
            const vehicle = str(input.vehicle), applicant = str(input.applicant), start = str(input.start), end = str(input.end);
            if (!vehicle) return bad('차량(vehicle)은 필수입니다.');
            if (!applicant) return bad('신청자(applicant)는 필수입니다.');
            if (!start || !end) return bad('사용 시작/종료 시간은 필수입니다.');
            if (new Date(end) <= new Date(start)) return bad('사용 종료 시간은 시작 시간보다 뒤여야 합니다.');
            const reserves = await store.rows('vehicle_reservations');
            const s = new Date(start).getTime(), e = new Date(end).getTime();
            const conflict = reserves.find(r => r.vehicle === vehicle && ACTIVE_RESERVE_STATUSES.includes(r.status) && r.start && r.end
                && s < new Date(r.end).getTime() && e > new Date(r.start).getTime());
            if (conflict) return bad(`이미 예약된 시간과 겹칩니다: ${conflict.id} (${conflict.applicant})`);
            const reserve = { id: nextId(reserves, 'VR-', 4), vehicle, applicant, start, end, destination: str(input.destination), purpose: str(input.purpose), status: '승인대기중', createdAt: new Date().toISOString() };
            await store.upsert('vehicle_reservations', reserve.id, reserve);
            return json(201, { ok: true, reservation: reserve });
        }
        if (path === '/api/reservations/action' && method === 'POST') {
            const input = await body();
            const id = str(input.id), action = str(input.action);
            if (!id) return bad('예약 id가 필요합니다.');
            const r = (await store.rows('vehicle_reservations')).find(x => x.id === id);
            if (!r) return bad('해당 예약을 찾을 수 없습니다.');
            const now = new Date().toISOString();
            if (action === 'approve') {
                if (r.status !== '승인대기중' && r.status !== '신청완료') return bad('승인 대기 상태의 예약만 승인할 수 있습니다.');
                r.status = '승인완료'; r.approvedAt = now;
            } else if (action === 'handover') {
                if (r.status !== '승인완료') return bad('승인완료된 예약만 차키를 전달할 수 있습니다.');
                r.keyHandedOver = true; r.keyHandedAt = now;
            } else if (action === 'return-request') {
                if (r.status !== '승인완료') return bad('승인완료(사용중)인 예약만 반납 요청할 수 있습니다.');
                const startKm = num(input.startKm), endKm = num(input.endKm);
                if (!(startKm >= 0)) return bad('처음 키로수를 입력하세요.');
                if (!(endKm > 0)) return bad('최종 키로수를 입력하세요.');
                if (endKm < startKm) return bad('최종 키로수는 처음 키로수보다 작을 수 없습니다.');
                r.returnInfo = { startKm, endKm, purpose: str(input.purpose), fuel: num(input.fuel), requestedAt: now };
                r.status = '반납요청';
            } else if (action === 'return-confirm') {
                if (r.status !== '반납요청') return bad('반납요청 상태의 예약만 반납 확인할 수 있습니다.');
                r.status = '반납완료'; r.returnConfirmedAt = now;
            } else if (action === 'cancel') {
                r.status = '취소'; r.canceledAt = now;
            } else return bad('알 수 없는 action 입니다: ' + action);
            await store.upsert('vehicle_reservations', r.id, r);
            return json(200, { ok: true, reservation: r });
        }
        if (path === '/api/vehicle-logs/complete' && method === 'POST') {
            const input = await body();
            const id = str(input.id), endKm = num(input.endKm);
            if (!id) return bad('완료할 운행일지 id가 필요합니다.');
            if (!(endKm > 0)) return bad('도착 주행거리를 입력하세요.');
            const log = (await store.rows('vehicle_logs')).find(l => l.id === id);
            if (!log) return bad('해당 운행일지를 찾을 수 없습니다.');
            if (endKm < num(log.startKm)) return bad('도착 주행거리는 출발보다 작을 수 없습니다.');
            log.endKm = endKm;
            if (input.fuel !== undefined && str(input.fuel) !== '') log.fuel = num(input.fuel);
            if (input.toll !== undefined && str(input.toll) !== '') log.toll = num(input.toll);
            if (str(input.arriveTime)) log.arriveTime = str(input.arriveTime);
            if (input.passengers !== undefined) log.passengers = str(input.passengers);
            if (input.memo !== undefined) log.memo = str(input.memo);
            log.status = '완료'; log.completedAt = new Date().toISOString();
            await store.upsert('vehicle_logs', log.id, log);
            return json(200, { ok: true, log });
        }
        if (path === '/api/vehicle-logs') {
            if (method === 'GET') {
                const status = str(url.searchParams.get('status')), driver = str(url.searchParams.get('driver'));
                let logs = await store.rows('vehicle_logs');
                if (status) logs = logs.filter(l => (l.status || '완료') === status);
                if (driver) logs = logs.filter(l => l.driver === driver);
                logs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
                return json(200, { logs });
            }
            if (method === 'POST') {
                const input = await body();
                const logs = await store.rows('vehicle_logs');
                let log;
                try { log = normalizeLog(input, nextId(logs, 'VL-', 4)); } catch (e) { return bad(e.message); }
                await store.upsert('vehicle_logs', log.id, log);
                return json(201, { ok: true, log });
            }
            return json(405, { ok: false, error: 'Method Not Allowed' });
        }
        return json(404, { ok: false, error: 'Not Found: ' + path });
    } catch (e) {
        return json(500, { ok: false, error: e.message || String(e) });
    }
}
