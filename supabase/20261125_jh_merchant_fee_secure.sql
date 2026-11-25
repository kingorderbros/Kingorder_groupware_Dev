-- ============================================================================
-- [개발] 가맹점별 수수료율 보안 1단계 (2026-11-25)
--   다니엘님 "자료 유출에 대한 보안 — 가맹점별 수수료율, 본부장급 이상으로 하고 1단계 진행"
--
-- 문제: 수수료가 든 표(supplies · customers · settlements)는 직원이면 누구나 읽을 수 있어,
--       화면에서 *** 로 가려도 값이 브라우저까지 내려왔습니다 (개발자 도구로 보임).
--
-- 이 SQL 이 하는 일
--   1) 수수료 값을 별도 표 merchant_fees 로 옮깁니다. 이 표는 본부장급 이상(본부장 · 부장 · 대표급 · 관리자)만 읽습니다.
--      원래 표에는 값 대신 '***'(값 있음) · ''(값 없음) 표시만 남습니다.
--        · supplies.data.fee        (거래처 관리 › 병원·기타 PG · 약국)
--        · customers.data.fee       (업체 › 파트너사 제공 PG 수수료 — 등급별 객체)
--        · settlements.data.merchantFee (지급명세 가맹점수수료)
--      앞으로 저장되는 값도 데이터베이스가 직접 옮깁니다(트리거) — 화면을 거치지 않은 저장도 같음.
--      본부장급 미만이 수수료를 바꿔 보내면 무시합니다(원래 값 유지).
--   2) 수수료 엑셀 승인을 데이터베이스가 처리합니다 (fee_download_requests + 함수).
--      본부장급 미만은 승인받은 1회(24시간 안)에만 함수로 수수료를 받을 수 있습니다.
--   3) 열람 · 다운로드 · 요청 · 승인 기록 (fee_access_log) — 관리자만 조회.
--   4) 직급 목록(gwOrgRanks.v1)의 권한 등급(cls) 변경은 관리자 · 조직도 관리 권한만 (직급 등급을 올려 수수료를 보는 것 막기).
--
-- 실행: 개발 Supabase › SQL Editor 에 붙여 넣고 Run. schema-v8 뒤에. 여러 번 돌려도 괜찮습니다.
-- 되돌리기: 맨 아래 '되돌리기' 절 (백업 표 zz_backup_fee_20261125 에서 값을 돌려놓음).
-- ============================================================================

-- ---------- 0. 본부장급 이상인가 ----------
-- 직원 기록의 level = 직급 id(rk_…) 또는 예전 등급 이름. 직급 목록(gwOrgRanks.v1)의 cls 로 등급을 봅니다.
create or replace function public.kob_caller_fee_cls() returns text
language plpgsql stable security definer set search_path = public as $$
declare
    me jsonb := public.kob_caller();
    lv text;
    cls text;
    ranks jsonb;
begin
    if me is null then return null; end if;
    if public.kob_user_is_admin(me) then return 'admin'; end if;
    lv := coalesce(me ->> 'level', '');
    if lv in ('head', 'exec') then return lv; end if;
    select value into ranks from public.app_store where key = 'gwOrgRanks.v1';
    if jsonb_typeof(ranks) = 'array' then
        select r ->> 'cls' into cls
          from jsonb_array_elements(ranks) r
         where jsonb_typeof(r) = 'object' and r ->> 'id' = lv
         limit 1;
    end if;
    if cls is null then   -- 직급 목록이 없거나 예전 모양 — 기본 직급표
        cls := case when lv in ('rk_ceo', 'rk_evp', 'rk_svp', 'rk_dir') then 'exec'
                    when lv in ('rk_gm', 'rk_head') then 'head' else null end;
    end if;
    return case when cls in ('head', 'exec') then cls else null end;
end $$;

create or replace function public.kob_caller_sees_fee() returns boolean
language sql stable security definer set search_path = public as $$
    select public.kob_caller_fee_cls() is not null
$$;

