// 업체 통합(2026-10-05) 시험 — index.html 안의 **실제 코드를 꺼내서** 돌립니다.
//   · normalizeCompanies — 예전 자료(채널구분 · 담당 파트너사 이름 · 본사 이름)에서 업체 유형 · 상위업체를 찾아 채우는지
//   · 거래상태 통합 — 고객구분 · 예전 파트너사 상태를 새 목록으로
//   · 예전 파트너사(gwPartners.v1) — 옮기기 전에는 화면에 함께 보이되 저장은 migrateCompaniesOnce() 만 하는지
//   · 엑셀 업체유형 · 가격정책 읽기
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const html = fs.readFileSync(INDEX, 'utf8');
const i = html.indexOf('let customers = (window.kobDb');
const j = html.indexOf('let customerIdCounter', i);
if (i < 0 || j < 0) { console.error('index.html 에서 업체 부분을 찾지 못했습니다. 코드가 바뀌었다면 이 시험의 표시도 고쳐 주세요.'); process.exit(1); }
const CODE = html.slice(i, j);
['function normalizeCompanies(', 'function prepareCompanies(', 'async function migrateCompaniesOnce(', 'function parseCompanyKind('].forEach(n => {
    if (!CODE.includes(n)) { console.error('업체 부분에', n, '가 없습니다.'); process.exit(1); }
});

function makeKobDb(rows) {
    const t = new Map((rows || []).map(r => [r.id, JSON.parse(JSON.stringify(r))]));
    const log = [];
    return {
        rows: () => Array.from(t.values()).map(r => JSON.parse(JSON.stringify(r))),
        get: (n, id) => (t.has(id) ? JSON.parse(JSON.stringify(t.get(id))) : null),
        save: (n, row) => { log.push(['save', row.id]); t.set(row.id, JSON.parse(JSON.stringify(row))); return Promise.resolve(); },
        remove: (n, id) => { log.push(['remove', id]); t.delete(id); return Promise.resolve(); },
        __t: t, __log: log
    };
}
// store: app_store 흉내 (loadJsonStore · saveJsonStore)
function run(customerRows, store, opts) {
    const o = opts || {};
    const kobDb = makeKobDb(customerRows);
    const st = Object.assign({}, store || {});
    const ctx = vm.createContext({
        window: { kobDb, addEventListener() {}, dispatchEvent() { return true; } }, kobDb, console: { log() {}, info() {}, warn() {}, error() {} }, JSON, Map, Set, Array, String, Number, Promise, Error, Date, RegExp, Object,
        kobStorage: { authed: o.authed !== false },
        isPartnerMode: () => !!o.partnerMode,
        loadJsonStore: (k, fb) => (st[k] === undefined || st[k] === null ? fb : JSON.parse(JSON.stringify(st[k]))),
        saveJsonStore: (k, v) => { st[k] = JSON.parse(JSON.stringify(v)); return true; },
        renderCustomers() {}, renderCommonCustomers() {}, refreshWorkViews() {}, retryWorkCenterRestore() {}
    });
    vm.runInContext(CODE + '\n;globalThis.__get = () => ({ customers, customerSaved });', ctx);
    return { ctx, kobDb, st, get: () => ctx.__get() };
}

