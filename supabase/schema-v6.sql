-- ============================================================================
-- schema-v6 — 자료 보호 3단계 (2026-09-28)
--   설정 자료(app_store) · 업무 표 · 첨부 파일을 **그룹웨어 직원만** 읽고 쓰게 좁힙니다.
--
--   지금까지
--     · app_store  : 공개 키(anon)만으로 누구나 읽고 쓸 수 있었음
--     · 업무 표    : '로그인한 사람(authenticated)' 이면 누구나 — 그런데 Supabase 가입이 열려 있어
--                    아무나 가입하면 '로그인한 사람' 이 될 수 있었음
--   이제
--     · 로그인했고, 그 이메일이 직원 목록(app_store 의 gwUsers.v1)에 있는 사람만
--     · 파트너센터 · 운행일지 · 구글 캘린더는 서버(service_role)를 거치므로 영향 없음
--
--   실행 전에 확인할 것 (1 · 2단계가 배포되어 있어야 합니다)
--     1. 그룹웨어 로그인 · 파트너센터 로그인이 지금 잘 되는지
--     2. Supabase › Authentication › Sign In / Providers › **Allow new users to sign up 끄기**
--        (직원 계정은 그룹웨어가 관리자 기능으로 만들므로 꺼도 됩니다)
--
--   되돌리기: 맨 아래 '되돌리기' 절을 실행하면 이 SQL 전 상태로 돌아갑니다.
-- ============================================================================

-- 1) 이 요청을 보낸 사람이 그룹웨어 직원인가
--    security definer — 함수 안에서는 RLS 없이 직원 목록을 읽습니다(그래야 자기 자신을 확인할 수 있음).
create or replace function public.kob_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
    select coalesce((
        select exists (
            select 1
              from public.app_store s,
                   jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) u
             where s.key = 'gwUsers.v1'
               and coalesce(auth.jwt() ->> 'email', '') <> ''
               and lower(u ->> 'email') = lower(auth.jwt() ->> 'email')
        )
    ), false)
$$;
-- anon 에도 실행 권한을 줍니다 — 없으면 '빈 결과' 가 아니라 '권한 오류' 가 나서 로그인 전 화면이 깨집니다
revoke all on function public.kob_is_staff() from public;
grant execute on function public.kob_is_staff() to anon, authenticated, service_role;

-- 2) app_store — anon 정책을 지우고 직원만
alter table public.app_store enable row level security;
drop policy if exists "app_store anon read"  on public.app_store;
drop policy if exists "app_store anon write" on public.app_store;
drop policy if exists "app_store rw"         on public.app_store;
create policy "app_store rw" on public.app_store for all
    to authenticated
    using ((select public.kob_is_staff()))
    with check ((select public.kob_is_staff()));

-- 3) 업무 표 — setup_work_table 이 만든 "<표> rw" 정책을 모두 직원만으로
do $$
declare r record;
begin
    for r in select tablename from pg_policies
              where schemaname = 'public' and policyname = tablename || ' rw' and tablename <> 'app_store'
    loop
        execute format('drop policy if exists "%1$s rw" on public.%1$I', r.tablename);
        execute format('create policy "%1$s rw" on public.%1$I for all to authenticated
                        using ((select public.kob_is_staff())) with check ((select public.kob_is_staff()))', r.tablename);
    end loop;
end $$;

-- 앞으로 새 표를 만들 때도 같은 규칙이 붙도록 setup_work_table 도 바꿉니다
create or replace function public.setup_work_table(p_table text) returns void
language plpgsql security definer set search_path = public as $$
begin
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$I', p_table);
    execute format('create trigger trg_%1$s_touch before update on public.%1$I
                    for each row execute function public.touch_row()', p_table);
    execute format('alter table public.%I enable row level security', p_table);
    execute format('alter table public.%I replica identity full', p_table);
    execute format('drop policy if exists "%1$s rw" on public.%1$I', p_table);
    execute format('create policy "%1$s rw" on public.%1$I for all to authenticated
                    using ((select public.kob_is_staff())) with check ((select public.kob_is_staff()))', p_table);
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = p_table) then
        execute format('alter publication supabase_realtime add table public.%I', p_table);
    end if;
end $$;

-- 4) 첨부 파일(Storage 'files') — 직원만
drop policy if exists "files read"  on storage.objects;
drop policy if exists "files write" on storage.objects;
create policy "files read"  on storage.objects for select
    to authenticated using (bucket_id = 'files' and (select public.kob_is_staff()));
create policy "files write" on storage.objects for all
    to authenticated using (bucket_id = 'files' and (select public.kob_is_staff()))
    with check (bucket_id = 'files' and (select public.kob_is_staff()));

-- 5) 확인 — 아래 두 줄의 결과를 보세요
--    · 정책 목록: app_store rw 와 각 업무 표 rw 가 kob_is_staff 로 바뀌어 있어야 합니다
select tablename, policyname, qual from pg_policies
 where schemaname in ('public', 'storage') and (policyname like '% rw' or policyname like 'files %')
 order by tablename;


-- ============================================================================
-- 되돌리기 (문제가 생겼을 때만 — 아래 주석(--)을 지우고 이 부분만 실행)
-- ============================================================================
-- drop policy if exists "app_store rw" on public.app_store;
-- create policy "app_store anon read"  on public.app_store for select using (true);
-- create policy "app_store anon write" on public.app_store for all using (true) with check (true);
-- do $$ declare r record; begin
--   for r in select tablename from pg_policies where schemaname = 'public' and policyname = tablename || ' rw' and tablename <> 'app_store' loop
--     execute format('drop policy if exists "%1$s rw" on public.%1$I', r.tablename);
--     execute format('create policy "%1$s rw" on public.%1$I for all to authenticated using (true) with check (true)', r.tablename);
--   end loop; end $$;
-- drop policy if exists "files read"  on storage.objects;
-- drop policy if exists "files write" on storage.objects;
-- create policy "files read"  on storage.objects for select to authenticated using (bucket_id = 'files');
-- create policy "files write" on storage.objects for all to authenticated using (bucket_id = 'files') with check (bucket_id = 'files');
