-- ============================================================================
-- 킹오더브라더스 그룹웨어 — Supabase 스키마 2차 (업무 자료 표 분리 · 2026-09-17)
--
-- 1차(schema.sql)는 app_store 한 장에 "키 하나 = JSON 덩어리 하나" 로 담았습니다.
-- 그 방식의 한계 세 가지 때문에 업무 자료만 표로 나눕니다.
--   ① 두 사람이 같은 화면을 동시에 고치면 나중 저장이 앞 사람 것을 통째로 덮어씀
--   ② 첨부파일이 base64 글자로 JSON 안에 들어가, 한 건 고칠 때마다 전부 다시 전송
--   ③ 검색·집계를 못 해 전체를 브라우저로 내려받아 걸러야 함
--
-- 설계 원칙 — 화면 코드를 최대한 그대로 두기 위해:
--   · 한 건 = 한 행. 쓰기도 그 행만 → ① 해결
--   · 화면이 쓰던 객체는 통째로 data(jsonb) 에 넣습니다. 항목 이름을 안 바꿔도 됩니다.
--   · 검색·정렬에 쓰는 값만 **생성 열**(generated column)로 뽑습니다.
--     data 에서 자동으로 계산되므로 따로 채워 넣을 필요가 없고, 값이 어긋날 일도 없습니다.
--   · rev(판) 로 동시 수정 충돌을 잡습니다. 읽을 때의 rev 와 다르면 저장을 막고 알립니다.
--   · 첨부파일은 Supabase Storage 에 두고 attachments 표가 가리킵니다 → ② 해결
--
-- 실행: Supabase 대시보드 › SQL Editor 에 붙여 넣고 Run.
--       dev 프로젝트와 prod 프로젝트에 **각각** 돌립니다. schema.sql 을 먼저 돌린 뒤 이것을 돌립니다.
--       이미 있는 표·정책은 건너뛰므로 여러 번 돌려도 됩니다.
-- ============================================================================


-- ============================================================================
-- 0. 공통 장치
-- ============================================================================

-- updated_at 자동 갱신 + rev(판) 1 증가
create or replace function public.touch_row() returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    new.rev = coalesce(old.rev, 0) + 1;
    return new;
end $$;

-- 화면이 쓰는 번호(QT-0001 · CASE-0012 …) 를 서버에서 채번합니다.
-- 지금은 브라우저 안의 숫자를 하나씩 올리고 있어, 두 사람이 동시에 만들면 같은 번호가 나옵니다.
create table if not exists public.id_counters (
    kind text primary key,
    n    bigint not null default 0
);
create or replace function public.next_code(p_kind text, p_prefix text, p_width int default 4)
returns text language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
    insert into public.id_counters (kind, n) values (p_kind, 1)
        on conflict (kind) do update set n = public.id_counters.n + 1
        returning n into v;
    return p_prefix || lpad(v::text, p_width, '0');
end $$;

