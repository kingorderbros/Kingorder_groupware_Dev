// 사용법: PGLITE=<pglite 폴더>/dist/index.js node tools/test-schema-v10.mjs supabase/schema-v10.sql
//   pglite 는 킹오더챗 개발환경에 설치돼 있습니다: ../킹오더챗/개발환경/node_modules/@electric-sql/pglite/dist/index.js
//   npm run check 에는 넣지 않습니다 (pglite 가 이 폴더에 없음)
// 2026-11-12 킹오더일정 — 일정 확인 기록(schedule_reads): 본인 것만 남기고 읽음, 확인 목록은 등록자 · 참석자만
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const libPath = process.env.PGLITE || path.resolve('../킹오더챗/개발환경/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(libPath).href);
const SQL = fs.readFileSync(process.argv[2] || 'supabase/schema-v10.sql', 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

await db.exec(`
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create role authenticated; create role anon;
  create table public.app_store (key text primary key, value jsonb);
  create table public.schedules (id text primary key, data jsonb not null default '{}'::jsonb, rev int not null default 1);
  grant usage on schema public, auth to authenticated, anon;
  grant execute on all functions in schema auth to authenticated, anon;
  create publication supabase_realtime;
`);
await db.query(`insert into app_store values ('gwUsers.v1', $1)`, [JSON.stringify([
    { id: 'u1', name: '김영업', email: 'kim@k.co' },
    { id: 'u2', name: '정장훈', email: 'daniel@k.co' },
    { id: 'u3', name: '박설치', email: 'park@k.co' },
    { id: 'u4', name: '이직원', email: 'lee@k.co' }
])]);
await db.query(`insert into schedules values ('s1', $1)`, [JSON.stringify({ title: '미팅', salesperson: '김영업', createdBy: 'kim@k.co', attendees: [{ name: '정장훈', status: 'pending' }] })]);
await db.query(`insert into schedules values ('s2', $1)`, [JSON.stringify({ title: '설치', salesperson: '박설치', createdBy: 'park@k.co', attendees: [] })]);

await db.exec(SQL);
await db.exec(SQL);   // 두 번 돌려도 괜찮아야 합니다
ok(true, 'schema-v10 을 두 번 실행해도 오류 없음');

const as = async (email, fn) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ email, role: 'authenticated' })}', false);`);
    try { return await fn(); } catch (e) { return 'error:' + e.message; }
    finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); }
};
const q = (sql, args) => db.query(sql, args).then(r => r.rows);

// 확인 남기기 — 본인 이름으로만
await as('daniel@k.co', () => q(`select public.schedule_mark_seen(array['s1','s2'])`));
await as('lee@k.co', () => q(`select public.schedule_mark_seen(array['s1'])`));
const all = await q(`select schedule_id, user_email, user_name from schedule_reads order by schedule_id, user_email`);
ok(all.length === 3 && all.find(r => r.user_email === 'daniel@k.co' && r.user_name === '정장훈'), '확인 기록: 이메일 · 이름은 로그인한 사람으로 (얻음 ' + JSON.stringify(all) + ')');

// 표에 직접 쓰기는 막힘
const direct = await as('lee@k.co', () => q(`insert into schedule_reads(schedule_id, user_email, user_name) values ('s2', 'kim@k.co', '김영업')`));
ok(String(direct).startsWith('error:'), '표에 직접 넣기 막힘 (남 이름으로 확인 남기기 불가)');

// 다시 열면 last_seen 만 바뀜
const before = (await q(`select first_seen, last_seen from schedule_reads where schedule_id='s1' and user_email='daniel@k.co'`))[0];
await new Promise(r => setTimeout(r, 20));
await as('daniel@k.co', () => q(`select public.schedule_mark_seen(array['s1'])`));
const after = (await q(`select first_seen, last_seen from schedule_reads where schedule_id='s1' and user_email='daniel@k.co'`))[0];
ok(+after.first_seen === +before.first_seen && +after.last_seen > +before.last_seen, '다시 열면 처음 시각은 그대로 · 마지막 시각만 바뀜');

// 내 것만 보임
const mine = await as('lee@k.co', () => q(`select schedule_id from schedule_reads`));
ok(Array.isArray(mine) && mine.length === 1 && mine[0].schedule_id === 's1', '표에서는 내 확인 기록만 보임 (얻음 ' + JSON.stringify(mine) + ')');

// 확인 인원 수 — 누구나
const cnt = await as('park@k.co', () => q(`select schedule_id, n from public.schedule_read_counts(array['s1','s2','s9']) order by schedule_id`));
ok(JSON.stringify(cnt) === JSON.stringify([{ schedule_id: 's1', n: 2 }, { schedule_id: 's2', n: 1 }]), '확인 N명 — 누구나 숫자는 봄 (얻음 ' + JSON.stringify(cnt) + ')');

// 확인 목록 — 등록자 · 참석자만
const byOwner = await as('kim@k.co', () => q(`select user_name from public.schedule_readers('s1') order by user_name`));
ok(Array.isArray(byOwner) && byOwner.map(r => r.user_name).join(',') === '이직원,정장훈', '등록자는 확인 목록을 봄');
const byAtt = await as('daniel@k.co', () => q(`select user_name from public.schedule_readers('s1')`));
ok(Array.isArray(byAtt) && byAtt.length === 2, '참석자도 확인 목록을 봄');
const byOther = await as('lee@k.co', () => q(`select user_name from public.schedule_readers('s1')`));
ok(Array.isArray(byOther) && byOther.length === 0, '등록자 · 참석자가 아니면 빈 목록');
const bySalesName = await as('park@k.co', () => q(`select user_name from public.schedule_readers('s2')`));
ok(Array.isArray(bySalesName) && bySalesName.length === 1, '담당자 이름(salesperson)으로도 등록자 판단');

// 로그인 안 한 사람
await db.exec(`set role anon;`);
const anon = await db.query(`select public.schedule_mark_seen(array['s1'])`).then(() => 'ok', e => 'error');
await db.exec(`reset role;`);
ok(anon === 'error', '로그인 안 하면 확인 남기기 불가');

console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
