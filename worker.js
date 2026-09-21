// ==================== Cloudflare Worker 입구 (2026-09-21) ====================
// Cloudflare 대시보드의 "Import a repository" 는 Pages 가 아니라 **Worker** 를 만듭니다.
// 그래서 이 저장소를 Worker 로도 돌아가게 했습니다 — 정적 파일(index.html · js · assets …)은
// Workers Static Assets(wrangler.toml 의 [assets]) 가 내주고, /api/* 만 여기서 받아
// functions/api/[[route]].js 의 onRequest 로 넘깁니다. 그 파일은 Pages Functions 모양
// (context.request · context.env) 그대로라 두 방식 모두에서 같은 코드가 돕니다.
import { onRequest } from './functions/api/[[route]].js';

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
};