(async () => {
    console.log('\n[1] 예전 자료에서 업체 유형 · 상위업체 찾기');
    {
        const rows = [
            { id: 'c1', name: '역삼점', channelType: '파트너사', partnerName: '오케팅 홀딩스', businessNo: '111-22-33333', type: '거래고객' },
            { id: 'c2', name: '개인식당', channelType: '직영', type: '잠재고객' },
            { id: 'c3', name: '치킨가맹1', custType: 'franchise', franchiseName: '치킨본사' },
            { id: 'p17', name: '오케팅홀딩스', custType: 'partner', status: '계약해지', contact: '최상무' },
            { id: 'h1', name: '치킨본사', kind: 'hq' },
            { id: 'c4', name: '가게', kind: 'direct', parentId: 'p17' }
        ];
        const r = run(rows, {});
        const { customers } = r.get();
        const by = id => customers.find(c => c.id === id);
        ok(by('c1').kind === 'partnerShop' && by('c1').parentId === 'p17', '담당 파트너사 이름(띄어쓰기 달라도) → 파트너사 가맹점 · 상위업체 id');
        ok(by('c1').partnerName === '오케팅홀딩스' && by('c1').parentPartnerId === 'p17' && by('c1').channelType === '파트너사', '예전 칸(partnerName · parentPartnerId · channelType)을 상위업체에서 다시 채운다');
        ok(by('c2').kind === 'direct' && by('c2').parentId === '' && by('c2').channelType === '직영', '소속이 없으면 개인 가맹점 · 직영');
        ok(by('c3').kind === 'franchise' && by('c3').parentId === 'h1' && by('c3').franchiseName === '치킨본사', '본사 이름 글자 → 본사 id');
        ok(by('h1').franchiseName === '치킨본사' && by('h1').channelType === '프랜차이즈', '본사는 자기 이름이 본사명');
        ok(by('c4').parentId === '', '상위업체를 두지 않는 유형(개인 가맹점)은 상위업체를 지운다');
        ok(by('c1').bizNo === '111-22-33333' && by('c1').businessNo === '111-22-33333', '사업자번호를 bizNo 에도 (표의 검색 색인 칸)');
        ok(by('p17').contactName === '최상무' && by('p17').contact === '최상무', '담당자 이름 둘(contact · contactName)을 맞춘다');
        ok(by('c1').status === '거래중' && by('c2').status === '미거래' && by('p17').status === '거래중단', '거래상태: 거래고객 → 거래중 · 잠재 → 미거래 · 계약해지 → 거래중단');
        ok(by('c1').type === '거래고객', '고객구분(영업 단계)은 그대로 둔다');
        ok(r.kobDb.__log.length === 0, '본체 시작 때는 아무것도 저장하지 않는다 (로그인 전 쓰기 금지)');
        // 상위업체 이름이 바뀌어도 id 로 이어져 있다
        by('p17').name = '오케팅홀딩스(주)';
        r.ctx.normalizeCompanies(customers);
        ok(by('c1').parentId === 'p17' && by('c1').partnerName === '오케팅홀딩스(주)', '상위업체 상호를 바꿔도 연결이 유지되고 이름 칸만 따라 바뀐다');
    }

    console.log('\n[2] 예전 파트너사 목록 (gwPartners.v1)');
    {
        const legacy = [{ id: 'p17', name: '오케팅홀딩스', custType: 'partner' }, { id: 'p18', name: '매일새옷', custType: 'dist' }, { id: 'c1', name: '겹침' }];
        const rows = [{ id: 'c1', name: '역삼점', partnerName: '오케팅홀딩스' }];
        let r = run(rows, { 'gwPartners.v1': legacy });
        let { customers, customerSaved } = r.get();
        ok(customers.length === 3 && customers.filter(c => c.fromLegacy).map(c => c.id).join(',') === 'p17,p18', '옮기기 전: 표에 없는 예전 파트너사를 화면 목록에 함께 둔다 (같은 id 는 표가 이김)');
        ok(customers.find(c => c.id === 'c1').parentId === 'p17', '예전 파트너사와도 상위업체가 이어진다');
        ok(!customerSaved.has('p17'), '예전 줄은 저장본 기록에 없다');
        r.ctx.saveCustomers();
        ok(!r.kobDb.__log.some(x => x[1] === 'p17' || x[1] === 'p18'), 'saveCustomers() 는 아직 옮기지 않은 예전 줄을 저장하지 않는다');

        const res = await r.ctx.migrateCompaniesOnce();
        ok(res.moved === 2 && r.kobDb.__t.has('p17') && r.kobDb.__t.has('p18'), '로그인 뒤 옮기기: 예전 파트너사를 같은 id 로 표에 넣는다');
        ok(r.kobDb.__t.get('p18').kind === 'dist' && r.kobDb.__t.get('p17').fromLegacy === undefined, '유형을 지니고 · 옮김 표시 칸(fromLegacy)은 지우고 저장');
        ok(res.fixed === 1 && r.kobDb.__t.get('c1').kind === 'partnerShop' && r.kobDb.__t.get('c1').parentId === 'p17', '유형 · 상위업체가 비어 있던 가맹점 줄도 채워 저장한다');
        ok(!!r.st['gwPartnersMigrated.v1'] && r.st['gwPartnersMigrated.v1'].moved.join(',') === 'p17,p18', '모두 저장한 뒤 옮김 표시를 남긴다');
        ok(Array.isArray(r.st['gwPartners.v1']) && r.st['gwPartners.v1'].length === 3, '예전 목록은 지우지 않는다 (되돌리기용)');
        const n = r.kobDb.__log.length;
        const again = await r.ctx.migrateCompaniesOnce();
        ok(again.done && r.kobDb.__log.length === n, '두 번째부터는 아무것도 하지 않는다');

        r = run([{ id: 'c1', name: '역삼점' }], { 'gwPartners.v1': legacy, 'gwPartnersMigrated.v1': { at: 'x' } });
        ok(r.get().customers.length === 1, '옮김 표시가 있으면 예전 목록을 다시 읽지 않는다 (지운 업체가 되살아나지 않게)');
        r = run([], { 'gwPartners.v1': legacy }, { partnerMode: true });
        ok(r.get().customers.length === 0, '파트너센터에서는 예전 목록을 업체로 읽지 않는다');
        r = run([], { 'gwPartners.v1': legacy }, { authed: false });
        const pre = await r.ctx.migrateCompaniesOnce();
        ok(pre.moved === 0 && r.kobDb.__log.length === 0 && !r.st['gwPartnersMigrated.v1'], '로그인 전에는 옮기지 않는다');
        r = run([{ id: 'c1', name: '가게', kind: 'direct', status: '미거래', bizNo: '', businessNo: '' }], {});
        const none = await r.ctx.migrateCompaniesOnce();
        ok(none.moved === 0 && none.fixed === 0 && r.kobDb.__log.length === 0, '옮길 것도 고칠 것도 없으면 저장하지 않는다');
    }

    console.log('\n[3] 업체 목록 바꾸기 · 소속 업체');
    {
        const r = run([{ id: 'p1', name: 'P', kind: 'partner' }, { id: 'c1', name: 'A', kind: 'partnerShop', parentId: 'p1' }, { id: 'c2', name: 'B', kind: 'partnerShop', parentId: 'p1' }], {});
        ok(r.ctx.companyChildren('p1').map(c => c.id).join(',') === 'c1,c2', 'companyChildren: 상위업체가 이 업체인 곳');
        r.ctx.setCompanyList(r.get().customers.filter(c => c.id !== 'c2'));
        ok(r.get().customers.length === 2, 'setCompanyList: 목록을 바꾼다');
    }

    console.log('\n[4] 엑셀 업체유형 · 가격정책 · 거래상태');
    {
        const r = run([], {});
        const k = r.ctx.parseCompanyKind;
        const cases = [['개인 가맹점', 'direct'], ['직영', 'direct'], ['개인사업자', 'direct'], ['프랜차이즈 가맹점', 'franchise'], ['프랜차이즈', 'franchise'],
                       ['파트너사', 'partner'], ['총판', 'partner'], ['대리점', 'partner'], ['파트너사 가맹점', 'partnerShop'], ['프랜차이즈 본사', 'hq'],
                       ['본사', 'hq'], ['하드웨어 유통', 'dist'], ['partnerShop', 'partnerShop'], ['', ''], ['모름', '']];
        ok(cases.every(([v, want]) => k(v) === want), '업체유형: ' + cases.map(([v, w]) => `${v || '(빈칸)'}→${w || "''"}`).join(' · '));
        const p = r.ctx.parseFranchisePolicy;
        ok(p('가격표시형') === 'visible' && p('가격비공개형') === 'hidden' && p('페이백형') === 'payback' && p('payback') === 'payback' && p('x') === '', '가격정책: 이름 · 코드');
        const s = r.ctx.companyStatusOf;
        ok(s({ status: 'PG정산' }) === 'PG정산' && s({ status: '계약해지' }) === '거래중단' && s({ type: '휴면고객' }) === '휴면' && s({}) === '미거래', '거래상태 정하기');
        ok(r.ctx.companyStatusList().map(x => x.id).join(',') === '거래중,PG정산,미거래,보류,휴면,거래중단', '거래상태 목록 6가지');
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
