-- ============================================================================
-- schema-v8 — 권한 칸 지키기 (2026-10-28 구조 점검 · 보안 3단계)
--
-- 문제: app_store 는 직원이면 모든 키를 읽고 쓸 수 있습니다(schema-v6 "app_store rw").
--       서버는 직원 명단(gwUsers.v1)의 관리자 표시 · 권한 그룹을 그대로 믿으므로, 직원이 브라우저에서
--       자기 정보에 isAdmin:true 를 써 넣으면 관리자가 되고, 남의 계정 비밀번호까지 초기화할 수 있었습니다.
--
-- 이 SQL 은 저장 요청을 받을 때 데이터베이스가 직접 검사합니다 (화면을 거치지 않은 저장도 막힘).
--   · gwUsers.v1        권한 관련 칸(권한 그룹 · 관리자 표시 · 직책 등급 · 본부 · 이메일 · 퇴사)을 바꾸거나 사람을 넣고 빼는 저장은
--                       '사용자 관리' 또는 '조직도 관리' 권한이 있는 사람만.
--                       누군가를 관리자로 만들거나, 관리자의 권한 칸을 바꾸거나 빼는 저장은 관리자만.
--                       (이름 · 담당업무 · 연락처 · 사진 등 그 밖의 칸은 지금처럼)
--   · gwPermissionGroups.v2   관리자 또는 '권한 관리' 권한이 있는 사람만
--   · gwPartnerAdminPerm.v1   관리자만 (파트너 임시 비밀번호 발급 권한)
--   · gwInboundSources.v1     메일 수집 설정(메일 서버 · 계정 · 자동 수집)은 관리자만 — 메일 비밀번호가 다른 서버로 새지 않게
--   · 위 키를 통째로 지우는 것은 관리자만
--   '누가 요청했는가' 는 저장 전 명단(지금 표에 있는 값)으로 판단합니다 — 같은 저장으로 자기 권한을 올리지 못하게.
--   서버(Worker 의 service_role) · SQL Editor 는 검사하지 않습니다.
--
-- 실행: Supabase 대시보드 › SQL Editor 에 붙여 넣고 Run. schema-v6 뒤에. 여러 번 돌려도 괜찮습니다.
--       개발(Supabase 개발 프로젝트)에서 먼저 돌려 확인한 뒤 운영에 돌립니다.
-- 되돌리기: 맨 아래 '되돌리기' 절.
-- ============================================================================

-- 0-a) 직원 확인에서 퇴사자 빼기 — 예전엔 퇴사 처리해도 남은 로그인 토큰으로 자료를 읽고 쓸 수 있었습니다 (schema-v6 함수를 바꿉니다)
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
               and coalesce(u ->> 'resigned', 'false') <> 'true'
        )
    ), false)
$$;

-- 0) 요청한 사람의 직원 기록 (저장 전 명단에서 · 퇴사자 제외)
create or replace function public.kob_caller() returns jsonb
language sql stable security definer set search_path = public as $$
    select (
        select u
          from public.app_store s,
               jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) u
         where s.key = 'gwUsers.v1'
           and coalesce(auth.jwt() ->> 'email', '') <> ''
           and lower(u ->> 'email') = lower(auth.jwt() ->> 'email')
           and coalesce(u ->> 'resigned', 'false') <> 'true'
         limit 1
    )
$$;

-- 관리자 기록인가 — 서버 requireAdmin 과 같은 기준
create or replace function public.kob_user_is_admin(u jsonb) returns boolean
language sql immutable as $$
    select u is not null and (
        coalesce(u ->> 'groupId', '') = 'admin' or coalesce(u ->> 'dept', '') = 'admin'
        or coalesce(u ->> 'level', '') = 'admin' or coalesce(u ->> 'isAdmin', 'false') = 'true'
    )
$$;

-- 요청한 사람이 이 권한을 가졌는가 (관리자는 모두)
create or replace function public.kob_caller_can(perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
    me jsonb := public.kob_caller();
    pg jsonb;
    groups jsonb;
begin
    if me is null then return false; end if;
    if public.kob_user_is_admin(me) then return true; end if;
    select value into pg from public.app_store where key = 'gwPermissionGroups.v2';
    groups := case when jsonb_typeof(pg) = 'array' then pg
                   when jsonb_typeof(pg -> 'groups') = 'array' then pg -> 'groups'
                   else '[]'::jsonb end;
    return exists (
        select 1 from jsonb_array_elements(groups) g
         where g ->> 'id' = me ->> 'groupId'
           and jsonb_typeof(g -> 'permissions') = 'array'
           and (g -> 'permissions') ? perm
    );
end $$;

-- 직원 한 사람 기록 중 권한 칸만
create or replace function public.kob_user_priv(u jsonb) returns jsonb
language sql immutable as $$
    select case when u is null then null else jsonb_build_object(
        'groupId', u -> 'groupId', 'isAdmin', u -> 'isAdmin', 'level', u -> 'level',
        'dept', u -> 'dept', 'email', lower(coalesce(u ->> 'email', '')), 'resigned', u -> 'resigned') end
$$;

-- 1) 저장 검사
-- security invoker(기본) — 요청한 사람의 역할로 돕니다. definer 로 두면 함수 안에서 current_user 가 늘 만든 사람(postgres)이라 검사를 건너뜁니다.
create or replace function public.kob_app_store_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
    k text := coalesce(new.key, old.key);
    oldv jsonb := case when tg_op in ('UPDATE', 'DELETE') then old.value else null end;
    newv jsonb := case when tg_op in ('INSERT', 'UPDATE') then new.value else null end;
    priv_change boolean := false;
    admin_change boolean := false;
    r record;
