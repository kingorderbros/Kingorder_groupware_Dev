// ==================== 킹오더브라더스 서비스 워커 ====================
// 세 화면(그룹웨어 · 파트너센터 · 운행일지)이 같은 문서를 ?mode= 로 갈라 쓰므로
// 서비스 워커도 하나만 둡니다. (2026-09-05)
//
// 화면(HTML)은 자주 고쳐지므로 **네트워크 먼저**, 안 되면 캐시로 — 옛 화면이 남지 않게 합니다.
// 그림·스크립트 같은 딸린 파일은 **캐시 먼저** 로 빠르게 띄웁니다.
// 운행일지 등 /api/ 요청은 캐시하지 않습니다 — 지난 값이 남으면 안 되는 자료입니다.
const CACHE = 'kob-dev-v2';   // 이름을 올리면 activate 에서 옛 캐시를 지웁니다 (2026-09-05)
const OFFLINE_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>연결 없음</title></head>
<body style="font-family:system-ui,-apple-system,'Malgun Gothic',sans-serif;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8fafc;color:#334155">
<div style="text-align:center;padding:24px">
  <p style="font-size:40px;margin:0 0 8px">📡</p>
  <h1 style="font-size:18px;margin:0 0 6px">연결이 없습니다</h1>
  <p style="font-size:13px;color:#64748b;margin:0">네트워크가 돌아오면 다시 열어 주세요.</p>
</div></body></html>`;

self.addEventListener('install', (e) => {
    self.skipWaiting();                       // 새 버전을 곧바로 씁니다
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));   // 옛 캐시 정리
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;                       // 저장·전송은 그대로 통과
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;        // 바깥 주소(CDN 등)는 건드리지 않습니다
    if (url.pathname.startsWith('/api/')) return;           // 자료 요청은 캐시하지 않습니다
    // manifest 는 홈 화면 이름이 바뀔 수 있어 캐시하지 않습니다 —
    // 캐시가 남으면 이름을 고쳐도 옛 이름으로 계속 담깁니다. (2026-09-05)
    if (url.pathname.endsWith('.webmanifest')) return;

    // 화면 이동 · HTML — 네트워크 먼저
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        e.respondWith((async () => {
            try {
                const fresh = await fetch(req);
                const cache = await caches.open(CACHE);
                cache.put(req, fresh.clone());
                return fresh;
            } catch (err) {
                const hit = await caches.match(req, { ignoreSearch: true });
                if (hit) return hit;
                return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            }
        })());
        return;
    }

    // 딸린 파일 — 캐시 먼저, 없으면 받아서 담아 둡니다
    e.respondWith((async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        try {
            const fresh = await fetch(req);
            if (fresh && fresh.ok && fresh.type === 'basic') {
                const cache = await caches.open(CACHE);
                cache.put(req, fresh.clone());
            }
            return fresh;
        } catch (err) {
            return new Response('', { status: 504, statusText: 'Offline' });
        }
    })());
});
