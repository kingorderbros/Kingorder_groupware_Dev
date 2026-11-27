// 사용법: node tools/test-speed-log.mjs [supabase/20261127_jh_speed_log.sql]   (pglite 는 ../킹오더챗/개발환경 것을 씀, npm run check 에는 넣지 않음)
// 2026-11-27 사용 중 속도 기록 — 직원만 · 4분에 1번 · 표 직접 접근 막힘 · 요약은 service_role 만
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const libPath = process.env.PGLITE || path.resolve('../킹오더챗/개발환경/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(libPath).href);
const SQL = fs.readFileSync(process.argv[2] || 'supabase/20261127_jh_speed_log.sql', 'utf8');
const ROLLBACK = fs.readFileSync('supabase/20261127_jh_speed_log_rollback.sql', 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
await db.exec(`
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  create role authenticated; create role anon; create role service_role;
  create table public.app_store (key text primary key, value jsonb);
  grant usage on schema public, auth to authenticated, anon, service_role;
  grant execute on all functions in schema auth to authenticated, anon, service_role;
`);
await db.query(`insert into app_store values ('gwUsers.v1', $1)`, [JSON.stringify([
  { id: 'u1', name: '김영업', email: 'kim@k.co' }, { id: 'u2', name: '정장훈', email: 'daniel@k.co' }, { id: 'u5', name: '퇴사자', email: 'gone@k.co', resigned: true }])]);
await db.exec(`create or replace function public.kob_is_staff() returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select exists (select 1 from public.app_store s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) u
     where s.key = 'gwUsers.v1' and coalesce(auth.jwt() ->> 'email', '') <> '' and lower(u ->> 'email') = lower(auth.jwt() ->> 'email') and coalesce(u ->> 'resigned', 'false') <> 'true')), false) $$;
  grant execute on function public.kob_is_staff() to authenticated;`);
await db.exec(SQL); await db.exec(SQL);
ok(true, 'SQL 두 번 실행해도 오류 없음');
const UID = { 'kim@k.co': '11111111-1111-1111-1111-111111111111', 'daniel@k.co': '22222222-2222-2222-2222-222222222222', 'gone@k.co': '33333333-3333-3333-3333-333333333333', 'out@x.co': '44444444-4444-4444-4444-444444444444' };
const as = async (role, email, fn) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${email ? JSON.stringify({ email, sub: UID[email], role }) : ''}', false);`);
  try { return await fn(); } catch (e) { return 'error:' + e.message; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); }
};
const q = (sql, args) => db.query(sql, args).then(r => r.rows);
const P = (p90, boot) => JSON.stringify({ v: '1.1.50', n: 20, p50: 200, p90, max: p90 + 500, mobile: 0, boot_ms: boot, slow: [{ q: 'rest:app_store', ms: p90 + 500 }, { q: 'api:auth/logins', ms: 300 }] });
await as('authenticated', 'kim@k.co', () => q(`select public.gw_speed_report($1::jsonb)`, [P(800, 2500)]));
await as('authenticated', 'kim@k.co', () => q(`select public.gw_speed_report($1::jsonb)`, [P(9000, 9000)]));   // 4분 안 두 번째 — 무시
await as('authenticated', 'daniel@k.co', () => q(`select public.gw_speed_report($1::jsonb)`, [P(1200, 3000)]));
await as('authenticated', 'gone@k.co', () => q(`select public.gw_speed_report($1::jsonb)`, [P(5000, 5000)]));   // 퇴사자 — 무시
await as('authenticated', 'out@x.co', () => q(`select public.gw_speed_report($1::jsonb)`, [P(5000, 5000)]));    // 사외 — 무시
await as('anon', null, () => q(`select public.gw_speed_report($1::jsonb)`, [P(5000, 5000)]));
const rows = await q(`select user_id, data from gw_speed_log order by id`);
ok(rows.length === 2, '직원 2명 기록만 남음 (4분 안 중복 · 퇴사자 · 사외 · 로그인 안 함 무시) — ' + rows.length);
ok(rows[0].user_id === UID['kim@k.co'], '로그인한 사람 번호로 남음');
const big = await as('authenticated', 'daniel@k.co', () => q(`delete from gw_speed_log where true`));
ok(String(big).startsWith('error:'), '직원이 표를 직접 지우기 막힘');
const read = await as('authenticated', 'kim@k.co', () => q(`select * from gw_speed_log`));
ok(String(read).startsWith('error:'), '직원이 표를 직접 읽기 막힘');
const sumStaff = await as('authenticated', 'kim@k.co', () => q(`select public.gw_speed_summary(60)`));
ok(String(sumStaff).startsWith('error:'), '요약은 직원 권한으로 못 읽음');
const sum = (await as('service_role', null, () => q(`select public.gw_speed_summary(60) as s`)))[0].s;
ok(sum.reports === 2 && sum.users === 2 && sum.requests === 40, '요약: 보고 2 · 사람 2 · 조회 40 — ' + JSON.stringify(sum).slice(0, 200));
ok(Number(sum.p90_ms) === 1000 && Number(sum.boot_ms) === 2750 && Number(sum.max_ms) === 1700, '요약: p90 중간값 1000 · 접속 2750 · 최대 1700');
ok(sum.slowest[0].q === 'rest:app_store' && !JSON.stringify(sum).includes('@'), '가장 느린 조회 이름 · 사람 정보 없음');
await db.exec(`delete from gw_speed_log`);
const tooBig = await as('authenticated', 'kim@k.co', async () => { return q(`select public.gw_speed_report($1::jsonb)`, [JSON.stringify({ x: 'a'.repeat(5000) })]); });
ok((await q(`select count(*)::int n from gw_speed_log`))[0].n === 0, '4KB 넘는 기록은 버림');
await db.exec(ROLLBACK);
ok((await q(`select to_regclass('public.gw_speed_log') r`))[0].r === null, '되돌리기 SQL 로 표 · 함수 삭제');
console.log(`통과 ${pass} · 실패 ${fail}`); process.exit(fail ? 1 : 0);
