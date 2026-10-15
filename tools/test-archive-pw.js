// 자료실 본부 공용 계정 비밀번호 — 서버 /api/archive/password (2026-10-15). Supabase 는 가짜 fetch 로 대신합니다.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const store = {
    'gwUsers.v1': [
        { email: 'admin@k.co', name: '관리', groupId: 'admin', dept: 'admin' },
        { email: 'data@k.co', name: '자료', groupId: 'dataGroup', dept: 'mgmt' },
        { email: 'sales@k.co', name: '영업', groupId: 'sales', dept: 'sales' },
        { email: 'ops@k.co', name: '운영', groupId: 'sales', dept: 'ops' }
    ],
    'gwPermissionGroups.v2': { version: 2, groups: [
        { id: 'dataGroup', permissions: ['data-admin'] },
        { id: 'sales', permissions: ['sales', 'archive'] }
    ] },
    'gwArchive.v1': { lanUrl: 'http://192.168.0.50', account: 'dept', deptAccounts: { sales: { loginId: 'nc_sales' } } }
};
const secrets = new Map([['mailPassword', { name: 'mailPassword', value: 'MAIL-SECRET' }]]);
let whoEmail = '';
global.fetch = async (url, opt = {}) => {
    const u = new URL(String(url)), m = opt.method || 'GET';
    const res = (body, status) => new Response(body === undefined ? null : JSON.stringify(body), { status: status || 200 });
    if (u.pathname === '/auth/v1/user') return whoEmail ? res({ email: whoEmail }) : res({}, 401);
    const t = u.pathname.replace('/rest/v1/', '');
    if (t === 'app_store') {
        const k = u.searchParams.get('key') || '';
        const keys = k.startsWith('in.(') ? k.slice(4, -1).split(',').map(x => x.replace(/"/g, '')) : [k.replace(/^eq\./, '')];
        return res(keys.filter(x => x in store).map(x => ({ key: x, value: store[x] })));
    }
    if (t === 'inbound_secrets') {
        if (m === 'GET') return res(Array.from(secrets.values()));
        if (m === 'POST') { JSON.parse(opt.body).forEach(r => secrets.set(r.name, r)); return res(undefined, 201); }
        if (m === 'DELETE') { secrets.delete(String(u.searchParams.get('name')).replace(/^eq\./, '')); return res(undefined, 204); }
    }
    return res([], 200);
};

(async () => {
    const { onRequest } = await import('../functions/api/[[route]].js');
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const call = async (who, method, path, body) => {
        whoEmail = who;
        const r = await onRequest({ request: new Request('https://gw' + path, { method, headers: who ? { Authorization: 'Bearer t' } : {}, body: method === 'GET' ? undefined : JSON.stringify(body) }), env });
        return { status: r.status, body: await r.json() };
    };

    console.log('\n[1] 저장 — 전체 자료 권한만');
    ok((await call('', 'POST', '/api/archive/password', { dept: 'sales', value: 'pw-sales' })).status === 401, '로그인 안 하면 401');
    ok((await call('sales@k.co', 'POST', '/api/archive/password', { dept: 'sales', value: 'hack' })).status === 403, '직원은 자기 본부 것도 저장 못 함 (403)');
    ok((await call('admin@k.co', 'POST', '/api/archive/password', { dept: 'sales', value: 'pw-sales' })).status === 200, '관리자 저장');
    ok((await call('data@k.co', 'POST', '/api/archive/password', { dept: 'ops', value: 'pw-ops' })).status === 200, '전체 자료 권한(data-admin)도 저장');
    ok(secrets.get('archivePw:sales').value === 'pw-sales' && secrets.get('archivePw:sales').updated_by === 'admin@k.co', '서버 전용 표에 archivePw:본부 로 · 저장한 사람');
    ok((await call('admin@k.co', 'POST', '/api/archive/password', { dept: '../x', value: 'a' })).status === 400, '이상한 본부 id 는 거절');
    ok(!JSON.stringify(store['gwArchive.v1']).includes('pw-sales'), 'app_store(gwArchive.v1)에는 비밀번호가 없다');

    console.log('\n[2] 받기 — 자기 본부만');
    let r = await call('sales@k.co', 'GET', '/api/archive/password');
    ok(r.status === 200 && r.body.value === 'pw-sales' && r.body.dept === 'sales', '영업 직원 → 영업본부 비밀번호');
    r = await call('sales@k.co', 'GET', '/api/archive/password?dept=ops');
    ok(r.status === 403 && !JSON.stringify(r.body).includes('pw-ops'), '영업 직원이 운영본부를 달라면 403');
    r = await call('ops@k.co', 'GET', '/api/archive/password');
    ok(r.body.value === 'pw-ops', '운영 직원 → 운영본부 비밀번호');
    r = await call('admin@k.co', 'GET', '/api/archive/password?dept=ops');
    ok(r.body.value === 'pw-ops', '관리자는 다른 본부도');
    ok((await call('', 'GET', '/api/archive/password')).status === 401, '로그인 안 하면 401');
    ok((await call('nobody@k.co', 'GET', '/api/archive/password')).status === 403, '직원 목록에 없으면 403');
    r = await call('sales@k.co', 'GET', '/api/archive/password?dept=mailPassword');
    ok(r.status === 403, '다른 비밀 값(메일 비밀번호)은 이 통로로 못 꺼냄');
    r = await call('admin@k.co', 'GET', '/api/archive/password?dept=' + encodeURIComponent('../mailPassword'));
    ok(!JSON.stringify(r.body).includes('MAIL-SECRET'), '관리자라도 archivePw: 밖의 값은 안 나옴');

    console.log('\n[3] 현황 · 지우기 · 개인 계정 방식');
    r = await call('admin@k.co', 'GET', '/api/archive/password/status');
    ok(r.body.set && r.body.set.sales && r.body.set.ops && !r.body.set.mailPassword && !JSON.stringify(r.body).includes('pw-'), '현황 — 저장 여부만, 값은 없음');
    ok((await call('sales@k.co', 'GET', '/api/archive/password/status')).status === 403, '직원은 현황 못 봄');
    await call('admin@k.co', 'POST', '/api/archive/password', { dept: 'ops', value: '' });
    ok(!secrets.has('archivePw:ops') && secrets.has('mailPassword'), '빈 값으로 저장하면 지움 (다른 값은 그대로)');
    ok((await call('ops@k.co', 'GET', '/api/archive/password')).body.value === '', '지운 뒤 받기는 빈 값');
    store['gwArchive.v1'].account = 'personal';
    ok((await call('sales@k.co', 'GET', '/api/archive/password')).status === 409, '개인 계정 방식이면 공용 비밀번호를 내주지 않음');

    console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
    process.exit(fail ? 1 : 0);
})();
