// 가짜 Supabase 로 서버까지 통째로 돌리는 시험 서버 (2026-10-05) — dev DB 를 건드리지 않고 파트너센터 회원가입 · 로그인을 해 봅니다.
//   npm run mock   →   http://localhost:8800/?mode=partner   (파트너센터 · 서버 모드)
//                       http://localhost:8800/               (그룹웨어 · 로컬 저장소 모드 — 직원 화면은 브라우저 저장소)
//   · /api/* 는 functions/api/[[route]].js 를 그대로 부르고, Supabase 대신 tools/mock-supabase.js(메모리)를 씁니다. 끄면 사라집니다.
//   · 시험용 아이디: okt01 / Oldpass123!  (오케팅홀딩스 · 파트너사 · 업체관리자)
//   · 직원 대신 승인하기: POST /api/partner-admin/... 에 Authorization: Bearer tok-admin
//   · 지금 상태 보기: GET /__mock/state · 값 바꾸기: POST /__mock/set { key, value } 또는 { customer, patch }
const http = require('http'), fs = require('fs'), path = require('path');
const { makeMock } = require('./mock-supabase.js');
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8800);

(async () => {
    const P = await import('../functions/api/_partner.js');
    const mock = makeMock({
        store: {
            'gwUsers.v1': [{ email: 'daniel@kingorder.co.kr', name: '정장훈', groupId: 'admin' }],
            'gwPermissionGroups.v2': { groups: [] },
            'gwPartnersMigrated.v1': { at: 'mock' },
            'gwPartnerAccounts.v1': [{ id: 'okt01', loginId: 'okt01', partnerId: 'p17', manager: '최제성', active: true, role: 'admin', ...(await P.hashPassword('Oldpass123!')) }],
            'gwPartnerDeptPerm.v1': {},
            'gwPartnerIntakes.v1': []
        },
        tables: { customers: [
            { id: 'p17', data: { id: 'p17', name: '오케팅홀딩스', kind: 'partner', custType: 'partner', status: '거래중' } },
            { id: 'h1', data: { id: 'h1', name: '맛나치킨 본사', kind: 'hq', custType: 'hq', franchiseHq: 'hidden' } },
            { id: 'c3', data: { id: 'c3', name: '역삼 김밥천국', kind: 'partnerShop', custType: 'partnerShop', parentId: 'p17', address: '서울 강남구 테헤란로 30', status: '거래중' } }
        ] },
        tokens: { 'tok-admin': 'daniel@kingorder.co.kr' }
    });
    global.fetch = mock.fetch;
    const { onRequest } = await import('../functions/api/[[route]].js');
    const env = Object.assign({}, mock.env, process.env.TURNSTILE_SITE_KEY ? { TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY } : {});

    http.createServer(async (q, r) => {
        const u = new URL(q.url, 'http://localhost');
        let p = decodeURIComponent(u.pathname);
        if (p === '/__mock/state') {
            r.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            return r.end(JSON.stringify({ store: Object.fromEntries(mock.store), customers: Array.from(mock.tables.get('customers').values()) }, null, 2));
        }
        // 시험 도구에서 값 바꾸기 — { key, value } (app_store) 또는 { customer: id, patch: {...} }
        if (p === '/__mock/set' && q.method === 'POST') {
            const chunks = []; for await (const c of q) chunks.push(c);
            const j = JSON.parse(Buffer.concat(chunks).toString() || '{}');
            if (j.key) mock.store.set(j.key, j.value);
            if (j.customer) { const row = mock.tables.get('customers').get(j.customer); if (row) Object.assign(row.data, j.patch || {}); }
            r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"ok":true}');
        }
        if (p.startsWith('/api/')) {
            const chunks = []; for await (const c of q) chunks.push(c);
            const body = chunks.length ? Buffer.concat(chunks) : undefined;
            const headers = Object.assign({}, q.headers, { 'cf-connecting-ip': q.socket.remoteAddress || 'local' });
            try {
                const res = await onRequest({ request: new Request('http://localhost' + q.url, { method: q.method, headers, body: ['GET', 'HEAD'].includes(q.method) ? undefined : body }), env });
                const out = {}; res.headers.forEach((v, k) => { out[k] = v; });
                r.writeHead(res.status, out); r.end(Buffer.from(await res.arrayBuffer()));
            } catch (e) { r.writeHead(500, { 'content-type': 'application/json' }); r.end(JSON.stringify({ ok: false, error: String(e && e.message || e) })); }
            return;
        }
        if (p === '/config/app-config.js') {
            // 파트너센터(?mode=partner)는 서버 모드로 — Supabase 주소는 가짜지만 파트너센터는 /api 만 씁니다. 그룹웨어 화면은 로컬 저장소 모드.
            const partner = /mode=partner/.test(String(q.headers.referer || ''));
            r.writeHead(200, { 'content-type': 'text/javascript' });
            return r.end(partner ? "window.KOB_CONFIG={env:'mock',supabaseUrl:'https://mock.supabase.co',supabaseAnonKey:'mock',apiBase:''};"
                                 : "window.KOB_CONFIG={env:'mock',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");
        }
        if (p === '/') p = '/index.html';
        if (p === '/privacy') p = '/privacy.html';
        if (p === '/sw.js') { r.writeHead(404); return r.end(); }
        fs.readFile(path.join(ROOT, p), (e, b) => {
            if (e) { r.writeHead(404); return r.end(); }
            const type = p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.png') ? 'image/png' : p.endsWith('.json') ? 'application/json' : 'application/octet-stream';
            r.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); r.end(b);
        });
    }).listen(PORT, () => console.log(`시험 서버: http://localhost:${PORT}/?mode=partner  (okt01 / Oldpass123!) · 상태 /__mock/state`));
})();
