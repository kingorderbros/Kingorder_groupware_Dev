// 사용법: node tools/e2e-inbound-notify.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-19 — 인바운드 새 건 알림: 직원 직접 등록(빠른 등록 · 상세 창 · 가져오기) → 배정 본부 직원 알림함 + 푸시
const http = require('http'), fs = require('fs'), path = require('path'), pp = require('puppeteer-core');
const ROOT = process.argv[2] || '.';
const SHOTS = process.argv[3] || '';
const PORT = 8818;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p === '/config/app-config.js') { r.writeHead(200); return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};"); }
    if (p.startsWith('/api/')) { r.writeHead(404); return r.end('{}'); }
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
});
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const ADMIN = { email: 'daniel@kingorder.co.kr', dept: 'admin', name: '정장훈' };

async function openPage(br, url, w, h) {
    const pg = await br.newPage();
    await pg.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    pg.on('dialog', d => { pg.__dialogs = (pg.__dialogs || []).concat(d.message()); d.accept(); });
    await pg.goto(url, { waitUntil: 'networkidle0' });
    await pg.waitForFunction(() => document.documentElement.hasAttribute('data-kob-ready'), { timeout: 20000 });
    pg.__errs = errs;
    return pg;
}

// 브라우저 안 — 시험 직원 · 푸시 가로채기
function seed() {
    localUsers.push(
        { id: 't-s1', name: '김영업', email: 'kim@k.co', dept: 'sales', groupId: 'sales' },
        { id: 't-s2', name: '이영업', email: 'lee@k.co', dept: 'sales', groupId: 'sales' },
        { id: 't-s3', name: '휴직영업', email: 'leave@k.co', dept: 'sales', groupId: 'sales', onLeave: true },
        { id: 't-s4', name: '퇴사영업', email: 'out@k.co', dept: 'sales', groupId: 'sales', resigned: true },
        { id: 't-o1', name: '박운영', email: 'park@k.co', dept: 'ops', groupId: 'ops' },
        { id: 't-p1', name: '최결제', email: 'choi@k.co', dept: 'payment', groupId: 'payment' },
        { id: 't-v1', name: '외주직원', email: 'v@k.co', dept: 'vendor', groupId: 'vendor' });
    window.__sent = [];
    window.kobPush = Object.assign({}, window.kobPush || {}, { send: (n, label) => window.__sent.push({ id: n.id, to: n.toUser, label }) });
}