begin
    -- 서버(service_role) · SQL Editor(postgres) 는 검사하지 않습니다
    if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin', 'service_role') then
        return case when tg_op = 'DELETE' then old else new end;
    end if;
    if k not in ('gwUsers.v1', 'gwPermissionGroups.v2', 'gwPartnerAdminPerm.v1', 'gwInboundSources.v1') then
        return case when tg_op = 'DELETE' then old else new end;
    end if;
    -- 아직 없던 키를 처음 만드는 것(새로 꾸리는 환경)은 그대로
    if tg_op = 'INSERT' and not exists (select 1 from public.app_store where key = k) then
        return new;
    end if;
    -- 통째로 지우기는 관리자만
    if tg_op = 'DELETE' or newv is null or jsonb_typeof(newv) = 'null' then
        if not public.kob_user_is_admin(public.kob_caller()) then
            raise exception 'KOB_PRIV: % 은(는) 관리자만 지울 수 있습니다.', k using errcode = '42501';
        end if;
        return case when tg_op = 'DELETE' then old else new end;
    end if;
    if tg_op = 'INSERT' then
        select value into oldv from public.app_store where key = k;     -- upsert 로 덮어쓰는 경우
    end if;
    if oldv is not distinct from newv then return new; end if;

    if k = 'gwUsers.v1' then
        for r in
            with o as (select e ->> 'id' as id, e from jsonb_array_elements(case when jsonb_typeof(oldv) = 'array' then oldv else '[]'::jsonb end) e),
                 n as (select e ->> 'id' as id, e from jsonb_array_elements(case when jsonb_typeof(newv) = 'array' then newv else '[]'::jsonb end) e)
            select o.e as oe, n.e as ne
              from o full outer join n on o.id = n.id
        loop
            if public.kob_user_priv(r.oe) is distinct from public.kob_user_priv(r.ne) then
                priv_change := true;
                -- 관리자를 새로 만들거나, 관리자 기록의 권한 칸을 바꾸거나 빼는 것
                if public.kob_user_is_admin(r.ne) or public.kob_user_is_admin(r.oe) then admin_change := true; end if;
            end if;
        end loop;
        if admin_change and not public.kob_user_is_admin(public.kob_caller()) then
            raise exception 'KOB_PRIV: 관리자 권한은 관리자만 바꿀 수 있습니다.' using errcode = '42501';
        end if;
        if priv_change and not (public.kob_caller_can('users') or public.kob_caller_can('management-org')) then
            raise exception 'KOB_PRIV: 직원의 권한 · 계정 칸은 사용자 관리 · 조직도 관리 권한이 있어야 바꿀 수 있습니다.' using errcode = '42501';
        end if;
        return new;
    end if;

    if k = 'gwPermissionGroups.v2' then
        if not public.kob_caller_can('permissions') then
            raise exception 'KOB_PRIV: 권한 그룹은 권한 관리 권한이 있어야 바꿀 수 있습니다.' using errcode = '42501';
        end if;
        return new;
    end if;

    if k = 'gwPartnerAdminPerm.v1' then
        if not public.kob_user_is_admin(public.kob_caller()) then
            raise exception 'KOB_PRIV: 파트너 관리 권한은 관리자만 바꿀 수 있습니다.' using errcode = '42501';
        end if;
        return new;
    end if;

    if k = 'gwInboundSources.v1' then
        if ((oldv -> 'mail') is distinct from (newv -> 'mail') or (oldv -> 'auto' -> 'mail') is distinct from (newv -> 'auto' -> 'mail'))
           and not public.kob_user_is_admin(public.kob_caller()) then
            raise exception 'KOB_PRIV: 메일 수집 설정은 관리자만 바꿀 수 있습니다.' using errcode = '42501';
        end if;
        return new;
    end if;

    return new;
end $$;

drop trigger if exists trg_kob_app_store_guard on public.app_store;
create trigger trg_kob_app_store_guard
    before insert or update or delete on public.app_store
    for each row execute function public.kob_app_store_guard();

-- 확인 — 트리거가 걸렸는지
select tgname as "트리거", tgenabled as "켜짐(O)" from pg_trigger where tgname = 'trg_kob_app_store_guard';

-- ============================================================================
-- 되돌리기 (필요할 때만 — 아래 세 줄의 앞 -- 를 지우고 실행)
-- drop trigger if exists trg_kob_app_store_guard on public.app_store;
-- drop function if exists public.kob_app_store_guard();
-- drop function if exists public.kob_caller_can(text), public.kob_caller(), public.kob_user_is_admin(jsonb), public.kob_user_priv(jsonb);
-- ============================================================================
