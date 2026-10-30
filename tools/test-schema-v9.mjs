// 사용법: (pglite 가 있는 폴더에서) node tools/test-schema-v9.mjs supabase/schema-v8.sql supabase/schema-v9.sql
//   pglite 설치: 임시 폴더에서 npm install @electric-sql/pglite@0.2.17 후 그 폴더에 이 파일을 두고 실행 — npm run check 에는 넣지 않음
// 2026-10-30 권한 그룹 여러 개 — groupIds 도 권한 칸으로 지키고, 고른 그룹의 권한을 모두 합쳐 보는지
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const SQL = fs.readFileSync(process.argv[2], 'utf8') + '\n' + fs.readFileSync(process.argv[3], 'utf8');
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


console.log('[권한 그룹 여러 개]');
{
  let r = await as('staff@k.co', async () => { const v = clone(await cur('gwUsers.v1')); v[2].groupIds = ['sales', 'perm']; await setUsers(v); });
  ok(r === 'denied', '직원이 자기 기록에 다른 권한 그룹을 더하면 막힘');
  r = await as('staff@k.co', async () => { const v = clone(await cur('gwUsers.v1')); v[2].groupIds = ['sales', 'admin']; await setUsers(v); });
  ok(r === 'denied', '직원이 자기 기록에 관리자 그룹을 더하면 막힘');
  r = await as('org@k.co', async () => { const v = clone(await cur('gwUsers.v1')); v[2].groupIds = ['sales', 'kop']; await setUsers(v); });
  ok(r === 'ok', '조직도 관리 권한이 있는 사람은 다른 직원의 그룹을 여러 개로 바꿀 수 있음');
  r = await as('org@k.co', async () => { const v = clone(await cur('gwUsers.v1')); v[2].groupIds = ['sales', 'admin']; await setUsers(v); });
  ok(r === 'denied', '관리자 그룹을 주는 것은 관리자만');
  // 대표 그룹은 sales, 더한 그룹(hr)에 조직도 관리 권한 → 그 권한이 인정되는지
  r = await as('admin@k.co', async () => { const v = clone(await cur('gwUsers.v1')); v.push({ id: 'u5', name: '겸직', email: 'multi@k.co', groupId: 'sales', groupIds: ['sales', 'hr'] }); await setUsers(v); });
  ok(r === 'ok', '관리자는 그룹 여러 개인 직원을 넣을 수 있음');
  r = await as('multi@k.co', async () => { const v = clone(await cur('gwUsers.v1')); v[2].groupIds = ['sales', 'kop', 'hr']; await setUsers(v); });
  ok(r === 'ok', '두 번째 그룹에 있는 권한(조직도 관리)도 인정됨');
  r = await as('staff@k.co', async () => { const v = clone(await cur('gwUsers.v1')); v[2].phone = '010-9'; await setUsers(v); });
  ok(r === 'ok', '연락처 같은 일반 칸은 그대로 저장됨');
  const adm = (await db.query(`select public.kob_user_is_admin('{"groupId":"sales","groupIds":["sales","admin"]}'::jsonb) a`)).rows[0].a;
  ok(adm === true, '고른 그룹에 관리자 그룹이 있으면 관리자로 봄');
}
console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
