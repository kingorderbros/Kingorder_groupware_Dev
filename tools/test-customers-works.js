// 고객사 · 업무 건 저장(4-2) 시험 — index.html 안의 **실제 코드를 꺼내서** 돌립니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}  (얻음: ${JSON.stringify(a)})`);

const html = fs.readFileSync(INDEX, 'utf8');
function slice(startMark, endMark, label) {
    const i = html.indexOf(startMark);
    const j = html.indexOf(endMark, i);
    if (i < 0 || j < 0) { console.error(`index.html 에서 ${label} 부분을 찾지 못했습니다. 코드가 바뀌었다면 이 시험의 표시도 고쳐 주세요.`); process.exit(1); }
    return html.slice(i, j);
}

// ---------- 고객사 ----------
const CUST = slice('let customers = (window.kobDb', 'let customerIdCounter', '고객사 저장');
// ---------- 업무 건 ----------
const WORKS = slice('function isDerivedWork(', 'function wcCustomer(', '업무 건 저장');
// ---------- 마지막으로 보던 고객 ----------
const LASTCUST = slice('const WC_LAST_CUSTOMER_KEY', 'function retryWorkCenterRestore(', '지난번 고객 기억');

for (const [code, need, label] of [
    [CUST, 'function saveCustomers(', '고객사'],
    [WORKS, 'function saveWorks(', '업무 건']
]) if (!code.includes(need)) { console.error(label, '에', need, '가 없습니다.'); process.exit(1); }

function makeKobDb(seed) {
    const t = new Map();
    const log = [];
    (Object.entries(seed || {})).forEach(([tbl, rows]) => t.set(tbl, new Map(rows.map(r => [r.id, JSON.parse(JSON.stringify(r))]))));
    const T = (n) => { if (!t.has(n)) t.set(n, new Map()); return t.get(n); };
    return {
        rows: (n) => Array.from(T(n).values()).map(r => JSON.parse(JSON.stringify(r))),
        save: (n, row) => { log.push(['save', n, row.id]); T(n).set(row.id, JSON.parse(JSON.stringify(row))); return Promise.resolve(); },
        remove: (n, id) => { log.push(['remove', n, id]); T(n).delete(id); return Promise.resolve(); },
        __t: T, __log: log, __writes: () => log.length, __reset: () => { log.length = 0; }
    };
}
function mkWin() {
    const ls = new Map(), ev = [];
    const win = {
        addEventListener: (n, f) => { if (!ls.has(n)) ls.set(n, []); ls.get(n).push(f); },
        dispatchEvent: (e) => { ev.push(e); (ls.get(e.type) || []).forEach(f => f(e)); return true; },
        __ev: ev
    };
    return win;
}

// ---------- 고객사 시험 ----------
function runCust(seed) {
    const win = mkWin();
    win.kobDb = makeKobDb({ customers: seed || [] });
    const toasts = [];
    const ctx = vm.createContext({
        window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date, RegExp,
        kobDb: win.kobDb,
        customerIdCounter: 3,
        renderCustomers: () => {}, renderCommonCustomers: () => {}, refreshWorkViews: () => {},
        showAppToast: (t, tone) => toasts.push({ t, tone })
    });
    vm.runInContext(CUST + `
;globalThis.__t = { get customers(){return customers;}, set customers(v){customers=v;},
                    saveCustomers, reloadCustomersFromDb, syncCustomerIdCounter };`, ctx);
    return { t: vm.runInContext('__t', ctx), db: win.kobDb, win, toasts, ctx };
}

// ---------- 업무 건 시험 ----------
function runWorks(seed) {
    const win = mkWin();
    win.kobDb = makeKobDb({ works: seed || [] });
    const toasts = [];
    const centers = { ops: { works: [], seq: 147 }, sales: { works: [], seq: 1 } };
    const ctx = vm.createContext({
        window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date, RegExp,
        kobDb: win.kobDb, WORK_CENTERS: centers,
        refreshWorkViews: () => {},
        showAppToast: (t, tone) => toasts.push({ t, tone })
    });
    vm.runInContext(WORKS + `
;globalThis.__t = { saveWorks, loadWorksFromDb, reloadWorksFromDb, isDerivedWork };`, ctx);
    return { t: vm.runInContext('__t', ctx), db: win.kobDb, win, toasts, centers };
}

