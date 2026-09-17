// 정산 · 공급내역 · 단가표 · 보완서류 저장(4-5) 시험 — index.html 안의 실제 코드를 꺼내서 돌립니다.
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
    if (i < 0 || j < 0) { console.error(`index.html 에서 ${label} 부분을 못 찾았습니다.`); process.exit(1); }
    return html.slice(i, j);
}

const KINDS = [
    { label: '정산', var: 'payoutRecords', table: 'settlements', fn: 'Payouts', ondemand: true,
      counter: 'payoutIdCounter', start: 1, big: 'py42',
      mk: (n) => ({ id: 'py' + n, ym: '2026-09', pathRaw: '킹오더파트너', payAmount: 1200000 }),
      code: slice('let payoutRecords = (window.kobDb', 'let payoutIdCounter', '정산') },
    { label: '공급내역', var: 'supplyRecords', table: 'supplies', fn: 'Supplies', ondemand: true,
      counter: 'supplySeq', start: 60, big: 'SP-042',
      mk: (n) => ({ id: 'SP-' + String(n).padStart(3, '0'), channel: 'franchise', partnerId: 'p17' }),
      code: slice('let supplyRecords = (window.kobDb', 'let supplySeq', '공급내역') },
    { label: '단가표', var: 'priceBook', table: 'price_book', fn: 'PriceBook', ondemand: false,
      counter: 'priceSeq', start: 40, big: 'PR-042',
      mk: (n) => ({ id: 'PR-' + String(n).padStart(3, '0'), cat: 'POS', name: 'POS 단말', kind: '단가', cost: 300000, price: 450000 }),
      code: slice('let priceBook = (window.kobDb', 'let priceSeq', '단가표') },
    { label: '보완서류 요청', var: 'payDocRequests', table: 'pay_doc_requests', fn: 'PayDocs', ondemand: false,
      counter: null, start: 0, big: null,
      mk: (n) => ({ id: 'PD-' + String(n).padStart(4, '0'), merchant: '테스트 가맹점', bizNo: '123-45-67890', status: 'requested', targetName: '영업본부' }),
      code: slice('let payDocRequests = (window.kobDb', '// ---------- 역할 판정 ----------', '보완서류') }
];

function makeKobDb(seed, readyTables) {
    const rows = new Map((seed || []).map(r => [r.id, JSON.parse(JSON.stringify(r))]));
    const log = [], loads = [];
    const ready = new Set(readyTables || []);
    const loadable = new Set(readyTables === undefined ? [] : ['settlements', 'supplies']);
    return {
        // 아직 안 받은 표는 빈 목록으로 보입니다 (실제 kobDb 와 같게)
        rows: (t) => (t && !ready.has(t) && loadable.has(t)) ? [] : Array.from(rows.values()).map(r => JSON.parse(JSON.stringify(r))),
        save: (t, row) => { log.push(['save', row.id]); rows.set(row.id, JSON.parse(JSON.stringify(row))); return Promise.resolve(); },
        remove: (t, id) => { log.push(['remove', id]); rows.delete(id); return Promise.resolve(); },
        ready: (t) => ready.has(t),
        load: (t) => { loads.push(t); ready.add(t); return Promise.resolve(rows.size); },
        __rows: rows, __loads: loads, __writes: () => log.length, __reset: () => { log.length = 0; }
    };
}

function run(k, seed, readyTables) {
    const ls = new Map();
    const win = {
        addEventListener: (n, f) => { if (!ls.has(n)) ls.set(n, []); ls.get(n).push(f); },
        dispatchEvent: (e) => { (ls.get(e.type) || []).forEach(f => f(e)); return true; }
    };
    win.kobDb = makeKobDb(seed, readyTables);
    const ctx = vm.createContext({
        window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date, RegExp, Math,
        kobDb: win.kobDb
    });
    if (k.counter) vm.runInContext(`let ${k.counter} = ${k.start};`, ctx);
    const extra = k.ondemand ? `, ensureLoaded: ensure${k.fn}Loaded` : '';
    vm.runInContext(k.code + `
;globalThis.__t = {
    get list(){ return ${k.var}; }, set list(v){ ${k.var} = v; },
    save: save${k.fn}, reload: reload${k.fn}FromDb${k.counter ? `, syncCounter: sync${k.fn}IdCounter, get counter(){ return ${k.counter}; }` : ''}${extra}
};`, ctx);
    return { t: vm.runInContext('__t', ctx), db: win.kobDb, win };
}

