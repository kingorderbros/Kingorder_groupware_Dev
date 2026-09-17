-- ============================================================================
-- 스키마 2차 보정 — 검색용 생성 열의 항목 이름 맞추기 (2026-09-17)
--
-- schema-v2.sql 을 만들 때 화면이 쓰는 항목 이름을 몇 군데 잘못 짚었습니다.
-- 실제로 옮겨진 자료와 index.html 을 대조해 바로잡습니다.
--   예) 파트너 접수의 파트너사는 'partner' 가 아니라 'partnerId',
--       날짜는 'date' 가 아니라 'at' 이었습니다.
--
-- 생성 열은 data 에서 자동으로 계산되는 값이라, 지우고 다시 만들어도 원본 자료는 그대로입니다.
-- 실행: SQL Editor 에 붙여 넣고 Run. schema-v2.sql 을 먼저 돌린 뒤에 돌립니다.
-- ============================================================================

-- ---------- 1. 파트너 접수 ----------
alter table public.partner_intakes drop column if exists partner_id;
alter table public.partner_intakes drop column if exists on_date;
alter table public.partner_intakes
    add column partner_id   text generated always as (data->>'partnerId')   stored,
    add column partner_name text generated always as (data->>'partnerName') stored,
    add column at_text      text generated always as (data->>'at')          stored;
create index if not exists idx_intakes_partner on public.partner_intakes (partner_id);

-- ---------- 2. 고객사 — 가맹점관리는 businessNo, 고객관리는 bizNo 를 씁니다 ----------
alter table public.customers drop column if exists biz_no;
alter table public.customers
    add column biz_no text generated always as
        (coalesce(data->>'businessNo', data->>'bizNo')) stored;
create index if not exists idx_customers_bizno on public.customers (biz_no);

-- ---------- 3. 업무센터 업무 건 ----------
-- 날짜 항목은 'date' 가 아니라 'receivedAt'(접수일) 입니다.
alter table public.works drop column if exists on_date;
alter table public.works
    add column received_at text generated always as (data->>'receivedAt') stored,
    add column done_at     text generated always as (data->>'doneAt')     stored;
-- center(ops/sales/pay)는 **지금 업무 건 안에 없는 값**입니다. 업무 건이 고객 아래에 묶여 있어서
-- 어느 본부 것인지 위치로만 구분됩니다. 4-2 단계에서 저장할 때 center 를 넣도록 화면을 고칩니다.
comment on column public.works.center is '4-2 단계에서 화면이 채워 넣습니다. 그 전에는 비어 있습니다.';

-- ---------- 4. 보완서류 요청 — workId 가 아니라 가맹점 정보로 찾습니다 ----------
alter table public.pay_doc_requests drop column if exists work_id;
alter table public.pay_doc_requests
    add column biz_no      text generated always as (data->>'bizNo')      stored,
    add column merchant    text generated always as (data->>'merchant')   stored,
    add column target_name text generated always as (data->>'targetName') stored,
    add column due_date    text generated always as (data->>'dueDate')    stored;
create index if not exists idx_paydoc_biz on public.pay_doc_requests (biz_no);

-- ---------- 5. 정산 — 지급월은 ym, 영업업체는 pathRaw ----------
alter table public.settlements drop column if exists period;
alter table public.settlements drop column if exists partner_key;
alter table public.settlements
    add column ym       text generated always as (data->>'ym')      stored,
    add column path_raw text generated always as (data->>'pathRaw') stored;
create index if not exists idx_settle_ym on public.settlements (ym, path_raw);

-- ---------- 6. 공급 내역 — 날짜 대신 파트너사 ----------
alter table public.supplies drop column if exists on_date;
alter table public.supplies
    add column partner_id text generated always as (data->>'partnerId') stored;

-- ---------- 7. 아직 자료가 없어 확인하지 못한 표 ----------
-- pg_fees(PG수수료) · price_book(단가표) · install_checks(설치 체크리스트) 의 검색용 열은
-- 코드에서 확인하지 못해 임시로 둔 이름입니다. 값이 안 맞으면 그 열이 비어 있을 뿐
-- 자료가 상하지는 않습니다. 4-5 단계에서 화면을 붙일 때 확정합니다.
comment on table public.pg_fees       is '검색용 열은 임시 — 4-5 단계에서 확정';
comment on table public.price_book    is '검색용 열은 임시 — 4-5 단계에서 확정';
comment on table public.install_checks is '검색용 열은 임시 — 4-4 단계에서 확정';


-- ============================================================================
-- 확인 — 옮겨 둔 파트너 접수 1건의 검색용 열이 채워졌으면 성공입니다.
-- ============================================================================
select id, status, dept, partner_id, partner_name, at_text, rev
from public.partner_intakes;
