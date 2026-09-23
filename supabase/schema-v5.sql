-- ============================================================================
-- 킹오더브라더스 그룹웨어 — Supabase 스키마 5차 (구글 캘린더 연동 · 2026-09-23)
--
-- 그룹웨어 일정캘린더 ↔ 직원 폰 캘린더를 양방향으로 잇기 위한 표 네 개입니다.
--
-- 어떤 구조인가
--   · 회사 구글 계정(kingorderbrothers@gmail.com) **하나가 캘린더를 전부 소유**합니다.
--     공유 캘린더 4종(전사 · 영업진행 · 설치A/S · 부서별) + 직원마다 '킹오더 일정 – 홍길동' 하나.
--   · 각 캘린더를 직원 구글 계정에 '변경 권한'으로 공유합니다. 직원 폰에는 그렇게 들어갑니다.
--   · 그래서 구글 허용(동의) 화면을 보는 사람은 **관리자 한 명뿐**이고, 그 증서를 여기 보관합니다.
--
-- 왜 표로 두나
--   · 어느 그룹웨어 일정이 어느 구글 일정인지 짝을 기억해야 같은 일정이 두 번 생기지 않습니다.
--   · 구글에서 "지난번 이후 바뀐 것만" 받아오려면 캘린더마다 표식을 보관해야 합니다.
--
-- 보안 — 네 표 모두 RLS 를 켜고 **정책을 하나도 만들지 않습니다.**
--   그러면 브라우저(anon · authenticated)에서는 한 줄도 읽거나 쓸 수 없고,
--   Cloudflare Worker 가 service_role 키로 접근할 때만 보입니다.
--   gcal_account 에는 구글 연결 증서가 들어가므로 이 점이 특히 중요합니다.
--
-- 직원의 구글 계정 주소는 여기 두지 않습니다 — 사용자/권한관리 화면에서 다루므로
-- 기존 app_store 의 gwUsers.v1 에 항목 하나로 들어갑니다.
--
-- 실행: Supabase 대시보드 › SQL Editor 에 붙여 넣고 Run.
--       schema-v2.sql 까지 돌린 뒤에 돌립니다. 여러 번 돌려도 괜찮습니다.
-- ============================================================================


-- ============================================================================
-- 0. 공통 장치
-- ============================================================================

-- 2차의 touch_row() 는 rev(판)까지 올리는데, 아래 표들은 여러 사람이 동시에 고치는 자료가
-- 아니라 rev 가 없습니다. 그래서 updated_at 만 갱신하는 것을 따로 둡니다.
create or replace function public.touch_at() returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

