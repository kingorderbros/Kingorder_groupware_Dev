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
 *
 * 파트너센터 (2026-09-28 · 자료 보호 2단계 — 판단은 _partner.js)
 *   POST /api/partner/login   { loginId, pw }                → { token, session }   (예전 평문 비밀번호는 이때 암호화로 바꿈)
 *   GET  /api/partner/boot    그 파트너사 몫의 자료만         (Authorization: Bearer 토큰)
 *   POST /api/partner/save    { key, upserts, removes }       그 파트너사 것만 반영 → 반영된 목록
 *   POST /api/auth/lookup     { id }                          로그인 창 아이디 → 이메일 (1단계)
 *   GET  /api/auth/logins     모든 직원의 마지막 로그인 시각 (관리자만 · 2026-09-29)
 *
 * 첨부파일 (2026-09-29 · 3단계 — 판단은 _files.js)
 *   POST /api/files/session             로그인 토큰 → 파일용 쿠키 (직원 · 파트너 모두)
 *   POST /api/files/upload?name=&type=  본문 = 파일 → { file: { path, name, type, size } }
 *   GET  /api/files/get?p=경로&n=이름[&dl=1]
 *
 * 대한민국 공휴일 (2026-09-29)
 *   GET /api/holidays[?refresh=1]  { updatedAt, days: { 'YYYY-MM-DD': '이름' } } — 하루 한 번 구글 공휴일 캘린더에서 새로
 *
 * 폰 · PC 푸시 알림 (2026-09-29 · 9단계 — 판단 · 암호는 _push.js)
 *   GET /api/push/key · GET /api/push/status · POST /api/push/subscribe · unsubscribe · prefs · send
 */