-- ---------- 1. 수수료 별도 표 ----------
create table if not exists public.merchant_fees (
    id          text primary key,            -- '표:줄 id'  예) supplies:SP-001
    tbl         text not null,
    row_id      text not null,
    value       jsonb not null default '{}'::jsonb,   -- { "fee": 1.23 } · { "fee": { "grade1": 1.1 } } · { "merchantFee": 5000 }
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_merchant_fees_tbl on public.merchant_fees (tbl, row_id);
alter table public.merchant_fees enable row level security;
drop policy if exists "merchant_fees read" on public.merchant_fees;
create policy "merchant_fees read" on public.merchant_fees for select to authenticated
    using (public.kob_caller_sees_fee());
-- 쓰기 정책은 두지 않습니다 — 아래 트리거(데이터베이스 권한)로만 씁니다.

-- 실시간 — 본부장급 화면에 다른 사람이 고친 수수료가 바로 보이게 (읽기 정책을 따릅니다)
do $$ begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'merchant_fees') then
        execute 'alter publication supabase_realtime add table public.merchant_fees';
    end if;
end $$;

-- ---------- 2. 저장할 때 수수료를 옮기는 트리거 ----------
create or replace function public.kob_fee_field(t text) returns text
language sql immutable as $$
    select case t when 'settlements' then 'merchantFee' else 'fee' end
$$;

create or replace function public.kob_fee_split() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    f text := public.kob_fee_field(tg_table_name);
    fid text := tg_table_name || ':' || new.id;
    -- 서버(service_role) · SQL Editor(로그인 정보 없음)는 그대로 옮깁니다.
    -- (security definer 라 함수 안의 current_user 는 늘 만든 사람이므로, 요청에 실린 로그인 정보로 판단합니다)
    trusted boolean := coalesce(current_setting('request.jwt.claims', true), '') = '' or coalesce(auth.role(), '') = 'service_role';
    allowed boolean;
    nv jsonb;
    cur jsonb;
    nxt jsonb;
    mask jsonb;
    k text;
    v jsonb;
begin
    if new.data is null or not (new.data ? f) then return new; end if;
    nv := new.data -> f;
    allowed := trusted or public.kob_caller_sees_fee();
    select m.value -> f into cur from public.merchant_fees m where m.id = fid;

    if tg_table_name = 'customers' then
        -- 등급별 객체. 받은 객체에 있는 등급만 남기고, '***' 인 등급은 원래 값을 씁니다.
        cur := case when jsonb_typeof(cur) = 'object' then cur else '{}'::jsonb end;
        if allowed and jsonb_typeof(nv) = 'object' then
            nxt := '{}'::jsonb;
            for k, v in select * from jsonb_each(nv) loop
                if v = '"***"'::jsonb then
                    if cur ? k then nxt := nxt || jsonb_build_object(k, cur -> k); end if;
                elsif v is not null and v <> 'null'::jsonb and v <> '""'::jsonb then
                    nxt := nxt || jsonb_build_object(k, v);
                end if;
            end loop;
        elsif allowed then
            nxt := '{}'::jsonb;                     -- 객체가 아니면(빈 값) 모두 지움
        else
            nxt := cur;                             -- 권한 없음 — 원래 값 유지
        end if;
        select coalesce(jsonb_object_agg(e.key, '***'), '{}'::jsonb) into mask from jsonb_each(nxt) e;
        if nxt = '{}'::jsonb then
            delete from public.merchant_fees where id = fid;
        else
            insert into public.merchant_fees (id, tbl, row_id, value, updated_at, updated_by)
            values (fid, tg_table_name, new.id, jsonb_build_object(f, nxt), now(), coalesce(auth.jwt() ->> 'email', current_user))
            on conflict (id) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
            where public.merchant_fees.value is distinct from excluded.value;
        end if;
    else
        -- 값 하나
        if allowed then
            if nv = '"***"'::jsonb then nxt := cur;
            elsif nv is null or nv = 'null'::jsonb or nv = '""'::jsonb then nxt := null;
            else nxt := nv; end if;
        else
            nxt := cur;
        end if;
        mask := case when nxt is null or nxt = 'null'::jsonb or nxt = '""'::jsonb then '""'::jsonb else '"***"'::jsonb end;
        if mask = '""'::jsonb then
            delete from public.merchant_fees where id = fid;
        else
            insert into public.merchant_fees (id, tbl, row_id, value, updated_at, updated_by)
            values (fid, tg_table_name, new.id, jsonb_build_object(f, nxt), now(), coalesce(auth.jwt() ->> 'email', current_user))
            on conflict (id) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
            where public.merchant_fees.value is distinct from excluded.value;
        end if;
    end if;
    new.data := jsonb_set(new.data, array[f], mask);
    return new;
