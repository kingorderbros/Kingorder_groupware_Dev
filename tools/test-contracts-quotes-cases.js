// 계약 · 견적 · 상담 저장(4-3) 시험 — index.html 안의 **실제 코드를 꺼내서** 돌립니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}  (얻음: ${JSON.stringify(a)})`);

const html = fs.readFileSync(INDEX, 'utf8');
function slice(a, b, label) {
    const i = html.indexOf(a), j = html.indexOf(b, i);
    if (i < 0 || j < 0) { console.error(`index.html 에서 ${label} 부분을 못 찾았습니다. 코드가 바뀌었다면 이 시험의 표시도 고쳐 주세요.`); process.exit(1); }
    return html.slice(i, j);
}

const KINDS = [
    { label: '계약', var: 'contracts', table: 'contracts', fn: 'Contracts', counter: 'contractIdCounter', start: 8, prefix: 'CTR-',
      code: slice('let contracts = (window.kobDb', 'let contractIdCounter', '계약 저장'),
      sample: (id) => ({ id, name: '킹오더식당 POS 3대', customerId: 'c3', status: '초안', approvalStatus: '미제출' }) },
    { label: '견적', var: 'quotes', table: 'quotes', fn: 'Quotes', counter: 'quoteIdCounter', start: 6, prefix: 'QT-',
      code: slice('let quotes = (window.kobDb', 'let quoteIdCounter', '견적 저장'),
      sample: (id) => ({ id, name: '킹오더식당 견적', customerId: 'c3', status: '작성중', lines: [] }) },
    { label: '상담', var: 'cases', table: 'cases', fn: 'Cases', counter: 'caseIdCounter', start: 4, prefix: 'CASE-',
      code: slice('let cases = (window.kobDb', 'let caseIdCounter', '상담 저장'),
      sample: (id) => ({ id, description: '단말 문의', customerId: 'c3', completed: false }) }
];

function makeKobDb(table, seed) {
    const rows = new Map((seed || []).map(r => [r.id, JSON.parse(JSON.stringify(r))]));
    const log = [];
    return {
        rows: () => Array.from(rows.values()).map(r => JSON.parse(JSON.stringify(r))),
        save: (t, row) => { log.push(['save', row.id]); rows.set(row.id, JSON.parse(JSON.stringify(row))); return Promise.resolve(); },
        remove: (t, id) => { log.push(['remove', id]); rows.delete(id); return Promise.resolve(); },
        __rows: rows, __writes: () => log.length, __reset: () => { log.length = 0; }
    };
}

function run(k, seed) {
    const ls = new Map(), toasts = [];
    const win = {
        addEventListener: (n, f) => { if (!ls.has(n)) ls.set(n, []); ls.get(n).push(f); },
        dispatchEvent: (e) => { (ls.get(e.type) || []).forEach(f => f(e)); return true; }
    };
    win.kobDb = makeKobDb(k.table, seed);
    const ctx = vm.createContext({
        window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date, RegExp, Math,
        kobDb: win.kobDb,
        document: { getElementById: () => null },          // 목록 화면이 안 떠 있는 상태
        showAppToast: (t, tone) => toasts.push({ t, tone })
    });
    vm.runInContext(`let ${k.counter} = ${k.start};`, ctx);
    vm.runInContext(k.code + `
;globalThis.__t = {
    get list(){ return ${k.var}; }, set list(v){ ${k.var} = v; },
    save: save${k.fn}, reload: reload${k.fn}FromDb, syncCounter: sync${k.fn}IdCounter,
    get counter(){ return ${k.counter}; }
};`, ctx);
    return { t: vm.runInContext('__t', ctx), db: win.kobDb, win, toasts };
}