srv.listen(PORT, async () => {
    const br = await pp.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
    const base = `http://localhost:${PORT}/`;
    try {
        for (const [w, h] of [[1400, 900], [390, 844]]) {
            console.log(`\n[화면 ${w}x${h}]`);
            const g = await openPage(br, base, w, h);
            await g.evaluate(u => enterApp(u), ADMIN);
            await g.evaluate(seed);
            await g.evaluate(() => navigate('inbound-center', document.getElementById('nav-inbound-center')));
            const r = await g.evaluate(async () => {
                const sleep = ms => new Promise(r => setTimeout(r, ms));
                const out = {};
                const mine = (since) => collabNotifications.slice(since).filter(n => n.type === 'inbound-new');
                // ① 빠른 등록 — 영업 배정
                let k = collabNotifications.length; __sent.length = 0;
                Object.assign(inbQuickDraft, { channel: 'blog', raw: '키오스크 설치 문의합니다', message: '키오스크 설치 문의합니다', company: '강남치킨', phone: '010-1234-5678', dept: '영업' });
                saveInbQuick(); await sleep(50);
                let ns = mine(k);
                out.quickTo = ns.map(n => n.toUser).sort().join(',');
                out.quickId = ns[0] && ns[0].inboundId;
                out.quickDetail = ns[0] && ns[0].detail;
                out.quickTitle = ns[0] && ns[0].title;
                out.pushTo = __sent.map(x => x.to).sort().join(',');
                out.pushLabel = __sent[0] && __sent[0].label;
                // 알림 문구 · 누르면 그 건 상세
                out.text = ns[0] ? notiText(ns[0]) : '';
                out.click = ns[0] ? notiClickJs(ns[0]) : '';
                closeInboundModal && document.getElementById('inbound-modal').classList.add('hidden');
                openInboundFromNotice(out.quickId); await sleep(50);
                const modal = document.getElementById('inbound-modal');
                out.opened = !modal.classList.contains('hidden') && inboundEditId === out.quickId;
                closeInboundModal();
                // ② 빠른 등록 — 자동 배정(운영 키워드)
                k = collabNotifications.length;
                Object.assign(inbQuickDraft, { channel: 'cafe', raw: '키오스크 고장 AS 요청', message: '키오스크 고장 AS 요청', company: '역삼분식', phone: '010-2222-3333', dept: 'auto' });
                saveInbQuick(); await sleep(50);
                out.autoTo = mine(k).map(n => n.toUser).sort().join(',');
                // ③ 미배정 (상세 창에서 새로 등록)
                k = collabNotifications.length;
                openInboundModal(); await sleep(20);
                Object.assign(inboundDraft, { company: '서초카페', name: '홍길동', phone: '010-4444-5555', requestNote: '문의' });
                saveInbound(); await sleep(50);
                out.modalTo = mine(k).map(n => n.toUser).sort().join(',');
                // ④ 가져오기 5건 → 사람마다 1개로 묶음
                k = collabNotifications.length;
                const five = [1, 2, 3, 4, 5].map(i => makeInboundRecord({ channel: 'mail', inAt: inbNowStamp(), company: '가게' + i, phone: '010-90' + i + '0-000' + i, message: '문의 ' + i, extKey: 'e2e:' + i + ':' + Date.now(), autoAssign: false }));
                five.forEach(r => { r.kob.dept = '영업'; });
                inboundAddRecords(five); await sleep(50);
                ns = mine(k);
                out.bundle = ns.length === 2 && ns.every(n => n.title === '새 인바운드 5건' && !n.inboundId); out.bundleDbg = ns.map(n => n.toUser + ':' + n.title).join(' / ');
                out.bundleClick = ns[0] ? notiClickJs(ns[0]) : '';
                // ⑤ 시트 이관은 알리지 않음
                k = collabNotifications.length;
                const sh = makeInboundRecord({ channel: 'sheet', inAt: inbNowStamp(), company: '이관', phone: '010-7777-8888', message: '이관', extKey: 'e2e-sheet:' + Date.now() });
                inboundAddRecords([sh]); await sleep(50);
                out.sheet = mine(k).length;
                // 알림함에 그려 보기 (김영업 화면)
                out.bell = (() => { try { const n = collabNotifications.filter(x => x.type === 'inbound-new' && x.toUser === '김영업'); return n.length > 0 && typeof notiText(n[0]) === 'string'; } catch (e) { return String(e); } })();
                return out;
            });
            ok(r.quickTo === '김영업,이영업', `빠른 등록(영업) → 영업본부 직원만 (휴직 · 퇴사 · 등록한 본인 제외) (얻음 ${r.quickTo})`);
            ok(r.pushTo === '김영업,이영업' && r.pushLabel === '인바운드', `폰 · PC 푸시도 같은 사람에게 [인바운드] (얻음 ${r.pushTo} · ${r.pushLabel})`);
            ok(r.quickTitle === '강남치킨' && /^IN-\d+ · 네이버 블로그 · 빠른 등록 · 영업본부 · 키오스크 설치 문의합니다$/.test(r.quickDetail || ''), `알림 제목 · 내용 (얻음 ${r.quickTitle} / ${r.quickDetail})`);
            ok(/인바운드 새 건이 등록되었습니다/.test(r.text), '알림함 문구');
            ok(/^openInboundFromNotice\(/.test(r.click) && r.opened, '알림을 누르면 인바운드 관리 → 그 건 상세');
            ok(r.autoTo === '박운영', `자동 배정(운영 키워드) → 운영본부 직원 (얻음 ${r.autoTo})`);
            ok(r.modalTo === '관리자,김영업,박운영,이영업', `상세 창 새 등록(미배정) → 인바운드 화면 권한자 모두 (관리자 계정 포함, 결제본부 · 외주 제외) (얻음 ${r.modalTo})`);
            ok(r.bundle && /^openInboundFromNotice\(/.test(r.bundleClick), '가져오기 5건 → 사람마다 \'새 인바운드 5건\' 하나 · 누르면 인바운드 관리');
            ok(r.sheet === 0, '시트 이관은 알리지 않음');
            ok(r.bell === true, '알림함 그리기 오류 없음');
            ok(g.__errs.length === 0, `화면 오류 0 (얻음 ${g.__errs.join(' | ')})`);
            await g.close();
        }
    } catch (e) { fail++; console.log('  ✗ 실행 오류', e && e.stack); }
    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    await br.close(); srv.close(); process.exit(fail ? 1 : 0);
});
