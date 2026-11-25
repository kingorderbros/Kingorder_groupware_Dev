// 사용법: npm i --no-save @electric-sql/pglite@0.2.17 (처음 한 번) → node tools/sql-fee-secure.mjs   (PGlite — 내 컴퓨터 안의 시험용 Postgres. 실제 DB 에 접속하지 않습니다)
// 2026-11-25 — supabase/20261125_jh_merchant_fee_secure.sql 을 역할별(관리자 · 대표이사 · 본부장 · 팀장 · SQL Editor)로 시험합니다.
//   schema-v8 의 직원 · 권한 함수를 그대로 가져와 Supabase 와 비슷한 틀을 만든 뒤 보안 SQL 을 실행합니다.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const v8 = fs.readFileSync(path.join(ROOT, 'supabase', 'schema-v8.sql'), 'utf8');
const grab = n => { const i = v8.indexOf('create or replace function public.' + n); return v8.slice(i, v8.indexOf('$$;', i) + 3); };
const V8_FUNCS = ['kob_caller()', 'kob_user_is_admin(', 'kob_caller_can(', 'kob_is_staff()'].map(grab).join('\n');
const FEE_SQL = fs.readFileSync(path.join(ROOT, 'supabase', '20261125_jh_merchant_fee_secure.sql'), 'utf8');
const db = new PGlite();
const ex = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return e.message; } };
let pass=0, fail=0; const ok=(c,n,x)=>{ if(c){pass++;console.log('  ✓',n);} else {fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));} };
const step = async (name, sql) => { const e = await ex(sql); if (e) { console.log('중지:', name, e); process.exit(1); } };
await step('auth', `
create schema auth;
create role authenticated; create role anon; create role service_role;
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt() ->> 'role', '') $$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on all functions in schema auth to authenticated, anon, service_role;
grant usage on schema public to authenticated;
create table public.app_store (key text primary key, value jsonb, updated_at timestamptz default now());`);
await step('v8 함수', V8_FUNCS);
await step('표', `
create table public.supplies (id text primary key, batch_id text, data jsonb not null default '{}', channel text generated always as (data->>'channel') stored, rev int not null default 1, updated_at timestamptz default now(), updated_by text);
create table public.customers (id text primary key, data jsonb not null default '{}', name text generated always as (data->>'name') stored, rev int not null default 1, updated_at timestamptz default now(), updated_by text);
create table public.settlements (id text primary key, batch_id text, data jsonb not null default '{}', rev int not null default 1, updated_at timestamptz default now(), updated_by text);
do $$ declare t text; begin foreach t in array array['app_store','supplies','customers','settlements'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy "%1$s rw" on public.%1$I for all to authenticated using (public.kob_is_staff()) with check (public.kob_is_staff())', t);
  execute format('grant select, insert, update, delete on public.%I to authenticated', t);
end loop; end $$;
insert into public.app_store values ('gwUsers.v1', '[
 {"id":"u1","name":"관리자","email":"admin@x.kr","level":"admin","dept":"admin","groupId":"admin"},
 {"id":"u2","name":"박본부","email":"head@x.kr","level":"rk_head","dept":"sales","groupId":"sales"},
 {"id":"u3","name":"김팀장","email":"lead@x.kr","level":"rk_leader","dept":"sales","groupId":"sales"},
 {"id":"u4","name":"최본부","email":"head2@x.kr","level":"rk_head","dept":"ops","groupId":"ops"},
 {"id":"u5","name":"이대표","email":"ceo@x.kr","level":"rk_ceo","dept":"management","groupId":"sales"}]');
insert into public.app_store values ('gwOrgRanks.v1', '[{"id":"rk_ceo","name":"대표이사","cls":"exec"},{"id":"rk_head","name":"본부장","cls":"head"},{"id":"rk_leader","name":"팀장","cls":"leader"}]');
insert into public.app_store values ('gwPermissionGroups.v2', '[{"id":"sales","permissions":[]}]');
insert into public.supplies (id, data) values ('SP-1', '{"id":"SP-1","channel":"pg","name":"병원","fee":2.345}'), ('SP-2', '{"id":"SP-2","channel":"pharmacy","name":"약국","fee":1.5}'), ('SP-3', '{"id":"SP-3","channel":"franchise","name":"브랜드"}'), ('SP-4','{"id":"SP-4","channel":"pg","name":"빈칸","fee":""}');
insert into public.customers (id, data) values ('c1', '{"id":"c1","name":"파트너","kind":"partner","fee":{"g1":1.1,"g2":"","g3":2.2}}'), ('c2', '{"id":"c2","name":"가맹점"}');
insert into public.settlements (id, data) values ('py1', '{"id":"py1","ym":"2026-11","merchantFee":55555,"fee":1000}'), ('py2', '{"id":"py2","ym":"2026-10","merchantFee":44444}'), ('py0', '{"id":"py0","ym":"2026-11","merchantFee":0}');`);
await step('보안 SQL', FEE_SQL);
const r1 = await db.query(`select id, data from public.supplies order by id`);
ok(r1.rows.find(r=>r.id==='SP-1').data.fee==='***' && r1.rows.find(r=>r.id==='SP-4').data.fee==='' && !('fee' in r1.rows.find(r=>r.id==='SP-3').data), '옮긴 뒤 supplies 에는 *** 표시만', r1.rows.map(r=>r.data.fee));
const c1 = (await db.query(`select data from public.customers where id='c1'`)).rows[0].data;
ok(JSON.stringify(c1.fee)==='{"g1":"***","g3":"***"}', 'customers 등급별 *** (빈 등급은 빠짐)', c1.fee);
const s1 = (await db.query(`select data from public.settlements where id='py1'`)).rows[0].data;
ok(s1.merchantFee==='***' && s1.fee===1000, 'settlements 가맹점수수료만 *** (수수료 칸은 그대로)', s1);
const mf = (await db.query(`select id, value from public.merchant_fees order by id`)).rows;
ok((await db.query(`select data from public.settlements where id='py0'`)).rows[0].data.merchantFee==='', '지급명세 0원은 값 없음으로 (*** 아님)');
ok(mf.length===5 && mf.find(x=>x.id==='supplies:SP-1').value.fee===2.345 && JSON.stringify(mf.find(x=>x.id==='customers:c1').value.fee)==='{"g1":1.1,"g3":2.2}', 'merchant_fees 에 실제 값 4줄', mf);
ok((await db.query(`select count(*)::int n from public.zz_backup_fee_20261125`)).rows[0].n===6, '백업 6줄 (0원 줄 포함 원래 값)');
// ---- 요청자로 실행 ----
const as = async (email, fn) => {
  await db.exec(`begin`);
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ email, role: 'authenticated' })]);
  await db.exec(`set local role authenticated`);
  try { return await fn(); } catch (e) { return { error: e.message }; } finally { await db.exec(`commit`); }
};
const sel = (sql, p) => async () => (await db.query(sql, p)).rows;
// 읽기
let x = await as('lead@x.kr', sel(`select * from public.merchant_fees`));
ok(Array.isArray(x) && x.length===0, '팀장은 merchant_fees 0줄', x);
x = await as('head@x.kr', sel(`select * from public.merchant_fees`)); ok(x.length===5, '본부장은 5줄', x.length);
x = await as('ceo@x.kr', sel(`select * from public.merchant_fees`)); ok(x.length===5, '대표이사 5줄');
x = await as('admin@x.kr', sel(`select * from public.merchant_fees`)); ok(x.length===5, '관리자 5줄');
x = await as('lead@x.kr', sel(`select data from public.supplies where id='SP-1'`)); ok(x[0].data.fee==='***', '팀장이 원래 표를 읽어도 ***', x);
// 팀장이 수수료를 바꿔 보냄 → 무시
x = await as('lead@x.kr', sel(`update public.supplies set data = jsonb_set(data,'{fee}','9.99') || '{"memo":"팀장 수정"}' where id='SP-1' returning data`));
ok(x[0] && x[0].data.fee==='***' && x[0].data.memo==='팀장 수정', '팀장 수정 — 다른 칸은 저장, 수수료는 무시', x);
ok((await db.query(`select value from public.merchant_fees where id='supplies:SP-1'`)).rows[0].value.fee===2.345, '수수료 원래 값 유지');
x = await as('lead@x.kr', sel(`update public.customers set data = jsonb_set(data,'{fee}','{"g1":"***","g3":"***","g2":5}') where id='c1' returning data`));
ok(JSON.stringify((await db.query(`select value from public.merchant_fees where id='customers:c1'`)).rows[0].value.fee)==='{"g1":1.1,"g2":5,"g3":2.2}', '팀장 — 있던 등급(g1 · g3) 값은 그대로, 값이 없던 등급(g2)만 새로 넣음');
// 팀장이 직접 merchant_fees 쓰기
x = await as('lead@x.kr', sel(`insert into public.merchant_fees(id,tbl,row_id,value) values ('x','supplies','SP-9','{}') returning id`));
ok(x.error, '팀장 merchant_fees 직접 쓰기 막힘', x);
// 본부장 수정
x = await as('head@x.kr', sel(`update public.supplies set data = jsonb_set(data,'{fee}','3.1') where id='SP-1' returning data`));
ok(x[0].data.fee==='***' && (await db.query(`select value from public.merchant_fees where id='supplies:SP-1'`)).rows[0].value.fee===3.1, '본부장 수정 → 별도 표에 새 값, 원래 표 ***');
x = await as('head@x.kr', sel(`update public.customers set data = jsonb_set(data,'{fee}','{"g1":"***","g3":"","g2":5}') where id='c1' returning data`));
ok(JSON.stringify(x[0].data.fee)==='{"g1":"***","g2":"***"}' && JSON.stringify((await db.query(`select value from public.merchant_fees where id='customers:c1'`)).rows[0].value.fee)==='{"g1":1.1,"g2":5}', '본부장 등급 수정 (*** 유지 · 빈칸 삭제 · 새 등급)', x);
x = await as('head@x.kr', sel(`update public.supplies set data = jsonb_set(data,'{fee}','""') where id='SP-2' returning data`));
ok(x[0].data.fee==='' && (await db.query(`select count(*)::int n from public.merchant_fees where id='supplies:SP-2'`)).rows[0].n===0, '본부장이 비우면 별도 표에서도 삭제');
// 새 줄 (팀장 · 본부장)
x = await as('lead@x.kr', sel(`insert into public.supplies(id,data) values ('SP-5','{"id":"SP-5","channel":"pg","fee":7}') returning data`));
ok(x[0].data.fee==='***' && (await db.query(`select value from public.merchant_fees where id='supplies:SP-5'`)).rows[0].value.fee===7, '팀장이 새로 넣은 수수료(엑셀 업로드 · 새 줄)는 저장 — 읽기만 못 함', x);
x = await as('lead@x.kr', sel(`update public.supplies set data = jsonb_set(data,'{fee}','1') where id='SP-5' returning data`));
ok((await db.query(`select value from public.merchant_fees where id='supplies:SP-5'`)).rows[0].value.fee===7, '팀장은 있던 값을 바꾸지 못함');
x = await as('lead@x.kr', sel(`update public.supplies set data = jsonb_set(data,'{fee}','""') where id='SP-5' returning data`));
ok((await db.query(`select value from public.merchant_fees where id='supplies:SP-5'`)).rows[0].value.fee===7 && x[0].data.fee==='***', '팀장은 있던 값을 지우지 못함', x);
x = await as('lead@x.kr', sel(`insert into public.settlements(id,data) values ('py9','{"id":"py9","merchantFee":777}') returning data`));
ok((await db.query(`select value from public.merchant_fees where id='settlements:py9'`)).rows[0].value.merchantFee===777, '팀장 지급명세 업로드 새 줄 저장');
const before = (await db.query(`select value from public.merchant_fees where id='customers:c1'`)).rows[0].value.fee;
x = await as('lead@x.kr', sel(`update public.customers set data = jsonb_set(data,'{fee}','{"g1":9,"g9":3}') where id='c1' returning data`));
const after = (await db.query(`select value from public.merchant_fees where id='customers:c1'`)).rows[0].value.fee;
ok(after.g1===before.g1 && after.g9===3 && Object.keys(after).length===Object.keys(before).length+1, '팀장 — 있던 등급은 그대로(빠뜨려도 지워지지 않음), 없던 등급만 추가', { before, after });
await db.query(`update public.customers set data = jsonb_set(data,'{fee}','{"g1":1.1,"g3":2.2}')`);
x = await as('head@x.kr', sel(`insert into public.supplies(id,data) values ('SP-6','{"id":"SP-6","channel":"pg","fee":8}') returning data`));
ok(x[0].data.fee==='***' && (await db.query(`select value from public.merchant_fees where id='supplies:SP-6'`)).rows[0].value.fee===8, '본부장 새 줄 수수료 저장');
// 삭제 → 별도 표도
x = await as('head@x.kr', sel(`delete from public.supplies where id='SP-6' returning id`));
ok((await db.query(`select count(*)::int n from public.merchant_fees where id='supplies:SP-6'`)).rows[0].n===0, '줄을 지우면 수수료도 삭제');
// ---- 승인 흐름 ----
x = await as('lead@x.kr', sel(`select * from public.fee_dl_fetch('nope')`)); ok(x.error, '없는 요청 받기 막힘');
x = await as('lead@x.kr', sel(`select * from public.fee_dl_request('pg','병원·기타 PG','월말 보고','["최본부"]'::jsonb)`));
const rid = x[0] && x[0].id; ok(rid && x[0].status==='pending' && JSON.stringify(x[0].approvers)==='["박본부"]', '팀장 승인 요청 — 승인자는 데이터베이스가 정함 (위조한 최본부 무시 → 같은 본부 박본부)', x);
x = await as('lead@x.kr', sel(`select * from public.fee_dl_request('pg','병원·기타 PG','또','["박본부"]'::jsonb)`)); ok(x[0].id===rid, '대기 중 다시 요청 → 같은 요청');
x = await as('lead@x.kr', sel(`select public.fee_dl_fetch($1) v`, [rid])); ok(x.error && /승인된 요청이 아닙니다/.test(x.error), '승인 전 받기 막힘', x);
x = await as('lead@x.kr', sel(`select * from public.fee_dl_decide($1, true)`, [rid])); ok(x.error, '요청자 본인 승인 막힘');
x = await as('head2@x.kr', sel(`select * from public.fee_dl_decide($1, true)`, [rid])); ok(x.error && /지정된 승인자/.test(x.error), '다른 본부 본부장 승인 막힘', x);
x = await as('head@x.kr', sel(`select * from public.fee_dl_decide($1, false)`, [rid])); ok(x.error && /반려 사유/.test(x.error), '반려 사유 없으면 막힘');
x = await as('head@x.kr', sel(`select * from public.fee_dl_decide($1, true)`, [rid])); ok(x[0] && x[0].status==='approved', '같은 본부 본부장 승인', x);
x = await as('head2@x.kr', sel(`select public.fee_dl_fetch($1) v`, [rid])); ok(x.error, '남의 승인으로 받기 막힘');
x = await as('lead@x.kr', sel(`select public.fee_dl_fetch($1) v`, [rid]));
ok(x[0] && x[0].v && x[0].v['SP-1'] && x[0].v['SP-1'].fee===3.1 && !x[0].v['c1'], '승인 후 받기 — pg 채널 수수료만', x);
x = await as('lead@x.kr', sel(`select public.fee_dl_fetch($1) v`, [rid])); ok(x.error && /used/.test(x.error), '두 번째는 막힘', x);
ok((await db.query(`select rows_n from public.fee_download_requests where id=$1`, [rid])).rows[0].rows_n>=1, '받은 건수 기록 (화면이 안 보내면 데이터베이스가 셈)');
// 24시간 지남
x = await as('lead@x.kr', sel(`select * from public.fee_dl_request('payout','지급명세','정산','["박본부"]'::jsonb)`)); ok(x.error && /지급월/.test(x.error), '지급명세는 지급월 없이 요청 불가', x);
x = await as('lead@x.kr', sel(`select * from public.fee_dl_request('payout','지급명세','정산','["박본부"]'::jsonb,'2026-11')`)); const rid2 = x[0].id;
await as('head@x.kr', sel(`select * from public.fee_dl_decide($1, true)`, [rid2]));
await db.query(`update public.fee_download_requests set decided_at = now() - interval '25 hours' where id = $1`, [rid2]);
x = await as('lead@x.kr', sel(`select public.fee_dl_fetch($1) v`, [rid2])); ok(x.error && /24시간/.test(x.error), '24시간 지나면 막힘', x);
// 지급명세 — 승인받은 지급월만
x = await as('lead@x.kr', sel(`select * from public.fee_dl_request('payout','지급명세','11월','[]'::jsonb,'2026-11')`)); const rid4 = x[0].id;
await as('head@x.kr', sel(`select * from public.fee_dl_decide($1, true)`, [rid4]));
x = await as('lead@x.kr', sel(`select public.fee_dl_fetch($1) v`, [rid4]));
ok(x[0] && x[0].v.py1 && !x[0].v.py2, '지급명세 받기 — 승인받은 2026-11 만 (10월 값은 안 옴)', x);
// 본부장급 미만 저장 기록 (10분에 한 번으로 묶음)
x = await as('admin@x.kr', sel(`select count(*)::int n from public.fee_log_list(1000) where action='upload'`));
ok(x[0].n>=1 && x[0].n<=3, '본부장급 미만 수수료 저장 기록 (표마다 10분에 한 번)', x);
// 대표이사는 지정 안 돼도 승인 가능
x = await as('lead@x.kr', sel(`select * from public.fee_dl_request('partner','파트너사','파트너 정리','["박본부"]'::jsonb)`)); const rid3 = x[0].id;
x = await as('ceo@x.kr', sel(`select * from public.fee_dl_decide($1, true)`, [rid3])); ok(x[0] && x[0].status==='approved', '대표이사는 승인 가능');
x = await as('lead@x.kr', sel(`select public.fee_dl_fetch($1) v`, [rid3])); ok(x[0].v['c1'] && !x[0].v['SP-1'], '파트너사 채널은 업체 수수료만', x);
// 요청 목록 읽기
x = await as('lead@x.kr', sel(`select id from public.fee_download_requests`)); ok(x.length===4, '팀장은 자기 요청 4건 보임', x.length);
x = await as('head2@x.kr', sel(`select id from public.fee_download_requests`)); ok(x.length===4, '본부장급은 요청 목록 보임', x.length);
x = await as('lead@x.kr', sel(`update public.fee_download_requests set status='approved' where id=$1 returning id`, [rid2])); ok(!x.error ? x.length===0 : true, '팀장이 요청 상태 직접 바꾸기 막힘', x);
// 기록
x = await as('head@x.kr', sel(`select public.fee_log('view','pg', null, null)`)); ok(!x.error, '본부장 열람 기록');
x = await as('lead@x.kr', sel(`select public.fee_log('approve','pg', null, null)`)); ok(x.error, '직원이 승인 기록 위조 막힘');
x = await as('lead@x.kr', sel(`select public.fee_log('download','payout', 9999, '가짜')`)); ok(x.error, '본부장급 미만은 다운로드 기록 위조 막힘', x);
x = await as('head@x.kr', sel(`select public.fee_log('download','zzz', 1, null)`)); ok(x.error, '없는 자료 이름 기록 막힘');
x = await as('lead@x.kr', sel(`select * from public.fee_access_log`)); ok(x.length===0, '팀장은 기록 못 봄');
x = await as('lead@x.kr', sel(`select * from public.fee_log_list(10)`)); ok(x.error, '팀장 기록 목록 막힘');
x = await as('admin@x.kr', sel(`select action from public.fee_log_list(100)`)); ok(x.length>=8 && x.some(r=>r.action==='download') && x.some(r=>r.action==='approve') && x.some(r=>r.action==='request') && x.some(r=>r.action==='view'), '관리자는 기록 보임 (요청·승인·다운로드·열람)', x.map(r=>r.action));
// 직급 등급 올리기 막기
x = await as('lead@x.kr', sel(`update public.app_store set value='[{"id":"rk_ceo","name":"대표이사","cls":"exec"},{"id":"rk_head","name":"본부장","cls":"head"},{"id":"rk_leader","name":"팀장","cls":"head"}]' where key='gwOrgRanks.v1' returning key`));
ok(x.error && /권한 등급/.test(x.error), '팀장이 팀장 직급 등급을 본부장급으로 올리기 막힘', x);
x = await as('lead@x.kr', sel(`update public.app_store set value='[{"id":"rk_ceo","name":"대표","cls":"exec"},{"id":"rk_head","name":"본부장","cls":"head"},{"id":"rk_leader","name":"팀장님","cls":"leader"}]' where key='gwOrgRanks.v1' returning key`));
ok(!x.error && x.length===1, '이름만 바꾸는 것은 그대로', x);
x = await as('admin@x.kr', sel(`update public.app_store set value='[{"id":"rk_ceo","name":"대표","cls":"exec"},{"id":"rk_head","name":"본부장","cls":"head"},{"id":"rk_leader","name":"팀장님","cls":"head"}]' where key='gwOrgRanks.v1' returning key`));
ok(!x.error, '관리자는 등급 변경 가능', x);
x = await as('lead@x.kr', sel(`delete from public.app_store where key='gwOrgRanks.v1' returning key`));
ok(x.error && /권한 등급/.test(x.error), '팀장이 직급 목록 지우기 막힘 (지운 뒤 다시 넣는 우회)', x);
x = await as('lead@x.kr', sel(`update public.app_store set value='{}'::jsonb where key='gwOrgRanks.v1' returning key`));
ok(x.error && /권한 등급/.test(x.error), '팀장이 배열 아닌 값으로 덮기 막힘', x);
// 직급 목록이 예전 모양 ({name, level} · 문자열)이어도 화면과 같은 판단
await db.query(`update public.app_store set value='[{"name":"본부장","level":"head"},"팀장",{"name":"대표이사"}]' where key='gwOrgRanks.v1'`);
x = await as('head@x.kr', sel(`select public.kob_caller_sees_fee() v`)); ok(x[0].v===true, '예전 모양 직급 목록 — 본부장 인식', x);
x = await as('lead@x.kr', sel(`select public.kob_caller_sees_fee() v`)); ok(x[0].v===false, '예전 모양 — 팀장은 아님');
x = await as('ceo@x.kr', sel(`select public.kob_caller_sees_fee() v`)); ok(x[0].v===true, '예전 모양 — 대표이사(이름으로 기본 등급)');
x = await as('lead@x.kr', sel(`update public.app_store set value='[{"name":"본부장","level":"head"},"팀장",{"name":"대표이사"}]' where key='gwOrgRanks.v1' returning key`));
ok(!x.error, '같은 값 다시 저장은 그대로', x);
// 여러 번 실행해도 괜찮은지
const e2 = await ex(FEE_SQL); ok(!e2, '다시 실행해도 오류 없음', e2);
ok((await db.query(`select count(*)::int n from public.zz_backup_fee_20261125`)).rows[0].n===6, '다시 실행해도 백업은 처음 값 그대로');
console.log(`통과 ${pass} · 실패 ${fail}`); process.exit(fail?1:0);