(async () => {
    for (const k of KINDS) {
        console.log(`\n========== ${k.label} (${k.table}) ==========`);

        console.log('\n  [1] 저장된 것을 불러오는지');
        {
            const { t } = run(k, [k.sample(k.prefix + '0001')]);
            eq(t.list.length, 1, '저장돼 있던 것을 들고 시작한다');
        }

        console.log('\n  [2] 등록 · 수정 · 삭제');
        {
            const { t, db } = run(k, []);
            const row = k.sample(k.prefix + '0009');
            t.list.unshift(row);
            t.save();
            eq(db.__rows.size, 1, '새로 넣은 것이 저장된다');

            t.list[0].memo = '메모 추가';
            t.save();
            eq(db.__rows.get(k.prefix + '0009').memo, '메모 추가', '수정이 반영된다');

            t.list = t.list.filter(x => x.id !== k.prefix + '0009');
            t.save();
            eq(db.__rows.size, 0, '삭제가 반영된다');
        }

        console.log('\n  [3] 안 바뀌면 헛되이 보내지 않는지');
        {
            const { t, db } = run(k, [k.sample(k.prefix + '0001')]);
            db.__reset();
            t.save(); t.save();
            eq(db.__writes(), 0, '안 바꾸고 저장하면 한 건도 안 보낸다');
        }

        console.log('\n  [4] 번호가 다시 접속해도 안 겹치는지');
        {
            const { t } = run(k, [k.sample(k.prefix + '0042'), k.sample(k.prefix + '0007')]);
            t.syncCounter();
            ok(t.counter > 42, `저장된 가장 큰 번호(42) 뒤로 이어진다 — 다음 ${t.counter}`);
        }

        console.log('\n  [5] 남이 고쳤을 때 · 로그인 직후 · 충돌');
        {
            const { t, db, win, toasts } = run(k, []);
            db.__rows.set(k.prefix + '0003', k.sample(k.prefix + '0003'));
            win.dispatchEvent({ type: 'kob-db-change', detail: { table: null, id: null, reason: 'signin' } });
            eq(t.list.length, 1, '로그인 직후 받아 온다');

            db.__rows.set(k.prefix + '0003', Object.assign(k.sample(k.prefix + '0003'), { memo: '남이 고침' }));
            win.dispatchEvent({ type: 'kob-db-change', detail: { table: k.table, id: k.prefix + '0003', reason: 'remote' } });
            eq(t.list[0].memo, '남이 고침', '남이 고친 내용을 받아 온다');

            win.dispatchEvent({ type: 'kob-db-change', detail: { table: '다른표', id: 'x', reason: 'remote' } });
            eq(t.list.length, 1, '다른 표의 변경에는 반응하지 않는다');

            win.dispatchEvent({ type: 'kob-db-conflict', detail: { table: k.table, id: k.prefix + '0003', mine: {}, theirs: k.sample(k.prefix + '0003') } });
            eq(toasts.length, 1, '충돌을 알린다');
            ok(/다른 사람이 먼저 고쳤습니다/.test(toasts[0].t), '무슨 일인지 알려 준다');
        }

        console.log('\n  [6] 내가 방금 한 것은 되돌아오지 않는지');
        {
            const { t, db, win } = run(k, []);
            t.list.unshift(k.sample(k.prefix + '0005'));
            t.save();
            t.list[0].memo = '아직 저장 안 한 수정';
            win.dispatchEvent({ type: 'kob-db-change', detail: { table: k.table, id: k.prefix + '0005', reason: 'local' } });
            eq(t.list[0].memo, '아직 저장 안 한 수정', '편집 중 내용이 되돌아가지 않는다');
        }
    }

    console.log('\n========== 공통 ==========');
    console.log('\n  [7] 저장소가 없어도 터지지 않는지');
    for (const k of KINDS) {
        const ls = new Map();
        const win = { addEventListener: (n, f) => { if (!ls.has(n)) ls.set(n, []); ls.get(n).push(f); }, dispatchEvent: () => true };
        const ctx = vm.createContext({ window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date, RegExp, Math, document: { getElementById: () => null } });
        vm.runInContext(`let ${k.counter} = ${k.start};`, ctx);
        let threw = null;
        try {
            vm.runInContext(k.code + `;globalThis.__t = { get list(){return ${k.var};}, save: save${k.fn} };`, ctx);
            vm.runInContext('__t', ctx).save();
        } catch (e) { threw = e; }
        ok(!threw, `${k.label}: kobDb 가 없어도 안 터진다` + (threw ? ' — ' + threw.message : ''));
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
