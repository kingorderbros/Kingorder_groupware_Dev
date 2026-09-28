// 로그인 창 아이디 → 이메일 (/api/auth/lookup) 시험 (2026-09-28) — Supabase 는 가짜 fetch 로 대신합니다.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const USERS = [
    { email: 'daniel@kingorder.co.kr', name: '정장훈', groupId: 'admin' },
    { email: 'sales.lee@kingorder.co.kr', name: '이영업' },
    { email: 'kim@kingorder.co.kr', name: '김일' },
    { email: 'kim@partner.com', name: '김이' }
];
global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/app_store')) {
        const body = u.includes('gwUsers.v1') ? JSON.stringify([{ key: 'gwUsers.v1', value: USERS }]) : '[]';
        return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200 });
};

(async () => {
    const { onRequest } = await import('../functions/api/[[route]].js');
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const call = async (id) => {
        const res = await onRequest({ request: new Request('https://gw/api/auth/lookup', { method: 'POST', body: JSON.stringify({ id }) }), env });
        return { status: res.status, j: await res.json() };
    };

    console.log('\n[1] 찾기');
    let r = await call('daniel');
    ok(r.j.ok && r.j.email === 'daniel@kingorder.co.kr', '앞부분만 넣어도 이메일을 찾는다');
    r = await call('DANIEL@kingorder.co.kr');
    ok(r.j.ok && r.j.email === 'daniel@kingorder.co.kr', '전체 주소 · 대문자도 된다');
    r = await call('sales.lee');
    ok(r.j.ok && r.j.email === 'sales.lee@kingorder.co.kr', '점이 들어간 아이디');

    console.log('\n[2] 못 찾거나 겹칠 때');
    r = await call('nobody');
    ok(!r.j.ok && /등록되지 않은/.test(r.j.error), '없는 아이디는 등록되지 않은 계정');
    r = await call('kim');
    ok(!r.j.ok && /2개/.test(r.j.error), '앞부분이 겹치면 전체 주소를 넣어 달라고 한다');
    ok(!/partner\.com|김이/.test(r.j.error), '겹칠 때 다른 사람의 주소 · 이름은 알려 주지 않는다');
    r = await call('');
    ok(r.status === 400, '빈 아이디는 400');

    console.log('\n[3] 완전히 새 환경의 처음 설정 (2026-09-28 검토)');
    {
        // 직원 목록도 로그인 계정도 없는 서버
        let saved = null;
        const realFetch = global.fetch;
        global.fetch = async (url, opt = {}) => {
            const u = String(url);
            if (u.includes('/auth/v1/admin/users') && (opt.method || 'GET') === 'GET') return new Response(JSON.stringify({ users: [] }), { status: 200 });
            if (u.includes('/auth/v1/admin/users') && opt.method === 'POST') return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
            if (u.includes('/rest/v1/app_store') && (opt.method || 'GET') === 'GET') return new Response('[]', { status: 200 });
            if (u.includes('/rest/v1/app_store') && opt.method === 'POST') { saved = JSON.parse(opt.body); return new Response(null, { status: 201 }); }
            return new Response('[]', { status: 200 });
        };
        const res = await onRequest({ request: new Request('https://gw/api/auth/bootstrap', { method: 'POST', body: JSON.stringify({ email: 'boss@k.co' }) }), env });
        const j = await res.json();
        ok(res.status === 200 && j.ok && j.password, '직원 목록이 없어도 첫 관리자 임시 비밀번호가 나온다');
        ok(saved && saved[0].key === 'gwUsers.v1' && saved[0].value[0].email === 'boss@k.co' && saved[0].value[0].groupId === 'admin', '관리자 한 명짜리 직원 목록을 만들어 둔다');
        global.fetch = realFetch;
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