(async () => {
    console.log('\n========== 고객사 ==========');

    console.log('\n[1] 저장된 고객을 불러오는지');
    {
        const { t } = runCust([{ id: 'c5', name: '킹오더식당', businessNo: '123-45-67890' }]);
        eq(t.customers.length, 1, '저장돼 있던 고객을 들고 시작한다');
        eq(t.customers[0].name, '킹오더식당', '내용도 그대로');
    }

    console.log('\n[2] 등록 · 수정 · 삭제가 저장되는지');
    {
        const { t, db } = runCust([]);
        t.customers.push({ id: 'c4', name: '새 가맹점', businessNo: '111-11-11111' });
        t.saveCustomers();
        eq(db.__t('customers').get('c4').name, '새 가맹점', '새 고객이 저장된다');

        t.customers[0].name = '새 가맹점(상호변경)';
        t.saveCustomers();
        eq(db.__t('customers').get('c4').name, '새 가맹점(상호변경)', '수정이 반영된다');

        t.customers = t.customers.filter(c => c.id !== 'c4');
        t.saveCustomers();
        eq(db.__t('customers').size, 0, '삭제가 반영된다');
    }

    console.log('\n[3] 두 화면이 서로 다른 항목 이름을 써도 그대로 담기는지');
    {
        const { t, db } = runCust([]);
        t.customers.push({ id: 'c1', name: '가맹점관리쪽', businessNo: '111-11-11111', ceo: '김대표' });
        t.customers.push({ id: 'c2', name: '고객관리쪽', bizNo: '222-22-22222', grade: '일반' });
        t.saveCustomers();
        eq(db.__t('customers').get('c1').businessNo, '111-11-11111', '가맹점관리의 businessNo 가 담긴다');
        eq(db.__t('customers').get('c2').bizNo, '222-22-22222', '고객관리의 bizNo 도 담긴다');
    }

    console.log('\n[4] 고객 번호가 다시 접속해도 안 겹치는지');
    {
        const { t, ctx } = runCust([{ id: 'c12', name: '기존' }, { id: 'c7', name: '기존2' }]);
        t.syncCustomerIdCounter();
        const next = vm.runInContext('customerIdCounter', ctx);
        ok(next > 12, `저장된 가장 큰 번호(12) 뒤로 이어진다 — 다음 번호 ${next}`);
    }

    console.log('\n[5] 안 바뀌면 헛되이 보내지 않는지');
    {
        const { t, db } = runCust([{ id: 'c1', name: '킹오더식당' }]);
        db.__reset();
        t.saveCustomers(); t.saveCustomers();
        eq(db.__writes(), 0, '안 바꾸고 저장하면 한 건도 안 보낸다');
    }

    console.log('\n[6] 남이 고쳤을 때 · 충돌했을 때');
    {
        const { t, db, win, toasts } = runCust([{ id: 'c1', name: '옛 상호' }]);
        db.__t('customers').set('c1', { id: 'c1', name: '남이 고친 상호' });
        win.dispatchEvent({ type: 'kob-db-change', detail: { table: 'customers', id: 'c1', reason: 'remote' } });
        eq(t.customers[0].name, '남이 고친 상호', '남이 고친 내용을 받아 온다');

        win.dispatchEvent({ type: 'kob-db-conflict', detail: { table: 'customers', id: 'c1', mine: { name: '내 것' }, theirs: { name: '남이 고친 상호' } } });
        eq(toasts.length, 1, '충돌을 알린다');
        ok(/남이 고친 상호/.test(toasts[0].t), '어느 고객인지 알려 준다');
    }

    console.log('\n========== 업무 건 ==========');

    console.log('\n[7] 본부별로 갈라서 불러오는지');
    {
        const { t, centers } = runWorks([
            { id: 'W1', center: 'ops', title: '설치', status: 'received' },
            { id: 'W2', center: 'sales', title: '견적상담', status: 'working' },
            { id: 'W3', center: '없는본부', title: '버려야 함' }
        ]);
        eq(centers.ops.works.length, 1, '운영본부 1건');
        eq(centers.sales.works.length, 1, '영업본부 1건');
        eq(centers.ops.works[0].title, '설치', '내용도 그대로');
        ok(true, '모르는 본부의 자료는 어느 쪽에도 넣지 않는다');
    }

    console.log('\n[8] 새 업무에 본부 표시가 붙어 저장되는지');
    {
        const { t, db, centers } = runWorks([]);
        centers.ops.works.unshift({ id: 'W9', title: 'A/S 접수', status: 'received' });
        t.saveWorks();
        eq(db.__t('works').get('W9').center, 'ops', '어느 본부 것인지 함께 저장된다');
        eq(centers.ops.works[0].center, 'ops', '화면 쪽 값에도 붙는다');
    }

    console.log('\n[9] 파생 업무는 저장하지 않는지');
    {
        const { t, db, centers } = runWorks([]);
        centers.sales.works.push({ id: 'W1', title: '진짜 업무' });
        centers.sales.works.push({ id: 'CS-1', title: '상담에서 파생', caseId: 'CASE-0001' });
        centers.sales.works.push({ id: 'CT-1', title: '계약에서 파생', contractId: 'CT-1' });
        centers.sales.works.push({ id: 'QT-1', title: '견적에서 파생', quoteId: 'QT-0001' });
        t.saveWorks();
        eq(db.__t('works').size, 1, '파생 업무 3건은 저장하지 않는다');
        ok(db.__t('works').has('W1'), '진짜 업무만 저장한다');

        // 파생 업무는 지웠다 다시 만들어집니다 — 그때 삭제가 날아가면 안 됩니다
        db.__reset();
        centers.sales.works = centers.sales.works.filter(w => !w.caseId);
        centers.sales.works.push({ id: 'CS-2', title: '다시 만든 파생', caseId: 'CASE-0001' });
        t.saveWorks();
        eq(db.__writes(), 0, '파생 업무가 다시 만들어져도 저장소를 건드리지 않는다');
    }

    console.log('\n[10] O/B 연체 업무는 저장하는지 (사람이 상담이력을 적으므로)');
    {
        const { t, db, centers } = runWorks([]);
        centers.ops.works.push({ id: 'OB-c1-rent', type: 'ob', title: '임대료 연체 2건 안내', intakeEntries: [] });
        t.saveWorks();
        ok(db.__t('works').has('OB-c1-rent'), 'O/B 건은 저장된다');

        centers.ops.works[0].intakeEntries.push({ text: '통화함 — 내일 입금 약속' });
        t.saveWorks();
        eq(db.__t('works').get('OB-c1-rent').intakeEntries.length, 1, '적은 상담이력이 저장된다');
    }

    console.log('\n[11] 업무 상태가 바뀌면 저장되는지 · 안 바뀌면 안 보내는지');
    {
        const { t, db, centers } = runWorks([{ id: 'W1', center: 'ops', title: '설치', status: 'received' }]);
        db.__reset();
        t.saveWorks(); t.saveWorks();
        eq(db.__writes(), 0, '안 바뀌면 한 건도 안 보낸다');

        centers.ops.works[0].status = 'done';
        centers.ops.works[0].doneAt = '2026-09-17';
        t.saveWorks();
        eq(db.__t('works').get('W1').status, 'done', '완료 처리가 저장된다');
        eq(db.__writes(), 1, '그 한 건만 보낸다');
    }

    console.log('\n[12] 접수번호가 다시 접속해도 안 겹치는지');
    {
        const { centers } = runWorks([
            { id: 'OPS-0152', center: 'ops', title: 'a' },
            { id: 'OPS-0148', center: 'ops', title: 'b' }
        ]);
        ok(centers.ops.seq > 152, `저장된 가장 큰 접수번호(152) 뒤로 이어진다 — 다음 ${centers.ops.seq}`);
    }

    console.log('\n[13] 업무가 지워지면 저장소에서도 지워지는지');
    {
        const { t, db, centers } = runWorks([{ id: 'W1', center: 'ops', title: '설치' }]);
        centers.ops.works = [];
        t.saveWorks();
        eq(db.__t('works').size, 0, '지운 업무가 저장소에서도 사라진다');
    }

    console.log('\n[14] 남이 고쳤을 때 · 충돌했을 때');
    {
        const { t, db, win, centers, toasts } = runWorks([{ id: 'W1', center: 'ops', title: '옛 제목' }]);
        db.__t('works').set('W1', { id: 'W1', center: 'ops', title: '남이 고친 제목' });
        win.dispatchEvent({ type: 'kob-db-change', detail: { table: 'works', id: 'W1', reason: 'remote' } });
        eq(centers.ops.works[0].title, '남이 고친 제목', '남이 고친 내용을 받아 온다');

        win.dispatchEvent({ type: 'kob-db-conflict', detail: { table: 'works', id: 'W1', mine: { title: '내 것' }, theirs: { title: '남이 고친 제목' } } });
        eq(toasts.length, 1, '충돌을 알린다');
    }

    console.log('\n[15] 로그인 직후 업무 건을 받아 오는지 (표는 로그인한 사람에게만 열려 있음)');
    {
        const { db, win, centers } = runWorks([]);          // 로그인 전에는 한 줄도 안 옵니다
        eq(centers.ops.works.length, 0, '로그인 전에는 비어 있다');
        db.__t('works').set('W-2608-0147', { id: 'W-2608-0147', center: 'ops', type: 'as', customerId: 'ox-c3', title: 'POS 단말 · 전원 불량' });
        win.dispatchEvent({ type: 'kob-db-change', detail: { table: null, id: null, reason: 'signin' } });
        eq(centers.ops.works.length, 1, '로그인하면 저장된 업무가 들어온다');
        eq(centers.ops.works[0].customerId, 'ox-c3', '어느 고객의 건인지도 그대로 — 그 고객을 다시 조회하면 보인다');
    }

    console.log('\n[16] 마지막으로 보던 고객을 기억했다가 되살리는지');
    {
        const mem = new Map();
        const custList = { ops: [{ id: 'ox-c3' }, { id: 'ox-c9' }], sales: [{ id: 'sx-c1' }] };
        const ctx = vm.createContext({
            console, JSON, Error, Object,
            kobStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) },
            wcState: { ops: { customerId: null }, sales: { customerId: null } },
            wcDef: (k) => ({ customers: custList[k] || [] })
        });
        vm.runInContext(LASTCUST + `
;globalThis.__t = { rememberWorkCenterCustomer, restoreWorkCenterCustomer, wcLastCustomers, WC_LAST_CUSTOMER_KEY };`, ctx);
        const t = vm.runInContext('__t', ctx);
        const st = vm.runInContext('wcState', ctx);

        t.rememberWorkCenterCustomer('ops', 'ox-c3');
        ok(mem.has(t.WC_LAST_CUSTOMER_KEY), '브라우저에 적어 둔다');

        st.ops.customerId = null;                      // 새로고침 흉내
        eq(t.restoreWorkCenterCustomer('ops'), true, '되살렸다고 알려 준다');
        eq(st.ops.customerId, 'ox-c3', '지난번 고객으로 돌아간다');

        // 이미 고른 고객이 있으면 건드리지 않습니다
        st.ops.customerId = 'ox-c9';
        eq(t.restoreWorkCenterCustomer('ops'), false, '이미 고른 고객이 있으면 그대로 둔다');
        eq(st.ops.customerId, 'ox-c9', '고른 고객이 바뀌지 않는다');

        // 본부마다 따로 기억합니다
        eq(st.sales.customerId, null, '영업본부는 따로 — 아직 기억 없음');

        // 지워진 고객이면 되살리지 않고 기억도 정리합니다
        t.rememberWorkCenterCustomer('sales', 'sx-없는고객');
        st.sales.customerId = null;
        eq(t.restoreWorkCenterCustomer('sales'), false, '지워진 고객은 되살리지 않는다');
        eq(t.wcLastCustomers().sales, undefined, '쓸모없어진 기억은 지운다');

        // 초기화하면 기억도 지웁니다
        t.rememberWorkCenterCustomer('ops', null);
        eq(t.wcLastCustomers().ops, undefined, '초기화하면 기억도 지운다');
    }

    console.log('\n[17] 고객 자료가 늦게 도착해도 기억이 지워지지 않는지 (로그인 직후)');
    {
        const mem = new Map();
        const custList = { ops: [] };                       // 아직 안 들어온 상태
        const ctx = vm.createContext({
            console, JSON, Error, Object,
            kobStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) },
            wcState: { ops: { customerId: null } },
            wcDef: () => ({ customers: custList.ops })
        });
        vm.runInContext(LASTCUST + `
;globalThis.__t = { rememberWorkCenterCustomer, restoreWorkCenterCustomer, wcLastCustomers };`, ctx);
        const t = vm.runInContext('__t', ctx);
        const st = vm.runInContext('wcState', ctx);

        t.rememberWorkCenterCustomer('ops', 'ox-c3');
        eq(t.restoreWorkCenterCustomer('ops'), false, '고객이 아직 안 왔으면 되돌리지 않는다');
        eq(t.wcLastCustomers().ops, 'ox-c3', '**기억을 지우지 않는다** (지우면 도착해도 되돌아갈 곳이 없어짐)');

        custList.ops = [{ id: 'ox-c3' }];                   // 이제 도착
        eq(t.restoreWorkCenterCustomer('ops'), true, '도착한 뒤 다시 부르면 되돌린다');
        eq(st.ops.customerId, 'ox-c3', '지난번 고객으로 돌아간다');
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
