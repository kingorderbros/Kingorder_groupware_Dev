// 사용법: (pglite 가 있는 폴더에서) node tools/test-schema-v8.mjs supabase/schema-v8.sql
//   pglite 설치: 임시 폴더에서 npm install @electric-sql/pglite@0.2.17 후 그 폴더에 이 파일을 두고 실행 — npm run check 에는 넣지 않음
// 2026-10-28 보안 3단계 — 직원 명단 · 권한 그룹 · 파트너 관리 권한 · 메일 수집 설정의 권한 칸을 데이터베이스가 직접 지키는지
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const SQL = fs.readFileSync(process.argv[2], 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
await db.exec(`
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt() ->> 'role', '') $$;
  create table public.app_store (key text primary key, value jsonb, updated_at timestamptz default now());
  create role authenticated;
  grant usage on schema public, auth to authenticated;
  grant all on public.app_store to authenticated;
  grant execute on all functions in schema auth to authenticated;
`);
const users = [
  { id: 'u1', name: '관리자', email: 'admin@k.co', groupId: 'admin' },
  { id: 'u2', name: '조직담당', email: 'org@k.co', groupId: 'hr' },
  { id: 'u3', name: '직원', email: 'staff@k.co', groupId: 'sales', level: 'manager', phone: '010' },
  { id: 'u4', name: '퇴사자', email: 'gone@k.co', groupId: 'admin', resigned: true }
];
const groups = { groups: [{ id: 'admin', permissions: [] }, { id: 'hr', permissions: ['management-org'] }, { id: 'sales', permissions: ['sales'] }, { id: 'perm', permissions: ['permissions'] }] };
await db.query(`insert into app_store(key, value) values ('gwUsers.v1', $1), ('gwPermissionGroups.v2', $2), ('gwInboundSources.v1', $3), ('gwOther.v1', '[]'), ('gwPartnerAdminPerm.v1', '{}')`,
  [JSON.stringify(users), JSON.stringify(groups), JSON.stringify({ mail: { host: 'imap.good.com', user: 'a' }, auto: { mail: false }, naver: { q: 'x' } })]);
await db.exec(SQL);
const as = async (email, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ email, role: 'authenticated' })}', false);`);
  try { await fn(); return 'ok'; } catch (e) { return /KOB_PRIV/.test(e.message) ? 'denied' : 'error:' + e.message; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); }
};
const setUsers = (list) => db.query(`update app_store set value = $1 where key = 'gwUsers.v1'`, [JSON.stringify(list)]);
const upsertUsers = (list) => db.query(`insert into app_store(key, value) values ('gwUsers.v1', $1) on conflict (key) do update set value = excluded.value`, [JSON.stringify(list)]);
const cur = async (k) => (await db.query(`select value from app_store where key = $1`, [k])).rows[0].value;
const clone = (v) => JSON.parse(JSON.stringify(v));

console.log('[직원 명단]');
{ const l = clone(users); l[2].isAdmin = true; ok(await as('staff@k.co', () => setUsers(l)) === 'denied', '직원이 자기를 관리자로 — 막힘'); }
{ const l = clone(users); l[2].isAdmin = true; ok(await as('staff@k.co', () => upsertUsers(l)) === 'denied', '직원이 upsert 로 자기를 관리자로 — 막힘'); }
{ const l = clone(users); l[2].groupId = 'hr'; ok(await as('staff@k.co', () => setUsers(l)) === 'denied', '직원이 자기 권한 그룹 바꾸기 — 막힘'); }
{ const l = clone(users); l[0].email = 'staff2@k.co'; ok(await as('staff@k.co', () => setUsers(l)) === 'denied', '직원이 관리자 이메일 바꾸기(계정 가로채기) — 막힘'); }
{ const l = clone(users); l[2].phone = '011'; l[2].duty = '영업'; ok(await as('staff@k.co', () => setUsers(l)) === 'ok', '직원이 이름 · 연락처 같은 칸 바꾸기 — 됨'); }
{ const l = clone(await cur('gwUsers.v1')); l[2].groupId = 'sales2'; l.push({ id: 'u9', name: '새직원', email: 'new@k.co', groupId: 'sales' }); ok(await as('org@k.co', () => setUsers(l)) === 'ok', '조직도 관리 권한자가 직원 권한 그룹 · 새 직원 — 됨'); }
{ const l = clone(await cur('gwUsers.v1')); l.find(u => u.id === 'u9').isAdmin = true; ok(await as('org@k.co', () => setUsers(l)) === 'denied', '조직도 관리 권한자도 관리자 만들기 — 막힘'); }
{ const l = clone(await cur('gwUsers.v1')); l.find(u => u.id === 'u9').isAdmin = true; ok(await as('admin@k.co', () => setUsers(l)) === 'ok', '관리자가 관리자 만들기 — 됨'); }
{ const l = clone(await cur('gwUsers.v1')); l[3].resigned = false; l[3].email='gone@k.co'; ok(await as('gone@k.co', () => setUsers(l)) === 'denied', '퇴사자는 권한 없음 — 막힘'); }
ok(await as('staff@k.co', () => db.query(`delete from app_store where key = 'gwUsers.v1'`)) === 'denied', '직원이 명단 통째로 지우기 — 막힘');
console.log('[권한 그룹 · 파트너 · 인바운드]');
{ const g = clone(groups); g.groups[2].permissions.push('permissions'); ok(await as('staff@k.co', () => db.query(`update app_store set value = $1 where key = 'gwPermissionGroups.v2'`, [JSON.stringify(g)])) === 'denied', '직원이 권한 그룹 바꾸기 — 막힘'); }
{ const g = clone(groups); g.groups[2].permissions.push('x'); ok(await as('admin@k.co', () => db.query(`update app_store set value = $1 where key = 'gwPermissionGroups.v2'`, [JSON.stringify(g)])) === 'ok', '관리자가 권한 그룹 바꾸기 — 됨'); }
ok(await as('staff@k.co', () => db.query(`update app_store set value = '{"u3":true}' where key = 'gwPartnerAdminPerm.v1'`)) === 'denied', '직원이 파트너 관리 권한 — 막힘');
{ const v = clone(await cur('gwInboundSources.v1')); v.mail.host = 'evil.example'; ok(await as('staff@k.co', () => db.query(`update app_store set value = $1 where key = 'gwInboundSources.v1'`, [JSON.stringify(v)])) === 'denied', '직원이 메일 서버 주소 바꾸기 — 막힘'); }
{ const v = clone(await cur('gwInboundSources.v1')); v.naver.q = 'y'; ok(await as('staff@k.co', () => db.query(`update app_store set value = $1 where key = 'gwInboundSources.v1'`, [JSON.stringify(v)])) === 'ok', '직원이 메일 아닌 수집 설정 바꾸기 — 됨'); }
ok(await as('staff@k.co', () => db.query(`update app_store set value = '[1]' where key = 'gwOther.v1'`)) === 'ok', '다른 키는 지금처럼 — 됨');
ok((await db.query(`update app_store set value = '[]' where key = 'gwPartnerAdminPerm.v1'`)) && true, 'SQL Editor(postgres) 는 검사 안 함');
console.log('[직원 확인]');
{ let v = null; await as('gone@k.co', async () => { v = (await db.query(`select public.kob_is_staff() as s`)).rows[0].s; }); ok(v === false, '퇴사자는 직원으로 보지 않음 (남은 로그인 토큰으로 자료 못 읽음)'); }
{ let v = null; await as('admin@k.co', async () => { v = (await db.query(`select public.kob_is_staff() as s`)).rows[0].s; }); ok(v === true, '재직자는 직원'); }
console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
