// [구글 캘린더 준비] (/api/calendar/setup) — Cloudflare 한도(요청 한 번에 바깥 호출 50번) 안에서 끝나는지 (2026-10-12)
// dev 에서 캘린더 19개 이름을 [DEV] 로 바꾸다 'Too many subrequests' 로 7건 실패한 일을 그대로 재현합니다.
// Supabase · 구글은 모두 가짜이고, 서버를 한 번 부를 때마다 fetch 횟수를 셉니다.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const LIMIT = 50;

// ---- 가짜 자료 ----
const depts = [{ id: 'management', name: '경영진' }, { id: 'sales', name: '영업본부' }, { id: 'ops', name: '운영본부' }, { id: 'payment', name: '결제본부' }, { id: 'mgmt', name: '관리본부' }, { id: 'it', name: 'IT본부' }];
const users = [{ email: 'admin@company.com', name: '관리자', groupId: 'admin', dept: 'admin', googleEmail: 'admin.kob@gmail.com' }];
for (let i = 1; i <= 12; i++) users.push({ email: `u${i}@company.com`, name: `직원${i}`, dept: depts[i % depts.length].id, googleEmail: `u${i}.kob@gmail.com` });
const store = { 'gwUsers.v1': users, 'gwOrgDepts.v1': depts, 'gwPermissionGroups.v2': { groups: [] } };
const LABELS = { company: '전사일정', 'sales-share': '킹오더 영업일정 및 진행상황 공유', 'install-as': '설치 및 A/S 일정 공유' };
// 이미 만든 캘린더 — 이름은 [DEV] 없이 (예전 이름), 공유도 이미 다 되어 있음
const cals = new Map();
const acl = new Map();
const addCal = (key, kind, label, shareTo, extra) => {
    const id = 'g_' + key.replace(/\W/g, '_');
    cals.set(key, Object.assign({ key, kind, label, google_calendar_id: id, share_state: 'ok', last_error: null }, extra || {}));
    acl.set(id, new Set(shareTo));
};
const everyone = users.map(u => u.googleEmail);
Object.entries(LABELS).forEach(([k, l]) => addCal('cal:' + k, k, l, everyone));
depts.forEach(d => addCal('cal:team:' + d.id, 'team', '팀별 – ' + d.name, users.filter(u => u.dept === d.id).map(u => u.googleEmail), { dept: d.id }));
users.forEach(u => addCal('cal:personal:' + u.email, 'personal', '개인 – ' + u.name, [u.googleEmail], { member_email: u.email }));
const googleNames = new Map([...cals.values()].map(c => [c.google_calendar_id, c.label]));

