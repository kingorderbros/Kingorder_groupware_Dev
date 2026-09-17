-- ============================================================================
-- 스키마 3차 — 알림함 · 자부서 업무 표 추가 (2026-09-17, 4-4 단계)
--
-- 4-4(협업티켓 · 내 할 일 · 공지 · 프로젝트)를 붙이다 보니, 2차에서 빠뜨린 자료가 둘 있었습니다.
--   · 알림함(collabNotifications) — 우상단 종 모양에 쌓이는 알림. 읽음 표시도 여기 남습니다.
--   · 자부서 업무(localTasks)      — 협업 요청이 아니라 우리 부서 안에서만 관리하는 업무·이슈.
-- 둘 다 사람이 만든 실제 자료라 저장해야 합니다.
--
-- 실행: SQL Editor 에 붙여 넣고 Run. schema-v2.sql · schema-v2-fix.sql 을 먼저 돌린 뒤에 돌립니다.
--       (2차에서 만든 setup_work_table() 을 그대로 씁니다)
-- ============================================================================

-- ---------- 알림함 ----------
-- 사람·부서·팀 앞으로 오는 알림. 쌓이기만 하므로 나중에 오래된 것을 지우는 손질이 필요할 수 있습니다.
create table if not exists public.notifications (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    to_user     text generated always as (data->>'toUser') stored,
    to_dept     text generated always as (data->>'toDept') stored,
    to_team     text generated always as (data->>'toTeam') stored,
    noti_type   text generated always as (data->>'type')   stored,
    on_date     text generated always as (data->>'date')   stored,
    is_read     text generated always as (data->>'read')   stored,   -- 'true' / 'false' 글자
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_noti_user on public.notifications (to_user);
create index if not exists idx_noti_dept on public.notifications (to_dept, to_team);
create index if not exists idx_noti_date on public.notifications (on_date);

-- ---------- 자부서 업무 · 이슈 ----------
create table if not exists public.local_tasks (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    dept        text generated always as (data->>'dept')     stored,
    task_type   text generated always as (data->>'type')     stored,
    status      text generated always as (data->>'status')   stored,
    assignee    text generated always as (data->>'assignee') stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_localtask_dept on public.local_tasks (dept, status);

-- ---------- 공통 장치 (트리거 · RLS · Realtime) ----------
do $$
declare t text;
begin
    foreach t in array array['notifications', 'local_tasks'] loop
        perform public.setup_work_table(t);
    end loop;
end $$;


-- ============================================================================
-- 확인 — 두 줄이 나오면 성공입니다.
-- ============================================================================
select t.table_name as "표 이름",
       (select count(*) from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t.table_name) as "칸 수"
from information_schema.tables t
where t.table_schema = 'public' and t.table_name in ('notifications', 'local_tasks')
order by t.table_name;
