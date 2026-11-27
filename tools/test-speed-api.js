// 사용 중 속도 요약 /api/speed (2026-11-27, v1.1.50) — Supabase 는 가짜 fetch. 기준 1.5초 넘으면 ok=false, SQL 실행 전이면 ready=false
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
(async () => {
    const { onRequest } = await import('../functions/api/[[route]].js');
    let reply = { status: 200, body: {} }, calls = [];
    global.fetch = async (u, o) => { calls.push({ u: String(u), o }); return new Response(JSON.stringify(reply.body), { status: reply.status }); };
    const env = { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const get = async (q = '', e = env) => (await onRequest({ request: new Request('https://gw/api/speed' + q), env: e })).json();

    reply = { status: 200, body: { minutes: 60, reports: 6, users: 3, requests: 240, p90_ms: 420, max_ms: 2100, boot_ms: 2300, slowest: [{ q: 'rest:app_store', ms: 1800, n: 6 }] } };
    let r = await get();
    ok(r.ok === true && r.ready === true && r.limit_ms === 1500 && r.users === 3, '빠름 — ok · ready · 기준 1500ms · 요약 그대로');
    ok(calls[0].u === 'https://x.supabase.co/rest/v1/rpc/gw_speed_summary' && JSON.parse(calls[0].o.body).p_minutes === 60, '서버 키로 gw_speed_summary(60) 호출');
    reply.body = Object.assign({}, reply.body, { p90_ms: 1800 });
    r = await get('?minutes=99999');
    ok(r.ok === false && r.ready === true, '느림(p90 1.8초) — ok=false');
    ok(JSON.parse(calls[1].o.body).p_minutes === 1440, '조회 범위는 최대 1440분');
    reply.body = { reports: 0, p90_ms: null };
    r = await get();
    ok(r.ok === true && r.ready === true, '사용 기록 없음 — 정상으로 봄');
    reply = { status: 404, body: { message: 'not found' } };
    r = await get();
    ok(r.ok === false && r.ready === false && /SQL/.test(r.error), 'SQL 실행 전 — ready=false · 안내');
    r = await get('', {});
    ok(r.ok === false && r.ready === false, '서버 설정 없음 — ready=false');
    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