-- 표를 만들 때마다 반복되는 것(트리거 · RLS · Realtime)을 한 번에 붙입니다.
create or replace function public.setup_work_table(p_table text) returns void
language plpgsql security definer set search_path = public as $$
begin
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$I', p_table);
    execute format('create trigger trg_%1$s_touch before update on public.%1$I
                    for each row execute function public.touch_row()', p_table);

    execute format('alter table public.%I enable row level security', p_table);
    execute format('alter table public.%I replica identity full', p_table);

    -- 로그인한 사내 사용자만 읽고 씁니다. (1차에서 anon 에 열어 두었던 것을 여기서 좁힙니다)
    -- 주의: 여기까지는 "사외 차단" 까지입니다. 개인 캘린더처럼 **사내에서도 본인만 봐야 하는 것**은
    --       지금 화면 코드 안에서만 걸러지므로, 5단계에서 행 단위 조건으로 다시 좁혀야 합니다.
    execute format('drop policy if exists "%1$s rw" on public.%1$I', p_table);
    execute format('create policy "%1$s rw" on public.%1$I for all
                    to authenticated using (true) with check (true)', p_table);

    -- 다른 사람이 고친 것을 화면이 바로 받도록
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = p_table) then
        execute format('alter publication supabase_realtime add table public.%I', p_table);
    end if;
end $$;


-- ============================================================================
-- 1. 업무 자료 표
--    공통 칸:  id · data(화면 객체 그대로) · rev(판) · updated_at · updated_by
--    생성 열:  data 에서 자동으로 뽑히는 검색용 값 — 화면은 신경 쓰지 않아도 됩니다
-- ============================================================================

-- ---------- 1-1. 일정캘린더 ----------
create table if not exists public.schedules (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    on_date     text generated always as (data->>'date')       stored,
    calendar    text generated always as (data->>'calendar')   stored,   -- personal/team/sales-share/install-as/company
    dept        text generated always as (data->>'dept')       stored,
    owner_name  text generated always as (data->>'salesperson') stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_schedules_date on public.schedules (on_date);
create index if not exists idx_schedules_cal  on public.schedules (calendar, dept);

-- ---------- 1-2. 고객사 · 가맹점 ----------
create table if not exists public.customers (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    name        text generated always as (data->>'name')  stored,
    biz_no      text generated always as (data->>'bizNo') stored,
    grade       text generated always as (data->>'grade') stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_customers_name   on public.customers (name);
create index if not exists idx_customers_bizno  on public.customers (biz_no);

-- ---------- 1-3. 업무센터 업무 건 (영업 · 운영 · 결제 공용) ----------
create table if not exists public.works (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    center      text generated always as (data->>'center')     stored,   -- ops / sales / pay
    customer_id text generated always as (data->>'customerId') stored,
    work_type   text generated always as (data->>'type')       stored,
    status      text generated always as (data->>'status')     stored,
    assignee    text generated always as (data->>'assignee')   stored,
    on_date     text generated always as (data->>'date')       stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_works_center on public.works (center, status);
create index if not exists idx_works_cust   on public.works (customer_id);

-- ---------- 1-4. 계약 ----------
create table if not exists public.contracts (
    id              text primary key,
    data            jsonb not null default '{}'::jsonb,
    customer_id     text    generated always as (data->>'customerId')      stored,
    status          text    generated always as (data->>'status')          stored,
    approval_status text    generated always as (data->>'approvalStatus')  stored,
    rev             integer not null default 1,
    updated_at      timestamptz not null default now(),
    updated_by      text
);
create index if not exists idx_contracts_cust on public.contracts (customer_id);

-- ---------- 1-5. 견적서 ----------
create table if not exists public.quotes (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    customer_id text generated always as (data->>'customerId') stored,
    status      text generated always as (data->>'status')     stored,
    created_on  text generated always as (data->>'createdAt')  stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_quotes_cust on public.quotes (customer_id);

-- ---------- 1-6. 상담 ----------
create table if not exists public.cases (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    customer_id text    generated always as (data->>'customerId') stored,
    completed   text    generated always as (data->>'completed') stored,   -- 'true' / 'false' 글자
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);

-- ---------- 1-7. 공지사항 ----------
create table if not exists public.notices (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    author      text generated always as (data->>'author') stored,
    on_date     text generated always as (data->>'date')   stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);

-- ---------- 1-8. 프로젝트 (WBS · 이슈를 data 안에 함께 둡니다) ----------
create table if not exists public.projects (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    name        text generated always as (data->>'name')   stored,
    status      text generated always as (data->>'status') stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);

-- ---------- 1-9. 협업티켓 ----------
create table if not exists public.collab_requests (
    id            text primary key,
    data          jsonb not null default '{}'::jsonb,
    status        text generated always as (data->>'status')       stored,
    source_dept   text generated always as (data->>'sourceDept')   stored,
    target_dept   text generated always as (data->>'targetDept')   stored,
    assignee_user text generated always as (data->>'assigneeUser') stored,
    due_date      text generated always as (data->>'dueDate')      stored,
    rev           integer not null default 1,
    updated_at    timestamptz not null default now(),
    updated_by    text
);
create index if not exists idx_collab_target on public.collab_requests (target_dept, status);

-- ---------- 1-10. 내 할 일 ----------
create table if not exists public.todos (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    owner_name  text    generated always as (data->>'owner') stored,
    done        text    generated always as (data->>'done') stored,        -- 'true' / 'false' 글자
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_todos_owner on public.todos (owner_name);

-- ---------- 1-11. 파트너 접수 (app_store 에서 이사 — 첨부가 커서 우선순위 높음) ----------
create table if not exists public.partner_intakes (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    status      text generated always as (data->>'status')  stored,
    dept        text generated always as (data->>'dept')    stored,
    partner_id  text generated always as (data->>'partner') stored,
    on_date     text generated always as (data->>'date')    stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_intakes_status on public.partner_intakes (dept, status);

-- ---------- 1-12. 설치 체크리스트 (사진 첨부) ----------
create table if not exists public.install_checks (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    work_id     text generated always as (data->>'workId') stored,
    status      text generated always as (data->>'status') stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);

-- ---------- 1-13. 보완서류 요청 (결제업무센터) ----------
create table if not exists public.pay_doc_requests (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    work_id     text generated always as (data->>'workId') stored,
    status      text generated always as (data->>'status') stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);

-- ---------- 1-14 ~ 1-16. 엑셀로 대량 올라오는 자료 ----------
-- 한 번에 수천 행이 들어오므로 배치(batch_id)를 남겨 "이번 업로드만 되돌리기" 가 되게 합니다.
create table if not exists public.settlements (          -- 정산 내역
    id          text primary key,
    batch_id    text,
    data        jsonb not null default '{}'::jsonb,
    partner_key text generated always as (data->>'partnerKey') stored,
    period      text generated always as (data->>'period')     stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_settle_period on public.settlements (period, partner_key);
create index if not exists idx_settle_batch  on public.settlements (batch_id);

create table if not exists public.pg_fees (              -- PG 수수료
    id          text primary key,
    batch_id    text,
    data        jsonb not null default '{}'::jsonb,
    partner_key text generated always as (data->>'partnerKey') stored,
    period      text generated always as (data->>'period')     stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);
create index if not exists idx_pgfee_period on public.pg_fees (period, partner_key);

create table if not exists public.supplies (             -- 공급 내역
    id          text primary key,
    batch_id    text,
    data        jsonb not null default '{}'::jsonb,
    channel     text generated always as (data->>'channel') stored,
    on_date     text generated always as (data->>'date')    stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);

-- ---------- 1-17. 단가표 ----------
create table if not exists public.price_book (
    id          text primary key,
    data        jsonb not null default '{}'::jsonb,
    kind        text generated always as (data->>'kind')     stored,
    category    text generated always as (data->>'category') stored,
    rev         integer not null default 1,
    updated_at  timestamptz not null default now(),
    updated_by  text
);


-- ============================================================================
-- 2. 첨부파일
--    실제 파일은 Storage 버킷 'files' 에 두고, 이 표는 "어느 업무 건의 무슨 파일인지" 만 기록합니다.
--    지금처럼 base64 로 JSON 안에 넣지 않습니다.
-- ============================================================================
create table if not exists public.attachments (
    id           uuid primary key default gen_random_uuid(),
    owner_table  text not null,                 -- 'partner_intakes' · 'collab_requests' · 'works' …
    owner_id     text not null,
    slot         text,                          -- 서류 구분 (bizreg · idcard · bankbook …) — 없으면 일반 첨부
    path         text not null,                 -- Storage 안의 경로
    file_name    text not null,
    mime_type    text,
    size_bytes   bigint,
    uploaded_by  text,
    uploaded_at  timestamptz not null default now(),
    rev          integer not null default 1,
    updated_at   timestamptz not null default now()
);
create index if not exists idx_attach_owner on public.attachments (owner_table, owner_id);

-- Storage 버킷 (비공개 — 내려받기는 그때그때 만든 임시 주소로만)
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

-- 버킷 접근 — 로그인한 사내 사용자만. 사외(파트너센터)는 functions 가 대신 올리고 내려줍니다.
-- ※ 아래에서 'must be owner of table objects' 오류가 나면 SQL 로는 못 고치는 프로젝트입니다.
--    그때는 대시보드 › Storage › files › Policies 에서 같은 내용을 화면으로 만드십시오.
drop policy if exists "files read"   on storage.objects;
drop policy if exists "files write"  on storage.objects;
create policy "files read"  on storage.objects for select
    to authenticated using (bucket_id = 'files');
create policy "files write" on storage.objects for all
    to authenticated using (bucket_id = 'files') with check (bucket_id = 'files');


-- ============================================================================
-- 3. 공통 장치 붙이기 (트리거 · RLS · Realtime)
-- ============================================================================
do $$
declare t text;
begin
    foreach t in array array[
        'schedules','customers','works','contracts','quotes','cases','notices','projects',
        'collab_requests','todos','partner_intakes','install_checks','pay_doc_requests',
        'settlements','pg_fees','supplies','price_book','attachments'
    ] loop
        perform public.setup_work_table(t);
    end loop;
end $$;


-- ============================================================================
-- 4. 기존 app_store 를 로그인 사용자로 좁히기
--    1차에서 anon(브라우저에 그대로 보이는 키) 에게 전부 열어 두었습니다.
--    이제 로그인이 있으므로 좁힙니다. 파트너센터(사외)는 functions 를 거치게 바꾼 뒤 적용하세요.
--    ※ 5절의 이사 SQL 을 먼저 돌리고, 파트너센터 개편이 끝난 뒤 이 절을 돌리십시오.
-- ============================================================================
-- drop policy if exists "app_store anon read"  on public.app_store;
-- drop policy if exists "app_store anon write" on public.app_store;
-- create policy "app_store rw" on public.app_store for all
--     to authenticated using (true) with check (true);


-- ============================================================================
-- 5. 기존 자료 이사 (app_store → 새 표)
--    지금 app_store 에 들어 있는 파트너 접수 · 설치 체크리스트를 옮깁니다.
--    첨부(dataUrl)는 그대로 data 안에 남습니다 — 3단계(파일 저장소) 작업에서 Storage 로 옮깁니다.
-- ============================================================================
-- jsonb_array_elements 가 만드는 칸의 기본 이름도 value 라, app_store.value 와 겹치지 않도록
-- 표에 별명(a)을 주고 펼친 칸에도 이름(elem)을 붙입니다.
insert into public.partner_intakes (id, data)
select x.elem->>'id', x.elem
from public.app_store a
     cross join lateral jsonb_array_elements(a.value) as x(elem)
where a.key = 'gwPartnerIntakes.v1'
  and jsonb_typeof(a.value) = 'array'
  and x.elem->>'id' is not null
on conflict (id) do nothing;

insert into public.install_checks (id, data)
select x.elem->>'id', x.elem
from public.app_store a
     cross join lateral jsonb_array_elements(a.value) as x(elem)
where a.key = 'gwInstallChecks.v1'
  and jsonb_typeof(a.value) = 'array'
  and x.elem->>'id' is not null
on conflict (id) do nothing;

-- 옮긴 것이 화면에서 정상으로 보이는 것을 확인한 뒤에 아래를 돌려 옛 값을 지웁니다.
-- delete from public.app_store where key in ('gwPartnerIntakes.v1', 'gwInstallChecks.v1');


-- ============================================================================
-- 6. 확인 — 제대로 돌았으면 아래 목록이 결과로 나옵니다.
--    ("Success. No rows returned" 만 나왔다면 이 파일이 아닌 다른 파일을 돌린 것입니다)
-- ============================================================================
select
    t.table_name                                            as "표 이름",
    (select count(*) from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t.table_name) as "칸 수",
    case when exists (select 1 from storage.buckets b where b.id = 'files')
         then '파일 저장소 files 있음' else '파일 저장소 없음' end     as "저장소"
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name in ('schedules','customers','works','contracts','quotes','cases','notices',
                       'projects','collab_requests','todos','partner_intakes','install_checks',
                       'pay_doc_requests','settlements','pg_fees','supplies','price_book',
                       'attachments','id_counters')
order by t.table_name;