-- 트리거 + RLS(정책 없음 = 서버만 접근) 를 한 번에 붙입니다.
create or replace function public.setup_server_table(p_table text) returns void
language plpgsql security definer set search_path = public as $$
begin
    execute format('drop trigger if exists trg_%1$s_at on public.%1$I', p_table);
    execute format('create trigger trg_%1$s_at before update on public.%1$I
                    for each row execute function public.touch_at()', p_table);

    execute format('alter table public.%I enable row level security', p_table);

    -- 혹시 예전에 만들어 둔 정책이 있으면 지웁니다. (정책이 없으면 아무도 못 봅니다)
    execute format('drop policy if exists "%1$s rw" on public.%1$I', p_table);
    execute format('drop policy if exists "%1$s all" on public.%1$I', p_table);
end $$;


-- ============================================================================
-- 1. 회사 구글 계정 연결 증서
--    관리자가 [구글 캘린더 연결] 을 한 번 누르면 여기에 한 줄이 생깁니다. 늘 한 줄뿐입니다.
-- ============================================================================
create table if not exists public.gcal_account (
    id            text primary key default 'main',      -- 늘 'main'
    google_email  text,                                 -- 연결된 구글 계정 주소
    refresh_token text,                                 -- 다시 들어갈 때 쓰는 증서 (서버만 봅니다)
    scope         text,                                 -- 허용받은 범위
    connected_by  text,                                 -- 누가 연결했는지 (그룹웨어 이메일)
    connected_at  timestamptz not null default now(),
    last_error    text,                                 -- 마지막으로 실패한 사유 (화면에 보여 줍니다)
    updated_at    timestamptz not null default now()
);
comment on table public.gcal_account is '구글 캘린더 연결 증서 — 서버(service_role)만 접근';


-- ============================================================================
-- 2. 그룹웨어 캘린더 ↔ 구글 캘린더 짝
--    key 모양:  cal:company / cal:sales-share / cal:install-as
--               cal:team:<부서id>            (부서별)
--               cal:personal:<그룹웨어 이메일> (직원별 '킹오더 일정')
-- ============================================================================
create table if not exists public.gcal_calendars (
    key                text primary key,
    kind               text not null,        -- company / sales-share / install-as / team / personal
    label              text,                 -- 구글에 보이는 캘린더 이름
    dept               text,                 -- 부서별일 때 부서 id
    member_email       text,                 -- 직원별일 때 그룹웨어 로그인 이메일
    google_calendar_id text unique,          -- 구글이 붙여 준 캘린더 id
    share_email        text,                 -- 이 캘린더를 공유해 준 직원 구글 주소
    share_state        text default 'none',  -- none / invited / ok
    last_error         text,
    updated_at         timestamptz not null default now()
);
create index if not exists idx_gcal_cal_kind   on public.gcal_calendars (kind);
create index if not exists idx_gcal_cal_member on public.gcal_calendars (member_email);
comment on table public.gcal_calendars is '그룹웨어 캘린더와 구글 캘린더의 짝';


-- ============================================================================
-- 3. 일정 한 건의 짝
--    schedules 표의 한 줄과 구글 일정 한 건을 이어 둡니다.
--    content_hash 는 "마지막으로 양쪽을 맞춰 놓았을 때의 내용" 입니다.
--    이것과 같으면 보내지 않습니다 — 그래야 서로 주고받기를 끝없이 되풀이하지 않습니다.
-- ============================================================================
create table if not exists public.gcal_links (
    kob_id             text primary key,     -- schedules.id
    google_calendar_id text not null,
    google_event_id    text not null,
    content_hash       text,
    gcal_updated       text,                 -- 구글이 알려 준 마지막 수정 시각
    last_dir           text,                 -- push(그룹웨어→구글) / pull(구글→그룹웨어)
    updated_at         timestamptz not null default now(),
    unique (google_calendar_id, google_event_id)
);
create index if not exists idx_gcal_links_cal on public.gcal_links (google_calendar_id);
comment on table public.gcal_links is '그룹웨어 일정 ↔ 구글 일정 짝 (중복 생성 · 되돌이 방지)';


-- ============================================================================
-- 4. 캘린더별 받아오기 표식
--    sync_token 이 "지난번에 여기까지 받았다" 는 표식입니다. 이것을 주면 구글이 바뀐 것만 줍니다.
--    channel_* 은 나중에 도메인을 붙여 '구글이 알려 주는 방식' 으로 바꿀 때 씁니다. 지금은 빈 칸.
-- ============================================================================
create table if not exists public.gcal_state (
    google_calendar_id text primary key,
    sync_token         text,
    channel_id         text,
    resource_id        text,
    channel_expires_at timestamptz,
    last_sync_at       timestamptz,
    last_error         text,
    updated_at         timestamptz not null default now()
);
comment on table public.gcal_state is '구글 캘린더별 동기화 표식';


-- ============================================================================
-- 5. 트리거 · RLS 붙이기
-- ============================================================================
do $$
declare t text;
begin
    foreach t in array array['gcal_account', 'gcal_calendars', 'gcal_links', 'gcal_state'] loop
        perform public.setup_server_table(t);
    end loop;
end $$;


-- ============================================================================
-- 확인 — 네 줄이 나오고, '정책 수' 가 모두 0 이면 제대로 된 것입니다.
--        (정책이 0 개라서 브라우저에서는 아무도 못 봅니다)
-- ============================================================================
select t.tablename as "표 이름",
       case when c.relrowsecurity then '켜짐' else '꺼짐' end as "RLS",
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename) as "정책 수"
from pg_tables t
join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
where t.schemaname = 'public'
  and t.tablename in ('gcal_account', 'gcal_calendars', 'gcal_links', 'gcal_state')
order by t.tablename;