end $$;

create or replace function public.kob_fee_drop() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    delete from public.merchant_fees where id = tg_table_name || ':' || old.id;
    return old;
end $$;

do $$
declare t text;
begin
    foreach t in array array['supplies', 'customers', 'settlements'] loop
        execute format('drop trigger if exists trg_kob_fee_split on public.%I', t);
        execute format('create trigger trg_kob_fee_split before insert or update of data on public.%I for each row execute function public.kob_fee_split()', t);
        execute format('drop trigger if exists trg_kob_fee_drop on public.%I', t);
        execute format('create trigger trg_kob_fee_drop after delete on public.%I for each row execute function public.kob_fee_drop()', t);
    end loop;
end $$;

-- ---------- 3. 지금 있는 수수료 옮기기 (백업 먼저) ----------
create table if not exists public.zz_backup_fee_20261125 (
    tbl text not null, id text not null, value jsonb, backed_at timestamptz not null default now(),
    primary key (tbl, id)
);
alter table public.zz_backup_fee_20261125 enable row level security;   -- 정책 없음 = 화면에서 못 읽음
insert into public.zz_backup_fee_20261125 (tbl, id, value)
select 'supplies', id, data -> 'fee' from public.supplies where data ? 'fee' and data -> 'fee' not in ('"***"'::jsonb, '""'::jsonb)
on conflict do nothing;
insert into public.zz_backup_fee_20261125 (tbl, id, value)
select 'customers', id, data -> 'fee' from public.customers
 where data ? 'fee' and jsonb_typeof(data -> 'fee') = 'object' and exists (select 1 from jsonb_each(data -> 'fee') e where e.value not in ('"***"'::jsonb, '""'::jsonb, 'null'::jsonb))
on conflict do nothing;
insert into public.zz_backup_fee_20261125 (tbl, id, value)
select 'settlements', id, data -> 'merchantFee' from public.settlements where data ? 'merchantFee' and data -> 'merchantFee' not in ('"***"'::jsonb, '""'::jsonb)
on conflict do nothing;

-- 같은 값으로 다시 저장 → 트리거가 옮기고 표시로 바꿉니다 (SQL Editor 는 권한 검사 없이 옮김)
update public.supplies    set data = data where data ? 'fee'         and data -> 'fee'         <> '"***"'::jsonb;
update public.customers   set data = data where data ? 'fee'         and jsonb_typeof(data -> 'fee') = 'object';
update public.settlements set data = data where data ? 'merchantFee' and data -> 'merchantFee' <> '"***"'::jsonb;

