-- ============================================================================
-- schema-v10 — 일정 확인 기록 (킹오더일정 · 2026-11-12)
--
-- 일정 상세를 연 사람과 시각을 남겨 "누가 확인했는지" 와 "새 일정 숫자" 를 보여 줍니다.
--   · 일정 줄(schedules)에는 넣지 않습니다 — 볼 때마다 일정 줄을 고치면 수정 충돌 · 구글 재전송이 생깁니다.
--   · 확인은 schedule_mark_seen() 으로만 남깁니다. 이메일 · 이름은 로그인한 사람으로 서버가 채우므로
--     다른 사람 이름으로 남길 수 없습니다.
--   · 표에서 읽을 수 있는 것은 내 확인 기록뿐입니다 (새 일정 숫자 계산용).
--   · 확인 인원 수는 누구나, 확인한 사람 목록(이름 · 시각)은 그 일정의 등록자 · 참석자만 봅니다.
--
-- 실행: Supabase 대시보드 › SQL Editor 에 붙여 넣고 Run. 여러 번 돌려도 괜찮습니다.
--       개발에서 먼저 돌려 확인한 뒤 운영에 돌립니다.
-- 되돌리기: drop table public.schedule_reads; 와 아래 함수 4개 drop (일정 자료는 바뀌지 않습니다)
-- ============================================================================

create table if not exists public.schedule_reads (
    schedule_id text not null,
    user_email  text not null,
    user_name   text not null default '',
    first_seen  timestamptz not null default now(),
    last_seen   timestamptz not null default now(),
    primary key (schedule_id, user_email)
);
create index if not exists schedule_reads_user on public.schedule_reads (user_email);

alter table public.schedule_reads enable row level security;
drop policy if exists "schedule_reads own select" on public.schedule_reads;
create policy "schedule_reads own select" on public.schedule_reads for select to authenticated
    using (user_email = lower(coalesce(auth.jwt() ->> 'email', '')));
-- 넣기 · 고치기 · 지우기 정책은 두지 않습니다 → 아래 함수로만 씁니다.
revoke insert, update, delete on public.schedule_reads from authenticated, anon;
grant select on public.schedule_reads to authenticated;

-- 로그인한 사람의 이메일 · 이름 (직원 목록 gwUsers.v1 에서)
create or replace function public.kob_me_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.kob_me_name() returns text
language sql stable security definer set search_path = public as $$
    select coalesce((
        select u ->> 'name'
          from public.app_store s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) u
         where s.key = 'gwUsers.v1' and lower(coalesce(u ->> 'email', '')) = public.kob_me_email()
         limit 1
    ), '')
$$;

-- 확인 남기기 — 처음 연 시각은 그대로 두고 마지막 연 시각만 바꿉니다
create or replace function public.schedule_mark_seen(ids text[]) returns void
language plpgsql security definer set search_path = public as $$
declare me text := public.kob_me_email(); nm text := public.kob_me_name();
begin
    if me = '' then raise exception 'KOB_AUTH 로그인이 필요합니다'; end if;
    insert into public.schedule_reads (schedule_id, user_email, user_name, first_seen, last_seen)
    select distinct x, me, nm, now(), now() from unnest(coalesce(ids, '{}'::text[])) x where coalesce(x, '') <> ''
    on conflict (schedule_id, user_email) do update set last_seen = now(), user_name = excluded.user_name;
end $$;

-- 확인 인원 수 — 누구나 (숫자만)
create or replace function public.schedule_read_counts(ids text[]) returns table (schedule_id text, n int)
language sql stable security definer set search_path = public as $$
    select r.schedule_id, count(*)::int
      from public.schedule_reads r
     where public.kob_me_email() <> '' and r.schedule_id = any (coalesce(ids, '{}'::text[]))
     group by r.schedule_id
$$;

-- 확인한 사람 목록 — 그 일정의 등록자(담당자 · 만든 사람) · 참석자만. 아니면 빈 결과.
create or replace function public.schedule_readers(sid text) returns table (user_name text, first_seen timestamptz, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
    select r.user_name, r.first_seen, r.last_seen
      from public.schedule_reads r
      join public.schedules s on s.id = r.schedule_id
     where r.schedule_id = sid
       and public.kob_me_email() <> ''
       and (
            lower(coalesce(s.data ->> 'createdBy', '')) = public.kob_me_email()
         or (public.kob_me_name() <> '' and coalesce(s.data ->> 'salesperson', '') = public.kob_me_name())
         or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(s.data -> 'attendees') = 'array' then s.data -> 'attendees' else '[]'::jsonb end) a
                     where public.kob_me_name() <> '' and a ->> 'name' = public.kob_me_name())
       )
     order by r.first_seen
$$;

revoke all on function public.schedule_mark_seen(text[]) from public, anon;
revoke all on function public.schedule_read_counts(text[]) from public, anon;
revoke all on function public.schedule_readers(text) from public, anon;
revoke all on function public.kob_me_name() from public, anon;
grant execute on function public.schedule_mark_seen(text[]) to authenticated;
grant execute on function public.schedule_read_counts(text[]) to authenticated;
grant execute on function public.schedule_readers(text) to authenticated;
grant execute on function public.kob_me_name() to authenticated;
grant execute on function public.kob_me_email() to authenticated;

-- 다른 사람이 확인하면 열린 상세의 "확인" 칸을 새로 그리도록 — Realtime (내 줄만 받습니다: 위 select 정책)
do $$ begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'schedule_reads') then
        execute 'alter publication supabase_realtime add table public.schedule_reads';
    end if;
end $$;
