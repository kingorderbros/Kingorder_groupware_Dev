/**
 * 실행 환경 설정 — 개발(dev) (2026-09-16)
 *
 * 이 파일은 index.html 이 가장 먼저 읽습니다. 값이 갈리는 지점은 **여기 한 곳**뿐입니다.
 *   · env               화면 판 옆에 붙는 환경 이름 (dev / prod)
 *   · supabaseUrl       Supabase 프로젝트 URL  (예: https://xxxx.supabase.co)
 *   · supabaseAnonKey   Supabase anon(public) 키 — 브라우저에 노출되는 키입니다. RLS 로 보호합니다.
 *                       둘 다 비우면 브라우저 localStorage 만 쓰는 **로컬 모드**로 돕니다 (인터넷 없이도 됨).
 *   · apiBase           법인차량 API(/api/…) 주소. 같은 도메인(Cloudflare Pages Functions)이면 '' 로 둡니다.
 *
 * 운영(prod)은 config/app-config.prod.example.js 를 복사해 GitHub Actions 가 배포 때 갈아 끼웁니다.
 * 이 파일에 service_role 키를 **절대** 넣지 마세요 (그 키는 functions 의 환경변수에만).
 */
window.KOB_CONFIG = {
    env: 'dev',
    supabaseUrl: 'https://sejoauspxqrnsrhevwkj.supabase.co',
    supabaseAnonKey: 'sb_publishable_PsJccufYuppaXddEzERiPQ_aNHSZIkv',
    apiBase: ''
};