-- ---------- 4. 수수료 엑셀 승인 ----------
create table if not exists public.fee_download_requests (
    id          text primary key,
    ch          text not null,                 -- pg · pharmacy · partner · payout
    chname      text,
    reason      text not null,
    by_email    text not null,
    by_name     text,
    by_dept     text,
    approvers   jsonb not null default '[]'::jsonb,
    status      text not null default 'pending',   -- pending · approved · rejected · used
    decided_by  text,
    decided_at  timestamptz,
    note        text,
    used_at     timestamptz,
    rows_n      integer,
    created_at  timestamptz not null default now()
);
alter table public.fee_download_requests enable row level security;
drop policy if exists "fee_dl read" on public.fee_download_requests;
create policy "fee_dl read" on public.fee_download_requests for select to authenticated
    using (lower(by_email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.kob_caller_sees_fee());
-- 쓰기는 아래 함수로만

create table if not exists public.fee_access_log (
    id      bigserial primary key,
    at      timestamptz not null default now(),
    email   text,
    name    text,
    action  text not null,       -- view · download · request · approve · reject
    ch      text,
    rows_n  integer,
    detail  text
);
alter table public.fee_access_log enable row level security;
drop policy if exists "fee_log admin read" on public.fee_access_log;
create policy "fee_log admin read" on public.fee_access_log for select to authenticated
    using (public.kob_user_is_admin(public.kob_caller()));

create or replace function public.kob_fee_log_add(p_action text, p_ch text, p_rows integer, p_detail text) returns void
language sql security definer set search_path = public as $$
    insert into public.fee_access_log (email, name, action, ch, rows_n, detail)
    values (auth.jwt() ->> 'email', public.kob_caller() ->> 'name', p_action, p_ch, p_rows, left(coalesce(p_detail, ''), 500))
$$;
revoke all on function public.kob_fee_log_add(text, text, integer, text) from public, anon, authenticated;

-- 화면이 부르는 기록 (열람 · 본부장급 바로 다운로드)
create or replace function public.fee_log(p_action text, p_ch text, p_rows integer default null, p_detail text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
    if not public.kob_is_staff() then raise exception 'KOB_FEE: 직원만 기록할 수 있습니다.' using errcode = '42501'; end if;
    if p_action not in ('view', 'download') then raise exception 'KOB_FEE: 알 수 없는 기록입니다.' using errcode = '22023'; end if;
    perform public.kob_fee_log_add(p_action, p_ch, p_rows, p_detail);
end $$;

-- 승인 요청
create or replace function public.fee_dl_request(p_ch text, p_chname text, p_reason text, p_approvers jsonb) returns public.fee_download_requests
language plpgsql security definer set search_path = public as $$
declare
    me jsonb := public.kob_caller();
    em text := lower(coalesce(auth.jwt() ->> 'email', ''));
    r public.fee_download_requests;
begin
    if me is null then raise exception 'KOB_FEE: 직원만 요청할 수 있습니다.' using errcode = '42501'; end if;
    if p_ch not in ('pg', 'pharmacy', 'partner', 'payout') then raise exception 'KOB_FEE: 알 수 없는 자료입니다.' using errcode = '22023'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'KOB_FEE: 사유를 입력해 주세요.' using errcode = '22023'; end if;
    select * into r from public.fee_download_requests
     where lower(by_email) = em and ch = p_ch and status = 'pending' limit 1;
    if found then return r; end if;
    insert into public.fee_download_requests (id, ch, chname, reason, by_email, by_name, by_dept, approvers)
    values ('DLR-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || floor(random() * 1000)::int,
            p_ch, p_chname, left(trim(p_reason), 500), em, me ->> 'name', me ->> 'dept',
            case when jsonb_typeof(p_approvers) = 'array' then p_approvers else '[]'::jsonb end)
    returning * into r;
    perform public.kob_fee_log_add('request', p_ch, null, r.id || ' · ' || r.reason);
    return r;
end $$;

-- 승인 · 반려 — 본부장급 이상, 요청자 본인 제외, 지정된 승인자(또는 대표급 · 관리자)만
create or replace function public.fee_dl_decide(p_id text, p_approve boolean, p_note text default null) returns public.fee_download_requests
language plpgsql security definer set search_path = public as $$
declare
    me jsonb := public.kob_caller();
    cls text := public.kob_caller_fee_cls();
    em text := lower(coalesce(auth.jwt() ->> 'email', ''));
    r public.fee_download_requests;
begin
    select * into r from public.fee_download_requests where id = p_id for update;
    if not found then raise exception 'KOB_FEE: 요청을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
    if cls is null then raise exception 'KOB_FEE: 본부장급 이상만 승인할 수 있습니다.' using errcode = '42501'; end if;
    if lower(r.by_email) = em then raise exception 'KOB_FEE: 본인 요청은 승인할 수 없습니다.' using errcode = '42501'; end if;
    if r.status <> 'pending' then raise exception 'KOB_FEE: 이미 처리된 요청입니다.' using errcode = '22023'; end if;
    if cls = 'head' and not (r.approvers ? coalesce(me ->> 'name', '')) then
        raise exception 'KOB_FEE: 지정된 승인자만 승인할 수 있습니다.' using errcode = '42501';
    end if;
    if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'KOB_FEE: 반려 사유를 입력해 주세요.' using errcode = '22023'; end if;
    update public.fee_download_requests
       set status = case when p_approve then 'approved' else 'rejected' end,
           decided_by = me ->> 'name', decided_at = now(), note = left(coalesce(trim(p_note), ''), 500)
     where id = p_id returning * into r;
    perform public.kob_fee_log_add(case when p_approve then 'approve' else 'reject' end, r.ch, null, r.id || ' · 요청 ' || coalesce(r.by_name, r.by_email));
    return r;
end $$;

-- 승인받은 다운로드 — 요청자 본인, 승인 후 24시간 안, 1회. 그 자료의 수수료를 돌려주고 사용 처리
create or replace function public.fee_dl_fetch(p_id text, p_rows integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    em text := lower(coalesce(auth.jwt() ->> 'email', ''));
    r public.fee_download_requests;
    out jsonb;
begin
    select * into r from public.fee_download_requests where id = p_id for update;
    if not found or lower(r.by_email) <> em then raise exception 'KOB_FEE: 본인 요청만 받을 수 있습니다.' using errcode = '42501'; end if;
    if r.status <> 'approved' then raise exception 'KOB_FEE: 승인된 요청이 아닙니다 (상태: %).', r.status using errcode = '42501'; end if;
    if r.decided_at < now() - interval '24 hours' then raise exception 'KOB_FEE: 승인 후 24시간이 지났습니다. 다시 요청해 주세요.' using errcode = '42501'; end if;
    if r.ch in ('pg', 'pharmacy') then
        select coalesce(jsonb_object_agg(m.row_id, m.value), '{}'::jsonb) into out
          from public.merchant_fees m join public.supplies s on s.id = m.row_id
         where m.tbl = 'supplies' and s.channel = r.ch;
    elsif r.ch = 'partner' then
        select coalesce(jsonb_object_agg(m.row_id, m.value), '{}'::jsonb) into out from public.merchant_fees m where m.tbl = 'customers';
    else
        select coalesce(jsonb_object_agg(m.row_id, m.value), '{}'::jsonb) into out from public.merchant_fees m where m.tbl = 'settlements';
    end if;
    update public.fee_download_requests set status = 'used', used_at = now(), rows_n = p_rows where id = p_id;
    perform public.kob_fee_log_add('download', r.ch, p_rows, r.id || ' · 승인 ' || coalesce(r.decided_by, ''));
    return out;
end $$;

-- 관리자 — 기록 보기 (최근 n건)
create or replace function public.fee_log_list(p_limit integer default 100) returns setof public.fee_access_log
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.kob_user_is_admin(public.kob_caller()) then raise exception 'KOB_FEE: 관리자만 볼 수 있습니다.' using errcode = '42501'; end if;
    return query select * from public.fee_access_log order by id desc limit greatest(1, least(coalesce(p_limit, 100), 1000));
end $$;

-- 읽기는 위 정책을 따릅니다 (쓰기 정책이 없어 표에 직접 쓰는 것은 막힘)
grant select on public.merchant_fees, public.fee_download_requests, public.fee_access_log to authenticated;
revoke insert, update, delete on public.merchant_fees, public.fee_download_requests, public.fee_access_log from anon, authenticated;
grant execute on function public.fee_log(text, text, integer, text) to authenticated;
grant execute on function public.fee_dl_request(text, text, text, jsonb) to authenticated;
grant execute on function public.fee_dl_decide(text, boolean, text) to authenticated;
grant execute on function public.fee_dl_fetch(text, integer) to authenticated;
grant execute on function public.fee_log_list(integer) to authenticated;
grant execute on function public.kob_caller_sees_fee() to authenticated;

-- ---------- 5. 직급 등급(cls) 변경은 관리자 · 조직도 관리 권한만 ----------
-- security invoker — 요청한 사람의 역할로 돕니다 (schema-v8 과 같은 이유)
create or replace function public.kob_org_ranks_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
    oldv jsonb;
    changed boolean;
begin
    if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
    if new.key <> 'gwOrgRanks.v1' then return new; end if;
    select value into oldv from public.app_store where key = new.key;
    if oldv is null then return new; end if;
    with o as (select r ->> 'id' id, r ->> 'cls' cls from jsonb_array_elements(case when jsonb_typeof(oldv) = 'array' then oldv else '[]'::jsonb end) r where jsonb_typeof(r) = 'object'),
         n as (select r ->> 'id' id, r ->> 'cls' cls from jsonb_array_elements(case when jsonb_typeof(new.value) = 'array' then new.value else '[]'::jsonb end) r where jsonb_typeof(r) = 'object')
    select exists (select 1 from n left join o on o.id = n.id where n.cls is distinct from o.cls and (o.id is not null or n.cls in ('head', 'exec')))
      into changed;
    if changed and not (public.kob_user_is_admin(public.kob_caller()) or public.kob_caller_can('management-org')) then
        raise exception 'KOB_PRIV: 직급의 권한 등급은 관리자 · 조직도 관리 권한이 있어야 바꿀 수 있습니다.' using errcode = '42501';
    end if;
    return new;
end $$;
drop trigger if exists trg_kob_org_ranks_guard on public.app_store;
create trigger trg_kob_org_ranks_guard before insert or update on public.app_store
    for each row execute function public.kob_org_ranks_guard();

-- ---------- 확인 ----------
select (select count(*) from public.merchant_fees)                                   as "옮긴 수수료 줄",
       (select count(*) from public.zz_backup_fee_20261125)                           as "백업 줄",
       (select count(*) from public.supplies where data -> 'fee' not in ('"***"'::jsonb, '""'::jsonb) and data ? 'fee') as "supplies 남은 실제 값(0이어야)",
       (select count(*) from public.settlements where data -> 'merchantFee' not in ('"***"'::jsonb, '""'::jsonb) and data ? 'merchantFee') as "settlements 남은 실제 값(0이어야)",
       (select count(*) from public.customers c where jsonb_typeof(c.data -> 'fee') = 'object'
           and exists (select 1 from jsonb_each(c.data -> 'fee') e where e.value <> '"***"'::jsonb)) as "customers 남은 실제 값(0이어야)";

-- ============================================================================
-- 되돌리기 (필요할 때만 — /* */ 를 풀고 실행)
/*
do $$ declare t text; begin
    foreach t in array array['supplies', 'customers', 'settlements'] loop
        execute format('drop trigger if exists trg_kob_fee_split on public.%I', t);
        execute format('drop trigger if exists trg_kob_fee_drop on public.%I', t);
    end loop;
end $$;
update public.supplies    s set data = jsonb_set(s.data, '{fee}', b.value)         from public.zz_backup_fee_20261125 b where b.tbl = 'supplies'    and b.id = s.id;
update public.customers   c set data = jsonb_set(c.data, '{fee}', b.value)         from public.zz_backup_fee_20261125 b where b.tbl = 'customers'   and b.id = c.id;
update public.settlements s set data = jsonb_set(s.data, '{merchantFee}', b.value) from public.zz_backup_fee_20261125 b where b.tbl = 'settlements' and b.id = s.id;
-- 백업 뒤에 바뀐 값은 merchant_fees 에 있습니다 — 필요하면 위 세 줄 대신 merchant_fees 의 value 로 돌려놓습니다.
drop trigger if exists trg_kob_org_ranks_guard on public.app_store;
*/
-- 화면에서 이상 없음을 확인한 뒤(1~2주) 백업 표를 지웁니다:  drop table public.zz_backup_fee_20261125;
-- ============================================================================
