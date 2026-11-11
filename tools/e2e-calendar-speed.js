// 사용법: node tools/e2e-calendar-speed.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-12 킹오더일정 첫 화면 속도 — 휴대폰 느린 4G 흉내(1.6Mbps · 150ms), 390px
//   처음 열기(캐시 없음)와 두 번째 열기(서비스 워커 · 캐시 있음)에서 일정 화면이 보일 때까지 걸린 시간
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), pp = require('puppeteer-core');
const ROOT = process.argv[2] || '.';
const PORT = 8821;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };
// Cloudflare 처럼 압축해서 내줍니다 (gzip) — 실제 배포와 비슷하게
const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p === '/config/app-config.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};"); }
    if (p.startsWith('/api/')) { r.writeHead(404); return r.end('{}'); }
    fs.readFile(path.join(ROOT, p), (e, b) => {
        if (e) { r.writeHead(404); return r.end(); }
        const type = TYPES[path.extname(p)] || 'application/octet-stream';
        if (/text|javascript|json|manifest/.test(type)) { r.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' }); return r.end(zlib.gzipSync(b)); }
        r.writeHead(200, { 'content-type': type }); r.end(b);
    });
});
srv.listen(PORT, async () => {
    const br = await pp.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
    const pg = await br.newPage();
    await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const cdp = await pg.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });   // 휴대폰 CPU 흉내
    const measure = async (label) => {
        const t0 = Date.now();
        await pg.goto(`http://localhost:${PORT}/?mode=calendar`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await pg.waitForFunction(() => document.documentElement.hasAttribute('data-kob-ready'), { timeout: 120000 });
        const ready = Date.now() - t0;
        await pg.evaluate(() => enterApp({ email: 'daniel@kingorder.co.kr', dept: 'admin', name: '정장훈' }));
        await pg.waitForFunction(() => { const s = document.getElementById('sec-calendar-center'); return s && !s.classList.contains('hidden'); });
        const shown = Date.now() - t0;
        console.log(`  ${label}: 화면 준비 ${(ready / 1000).toFixed(1)}초 · 일정 화면 ${(shown / 1000).toFixed(1)}초`);
        return { ready, shown };
    };
    const first = await measure('처음 열기 (캐시 없음)');
    await new Promise(r => setTimeout(r, 1500));   // 서비스 워커 등록 · 캐시 채우기
    const second = await measure('두 번째 열기 (캐시 있음)');
    const size = fs.statSync(path.join(ROOT, 'index.html')).size;
    console.log(`  index.html ${(size / 1024 / 1024).toFixed(2)}MB · gzip ${(zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'index.html'))).length / 1024).toFixed(0)}KB`);
    console.log(JSON.stringify({ first, second }));
    await br.close(); srv.close();
});
