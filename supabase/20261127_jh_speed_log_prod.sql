-- [운영 DB 용] 그룹웨어 사용 중 속도 기록 (2026-11-27, 그룹웨어 v1.1.50) — 관리자만 실행, 운영 코드(v1.1.50) 올리기 전에 먼저
-- 실행: 운영 Supabase(qlrpokxghtvbaxsnwhno) › SQL Editor › 전체 붙여 넣기 › Run (여러 번 실행해도 됨). 개발 DB 는 20261127_jh_speed_log.sql
--   · 운영은 이 SQL 을 먼저 실행한 뒤 코드(v1.1.50)를 올립니다. 순서가 바뀌어도 화면은 정상(기록만 안 쌓임).
-- 직원 화면이 10분마다 조회 시간 요약(건수 · 중간값 · 느린 조회 이름 5개)을 남기고(gw_speed_report),
-- 그룹웨어 서버 /api/speed 가 최근 1시간 요약을 읽어(gw_speed_summary) 운영 점검 플랫폼이 확인합니다.
-- 남기는 것: 로그인 번호(auth uid) · 시각 · 숫자 · 조회 이름(예: rest:app_store). 자료 내용 · 이름 · 파일은 남기지 않습니다.
-- 되돌리기: 20261127_jh_speed_log_rollback.sql

create table if not exists public.gw_speed_log (
    id         bigserial primary key,
    user_id    text not null,
    at         timestamptz not null default now(),
    data       jsonb not null
);
create index if not exists gw_speed_log_at_idx on public.gw_speed_log (at desc);
alter table public.gw_speed_log enable row level security;          -- 정책 없음 = 화면에서 직접 읽기 · 쓰기 불가 (아래 함수로만)
revoke all on public.gw_speed_log from anon, authenticated;
revoke all on sequence public.gw_speed_log_id_seq from anon, authenticated;

-- 화면이 남기는 요약: { v, n, p50, p90, max, mobile, boot_ms, boot_steps, slow: [{ q, ms }] }
--   직원(kob_is_staff)만 · 한 사람당 4분에 1번까지 · 4KB 까지 · 14일 지난 기록은 가끔 지움
create or replace function public.gw_speed_report(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text;
begin
    if v_uid is null or p is null or jsonb_typeof(p) <> 'object' or length(p::text) > 4000 then return; end if;
    if not public.kob_is_staff() then return; end if;
    if exists (select 1 from public.gw_speed_log where user_id = v_uid and at > now() - interval '4 minutes') then return; end if;
    insert into public.gw_speed_log (user_id, data) values (v_uid, p);
    if random() < 0.02 then delete from public.gw_speed_log where at < now() - interval '14 days'; end if;
end $$;
revoke all on function public.gw_speed_report(jsonb) from public, anon;
grant execute on function public.gw_speed_report(jsonb) to authenticated;

-- 서버용 요약 (숫자와 조회 이름만, 사람 번호 없음) — service_role 만
create or replace function public.gw_speed_summary(p_minutes int default 60) returns jsonb
language sql stable security definer set search_path = public as $$
    with l as (
        select * from public.gw_speed_log where at > now() - make_interval(mins => greatest(5, least(coalesce(p_minutes, 60), 1440)))
    ), q as (
        select s ->> 'q' as q, (s ->> 'ms')::numeric as ms from l, jsonb_array_elements(coalesce(l.data -> 'slow', '[]'::jsonb)) s
    )
    select jsonb_build_object(
        'minutes', greatest(5, least(coalesce(p_minutes, 60), 1440)),
        'reports', (select count(*) from l),
        'users', (select count(distinct user_id) from l),
        'requests', (select coalesce(sum((data ->> 'n')::int), 0) from l),
        'p90_ms', (select round(percentile_cont(0.5) within group (order by (data ->> 'p90')::numeric)) from l),
        'max_ms', (select max((data ->> 'max')::numeric) from l),
        'boot_ms', (select round(percentile_cont(0.5) within group (order by (data ->> 'boot_ms')::numeric)) from l where data ? 'boot_ms'),
        'mobile_reports', (select count(*) from l where (data ->> 'mobile') = '1'),
        'slowest', (select coalesce(jsonb_agg(x order by x.ms desc), '[]'::jsonb) from (
                        select q, round(percentile_cont(0.9) within group (order by ms)) as ms, count(*) as n from q group by q order by 2 desc limit 5) x),
        'last_at', (select max(at) from l)
    )
$$;
revoke all on function public.gw_speed_summary(int) from public, anon, authenticated;
grant execute on function public.gw_speed_summary(int) to service_role;

-- 확인: '속도 기록 준비됨' 이면 정상
select case when to_regclass('public.gw_speed_log') is not null
             and exists (select 1 from pg_proc where proname = 'gw_speed_report')
             and exists (select 1 from pg_proc where proname = 'gw_speed_summary')
            then '속도 기록 준비됨' else '확인 필요' end as 결과;
