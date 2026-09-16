-- 킹오더브라더스 그룹웨어 — Supabase 스키마 (개발환경 1차 · 2026-09-16)
--
-- 1차는 **저장소 표 한 장(app_store)** 으로 시작합니다.
--   화면(index.html)은 지금까지 localStorage 에 키 하나 = JSON 하나로 자료를 두었습니다
--   (gwPartners.v1 · gwPartnerAccounts.v1 · gwInstallChecks.v1 · gwPartnerIntakes.v1 …).
--   js/kob-store.js 가 그 키·값을 이 표에 그대로 얹습니다. 그래서 화면 코드를 고치지 않고 DB 로 옮겨집니다.
--   화면마다 정식 표(고객사 · 계약 · 접수 …)로 쪼개는 것은 2차 — 그때 이 표의 값을 옮기면 됩니다.
-- 법인차량 API(functions/api)는 표 두 장을 따로 씁니다 (모바일 운행일지와 관리 화면이 서버를 거쳐 공유).
--
-- 실행: Supabase 대시보드 › SQL Editor 에 붙여 넣고 Run. dev 프로젝트와 prod 프로젝트에 **각각** 돌립니다.

-- ---------- 공용 저장소 ----------
create table if not exists public.app_store (
    key         text primary key,
    value       jsonb,
    updated_at  timestamptz not null default now()
);
comment on table public.app_store is '화면이 localStorage 대신 쓰는 키·값 저장소 (kob-store.js). 키 = 화면의 저장 키, 값 = JSON';

-- ---------- 법인차량 ----------
create table if not exists public.vehicle_logs (
    id          text primary key,      -- VL-0001
    data        jsonb not null,
    updated_at  timestamptz not null default now()
);
create table if not exists public.vehicle_reservations (
    id          text primary key,      -- VR-0001
    data        jsonb not null,
    updated_at  timestamptz not null default now()
);

-- updated_at 자동 갱신
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_app_store_touch on public.app_store;
create trigger trg_app_store_touch before update on public.app_store for each row execute function public.touch_updated_at();
drop trigger if exists trg_vehicle_logs_touch on public.vehicle_logs;
create trigger trg_vehicle_logs_touch before update on public.vehicle_logs for each row execute function public.touch_updated_at();
drop trigger if exists trg_vehicle_reservations_touch on public.vehicle_reservations;
create trigger trg_vehicle_reservations_touch before update on public.vehicle_reservations for each row execute function public.touch_updated_at();

-- ---------- Realtime — 다른 창 · 다른 사람의 변경을 바로 받기 ----------
alter table public.app_store replica identity full;      -- 삭제 이벤트에도 key 가 실리게
do $$ begin
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'app_store') then
        alter publication supabase_realtime add table public.app_store;
    end if;
end $$;

-- ---------- 접근 제어 (RLS) ----------
-- 1차: 브라우저(anon 키)가 app_store 를 읽고 쓸 수 있어야 화면이 돕니다. 사내 도구라 anon 에 열어 두되,
-- **Cloudflare Access(사내 이메일 도메인만) 뒤에 배포**해 외부 접근을 막습니다 (README 참고).
-- 2차에서 Supabase Auth 로그인으로 바꾸면 아래 정책을 authenticated 로 좁힙니다.
alter table public.app_store enable row level security;
drop policy if exists "app_store anon read"  on public.app_store;
drop policy if exists "app_store anon write" on public.app_store;
create policy "app_store anon read"  on public.app_store for select using (true);
create policy "app_store anon write" on public.app_store for all   using (true) with check (true);

-- 법인차량 표는 브라우저가 직접 만지지 않습니다 — functions 가 service_role 로만 접근 (RLS 켜고 정책 없음 = anon 차단)
alter table public.vehicle_logs         enable row level security;
alter table public.vehicle_reservations enable row level security;
