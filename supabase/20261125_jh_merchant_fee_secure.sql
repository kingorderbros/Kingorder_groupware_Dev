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
-- 직원 기록의 level = 직급 id(rk_…) 또는 예전 등급 이름. 직급 목록(gwOrgRanks.v1)으로 등급(cls)을 봅니다.
-- 화면(normalizeRanks)과 같은 규칙: 문자열 · {name, level} 예전 모양도 받고, id 가 없으면 기본 직급표에서 이름으로 찾습니다.
create or replace function public.kob_rank_default() returns jsonb
language sql immutable as $$
    select '[{"id":"rk_ceo","name":"대표이사","cls":"exec"},{"id":"rk_evp","name":"전무","cls":"exec"},{"id":"rk_svp","name":"상무","cls":"exec"},
             {"id":"rk_dir","name":"이사","cls":"exec"},{"id":"rk_gm","name":"부장","cls":"head"},{"id":"rk_head","name":"본부장","cls":"head"},
             {"id":"rk_leader","name":"팀장","cls":"leader"},{"id":"rk_manager","name":"매니저","cls":"manager"},{"id":"rk_part","name":"파트장","cls":"leader"}]'::jsonb
$$;
-- 직급 목록 → (id, cls) — 목록이 없거나 배열이 아니면 기본 직급표
create or replace function public.kob_rank_map(v jsonb) returns table (id text, cls text)
language sql stable as $$
    with src as (
        select e from jsonb_array_elements(case when jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 0 then v else public.kob_rank_default() end) e
    ), norm as (
        select case when jsonb_typeof(e) = 'string' then e #>> '{}' else coalesce(e ->> 'name', '') end as name,
               case when jsonb_typeof(e) = 'object' then nullif(e ->> 'id', '') end as rid,
               case when jsonb_typeof(e) = 'object' then coalesce(nullif(e ->> 'cls', ''), nullif(e ->> 'level', '')) end as rcls
          from src
    )
    select coalesce(n.rid, d ->> 'id') as id,
           case when n.rcls in ('manager', 'leader', 'head', 'exec') then n.rcls else coalesce(d ->> 'cls', 'manager') end as cls
      from norm n
      left join lateral (select x from jsonb_array_elements(public.kob_rank_default()) x where x ->> 'name' = trim(n.name) limit 1) dd(d) on true
     where trim(n.name) <> '' and coalesce(n.rid, d ->> 'id') is not null
