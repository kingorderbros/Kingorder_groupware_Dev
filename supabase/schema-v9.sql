-- ============================================================================
-- schema-v9 — 권한 그룹 여러 개 (2026-10-30)
--
-- 사용자 관리에서 권한 그룹을 여러 개 고를 수 있게 되면서, 직원 기록에 groupIds(고른 그룹 전부)가 생겼습니다.
-- schema-v8 의 저장 검사는 groupId 하나만 봤기 때문에, 이대로 두면 직원이 자기 기록의 groupIds 에
-- 다른 그룹을 넣어 메뉴 · 권한을 넓힐 수 있습니다. 아래는 groupIds 도 같은 기준으로 지킵니다.
--   · groupIds 를 바꾸는 저장 = 권한 칸 변경 ('사용자 관리' 또는 '조직도 관리' 권한이 있어야 함)
--   · groupIds 에 관리자 그룹이 있으면 관리자로 봄 (관리자로 만드는 저장은 관리자만)
--   · 권한 확인(kob_caller_can)은 고른 그룹의 권한을 모두 합쳐서 봄
--
-- 실행: Supabase 대시보드 › SQL Editor 에 붙여 넣고 Run. schema-v8 뒤에. 여러 번 돌려도 괜찮습니다.
--       개발에서 먼저 돌려 확인한 뒤 운영에 돌립니다.
-- 되돌리기: schema-v8.sql 을 다시 실행하면 이전 기준으로 돌아갑니다.
-- ============================================================================

-- 직원 한 사람이 고른 권한 그룹 전부 (대표 groupId + groupIds, 중복 없이 정렬)
create or replace function public.kob_user_groups(u jsonb) returns jsonb
language sql immutable as $$
    select coalesce((
        select jsonb_agg(distinct x order by x)
          from (
              select u ->> 'groupId' as x
              union all
              select jsonb_array_elements_text(case when jsonb_typeof(u -> 'groupIds') = 'array' then u -> 'groupIds' else '[]'::jsonb end)
          ) t
         where coalesce(x, '') <> ''
    ), '[]'::jsonb)
$$;

-- 관리자 기록인가 — 고른 그룹 중 관리자 그룹이 있어도 관리자
create or replace function public.kob_user_is_admin(u jsonb) returns boolean
language sql immutable as $$
    select u is not null and (
        public.kob_user_groups(u) ? 'admin' or coalesce(u ->> 'dept', '') = 'admin'
        or coalesce(u ->> 'level', '') = 'admin' or coalesce(u ->> 'isAdmin', 'false') = 'true'
    )
$$;

-- 요청한 사람이 이 권한을 가졌는가 — 고른 그룹 중 하나라도 켜져 있으면 (관리자는 모두)
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
         where public.kob_user_groups(me) ? (g ->> 'id')
           and jsonb_typeof(g -> 'permissions') = 'array'
           and (g -> 'permissions') ? perm
    );
end $$;

-- 직원 한 사람 기록 중 권한 칸만 — groupIds 를 더했습니다
create or replace function public.kob_user_priv(u jsonb) returns jsonb
language sql immutable as $$
    select case when u is null then null else jsonb_build_object(
        'groupId', u -> 'groupId', 'groups', public.kob_user_groups(u), 'isAdmin', u -> 'isAdmin', 'level', u -> 'level',
        'dept', u -> 'dept', 'email', lower(coalesce(u ->> 'email', '')), 'resigned', u -> 'resigned') end
$$;

-- 확인 — 아래 두 줄이 true, ["kop","sales"] 로 나오면 정상
select public.kob_user_is_admin('{"groupId":"sales","groupIds":["sales","admin"]}'::jsonb) as "그룹에 관리자가 있으면 관리자",
       public.kob_user_groups('{"groupId":"sales","groupIds":["kop","sales"]}'::jsonb) as "고른 그룹";
