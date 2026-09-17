-- ============================================================================
-- 스키마 4차 — 단가표 검색용 열 바로잡기 (2026-09-17, 4-5 단계)
--
-- 2차에서 단가표(price_book)의 검색용 열을 확인하지 못해 임시 이름으로 두었습니다.
-- 실제 화면 코드를 보니 카테고리는 'category' 가 아니라 **'cat'** 이었습니다.
-- 제품·서비스명(name)도 찾을 일이 많아 함께 뽑습니다.
--
-- 실행: SQL Editor 에 붙여 넣고 Run. (생성 열은 data 에서 자동 계산되므로 원본 자료는 그대로입니다)
-- ============================================================================

alter table public.price_book drop column if exists category;
alter table public.price_book
    add column cat  text generated always as (data->>'cat')  stored,
    add column name text generated always as (data->>'name') stored;
create index if not exists idx_pricebook_cat on public.price_book (cat, kind);

comment on table public.price_book is null;   -- '임시' 표시를 뗍니다

-- 정산 · 공급내역 · 보완서류는 2차 보정(schema-v2-fix.sql)에서 이미 맞췄습니다.
-- PG수수료(pg_fees)는 화면에 **채우는 코드가 아직 없어**(읽기만 함) 그대로 둡니다.

-- ============================================================================
-- 확인 — price_book 의 칸 목록이 나옵니다.
-- ============================================================================
select column_name as "칸 이름", data_type as "종류",
       case when is_generated = 'ALWAYS' then '자동 계산' else '' end as "비고"
from information_schema.columns
where table_schema = 'public' and table_name = 'price_book'
order by ordinal_position;