let calls = 0, failGoogle = false;
global.fetch = async (url, opt = {}) => {
    calls++;
    const u = new URL(String(url)), m = opt.method || 'GET';
    const res = (body, status) => new Response(body === undefined ? null : JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
    const h = (k) => (opt.headers || {})[k] || '';
    if (u.pathname === '/auth/v1/user') return String(h('Authorization')).endsWith('tok-admin') ? res({ email: 'admin@company.com' }) : res({}, 401);
    if (u.pathname === '/rest/v1/app_store') {
        const kq = decodeURIComponent(u.searchParams.get('key') || '');
        if (kq.startsWith('in.')) { const ks = kq.slice(4, -1).split(',').map(s => s.replace(/"/g, '')); return res(ks.filter(k => k in store).map(k => ({ key: k, value: store[k] }))); }
        const k = kq.replace(/^eq\./, '');
        return res(k in store ? [{ key: k, value: store[k] }] : []);
    }
    if (u.pathname === '/rest/v1/gcal_account') return res([{ id: 'main', refresh_token: 'rt', google_email: 'boss@gmail.com' }]);
    if (u.pathname === '/rest/v1/gcal_calendars') {
        if (m === 'GET') return res([...cals.values()]);
        const key = decodeURIComponent((u.searchParams.get('key') || '').replace(/^eq\./, ''));
        if (m === 'PATCH') { Object.assign(cals.get(key), JSON.parse(opt.body)); return res(undefined, 204); }
        if (m === 'POST') { JSON.parse(opt.body).forEach(r => cals.set(r.key, Object.assign(cals.get(r.key) || {}, r))); return res(undefined, 201); }
    }
    if (u.hostname === 'oauth2.googleapis.com') return res({ access_token: 'at', expires_in: 3600 });
    if (u.hostname === 'www.googleapis.com') {
        if (m === 'POST' && u.pathname === '/calendar/v3/calendars') { const id = 'g_new_' + calls; googleNames.set(id, JSON.parse(opt.body).summary); acl.set(id, new Set()); return res({ id }); }
        if (failGoogle) return res({ error: { message: '구글 오류(시험)' } }, 500);
        const mm = u.pathname.match(/\/calendars\/([^/]+)(\/acl)?/);
        const id = mm && decodeURIComponent(mm[1]);
        if (m === 'PATCH' && !mm[2]) { googleNames.set(id, JSON.parse(opt.body).summary); return res({ id }); }
        if (m === 'GET' && mm[2]) return res({ items: [...(acl.get(id) || [])].map(v => ({ scope: { type: 'user', value: v } })) });
        if (m === 'POST' && mm[2]) { acl.get(id).add(JSON.parse(opt.body).scope.value); return res({}); }
    }
    return res([], 200);
};

(async () => {
    const { onRequest } = await import('../functions/api/[[route]].js');
    const G = await import('../functions/api/_gcal.js');
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec', KOB_ENV: 'dev' };
    const setup = async (limit, from) => {
        if (G.forgetToken) G.forgetToken();          // 매번 새 요청처럼 — 토큰도 다시 받습니다(가장 많이 쓰는 경우)
        calls = 0;
        const r = await onRequest({ request: new Request('https://gw.test/api/calendar/setup', { method: 'POST', headers: { Authorization: 'Bearer tok-admin', 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign(limit ? { limit } : {}, from ? { from } : {})) }), env });
        return { body: await r.json(), calls };
    };

    console.log(`\n[1] 캘린더 ${cals.size}개를 [DEV] 이름으로 — 서버 한 번에 바깥 호출 ${LIMIT}번 이하`);
    let rounds = 0, maxCalls = 0, renamed = 0, failed = 0, from = 0;
    for (; rounds < 20; ) {
        const { body, calls: n } = await setup(30, from);   // 화면이 보내는 값과 같게 (앞 응답의 next 로 이어서)
        from = body.next;
        rounds++; maxCalls = Math.max(maxCalls, n);
        renamed += (body.renamed || []).length; failed += (body.failed || []).length;
        ok(n <= LIMIT, `${rounds}번째 — 바깥 호출 ${n}번 · 이름 바꿈 ${(body.renamed || []).length} · 남음 ${body.remaining}`);
        if (!body.remaining) break;
    }
    ok(failed === 0, '실패 0건');
    ok(renamed === cals.size, `이름 바꾼 캘린더 ${renamed} = ${cals.size}`);
    ok([...googleNames.values()].every(n => n.startsWith('[DEV]')), '구글 쪽 이름이 모두 [DEV] 로 시작');
    ok([...cals.values()].every(c => c.label.startsWith('[DEV]')), '저장된 이름도 모두 [DEV]');
    ok(rounds > 1, `한 번에 다 하지 않고 나눠서 (${rounds}번)`);

    console.log('\n[2] 화면이 큰 값을 보내도 서버가 상한(36)으로 자릅니다');
    [...cals.values()].forEach(c => { c.label = c.label.replace('[DEV]', ''); });
    const big = await setup(60);
    ok(big.calls <= LIMIT, `limit 60 요청 — 바깥 호출 ${big.calls}번`);

    console.log('\n[3] 다 맞춘 뒤 다시 누르면 할 일 없음');
    { let f = 0; for (let i = 0; i < 10; i++) { const r = await setup(30, f); if (!r.body.remaining) break; f = r.body.next; } }
    let f2 = 0, doneAll = false, rn = 0, maxN = 0;
    for (let i = 0; i < 10; i++) { const r = await setup(30, f2); rn += (r.body.renamed || []).length; maxN = Math.max(maxN, r.calls); if (!r.body.remaining) { doneAll = r.body.done === true; break; } f2 = r.body.next; }
    ok(doneAll && rn === 0, '바꿀 것 없음 · 끝까지 훑고 done');
    ok(maxN <= LIMIT, `확인만 할 때도 한 번에 최대 ${maxN}번`);

    console.log('\n[3-1] 새 직원 — 뒤쪽 캘린더 공유도 빠짐없이');
    const late = [...cals.values()].filter(c => c.kind === 'personal').pop();
    acl.get(late.google_calendar_id).clear();
    let f3 = 0, sharedN = 0;
    for (let i = 0; i < 10; i++) { const r = await setup(30, f3); sharedN += (r.body.shared || []).length; if (!r.body.remaining) break; f3 = r.body.next; }
    ok(sharedN === 1 && acl.get(late.google_calendar_id).size === 1, '맨 뒤 개인 캘린더에 다시 공유됨');

    console.log('\n[3-2] 처음 준비 — 전사 캘린더 하나에 40명 공유 (한 번에 못 끝내도 이어서)');
    {
        for (let i = 13; i <= 52; i++) users.push({ email: `n${i}@company.com`, name: `신입${i}`, dept: 'sales', googleEmail: `n${i}.kob@gmail.com` });
        const keep = cals.get('cal:company'); acl.get(keep.google_calendar_id).clear();
        let f = 0, rounds = 0, sharedN = 0, maxN = 0, stuck = false;
        for (; rounds < 40; rounds++) {
            const r = await setup(30, f); maxN = Math.max(maxN, r.calls);
            const did = (r.body.made || []).length + (r.body.renamed || []).length + (r.body.shared || []).length;
            sharedN += (r.body.shared || []).length;
            if (!r.body.remaining) break;
            if (!(r.body.next > f || did > 0)) { stuck = true; break; }   // 화면과 같은 멈춤 조건
            f = r.body.next;
        }
        ok(!stuck, `멈추지 않고 끝까지 (${rounds + 1}번)`);
        ok(acl.get(keep.google_calendar_id).size === users.length, `전사 캘린더 공유 ${acl.get(keep.google_calendar_id).size} = 직원 ${users.length}`);
        ok(maxN <= LIMIT, `한 번에 최대 ${maxN}번`);
    }

    console.log('\n[3-3] 구글이 계속 오류를 내도 한도 안에서');
    {
        [...cals.values()].forEach(c => { c.label = 'x'; });
        failGoogle = true;
        const r = await setup(30, 0);
        failGoogle = false;
        ok(r.calls <= LIMIT && (r.body.failed || []).length > 0, `실패 ${(r.body.failed || []).length}건 · 바깥 호출 ${r.calls}번`);
    }

    console.log('\n[4] 화면 — 남은 게 있으면 저절로 이어서 부름');
    {
        const fs = require('fs'), path = require('path');
        const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        const seg = html.slice(html.indexOf('async function gcalSetup'), html.indexOf('const ADMIN_TABS'));
        ok(/for \(let round = 0; round < 20; round\+\+\)/.test(seg) && /if \(!sum\.remaining \|\| !progressed\) break;/.test(seg), '최대 20번 · 더 나아가지 않으면 멈춤');
        ok(/limit: 30, from/.test(seg) && /x\.next > from \|\| did > 0/.test(seg), '한 번에 30 · 앞 응답의 next 로 이어서 · 아무것도 안 되면 멈춤');
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
