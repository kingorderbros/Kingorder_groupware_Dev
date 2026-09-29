// 첨부파일 서버 (2026-09-29 · 3단계) — functions/api/_files.js 판단 + /api/files/* 흐름. Supabase(Auth · app_store · Storage)는 가짜 fetch 로 대신합니다.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const store = {
    'gwUsers.v1': [{ email: 'staff@k.co', name: '직원', groupId: 'sales' }],
    'gwPartners.v1': [{ id: 'PA-1', name: '가나' }, { id: 'PA-2', name: '다라' }],
    'gwPartnerAccounts.v1': [{ loginId: 'p1', partnerId: 'PA-1' }, { loginId: 'p2', partnerId: 'PA-2' }, { loginId: 'p3', partnerId: 'PA-1', active: false }],
    'gwPartnerIntakes.v1': [],
    'gwArchivePosts.v1': [],
    'gwDevRequests.v1': []
};
const objects = new Map();          // Storage 가짜 — 경로 → { type, bytes }
let whoEmail = '';
global.fetch = async (url, opt = {}) => {
    const u = new URL(String(url)), m = opt.method || 'GET';
    const res = (body, status, headers) => new Response(body === undefined ? null : (typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)), { status: status || 200, headers });
    if (u.pathname === '/auth/v1/user') return whoEmail ? res({ email: whoEmail }) : res({}, 401);
    if (u.pathname.startsWith('/storage/v1/object/files/')) {
        const p = u.pathname.slice('/storage/v1/object/files/'.length).split('/').map(decodeURIComponent).join('/');
        if (m === 'POST') { objects.set(p, { type: opt.headers['Content-Type'], bytes: new Uint8Array(opt.body) }); return res({ Key: 'files/' + p }); }
        const o = objects.get(p);
        return o ? res(o.bytes, 200, { 'Content-Type': o.type }) : res({ error: 'not found' }, 400);
    }
    if (u.pathname === '/rest/v1/app_store') {
        const k = u.searchParams.get('key') || '';
        const keys = k.startsWith('in.(') ? k.slice(4, -1).split(',').map(x => x.replace(/"/g, '')) : [k.replace(/^eq\./, '')];
        return res(keys.filter(x => x in store).map(x => ({ key: x, value: store[x] })));
    }
    return res([], 200);
};

(async () => {
    const F = await import('../functions/api/_files.js');
    const P = await import('../functions/api/_partner.js');
    const SECRET = 'k';

    console.log('\n[1] 쿠키 · 경로 · 이름');
    const c = await F.makeCookieValue(SECRET, { k: 'staff', id: 'staff@k.co' });
    ok((await F.readCookieValue(SECRET, c)).id === 'staff@k.co', '만든 쿠키를 읽는다');
    ok(!(await F.readCookieValue('other', c)), '다른 열쇠면 거절');
    ok(!(await F.readCookieValue(SECRET, c, Date.now() + 13 * 3600e3)), '12시간 지나면 거절');
    ok(!(await F.readCookieValue(SECRET, await P.makeToken(SECRET, 'p1', 'PA-1'))), '파트너 로그인 토큰을 파일 쿠키로 쓸 수 없다');
    const sp = F.newPath({ k: 'staff' }, '견적서 최종.PDF'), pp = F.newPath({ k: 'partner', p: 'PA-1' }, '사업자등록증.jpg');
    ok(/^staff\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/.test(sp) && F.validPath(sp), '직원 파일 경로 — 한글 이름은 경로에 넣지 않고 확장자만');
    ok(pp.startsWith('partner/PA-1/') && F.validPath(pp), '파트너 파일은 파트너사 폴더');
    ok(!F.validPath('staff/../secret') && !F.validPath('partner/PA-1/../../x') && !F.validPath(''), '엉뚱한 경로는 거절');
    ok(F.dispositionHeader('계약서.pdf', true).includes("filename*=UTF-8''%EA%B3%84"), '한글 파일 이름을 내려받기 머리글에 담는다');
    ok(F.inlineSafe('image/png') && F.inlineSafe('application/pdf') && !F.inlineSafe('text/html') && !F.inlineSafe('image/svg+xml'), 'html · svg 는 화면에서 열지 않고 내려받기로');

    console.log('\n[2] 파트너가 볼 수 있는 파일');
    const staffFile = F.newPath({ k: 'staff' }, 'a.png'), otherPartner = F.newPath({ k: 'partner', p: 'PA-2' }, 'b.png');
    const view = { 'gwDevRequests.v1': [{ docs: [{ path: staffFile }, { path: otherPartner }] }] };
    ok(F.partnerMayRead(pp, { p: 'PA-1' }, {}), '자기 파트너사 폴더는 본다');
    ok(F.partnerMayRead(staffFile, { p: 'PA-1' }, view), '자기에게 보이는 자료에 적힌 직원 파일은 본다');
    ok(!F.partnerMayRead(F.newPath({ k: 'staff' }, 'x.png'), { p: 'PA-1' }, view), '자료에 없는 직원 파일은 못 본다');
    ok(!F.partnerMayRead(otherPartner, { p: 'PA-1' }, view), '다른 파트너사 파일은 자기 자료에 적어 넣어도 못 본다');

    const { onRequest } = await import('../functions/api/[[route]].js');
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: SECRET };
    const go = async (method, path, { auth, cookie, body, type } = {}) => {
        const headers = {};
        if (auth) headers.Authorization = 'Bearer ' + auth;
        if (cookie) headers.Cookie = 'kob_files=' + cookie;
        if (type) headers['Content-Type'] = type;
        return onRequest({ request: new Request('https://gw' + path, { method, headers, body }), env });
    };
    const cookieOf = (r) => { const m = /kob_files=([^;]+)/.exec(r.headers.get('Set-Cookie') || ''); return m ? m[1] : ''; };

    console.log('\n[3] 쿠키 받기');
    whoEmail = '';
    ok((await go('POST', '/api/files/session')).status === 401, '로그인 없으면 401');
    whoEmail = 'nobody@k.co';
    ok((await go('POST', '/api/files/session', { auth: 'x' })).status === 403, '직원 목록에 없으면 403');
    whoEmail = 'staff@k.co';
    let r = await go('POST', '/api/files/session', { auth: 'supabase-token' });
    const staffCookie = cookieOf(r);
    ok(r.status === 200 && staffCookie && /HttpOnly/.test(r.headers.get('Set-Cookie')) && /Path=\/api\/files/.test(r.headers.get('Set-Cookie')) && /Secure/.test(r.headers.get('Set-Cookie')), '직원 — HttpOnly · /api/files 에만 · Secure 쿠키');
    whoEmail = '';
    r = await go('POST', '/api/files/session', { auth: await P.makeToken(SECRET, 'p1', 'PA-1') });
    const p1Cookie = cookieOf(r);
    ok(r.status === 200 && (await r.json()).kind === 'partner', '파트너 토큰으로도 받는다');
    r = await go('POST', '/api/files/session', { auth: await P.makeToken(SECRET, 'p3', 'PA-1') });
    ok(r.status === 401, '사용 중지된 파트너 계정은 못 받는다');

    console.log('\n[4] 올리기 · 받기');
    ok((await go('POST', '/api/files/upload?name=a.txt', { body: 'hi' })).status === 401, '쿠키 없이 올리면 401');
    r = await go('POST', '/api/files/upload?name=' + encodeURIComponent('회의록.txt') + '&type=text/plain', { cookie: staffCookie, body: '안녕하세요' });
    const up = (await r.json()).file;
    ok(r.status === 200 && up && up.path.startsWith('staff/') && up.name === '회의록.txt' && up.size === Buffer.byteLength('안녕하세요'), '직원이 올리면 경로 · 이름 · 크기를 돌려준다');
    ok(objects.has(up.path) && objects.get(up.path).type === 'text/plain', 'Storage 에 들어갔다');
    r = await go('GET', '/api/files/get?p=' + encodeURIComponent(up.path) + '&n=' + encodeURIComponent('회의록.txt'), { cookie: staffCookie });
    ok(r.status === 200 && (await r.text()) === '안녕하세요' && /^inline/.test(r.headers.get('Content-Disposition')), '직원이 받는다 (텍스트는 화면에서 열기)');
    r = await go('GET', '/api/files/get?p=' + encodeURIComponent(up.path) + '&dl=1', { cookie: staffCookie });
    ok(/^attachment/.test(r.headers.get('Content-Disposition')), 'dl=1 이면 내려받기');
    ok((await go('POST', '/api/files/upload?name=big.bin', { cookie: staffCookie, body: new Uint8Array(20 * 1024 * 1024 + 1) })).status === 413, '20MB 넘으면 거절');
    ok((await go('POST', '/api/files/upload?name=empty.txt', { cookie: staffCookie, body: '' })).status === 400, '빈 파일은 거절');
    r = await go('POST', '/api/files/upload?name=' + encodeURIComponent('통장사본.png') + '&type=image/png', { cookie: p1Cookie, body: new Uint8Array([137, 80, 78, 71]) });
    const pUp = (await r.json()).file;
    ok(r.status === 200 && pUp.path.startsWith('partner/PA-1/'), '파트너가 올리면 자기 파트너사 폴더');
    ok((await go('GET', '/api/files/get?p=' + encodeURIComponent(pUp.path), { cookie: p1Cookie })).status === 200, '파트너가 자기 파일을 받는다');
    ok((await go('GET', '/api/files/get?p=' + encodeURIComponent(pUp.path), { cookie: staffCookie })).status === 200, '직원은 파트너 파일도 받는다');
    ok((await go('GET', '/api/files/get?p=' + encodeURIComponent(up.path), { cookie: p1Cookie })).status === 403, '파트너는 자기와 상관없는 직원 파일을 못 받는다');
    store['gwArchivePosts.v1'] = [{ id: 'A1', open: true, files: [{ path: up.path, name: '회의록.txt' }] }];
    ok((await go('GET', '/api/files/get?p=' + encodeURIComponent(up.path), { cookie: p1Cookie })).status === 200, '공개 자료실 글에 붙은 직원 파일은 파트너도 받는다');
    store['gwArchivePosts.v1'][0].open = false;
    ok((await go('GET', '/api/files/get?p=' + encodeURIComponent(up.path), { cookie: p1Cookie })).status === 403, '글을 비공개로 바꾸면 다시 못 받는다');
    const p2Cookie = await F.makeCookieValue(SECRET, { k: 'partner', id: 'p2', p: 'PA-2' });
    ok((await go('GET', '/api/files/get?p=' + encodeURIComponent(pUp.path), { cookie: p2Cookie })).status === 403, '다른 파트너사 파일은 못 받는다');
    store['gwPartnerAccounts.v1'][0].active = false;
    ok((await go('GET', '/api/files/get?p=' + encodeURIComponent(pUp.path), { cookie: p1Cookie })).status === 401, '쿠키가 남아 있어도 계정을 중지하면 못 받는다');
    store['gwPartnerAccounts.v1'][0].active = true;
    ok((await go('GET', '/api/files/get?p=' + encodeURIComponent('staff/2026/09/00000000-0000-0000-0000-000000000000.pdf'), { cookie: staffCookie })).status === 404, '없는 파일은 404');
    ok((await go('GET', '/api/files/get?p=..%2F..%2Fetc', { cookie: staffCookie })).status === 400, '엉뚱한 경로는 400');
    r = await go('POST', '/api/files/upload?name=x.html&type=text/html', { cookie: staffCookie, body: '<script>alert(1)</script>' });
    const html = (await r.json()).file;
    r = await go('GET', '/api/files/get?p=' + encodeURIComponent(html.path), { cookie: staffCookie });
    ok(/^attachment/.test(r.headers.get('Content-Disposition')) && r.headers.get('X-Content-Type-Options') === 'nosniff', 'html 파일은 화면에서 열지 않고 내려받기로 (스크립트 차단)');

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
