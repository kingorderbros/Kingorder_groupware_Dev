-- ============================================================================
-- schema-v7 — 인바운드 수집 비밀 값 (2026-10-08)
--
-- 인바운드 관리 › 수집 · 연결 화면에서 넣는 비밀 값을 보관합니다.
--   mailPassword       아임웹 알림 메일을 받는 메일함의 비밀번호(앱 비밀번호) — IMAP 으로 메일을 읽을 때
--   naverClientSecret  네이버 검색 API Client Secret — 블로그 · 카페 글 검색
--   igAccessToken      인스타그램(메타) 액세스 토큰 — 댓글 · DM
--
-- Cloudflare 환경변수(INBOUND_MAIL_PASSWORD · INBOUND_NAVER_CLIENT_SECRET · INBOUND_IG_ACCESS_TOKEN)가
-- 있으면 그것을 먼저 쓰고, 없을 때 이 표를 봅니다. 화면에는 '넣었는지' 만 보이고 값은 다시 보이지 않습니다.
--
-- 보안 — RLS 를 켜고 정책을 하나도 만들지 않습니다(schema-v5 의 setup_server_table 과 같은 방식).
--   브라우저(anon · authenticated)는 한 줄도 읽거나 쓸 수 없고, Worker 가 service_role 키로 접근할 때만 보입니다.
--
-- 실행: Supabase 대시보드 › SQL Editor 에 붙여 넣고 Run. schema-v5.sql 뒤에 돌립니다. 여러 번 돌려도 괜찮습니다.
-- ============================================================================

create table if not exists public.inbound_secrets (
    name        text primary key,                       -- mailPassword · naverClientSecret · igAccessToken
    value       text not null,
    updated_by  text,                                   -- 저장한 사람 (그룹웨어 이메일)
    updated_at  timestamptz not null default now()
);
comment on table public.inbound_secrets is '인바운드 수집 비밀 값 — 서버(service_role)만 접근';

select public.setup_server_table('inbound_secrets');


-- 확인 — 한 줄이 나오고 RLS 켜짐 · 정책 수 0 이면 제대로 된 것입니다.
select t.tablename as "표 이름",
       case when c.relrowsecurity then '켜짐' else '꺼짐' end as "RLS",
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename) as "정책 수"
from pg_tables t
join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
where t.schemaname = 'public' and t.tablename = 'inbound_secrets';
