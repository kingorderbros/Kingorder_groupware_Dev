// 사용법: node tools/e2e-calendar-mode.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-12 — 킹오더일정(?mode=calendar): 휴대폰 전용 일정 화면
const http = require('http'), fs = require('fs'), path = require('path'), pp = require('puppeteer-core');
const ROOT = process.argv[2] || '.';
const SHOTS = process.argv[3] || '';
const PORT = 8817;
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
    pg.on('dialog', d => d.accept());
    await pg.goto(url, { waitUntil: 'networkidle0' });
    await pg.waitForFunction(() => document.documentElement.hasAttribute('data-kob-ready'), { timeout: 20000 });
    pg.__errs = errs;
    return pg;
}

srv.listen(PORT, async () => {
    const br = await pp.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
    const base = `http://localhost:${PORT}/`;
    try {
        // ---------- Task 1: 일정 전용 주소 ----------
        console.log('[1] 일정 전용 주소 ?mode=calendar');
        const pg = await openPage(br, base + '?mode=calendar', 390, 844);
        const head = await pg.evaluate(() => ({
            mode: document.documentElement.dataset.mode,
            title: document.title,
            manifest: (document.getElementById('pwa-manifest') || {}).href || '',
            appleTitle: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || '',
            loginVisible: !document.getElementById('login-view').classList.contains('hidden') && getComputedStyle(document.getElementById('login-view')).display !== 'none'
        }));
        ok(head.mode === 'calendar', `data-mode = calendar (얻음 ${head.mode})`);
        ok(head.title.includes('일정'), `창 제목에 '일정' (얻음 ${head.title})`);
        ok(/dev-calendar\.webmanifest$/.test(head.manifest), `manifest = dev-calendar.webmanifest (얻음 ${head.manifest})`);
        ok(head.appleTitle === '[DEV]킹오더일정', `홈 화면 이름 [DEV]킹오더일정 (얻음 ${head.appleTitle})`);
        ok(head.loginVisible, '로그인 전에는 로그인 화면');
        const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/pwa/calendar.webmanifest'), 'utf8'));
        ok(mf.start_url === '/?mode=calendar' && mf.short_name === '킹오더일정', 'calendar.webmanifest start_url · short_name');

        await pg.evaluate(u => enterApp(u), ADMIN);
        await new Promise(r => setTimeout(r, 500));
        const inApp = await pg.evaluate(() => {
            const vis = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
            const secs = Array.from(document.querySelectorAll('.content-section')).filter(s => !s.classList.contains('hidden')).map(s => s.id);
            return {
                cal: vis(document.getElementById('sec-calendar-center')),
                others: secs.filter(id => id !== 'sec-calendar-center'),
                sidebar: vis(document.getElementById('sidebar')),
                header: vis(document.querySelector('#app-view header'))
            };
        });
        ok(inApp.cal, '로그인 뒤 일정캘린더 화면이 보임');
        ok(inApp.others.length === 0, `다른 화면은 모두 숨김 (얻음 ${inApp.others.join(',')})`);
        ok(!inApp.sidebar, '왼쪽 메뉴 숨김');
        ok(!inApp.header, '그룹웨어 머리 줄 숨김');
        // 다른 화면으로 가려 해도 일정 화면에 머무름
        await pg.evaluate(() => { try { navigate('dashboard', null); } catch (e) { } });
        ok(await pg.evaluate(() => !document.getElementById('sec-calendar-center').classList.contains('hidden')), '다른 화면으로 이동해도 일정 화면 유지');

        await pg.evaluate(() => handleLogout());
        await new Promise(r => setTimeout(r, 300));
        const out = await pg.evaluate(() => ({ q: location.search, login: !document.getElementById('login-view').classList.contains('hidden') }));
        ok(/mode=calendar/.test(out.q) && out.login, '로그아웃 후 주소에 mode=calendar 유지 · 로그인 칸 보임');
        ok(pg.__errs.length === 0, '스크립트 오류 없음 ' + pg.__errs.join(' | '));
        await pg.close();

        console.log('[1] 그룹웨어 기본 주소는 그대로');
        const gw = await openPage(br, base, 1400, 900);
        ok(await gw.evaluate(() => document.documentElement.dataset.mode) === 'groupware', '모드 없음 = groupware');
        await gw.evaluate(u => enterApp(u), ADMIN);
        ok(await gw.evaluate(() => getComputedStyle(document.getElementById('sidebar')).display !== 'none'), '그룹웨어는 왼쪽 메뉴 보임');
        await gw.close();
    } catch (e) {
        fail++; console.log('  ✗ 시험 중 오류', e && e.stack || e);
    } finally {
        await br.close(); srv.close();
        console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
        process.exit(fail ? 1 : 0);
    }
});
