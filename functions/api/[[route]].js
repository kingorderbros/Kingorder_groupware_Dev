/**
 * 법인차량 API — Cloudflare Pages Functions (개발환경 · 2026-09-16)
 *
 * 목업의 server.js(Node · data/*.json 파일 저장)를 그대로 옮겼습니다. 저장은 Supabase 표 두 개에 합니다.
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
 */

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
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(e));

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
                if (!meRec || meRec.groupId !== 'admin') return json(403, { ok: false, error: '관리자 그룹만 계정을 관리할 수 있습니다.' });

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
