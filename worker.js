// ==================== Cloudflare Worker 입구 (2026-09-21) ====================
// Cloudflare 대시보드의 "Import a repository" 는 Pages 가 아니라 **Worker** 를 만듭니다.
// 그래서 이 저장소를 Worker 로도 돌아가게 했습니다 — 정적 파일(index.html · js · assets …)은
// Workers Static Assets(wrangler.toml 의 [assets]) 가 내주고, /api/* 만 여기서 받아
// functions/api/[[route]].js 의 onRequest 로 넘깁니다. 그 파일은 Pages Functions 모양
// (context.request · context.env) 그대로라 두 방식 모두에서 같은 코드가 돕니다.
import { onRequest } from './functions/api/[[route]].js';
import { syncBoth } from './functions/api/_gcal.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
            return onRequest({
                request, env, params: {}, data: {},
                waitUntil: (p) => ctx.waitUntil(p),
                next: () => env.ASSETS.fetch(request),
            });
        }
        return env.ASSETS.fetch(request);
    },

    // 1분마다 — 구글 캘린더와 주고받습니다 (wrangler.toml 의 [triggers]).
    // 구글이 알려 주는 방식(웹훅)은 도메인 확인이 필요해 지금은 못 씁니다. 도메인을 붙이면 그때 바꿉니다.
    async scheduled(event, env, ctx) {
        ctx.waitUntil((async () => {
            try {
                const r = await syncBoth(env);
                if (!r.ok) return;                       // 아직 연결 안 됨 — 조용히 넘어갑니다
                const n = r.push.created + r.push.sent + r.push.deleted + r.pull.added + r.pull.updated + r.pull.deleted;
                if (n) console.log('[구글캘린더]', JSON.stringify(r));
            } catch (e) {
                console.error('[구글캘린더] 동기화 실패', e && e.message);
            }
        })());
    },
};
