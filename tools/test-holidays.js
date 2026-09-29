// 대한민국 공휴일 (2026-09-29) — functions/api/_holidays.js 해석 + /api/holidays 흐름. 구글 · Supabase 는 가짜 fetch.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const ev = (d, e, s, desc) => `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${d}\r\nDTEND;VALUE=DATE:${e}\r\nSUMMARY:${s}\r\nDESCRIPTION:${desc}\r\nEND:VEVENT\r\n`;
const ICS = 'BEGIN:VCALENDAR\r\n'
    + ev('20261003', '20261004', '개천절', '공휴일')
    + ev('20261005', '20261006', '쉬는 날 개천절', '공휴일')
    + ev('20261001', '20261002', '국군의날', '기념일\\n기념일을 숨기려면 Google Calendar 설정 > 대한민국')
    + ev('20260924', '20260927', '추석 연휴', '공휴일')                // 여러 날짜
    + ev('20260603', '20260604', '지방선거일', '공휴일')
    + 'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261010\r\nSUMMARY:한글\r\n 날\r\nDESCRIPTION:공휴일\r\nEND:VEVENT\r\n'   // 접힌 줄
    + Array.from({ length: 8 }, (_, i) => ev(`202701${String(i + 10).padStart(2, '0')}`, `202701${String(i + 11).padStart(2, '0')}`, '시험' + i, '공휴일')).join('')
    + 'END:VCALENDAR\r\n';
const store = {};
let icsStatus = 200, icsCalls = 0;
global.fetch = async (url, opt = {}) => {
    const u = new URL(String(url)), m = opt.method || 'GET';
    const res = (body, status) => new Response(body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body)), { status: status || 200 });
    if (u.hostname === 'calendar.google.com') { icsCalls++; return res(ICS, icsStatus); }
    if (u.pathname === '/rest/v1/app_store') {
        if (m === 'POST') { JSON.parse(opt.body).forEach(r => { store[r.key] = r.value; }); return res(undefined, 201); }
        const k = (u.searchParams.get('key') || '').replace(/^eq\./, '');
        return res(k in store ? [{ value: store[k] }] : []);
    }
    return res([], 200);
};
(async () => {
    const H = await import('../functions/api/_holidays.js');
    console.log('\n[1] 해석');
    const d = H.parseIcs(ICS);
    ok(d['2026-10-03'] === '개천절' && d['2026-10-05'] === '개천절 대체공휴일', "공휴일 · '쉬는 날 ○○' 은 '○○ 대체공휴일'");
    ok(!d['2026-10-01'], '기념일(국군의날)은 뺀다');
    ok(d['2026-09-24'] && d['2026-09-25'] && d['2026-09-26'] && !d['2026-09-27'], '여러 날짜에 걸친 연휴는 하루씩 (끝나는 날은 빼고)');
    ok(d['2026-06-03'] === '지방선거일', '선거일');
    ok(d['2026-10-09'] === '한글날', '접힌 줄도 편다');
    ok(H.isStale(null) && !H.isStale({ days: {}, updatedAt: new Date().toISOString() }) && H.isStale({ days: {}, updatedAt: '2020-01-01' }), '하루 지나면 새로 받는다');

    const { onRequest } = await import('../functions/api/[[route]].js');
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const call = async (q) => { const r = await onRequest({ request: new Request('https://gw/api/holidays' + (q || '')), env }); return { status: r.status, j: await r.json() }; };
    console.log('\n[2] 서버');
    let r = await call();
    ok(r.status === 200 && !r.j.cached && r.j.value.days['2026-10-03'] && store['gwHolidays.v1'], '처음엔 구글에서 받아 저장 (로그인 없이)');
    r = await call();
    ok(r.j.cached && icsCalls === 1, '하루 안에는 저장된 것을 그대로 (구글에 다시 안 감)');
    store['gwHolidays.v1'].updatedAt = '2020-01-01T00:00:00Z'; icsStatus = 500;
    r = await call();
    ok(r.status === 200 && r.j.stale && r.j.value.days['2026-10-03'], '구글이 안 되면 예전 것으로');
    delete store['gwHolidays.v1'];
    r = await call();
    ok(r.status === 502, '예전 것도 없고 구글도 안 되면 502');
    const P = await import('../functions/api/_partner.js');
    ok(P.SHARED_KEYS.includes('gwHolidays.v1'), '파트너센터도 받는다 (설치 희망일 영업일 계산)');
    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