(async () => {
    for (const k of KINDS) {
        console.log(`\n========== ${k.label} → ${k.table} ==========`);
        {
            const { t } = run(k, [k.mk(1)]);
            eq(t.list.length, 1, '저장돼 있던 것을 들고 시작한다');
        }
        {
            const { t, db } = run(k, []);
            const row = k.mk(9);
            t.list.push(row);
            t.save();
            eq(db.__rows.size, 1, '새로 넣은 것이 저장된다');
            t.list[0].memo = '메모';
            t.save();
            eq(db.__rows.get(row.id).memo, '메모', '수정이 반영된다');
            t.list = t.list.filter(x => x.id !== row.id);
            t.save();
            eq(db.__rows.size, 0, '삭제가 반영된다');
        }
        {
            const { t, db } = run(k, [k.mk(1)]);
            db.__reset();
            t.save(); t.save();
            eq(db.__writes(), 0, '안 바꾸면 한 건도 안 보낸다');
        }
        if (k.counter) {
            const { t } = run(k, [{ ...k.mk(1), id: k.big }]);
            t.syncCounter();
            ok(t.counter > 42, `번호가 저장된 것(42) 뒤로 이어진다 — 다음 ${t.counter}`);
        }
        {
            const { t, db, win } = run(k, []);
            const row = k.mk(3);
            db.__rows.set(row.id, row);
            win.dispatchEvent({ type: 'kob-db-change', detail: { table: null, id: null, reason: 'signin' } });
            eq(t.list.length, 1, '로그인 직후 받아 온다');
            t.list[0].memo = '편집 중';
            win.dispatchEvent({ type: 'kob-db-change', detail: { table: k.table, id: row.id, reason: 'local' } });
            eq(t.list[0].memo, '편집 중', '내가 방금 한 것으로 편집 중 내용이 되돌아가지 않는다');
        }
        if (k.ondemand) {
            console.log(`  [대량 자료] 화면을 열 때 받아 오는지`);
            const { t, db } = run(k, [k.mk(5)], []);       // 아직 안 받은 상태
            eq(t.list.length, 0, '미리 받지 않는다 (엑셀로 수천 줄이 들어올 수 있어서)');
            t.ensureLoaded();
            eq(db.__loads, [k.table], '화면을 열면 그때 받아 온다');
            t.ensureLoaded();
            eq(db.__loads.length, 1, '이미 받았으면 두 번 받지 않는다');
        }
    }

    console.log('\n========== 엑셀 대량 반영 ==========');
    console.log('\n  [정산] 한 달치를 통째로 바꿔도 저장소가 따라가는지');
    {
        const k = KINDS[0];
        const { t, db } = run(k, [{ id: 'py1', ym: '2026-09', pathRaw: '옛자료' }]);
        // 그 달을 지우고 새 파일 내용으로 바꾸는 흐름
        t.list = t.list.filter(r => r.ym !== '2026-09');
        [1, 2, 3].forEach(n => t.list.push({ id: 'py' + (10 + n), ym: '2026-09', pathRaw: '새자료' + n }));
        t.save();
        eq(db.__rows.size, 3, '옛 자료는 지우고 새 자료 3건이 들어간다');
        ok(!db.__rows.has('py1'), '그 달의 옛 자료가 저장소에서도 사라진다');
    }

    console.log('\n  [단가표] 검색용 칸 이름이 화면과 맞는지');
    {
        ok(/data->>'cat'/.test(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema-v4.sql'), 'utf8')),
           "schema-v4 가 카테고리를 'cat' 에서 뽑는다 (화면이 쓰는 이름)");
        const i = html.indexOf('const data = {\n                cat, name, kind,');
        ok(i > 0, '화면은 cat · name · kind 로 담는다');
    }

    console.log('\n[공통] 저장소가 없어도 터지지 않는지');
    for (const k of KINDS) {
        const ls = new Map();
        const win = { addEventListener: (n, f) => { if (!ls.has(n)) ls.set(n, []); ls.get(n).push(f); }, dispatchEvent: () => true };
        const ctx = vm.createContext({ window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date, RegExp, Math });
        if (k.counter) vm.runInContext(`let ${k.counter} = ${k.start};`, ctx);
        let threw = null;
        try {
            vm.runInContext(k.code + `;globalThis.__t = { save: save${k.fn}${k.ondemand ? `, ensureLoaded: ensure${k.fn}Loaded` : ''} };`, ctx);
            const t = vm.runInContext('__t', ctx);
            t.save();
            if (k.ondemand) t.ensureLoaded();
        } catch (e) { threw = e; }
        ok(!threw, `${k.label}: kobDb 가 없어도 안 터진다` + (threw ? ' — ' + threw.message : ''));
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
