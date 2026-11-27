-- 20261127_jh_speed_log.sql 되돌리기 — 속도 기록 표 · 함수 삭제 (화면은 기록 실패를 무시하므로 그대로 동작)
drop function if exists public.gw_speed_summary(int);
drop function if exists public.gw_speed_report(jsonb);
drop table if exists public.gw_speed_log;
select '속도 기록 삭제됨' as 결과;