import * as gcal from './_gcal.js';
import * as pc from './_partner.js';
import * as fs from './_files.js';
import * as push from './_push.js';
import * as hol from './_holidays.js';

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
        storeValue: async (key) => { const r = await call('GET', `app_store?select=value&key=eq.${encodeURIComponent(key)}`); return r && r[0] ? r[0].value : null; },
        // 여러 키를 한 번에 — { key → 값 } (2026-09-28 파트너센터)
        storeValues: async (keys) => {
            const list = keys.map(k => '"' + String(k).replace(/"/g, '') + '"').join(',');
            const r = await call('GET', `app_store?select=key,value&key=in.(${encodeURIComponent(list)})`);
            const out = {}; (r || []).forEach(x => { out[x.key] = x.value; }); return out;
        },
        remove: (table, id) => call('DELETE', `${table}?id=eq.${encodeURIComponent(id)}`, undefined, { Prefer: 'return=minimal' }),
        // 접두어로 시작하는 키 전부 — [{ key, value }] (2026-09-29 푸시 구독: 사람마다 키)
        storeLike: async (prefix) => (await call('GET', `app_store?select=key,value&key=like.${encodeURIComponent(String(prefix).replace(/[*%]/g, '') + '*')}`)) || [],
        // 표의 한 줄 그대로 — { id, data, rev, updated_by, updated_at } 또는 null
        rowRaw: async (table, id) => { const r = await call('GET', `${table}?select=id,data,rev,updated_by,updated_at&id=eq.${encodeURIComponent(id)}`); return r && r[0] ? r[0] : null; },
        setStore: (key, value) => call('POST', 'app_store?on_conflict=key', [{ key, value, updated_at: new Date().toISOString() }], { Prefer: 'resolution=merge-duplicates,return=minimal' })
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
// 로그인한 그룹웨어 직원인가 (2026-09-28 · 4단계 — 법인차량 · 운행일지)
//   { rec: 직원 기록, admin: 관리자인가, can(perms): 권한 그룹에 그중 하나가 켜져 있는가 }
async function requireStaff(env, store, request) {
    const me = await authAdmin(env).whoami(request);
    if (!me) return { error: json(401, { ok: false, error: '로그인이 필요합니다. 그룹웨어 아이디로 로그인해 주세요.' }) };
    const v = await store.storeValues(['gwUsers.v1', 'gwPermissionGroups.v2']);
    const users = Array.isArray(v['gwUsers.v1']) ? v['gwUsers.v1'] : [];
    const rec = users.find(u => str(u.email).toLowerCase() === str(me.email).toLowerCase());
    if (!rec) return { error: json(403, { ok: false, error: '직원 목록에 없는 계정입니다. 관리자에게 문의해 주세요.' }) };
    const admin = rec.groupId === 'admin' || rec.dept === 'admin' || rec.level === 'admin' || rec.isAdmin === true;
    const pg = v['gwPermissionGroups.v2'];
    const groups = Array.isArray(pg) ? pg : (pg && Array.isArray(pg.groups) ? pg.groups : []);
    const g = groups.find(x => x && x.id === rec.groupId);
    const perms = new Set(g && Array.isArray(g.permissions) ? g.permissions : []);
    return { me, rec, admin, can: (list) => admin || list.some(p => perms.has(p)) };
}
// 고치기 · 지우기 권한 (2026-09-28) — 관리자 이거나, 권한 그룹에 perms 중 하나가 켜져 있으면 통과.
//   'data-admin' = 권한 관리의 '전체 자료 수정 · 삭제'. 화면(canManageAllData)과 같은 기준입니다.
async function requirePerm(env, store, request, perms) {
    const me = await authAdmin(env).whoami(request);
    if (!me) return { error: json(401, { ok: false, error: '로그인이 필요합니다.' }) };
    const v = await store.storeValues(['gwUsers.v1', 'gwPermissionGroups.v2']);
    const users = Array.isArray(v['gwUsers.v1']) ? v['gwUsers.v1'] : [];
    const rec = users.find(u => str(u.email).toLowerCase() === str(me.email).toLowerCase());
    let ok = !!rec && (rec.groupId === 'admin' || rec.dept === 'admin' || rec.level === 'admin' || rec.isAdmin === true);
    if (!ok && rec) {
        const pg = v['gwPermissionGroups.v2'];                  // 저장 모양: { groups: [...], version } (예전엔 배열)
        const groups = Array.isArray(pg) ? pg : (pg && Array.isArray(pg.groups) ? pg.groups : []);
        const g = groups.find(x => x && x.id === rec.groupId);
        ok = !!(g && Array.isArray(g.permissions) && perms.some(p => g.permissions.includes(p)));
    }
    if (!ok) return { error: json(403, { ok: false, error: '고치거나 지울 권한이 없습니다.' }) };
    return { me, rec };
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
        // ---------- 대한민국 공휴일 (2026-09-29 · 판단은 _holidays.js) ----------
        // 공개 자료라 로그인 없이. 저장된 것이 하루 넘었으면 구글 공휴일 캘린더를 새로 받아 app_store 에 둡니다.
        if (path === '/api/holidays' && method === 'GET') {
            const cur = await store.storeValue(hol.KEY);
            let force = false;
            if (url.searchParams.get('refresh') === '1') {                  // 억지로 새로 받기는 관리자만 (2026-09-29 검토)
                const ad = await requireAdmin(env, store, request);
                if (ad.error) return ad.error;
                force = true;
            }
            if (!force && !hol.isStale(cur)) return json(200, { ok: true, cached: true, value: cur });
            if (!force && cur && hol.recentlyFailed(cur)) return json(200, { ok: true, cached: true, stale: true, value: cur });   // 방금 실패 — 1시간 쉼
            try {
                const res = await fetch(hol.ICS_URL, { headers: { 'User-Agent': 'kingorder-groupware' } });
                if (!res.ok) throw new Error('구글 공휴일 캘린더 ' + res.status);
                const days = hol.parseIcs(await res.text());
                if (Object.keys(days).length < 10) throw new Error('공휴일이 너무 적게 읽혔습니다');
                const value = { updatedAt: new Date().toISOString(), source: 'google-ko-holiday', days };
                await store.setStore(hol.KEY, value);
                return json(200, { ok: true, cached: false, value });
            } catch (e) {
                if (cur && cur.days) {                                        // 받기 실패 — 예전 것으로, 실패 시각을 남겨 1시간은 다시 안 감
                    try { await store.setStore(hol.KEY, Object.assign({}, cur, { failedAt: new Date().toISOString() })); } catch (e2) { /* 무시 */ }
                    return json(200, { ok: true, cached: true, stale: true, value: cur, error: e.message });
                }
                return json(502, { ok: false, error: '공휴일을 받지 못했습니다: ' + e.message });
            }
        }

        // ---------- 폰 · PC 푸시 알림 (2026-09-29 · 9단계 — 판단 · 암호는 _push.js) ----------
        if (path.startsWith('/api/push/')) {
            if (path === '/api/push/key' && method === 'GET') {
                return json(200, { ok: true, ready: push.keysReady(env), publicKey: push.keysReady(env) ? str(env.VAPID_PUBLIC_KEY) : '' });
            }
            const st = await requireStaff(env, store, request);
            if (st.error) return st.error;
            if (!st.rec.id) return json(400, { ok: false, error: '구성원 번호가 없는 계정입니다.' });
            const input = method === 'POST' ? await body() : {};
            const myKey = push.keyOf(st.rec.id);
            const loadMine = async () => {
                const v = await store.storeValue(myKey);
                if (v) return push.normRec(v);
                // 예전 모양(한 목록 'gwPushSubs.v1')에 내 기록이 있으면 옮겨 옵니다 (2026-09-29 오전에 켠 사람)
                const old = await store.storeValue('gwPushSubs.v1');
                const mine = Array.isArray(old) ? old.find(r => r && r.id === st.rec.id) : null;
                if (!mine) return push.normRec(null);
                const rec = push.normRec(mine);
                await store.setStore(myKey, rec);
                return rec;
            };
            if (path === '/api/push/status' && method === 'GET') {
                const rec = await loadMine();
                const ep = url.searchParams.get('endpoint');
                return json(200, { ok: true, ready: push.keysReady(env), thisDevice: ep ? push.hasSub(rec, ep) : undefined,
                                   devices: rec.subs.map(x => ({ device: x.device, at: x.at, endpointTail: String(x.endpoint).slice(-12) })),
                                   prefs: Object.fromEntries(push.CATEGORIES.map(c => [c.id, push.wants(rec, c.id)])), categories: push.CATEGORIES });
            }
            if (path === '/api/push/subscribe' && method === 'POST') {
                if (!push.validSubscription(input.subscription)) return bad('알림 받기 정보가 올바르지 않습니다.');
                const ep = input.subscription.endpoint;
                // 같은 기기를 전에 다른 사람이 쓰고 있었으면 그 사람 기록에서 뺍니다 (그 사람 알림이 이 기기로 오지 않게)
                for (const r of await store.storeLike(push.PREFIX)) {
                    if (r.key !== myKey && push.hasSub(r.value, ep)) await store.setStore(r.key, push.removeSub(r.value, ep));
                }
                await store.setStore(myKey, push.addSub(await loadMine(), input.subscription, input.device));
                return json(200, { ok: true });
            }
            if (path === '/api/push/unsubscribe' && method === 'POST') {
                await store.setStore(myKey, push.removeSub(await loadMine(), str(input.endpoint)));   // 내 기록에서만
                return json(200, { ok: true });
            }
            if (path === '/api/push/prefs' && method === 'POST') {
                await store.setStore(myKey, push.setPrefs(await loadMine(), input.prefs || {}));
                return json(200, { ok: true });
            }
            if (path === '/api/push/send' && method === 'POST') {
                const nid = str(input.id || (input.n && input.n.id));
                if (!nid) return bad('보낼 알림이 없습니다.');
                if (!push.keysReady(env)) return json(200, { ok: true, sent: 0, skipped: 'VAPID 키가 설정되지 않았습니다.' });
                // 요청 본문을 믿지 않고 저장된 알림을 다시 읽습니다 — 화면이 저장을 막 보내는 중일 수 있어 잠깐 기다려 가며
                let row = null;
                for (let i = 0; i < 5 && !row; i++) {
                    row = await store.rowRaw('notifications', nid);
                    if (!row) await new Promise(r => setTimeout(r, 600));
                }
                if (!row) return json(404, { ok: false, error: '알림을 찾지 못했습니다.' });
                const age = Date.now() - new Date(row.updated_at).getTime();
                if (row.rev !== 1 || str(row.updated_by).toLowerCase() !== str(st.me.email).toLowerCase() || !(age < 10 * 60 * 1000)) {
                    return json(403, { ok: false, error: '방금 내가 만든 알림만 보낼 수 있습니다.' });
                }
                const n = Object.assign({}, row.data || {}, { id: row.id });
                const users = (await store.storeValue('gwUsers.v1')) || [];
                const cat = push.categoryOf(n.type);
                const payload = push.payloadOf(n, { [n.type]: str(input.label) });
                const recips = push.recipientsOf(users, n, st.me.email);
                const recs = recips.length ? await store.storeValues(recips.map(u => push.keyOf(u.id))) : {};
                let targets = recips.map(u => ({ key: push.keyOf(u.id), rec: push.normRec(recs[push.keyOf(u.id)]) }))
                    .filter(x => push.wants(x.rec, cat)).flatMap(x => x.rec.subs.map(sub => ({ key: x.key, sub })));
                const total = targets.length;
                targets = targets.slice(0, push.MAX_TARGETS);
                let sent = 0; const gone = [];
                await Promise.all(targets.map(async ({ key, sub }) => {
                    try {
                        const q = await push.buildRequest(sub, payload, env);
                        const res = await fetch(q.url, q.init);
                        if (res.status === 404 || res.status === 410) gone.push({ key, ep: sub.endpoint });   // 브라우저가 구독을 버림
                        else if (res.ok) sent++;
                        else console.warn('[push] 보내기 실패', res.status, (await res.text()).slice(0, 200));
                    } catch (e) { console.warn('[push] 보내기 오류', e && e.message); }
                }));
                for (const g of gone) await store.setStore(g.key, push.removeSub(recs[g.key], g.ep));
                return json(200, { ok: true, sent, targets: total, skipped: total - targets.length, removed: gone.length });
            }
            return json(404, { ok: false, error: '없는 주소입니다: ' + path });
        }

        // ---------- 첨부파일 (2026-09-29 · 3단계 — 판단은 _files.js) ----------
        if (path.startsWith('/api/files/')) {
            const secret = str(env.SUPABASE_SERVICE_ROLE_KEY);
            const base = str(env.SUPABASE_URL).replace(/\/+$/, '');
            const skey = { apikey: secret, Authorization: `Bearer ${secret}` };
            const objUrl = (p) => `${base}/storage/v1/object/files/${p.split('/').map(encodeURIComponent).join('/')}`;
            // 파트너 토큰이면 그 계정 (중지 · 삭제면 null)
            const partnerWho = async (token) => {
                const t = await pc.readToken(secret, token);
                if (!t) return null;
                const v = await store.storeValues(['gwPartnerAccounts.v1', 'gwPartners.v1']);
                const f = pc.findAccount(v['gwPartnerAccounts.v1'], v['gwPartners.v1'], t.loginId);
                if (!f || f.acct.active === false || f.acct.partnerId !== t.partnerId) return null;
                return { loginId: f.acct.loginId, partnerId: f.acct.partnerId, partnerName: f.partnerName };
            };
            if (path === '/api/files/session' && method === 'POST') {
                const token = str(request.headers.get('Authorization')).replace(/^Bearer\s+/i, '');
                let who = null;
                const pt = token ? await partnerWho(token) : null;
                if (pt) who = { k: 'partner', id: pt.loginId, p: pt.partnerId };
                else {
                    const st = await requireStaff(env, store, request);
                    if (st.error) return st.error;
                    who = { k: 'staff', id: str(st.me.email).toLowerCase() };
                }
                const value = await fs.makeCookieValue(secret, who);
                return new Response(JSON.stringify({ ok: true, kind: who.k, hours: fs.COOKIE_HOURS }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': fs.setCookieHeader(value, url.protocol === 'https:') }
                });
            }
            // 로그아웃 — 파일용 쿠키를 지웁니다 (같이 쓰는 PC 에서 다음 사람이 파일을 열지 못하게 · 2026-09-29 검토)
            if (path === '/api/files/logout' && method === 'POST') {
                return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
                    'Set-Cookie': `${fs.COOKIE}=; Path=/api/files; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}` } });
            }
            const who = await fs.readCookieValue(secret, fs.cookieFrom(request));
            if (!who) return json(401, { ok: false, error: '다시 로그인해 주세요 (파일 확인 시간이 지났습니다).' });
            // 직원도 그사이 직원 목록에서 빠졌는지 한 번 더 봅니다
            if (who.k === 'staff') {
                const users = (await store.storeValue('gwUsers.v1')) || [];
                if (!(Array.isArray(users) ? users : []).some(u => str(u.email).toLowerCase() === who.id)) return json(401, { ok: false, error: '직원 목록에 없는 계정입니다.' });
            }
            // 파트너는 그사이 중지 · 삭제되었는지 한 번 더 봅니다
            let pview = null;
            if (who.k === 'partner') {
                const v = await store.storeValues(pc.ALL_KEYS);
                const f = pc.findAccount(v['gwPartnerAccounts.v1'], v['gwPartners.v1'], who.id);
                if (!f || f.acct.active === false || f.acct.partnerId !== who.p) return json(401, { ok: false, error: '다시 로그인해 주세요.' });
                pview = pc.partnerView(v, { loginId: f.acct.loginId, partnerId: f.acct.partnerId, partnerName: f.partnerName });
            }
            if (path === '/api/files/upload' && method === 'POST') {
                const name = str(url.searchParams.get('name')).slice(0, 200) || 'file';
                const type = str(url.searchParams.get('type')).slice(0, 100) || 'application/octet-stream';
                const len = Number(request.headers.get('Content-Length') || 0);
                if (len > fs.MAX_BYTES) return json(413, { ok: false, error: '한 파일 20MB 까지 올릴 수 있습니다.' });
                const buf = await request.arrayBuffer();
                if (!buf.byteLength) return bad('빈 파일입니다.');
                if (buf.byteLength > fs.MAX_BYTES) return json(413, { ok: false, error: '한 파일 20MB 까지 올릴 수 있습니다.' });
                const p = fs.newPath(who, name);
                const res = await fetch(objUrl(p), { method: 'POST', headers: Object.assign({ 'Content-Type': type, 'x-upsert': 'false' }, skey), body: buf });
                if (!res.ok) return json(502, { ok: false, error: '파일 저장소에 올리지 못했습니다 (' + res.status + ').', detail: (await res.text()).slice(0, 300) });
                return json(200, { ok: true, file: { path: p, name, type, size: buf.byteLength } });
            }
            if (path === '/api/files/get' && method === 'GET') {
                const p = str(url.searchParams.get('p'));
                if (!fs.validPath(p)) return bad('파일 주소가 올바르지 않습니다.');
                if (who.k === 'partner' && !fs.partnerMayRead(p, who, pview, pc.SHARED_KEYS)) return json(403, { ok: false, error: '볼 수 없는 파일입니다.' });
                const res = await fetch(objUrl(p), { headers: skey });
                if (res.status === 404 || res.status === 400) return json(404, { ok: false, error: '파일이 없습니다 (지워졌을 수 있습니다).' });
                if (!res.ok) return json(502, { ok: false, error: '파일 저장소에서 받지 못했습니다 (' + res.status + ').' });
                const type = res.headers.get('Content-Type') || 'application/octet-stream';
                const dl = url.searchParams.get('dl') === '1' || !fs.inlineSafe(type);
                return new Response(res.body, {
                    status: 200,
                    headers: {
                        'Content-Type': type,
                        'Content-Disposition': fs.dispositionHeader(url.searchParams.get('n') || p.split('/').pop(), dl),
                        'Cache-Control': 'private, max-age=3600',
                        'X-Content-Type-Options': 'nosniff'
                    }
                });
            }
            return json(404, { ok: false, error: '없는 주소입니다: ' + path });
        }

        // ---------- 파트너센터 (2026-09-28 · 자료 보호 2단계 — 판단은 _partner.js) ----------
        if (path.startsWith('/api/partner/')) {
            const secret = str(env.SUPABASE_SERVICE_ROLE_KEY);
            // 토큰 → 지금 계정 (중지 · 삭제되었으면 null)
            const who = async () => {
                const t = await pc.readToken(secret, str(request.headers.get('Authorization')).replace(/^Bearer\s+/i, ''));
                if (!t) return null;
                const v = await store.storeValues(['gwPartnerAccounts.v1', 'gwPartners.v1']);
                const f = pc.findAccount(v['gwPartnerAccounts.v1'], v['gwPartners.v1'], t.loginId);
                if (!f || f.acct.active === false || f.acct.partnerId !== t.partnerId) return null;
                return { loginId: f.acct.loginId, partnerId: f.acct.partnerId, partnerName: f.partnerName };
            };
            if (path === '/api/partner/login' && method === 'POST') {
                const input = await body();
                const loginId = str(input.loginId).toLowerCase();
                const pw = input.pw === undefined || input.pw === null ? '' : String(input.pw);
                const v = await store.storeValues(['gwPartnerAccounts.v1', 'gwPartners.v1']);
                const accounts = Array.isArray(v['gwPartnerAccounts.v1']) ? v['gwPartnerAccounts.v1'] : [];
                const f = loginId && pw ? pc.findAccount(accounts, v['gwPartners.v1'], loginId) : null;
                const chk = f ? await pc.checkPassword(f.acct, pw) : { ok: false };
                if (!chk.ok) return json(200, { ok: false, error: '아이디 또는 비밀번호가 맞지 않습니다.' });
                if (f.acct.active === false) return json(200, { ok: false, error: '사용이 중지된 아이디입니다. 킹오더브라더스 담당자에게 문의해 주세요.' });
                if (chk.needUpgrade) {
                    // 예전 평문 비밀번호 — 이번에 암호화로 바꿔 둡니다 (그사이 바뀐 목록 위에 그 계정만 고칩니다)
                    try {
                        const fresh = await store.storeValue('gwPartnerAccounts.v1');
                        const list = Array.isArray(fresh) ? fresh : [];
                        const a = list.find(x => str(x.loginId).toLowerCase() === loginId);
                        if (a && a.pw === pw) { Object.assign(a, await pc.hashPassword(pw)); delete a.pw; await store.setStore('gwPartnerAccounts.v1', list); }
                    } catch (e) { console.error('[partner] 비밀번호 암호화 저장 실패', e && e.message); }
                }
                const token = await pc.makeToken(secret, f.acct.loginId, f.acct.partnerId);
                return json(200, { ok: true, token, session: { loginId: f.acct.loginId, partnerId: f.acct.partnerId, partnerName: f.partnerName } });
            }
            const me = await who();
            if (!me) return json(401, { ok: false, error: '다시 로그인해 주세요.' });
            if (path === '/api/partner/boot' && method === 'GET') {
                const v = await store.storeValues(pc.ALL_KEYS);
                return json(200, { ok: true, session: me, store: pc.partnerView(v, me) });
            }
            if (path === '/api/partner/save' && method === 'POST') {
                const input = await body();
                const key = str(input.key);
                if (!pc.WRITE_KEYS.includes(key)) return json(403, { ok: false, error: '저장할 수 없는 자료입니다.' });
                const cur = await store.storeValue(key);
                const r = pc.applyPartnerWrite(key, cur, input.upserts, input.removes, me);
                await store.setStore(key, r.list);
                const view = pc.partnerView({ [key]: r.list }, me)[key];
                return json(200, { ok: true, value: view, renamed: r.renamed, rejected: r.rejected });
            }
            return json(404, { ok: false, error: '없는 주소입니다: ' + path });
        }

        // ---------- 로그인 계정 ----------
        if (path.startsWith('/api/auth/')) {
            const auth = authAdmin(env);
            if (path === '/api/auth/status' && method === 'GET') {
                return json(200, { ok: true, empty: await auth.isEmpty() });
            }
            if (path === '/api/auth/lookup' && method === 'POST') {
                // 로그인 창의 아이디 → 이메일 (2026-09-28)
                // 직원 목록(gwUsers.v1)을 로그인 전 브라우저에 내려보내지 않기 위해 서버가 대신 찾습니다.
                // 이메일 앞부분만 넣어도 되고('sales.lee'), 겹치면 전체 주소를 넣어 달라고만 합니다(목록은 알려 주지 않음).
                const input = await body();
                const typed = str(input.id).toLowerCase();
                if (!typed) return bad('아이디를 입력해 주세요.');
                const users = (await store.storeValue('gwUsers.v1')) || [];
                const list = Array.isArray(users) ? users : [];
                const localPart = (v) => str(v).toLowerCase().split('@')[0];
                const hits = typed.includes('@')
                    ? list.filter(u => str(u.email).toLowerCase() === typed)
                    : list.filter(u => localPart(u.email) === typed);
                if (hits.length > 1) return json(200, { ok: false, error: `'${typed}' 로 시작하는 계정이 ${hits.length}개 있습니다. 이메일 전체를 입력해 주세요.` });
                if (!hits.length) return json(200, { ok: false, error: '등록되지 않은 계정입니다. 관리자에게 계정 발급을 요청하세요.' });
                return json(200, { ok: true, email: str(hits[0].email).toLowerCase() });
            }
            if (path === '/api/auth/bootstrap' && method === 'POST') {
                // 계정이 하나도 없을 때 한 번만 — 화면의 관리자(gwUsers.v1 의 dept 'admin') 이메일로 첫 계정을 만듭니다
                const input = await body();
                const email = str(input.email).toLowerCase();
                if (!validEmail(email)) return bad('이메일 형식이 아닙니다.');
                if (!(await auth.isEmpty())) return json(409, { ok: false, error: '처음 설정은 이미 끝났습니다. 로그인해 주세요.' });
                const users = (await store.storeValue('gwUsers.v1')) || [];
                let rec = (Array.isArray(users) ? users : []).find(u => str(u.email).toLowerCase() === email);
                // 완전히 새 환경(운영 첫 설정 등) — 직원 목록이 서버에 아직 없습니다. 화면은 로그인 전에는 저장하지 않으므로
                // 여기서 관리자 한 명짜리 목록을 만들어 둡니다 (2026-09-28 검토: 없으면 첫 계정을 영영 못 만듦)
                if (!rec && !(Array.isArray(users) && users.length)) {
                    rec = { id: 'u1', name: str(input.name) || '관리자', dept: 'admin', team: '', rank: '관리자', email, groupId: 'admin', level: 'admin',
                            duty: '시스템 관리', phone: '', mobile: '', birthday: '', joinedAt: '', note: '처음 설정에서 만든 관리자 계정' };
                    await store.setStore('gwUsers.v1', [rec]);
                }
                if (!rec || rec.groupId !== 'admin') return json(403, { ok: false, error: '관리자 그룹 계정의 이메일만 처음 설정에 쓸 수 있습니다.' });
                const password = tempPassword();
                await auth.call('POST', '/admin/users', { email, password, email_confirm: true, user_metadata: { name: str(rec.name), must_change_password: true } });
                return json(200, { ok: true, password });
            }
            // 모든 직원의 마지막 로그인 시각 — 사용자 관리 표용 (2026-09-29 · 관리자만)
            //   Supabase Auth 의 last_sign_in_at = 아이디 · 비밀번호로 실제 로그인한 때 (자동 로그인 유지 중에는 바뀌지 않습니다)
            if (path === '/api/auth/logins' && method === 'GET') {
                const ad = await requireAdmin(env, store, request);
                if (ad.error) return ad.error;
                const out = {};
                for (let page = 1; page <= 25; page++) {
                    const r = await auth.call('GET', `/admin/users?page=${page}&per_page=200`);
                    const list = (r && r.users) || [];
                    list.forEach(u => { if (u.email) out[str(u.email).toLowerCase()] = { lastSignIn: u.last_sign_in_at || '', createdAt: u.created_at || '' }; });
                    if (list.length < 200) break;
                }
                return json(200, { ok: true, logins: out });
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
            // 한꺼번에 맞추기 — 일정 화면을 보고 있는 브라우저도 1분마다 부릅니다.
            // 서버의 예약 실행이 꺼져 있어도 누군가 그룹웨어를 보고 있으면 맞춰집니다.
            // 관리자의 [지금 맞추기] 는 기다리지 않도록 force 로 부릅니다.
            if (path === '/api/calendar/sync' && method === 'POST') {
                const me = await authAdmin(env).whoami(request);
                if (!me) return json(401, { ok: false, error: '로그인이 필요합니다.' });
                const input = await body();
                try { return json(200, Object.assign({ ok: true }, await gcal.syncBoth(env, { minGapMs: input.force ? 0 : 20000 }))); }
                catch (e) {
                    if (e.code === 'not-connected') return json(409, { ok: false, error: '먼저 [구글 캘린더 연결] 을 눌러 주세요.' });
                    return json(500, { ok: false, error: e.message });
                }
            }

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
                            await g.patchCalendar(want.key, { share_state: 'ok', last_error: null });
                        }
                    } catch (e) {
                        if (e.code === 'not-connected') return json(409, { ok: false, error: '먼저 [구글 캘린더 연결] 을 눌러 주세요.' });
                        failed.push({ key: want.key, error: e.message });
                        try { await g.saveCalendar({ key: want.key, kind: want.kind, label: want.label, last_error: e.message }); } catch (e2) { /* 기록 실패는 넘어갑니다 */ }
                    }
                }
                return json(200, { ok: true, made, shared, failed, remaining, missingGoogle: plan.missingGoogle, done: remaining === 0 && !failed.length });
            }

            // 받아오기 — 관리자가 손으로 확인할 때 씁니다
            if (path === '/api/calendar/pull' && method === 'POST') {
                try {
                    const ctx = await gcal.buildContext(env, g);
                    return json(200, { ok: true, pull: await gcal.syncPull(env, g, ctx) });
                } catch (e) {
                    if (e.code === 'not-connected') return json(409, { ok: false, error: '먼저 [구글 캘린더 연결] 을 눌러 주세요.' });
                    return json(500, { ok: false, error: e.message });
                }
            }

            return json(404, { ok: false, error: '없는 주소입니다: ' + path });
        }

        // ---------- 법인차량 · 운행일지 — 로그인한 직원만 (2026-09-28 · 4단계) ----------
        //   · 운전자(일반 직원)는 **자기 이름으로만** 예약 · 운행일지 · 반납 요청을 합니다(이름은 로그인한 사람으로 서버가 적음)
        //   · 승인 · 차키 전달 · 반납 확인은 차량 담당(예약관리 권한) · 관리자만. 취소는 신청한 본인도.
        let staff = null;
        if (['/api/vehicles', '/api/drivers', '/api/reservations', '/api/reservations/action', '/api/vehicle-logs', '/api/vehicle-logs/complete'].includes(path)) {
            staff = await requireStaff(env, store, request);
            if (staff.error) return staff.error;
        }
        const carManager = () => staff && staff.can(['data-admin', 'management-vehicle-reserve', 'management-vehicle', 'management-work-center']);
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
        // 법인차량 예약 · 운행일지 고치기 · 지우기 (2026-09-28)
        //   예전에는 서버에 이 길이 없어 화면에서만 바뀌고 새로 불러오면 되돌아갔습니다.
        //   고치기: 관리자 · 전체 자료 권한 · 그 화면 권한(예약관리 / 운행내역). 지우기: 관리자 · 전체 자료 권한만.
        // 차량번호 · 모델을 바꾸면 기존 예약 · 운행내역의 차량 이름도 한 번에 (2026-09-29 — 예전엔 화면에서만 바뀌어 새로고침하면 옛 이름으로 돌아가 차량과 끊겼음)
        if (path === '/api/vehicles/rename' && method === 'POST') {
            const gate = await requirePerm(env, store, request, ['data-admin', 'management-vehicle', 'management-vehicle-reserve']);
            if (gate.error) return gate.error;
            const input = await body();
            const from = str(input.from), to = str(input.to);
            if (!from || !to || from === to) return bad('바꿀 차량 이름이 필요합니다.');
            let changed = 0;
            for (const table of ['vehicle_reservations', 'vehicle_logs']) {
                for (const row of await store.rows(table)) {
                    if (row.vehicle !== from) continue;
                    const { id, ...data } = row;
                    data.vehicle = to;
                    await store.upsert(table, id, data);
                    changed++;
                }
            }
            return json(200, { ok: true, changed });
        }
        if ((path === '/api/reservations' || path === '/api/vehicle-logs') && (method === 'PATCH' || method === 'DELETE')) {
            const isRes = path === '/api/reservations';
            const perms = method === 'DELETE' ? ['data-admin'] : ['data-admin', isRes ? 'management-vehicle-reserve' : 'management-vehicle'];
            const gate = await requirePerm(env, store, request, perms);
            if (gate.error) return gate.error;
            const table = isRes ? 'vehicle_reservations' : 'vehicle_logs';
            const input = await body();
            const id = str(input.id);
            if (!id) return bad('id 가 필요합니다.');
            const cur = (await store.rows(table)).find(x => x.id === id);
            if (!cur) return bad('찾을 수 없습니다: ' + id);
            if (method === 'DELETE') { await store.remove(table, id); return json(200, { ok: true, deleted: id }); }
            const patch = input.patch && typeof input.patch === 'object' ? Object.assign({}, input.patch) : {};
            delete patch.id;
            const next = Object.assign({}, cur, patch, { editedAt: new Date().toISOString(), editedBy: str((gate.rec || {}).name) });
            if (isRes) {
                // 새로 신청할 때와 같은 겹침 확인 (자기 자신은 빼고) — 2026-09-28 검토
                if (next.start && next.end && new Date(next.end) <= new Date(next.start)) return bad('사용 종료 시간은 시작 시간보다 뒤여야 합니다.');
                if (ACTIVE_RESERVE_STATUSES.includes(next.status) && next.start && next.end) {
                    const s0 = new Date(next.start).getTime(), e0 = new Date(next.end).getTime();
                    const clash = (await store.rows('vehicle_reservations')).find(r => r.id !== id && r.vehicle === next.vehicle
                        && ACTIVE_RESERVE_STATUSES.includes(r.status) && r.start && r.end && s0 < new Date(r.end).getTime() && e0 > new Date(r.start).getTime());
                    if (clash) return bad(`이미 예약된 시간과 겹칩니다: ${clash.id} (${clash.applicant})`);
                }
            }
            await store.upsert(table, id, next);
            return json(200, { ok: true, item: next });
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
            if (!carManager()) input.applicant = str(staff.rec.name);           // 차량 담당이 아니면 본인 이름으로만
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
            const mine = str(r.applicant) === str(staff.rec.name);
            const managerOnly = ['approve', 'handover', 'return-confirm'].includes(action);
            if ((managerOnly && !carManager()) || (!managerOnly && !mine && !carManager())) {
                return json(403, { ok: false, error: managerOnly ? '승인 · 차키 전달 · 반납 확인은 차량 담당자만 할 수 있습니다.' : '본인이 신청한 예약만 처리할 수 있습니다.' });
            }
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
            if (str(log.driver) !== str(staff.rec.name) && !carManager()) return json(403, { ok: false, error: '본인 운행일지만 마칠 수 있습니다.' });
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
                if (!carManager()) input.driver = str(staff.rec.name);           // 차량 담당이 아니면 본인 이름으로만
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
