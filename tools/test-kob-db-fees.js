// 사용법: node tools/test-kob-db-fees.js  (npm run check 에 포함)
// 2026-11-25 — js/kob-db.js 수수료 겹치기: 서버 모드에서 원래 표의 '***' 위에 merchant_fees 값을 겹쳐 주는지, 내가 저장한 값을 기억하는지, 로그아웃하면 지우는지
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x === undefined ? '' : JSON.stringify(x)); } };
const tables = {
    supplies: [{ id: 'SP-1', data: { id: 'SP-1', channel: 'pg', fee: '***' }, rev: 1 }, { id: 'SP-2', data: { id: 'SP-2', channel: 'pg', fee: '' }, rev: 1 }],
    customers: [{ id: 'c1', data: { id: 'c1', name: '파트너', fee: { g1: '***', g3: '***' } }, rev: 1 }],
    settlements: [{ id: 'py1', data: { id: 'py1', merchantFee: '***', fee: 1000 }, rev: 1 }],
    merchant_fees: [{ id: 'supplies:SP-1', value: { fee: 2.345 } }, { id: 'customers:c1', value: { fee: { g1: 1.1, g3: 2.2 } } }, { id: 'settlements:py1', value: { merchantFee: 55555 } }]
};
let authCb = null, feeDenied = false;
const sent = [];
const q = (t) => {
    const st = { t, filters: [] };
    const api = {
        select() { return api; }, order() { return api; },
        range() { if (t === 'merchant_fees' && feeDenied) return Promise.resolve({ data: [], error: null }); return Promise.resolve({ data: (tables[t] || []).slice(), error: null }); },
        insert(row) { sent.push({ t, op: 'insert', row }); return { select() { return { single() { return Promise.resolve({ data: { rev: 1 }, error: null }); } }; } }; },
        update(row) { sent.push({ t, op: 'update', row }); return { eq() { return { eq() { return { select() { return Promise.resolve({ data: [{ rev: 2 }], error: null }); } }; } }; } }; },
        eq() { return api; }
    };
    return api;
};
const client = {
    from: q,
    rpc: (n, a) => Promise.resolve({ data: { called: n, args: a }, error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }), onAuthStateChange: (cb) => { authCb = cb; } }
};
const events = [];
const win = { addEventListener() {}, dispatchEvent(e) { events.push(e.detail); }, localStorage: { getItem() { return null; }, setItem() {} }, currentUserEmail: 'head@x.kr' };
const ctx = { window: win, console, setTimeout, Promise, JSON, Map, Set, Array, Object, String, Number, Date, CustomEvent: function (n, o) { this.type = n; this.detail = o.detail; } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'kob-db.js'), 'utf8'), ctx);
const db = win.kobDb;
(async () => {
    await db.__init(client, 'supabase');
    await db.load('supplies'); await db.load('settlements');
    ok(db.feesLoaded, '수수료 받음');
    ok(db.get('supplies', 'SP-1').fee === 2.345, 'supplies 겹치기 (*** → 실제 값)', db.get('supplies', 'SP-1'));
    ok(db.get('supplies', 'SP-2').fee === '', '값 없는 줄은 그대로');
    ok(JSON.stringify(db.get('customers', 'c1').fee) === '{"g1":1.1,"g3":2.2}', 'customers 등급별 겹치기', db.get('customers', 'c1').fee);
    ok(db.rows('settlements')[0].merchantFee === 55555 && db.rows('settlements')[0].fee === 1000, 'settlements 가맹점수수료만 겹치기');
    // 저장 — 실제 값을 보내고(서버 트리거가 옮김), 기억해 둠
    await db.save('supplies', Object.assign(db.get('supplies', 'SP-1'), { fee: 3.1, memo: 'x' }));
    ok(sent.some(s => s.t === 'supplies' && s.row.data.fee === 3.1), '저장 때 실제 값을 원래 표로 보냄 (서버가 옮김)');
    ok(db.get('supplies', 'SP-1').fee === 3.1, '저장한 값 기억');
    // 남이 원래 표를 고쳐 '***' 로 되돌아와도 겹쳐 보임 — 내부 표를 직접 '***' 로 바꿔 흉내
    await db.save('customers', Object.assign(db.get('customers', 'c1'), { fee: { g1: '***', g2: 5, g3: '' } }));
    ok(JSON.stringify(db.get('customers', 'c1').fee) === '{"g1":1.1,"g2":5,"g3":""}' || JSON.stringify(db.get('customers', 'c1').fee) === '{"g1":1.1,"g2":5}', '등급 저장 — *** 등급은 이전 값, 빈 등급 삭제, 새 등급', db.get('customers', 'c1').fee);
    // 본부장급 미만 (merchant_fees 0줄)
    feeDenied = true; await db.reloadFees();
    ok(db.get('supplies', 'SP-1').fee === 3.1 || db.get('supplies', 'SP-1').fee === '***', '다시 받기 동작');
    tables.supplies[0].data.fee = '***';
    await db.load('supplies', true);
    ok(db.get('supplies', 'SP-1').fee === '***', '권한 없으면 *** 그대로 (값이 오지 않음)', db.get('supplies', 'SP-1'));
    // rpc
    const r = await db.rpc('fee_log', { p_action: 'view' });
    ok(r.called === 'fee_log', 'rpc 통로');
    // 로그아웃 → 지움
    feeDenied = false; await db.reloadFees();
    authCb('SIGNED_OUT', null);
    ok(db.rows('supplies').length === 0 && !db.feesLoaded, '로그아웃하면 자료 · 수수료 비움');
    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