$$;
-- 직원 기록 하나의 수수료 등급 — 'admin' · 'exec' · 'head' 또는 null
create or replace function public.kob_user_fee_cls(u jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare
    lv text;
    c text;
begin
    if u is null or coalesce(u ->> 'resigned', 'false') = 'true' then return null; end if;
    if public.kob_user_is_admin(u) then return 'admin'; end if;
    lv := coalesce(u ->> 'level', '');
    if lv in ('head', 'exec') then return lv; end if;
    select m.cls into c from public.kob_rank_map((select value from public.app_store where key = 'gwOrgRanks.v1')) m where m.id = lv limit 1;
    return case when c in ('head', 'exec') then c else null end;
end $$;
create or replace function public.kob_caller_fee_cls() returns text
language sql stable security definer set search_path = public as $$
    select public.kob_user_fee_cls(public.kob_caller())
$$;

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

-- 기록 표 (아래 트리거도 씁니다)
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
            -- 권한 없음 — 있던 등급은 그대로, 값이 없던 등급만 새로 넣을 수 있음 (엑셀 업로드 · 새 업체)
            nxt := cur;
            if jsonb_typeof(nv) = 'object' then
                for k, v in select * from jsonb_each(nv) loop
                    if not (cur ? k) and v not in ('"***"'::jsonb, '""'::jsonb, 'null'::jsonb) then nxt := nxt || jsonb_build_object(k, v); end if;
                end loop;
            end if;
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
        elsif cur is null and nv is not null and nv not in ('"***"'::jsonb, '""'::jsonb, 'null'::jsonb) then
            nxt := nv;      -- 권한 없음 — 값이 없던 칸에 새로 넣는 것만 (엑셀 업로드 · 새 줄). 읽을 수는 없음
        else
            nxt := cur;     -- 권한 없음 — 있던 값은 바꾸거나 지우지 못함
        end if;
        if tg_table_name = 'settlements' and nxt = '0'::jsonb then nxt := null; end if;   -- 지급명세 0원은 '값 없음'
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
    -- 본부장급 미만이 수수료를 새로 저장한 경우(엑셀 업로드 · 새 줄) 기록 — 업로드 한 번에 줄이 많아 10분에 한 번으로 묶습니다
    if not allowed and nxt is distinct from cur
       and not exists (select 1 from public.fee_access_log l where l.action = 'upload' and l.ch = tg_table_name
                        and lower(coalesce(l.email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')) and l.at > now() - interval '10 minutes') then
        insert into public.fee_access_log (email, name, action, ch, detail)
        values (auth.jwt() ->> 'email', public.kob_caller() ->> 'name', 'upload', tg_table_name, '본부장급 미만 수수료 저장 (엑셀 업로드 · 새 줄) · 첫 줄 ' || new.id);
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
    scope       text,                          -- 지급명세는 지급월(YYYY-MM) — 받기는 이 범위만
    created_at  timestamptz not null default now()
);
alter table public.fee_download_requests add column if not exists scope text;
alter table public.fee_download_requests enable row level security;
drop policy if exists "fee_dl read" on public.fee_download_requests;
create policy "fee_dl read" on public.fee_download_requests for select to authenticated
    using (lower(by_email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.kob_caller_sees_fee());
-- 쓰기는 아래 함수로만

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
    if not public.kob_caller_sees_fee() then raise exception 'KOB_FEE: 본부장급 이상만 기록할 수 있습니다.' using errcode = '42501'; end if;
    if p_action not in ('view', 'download') or p_ch not in ('pg', 'pharmacy', 'partner', 'payout') then raise exception 'KOB_FEE: 알 수 없는 기록입니다.' using errcode = '22023'; end if;
    perform public.kob_fee_log_add(p_action, p_ch, p_rows, p_detail);
end $$;

-- 승인 요청
drop function if exists public.fee_dl_request(text, text, text, jsonb);   -- 예전 4칸 모양 (범위 칸 추가 전)
create or replace function public.fee_dl_request(p_ch text, p_chname text, p_reason text, p_approvers jsonb, p_scope text default null) returns public.fee_download_requests
language plpgsql security definer set search_path = public as $$
declare
    me jsonb := public.kob_caller();
    em text := lower(coalesce(auth.jwt() ->> 'email', ''));
    r public.fee_download_requests;
    ap jsonb;
begin
    if me is null then raise exception 'KOB_FEE: 직원만 요청할 수 있습니다.' using errcode = '42501'; end if;
    if p_ch not in ('pg', 'pharmacy', 'partner', 'payout') then raise exception 'KOB_FEE: 알 수 없는 자료입니다.' using errcode = '22023'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'KOB_FEE: 사유를 입력해 주세요.' using errcode = '22023'; end if;
    if p_ch = 'payout' and coalesce(p_scope, '') !~ '^\d{4}-\d{2}$' then raise exception 'KOB_FEE: 지급월을 선택해 주세요.' using errcode = '22023'; end if;
    select * into r from public.fee_download_requests
     where lower(by_email) = em and ch = p_ch and status = 'pending' and coalesce(scope, '') = coalesce(case when p_ch = 'payout' then p_scope end, '') limit 1;
    if found then return r; end if;
    -- 승인자는 데이터베이스가 정합니다 (화면이 보낸 p_approvers 는 쓰지 않음): 같은 본부 본부장급, 없으면 본부장급 이상 전원 · 관리자
    select coalesce(jsonb_agg(distinct u ->> 'name'), '[]'::jsonb) into ap
      from public.app_store s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) u
     where s.key = 'gwUsers.v1' and coalesce(u ->> 'name', '') <> '' and lower(coalesce(u ->> 'email', '')) <> em
       and coalesce(u ->> 'dept', '') = coalesce(me ->> 'dept', '') and public.kob_user_fee_cls(u) = 'head';
    if ap = '[]'::jsonb then
        select coalesce(jsonb_agg(distinct u ->> 'name'), '[]'::jsonb) into ap
          from public.app_store s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) u
         where s.key = 'gwUsers.v1' and coalesce(u ->> 'name', '') <> '' and lower(coalesce(u ->> 'email', '')) <> em
           and public.kob_user_fee_cls(u) is not null;
    end if;
    if ap = '[]'::jsonb then raise exception 'KOB_FEE: 승인할 본부장급 직원이 없습니다. 관리자에게 문의해 주세요.' using errcode = '22023'; end if;
    insert into public.fee_download_requests (id, ch, chname, reason, by_email, by_name, by_dept, approvers, scope)
    values ('DLR-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || floor(random() * 1000)::int,
            p_ch, p_chname, left(trim(p_reason), 500), em, me ->> 'name', me ->> 'dept', ap, case when p_ch = 'payout' then p_scope end)
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
        select coalesce(jsonb_object_agg(m.row_id, m.value), '{}'::jsonb) into out
          from public.merchant_fees m join public.settlements t on t.id = m.row_id
         where m.tbl = 'settlements' and t.data ->> 'ym' = r.scope;      -- 승인받은 지급월만
    end if;
    update public.fee_download_requests set status = 'used', used_at = now(), rows_n = coalesce(p_rows, (select count(*)::int from jsonb_object_keys(out))) where id = p_id;
    perform public.kob_fee_log_add('download', r.ch, coalesce(p_rows, (select count(*)::int from jsonb_object_keys(out))), r.id || ' · 승인 ' || coalesce(r.decided_by, ''));
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
grant execute on function public.fee_dl_request(text, text, text, jsonb, text) to authenticated;
grant execute on function public.fee_dl_decide(text, boolean, text) to authenticated;
grant execute on function public.fee_dl_fetch(text, integer) to authenticated;
grant execute on function public.fee_log_list(integer) to authenticated;
grant execute on function public.kob_caller_sees_fee() to authenticated;

-- ---------- 5. 직급 등급(cls) 변경은 관리자 · 조직도 관리 권한만 ----------
-- 실제로 쓰이는 등급표(kob_rank_map — 없거나 배열이 아니면 기본 직급표)를 저장 전 · 후로 비교합니다.
-- 지우기 · 배열 아닌 값으로 덮기 · 지운 뒤 새로 넣기 모두 같은 기준으로 막힙니다.
-- security invoker — 요청한 사람의 역할로 돕니다 (schema-v8 과 같은 이유)
create or replace function public.kob_org_ranks_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
    k text := coalesce(new.key, old.key);
    oldv jsonb;
    newv jsonb := case when tg_op = 'DELETE' then null else new.value end;
    changed boolean;
begin
    if coalesce(current_setting('request.jwt.claims', true), '') = '' or coalesce(auth.role(), '') = 'service_role' then
        return case when tg_op = 'DELETE' then old else new end;
    end if;
    if k <> 'gwOrgRanks.v1' then return case when tg_op = 'DELETE' then old else new end; end if;
    oldv := case when tg_op = 'INSERT' then (select value from public.app_store where key = k) else old.value end;
    select exists (
        select 1 from public.kob_rank_map(newv) n full outer join public.kob_rank_map(oldv) o on o.id = n.id
         where n.cls is distinct from o.cls
    ) into changed;
    if changed and not (public.kob_user_is_admin(public.kob_caller()) or public.kob_caller_can('management-org')) then
        raise exception 'KOB_PRIV: 직급의 권한 등급은 관리자 · 조직도 관리 권한이 있어야 바꿀 수 있습니다.' using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_kob_org_ranks_guard on public.app_store;
create trigger trg_kob_org_ranks_guard before insert or update or delete on public.app_store
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
-- 지금 값(merchant_fees)을 먼저 돌려놓고, 거기 없는 줄만 백업 값으로
update public.supplies    t set data = jsonb_set(t.data, '{fee}', m.value -> 'fee')                 from public.merchant_fees m where m.id = 'supplies:' || t.id;
update public.customers   t set data = jsonb_set(t.data, '{fee}', m.value -> 'fee')                 from public.merchant_fees m where m.id = 'customers:' || t.id;
update public.settlements t set data = jsonb_set(t.data, '{merchantFee}', m.value -> 'merchantFee') from public.merchant_fees m where m.id = 'settlements:' || t.id;
update public.supplies    t set data = jsonb_set(t.data, '{fee}', b.value)         from public.zz_backup_fee_20261125 b where b.tbl = 'supplies'    and b.id = t.id and not exists (select 1 from public.merchant_fees m where m.id = 'supplies:' || t.id);
update public.customers   t set data = jsonb_set(t.data, '{fee}', b.value)         from public.zz_backup_fee_20261125 b where b.tbl = 'customers'   and b.id = t.id and not exists (select 1 from public.merchant_fees m where m.id = 'customers:' || t.id);
update public.settlements t set data = jsonb_set(t.data, '{merchantFee}', b.value) from public.zz_backup_fee_20261125 b where b.tbl = 'settlements' and b.id = t.id and not exists (select 1 from public.merchant_fees m where m.id = 'settlements:' || t.id);
-- 값이 없던 줄의 '***' · '' 표시는 화면에서 빈 값으로 보입니다
drop trigger if exists trg_kob_org_ranks_guard on public.app_store;
*/
-- 화면에서 이상 없음을 확인한 뒤(1~2주) 백업 표를 지웁니다:  drop table public.zz_backup_fee_20261125;
-- ============================================================================
