// 가맹점 설치환경 체크(설치 의뢰서 반영) 시험 — index.html 안의 실제 코드를 꺼내서 돌립니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const html = fs.readFileSync(INDEX, 'utf8');
function cut(a, b, label) {
    const i = html.indexOf(a), j = html.indexOf(b, i);
    if (i < 0 || j < 0) { console.error(`index.html 에서 ${label} 을 못 찾았습니다.`); process.exit(1); }
    return html.slice(i, j);
}
const CODE = cut('const PARTNER_SITE_CHECKS = [', 'const PARTNER_SITE_FIELDS = [', '설치환경 체크 항목')
           + '\n' + cut('function partnerSiteChecksText(', '\n        function partnerHwTableText(', '글로 풀기');

const ctx = vm.createContext({ console, JSON, Array, String, Number, Object });
vm.runInContext(CODE + `
;globalThis.__t = { PARTNER_SITE_CHECKS, PARTNER_SITE_REMARKS, partnerSiteRows, partnerSiteDef, partnerSiteChecksText };`, ctx);
const t = vm.runInContext('__t', ctx);

console.log('\n[1] 의뢰서 내용이 그대로 들어갔는지');
ok(t.PARTNER_SITE_CHECKS.length === 7, '설치환경 체크 7항목');
ok(t.PARTNER_SITE_REMARKS.length === 5, '접수 전 안내문 5가지');
ok(t.PARTNER_SITE_CHECKS.every(c => c.cat && c.name && c.hint), '항목마다 구분 · 이름 · 안내문이 있다');
ok(/대당 콘센트 2구/.test(t.partnerSiteDef('power').hint), '전기 문구가 의뢰서대로다 (대당 2구)');
ok(/설치 불가/.test(t.partnerSiteDef('net').hint), '인터넷 미설치 시 설치 불가 안내');
ok(/인테리어 담당자에게 사전 요청/.test(t.partnerSiteDef('lan').hint), '랜선은 인테리어 사전 요청 안내');
ok(t.PARTNER_SITE_REMARKS.some(r => /5일 전/.test(r)), '영업일 기준 5일 전 접수 안내');
ok(t.PARTNER_SITE_REMARKS.some(r => /타공/.test(r)), '현장 타공 불가 안내');

console.log('\n[2] 값 읽기');
let r = t.partnerSiteRows('');
ok(r.length === 7 && r.every(x => !x.ok && x.note === ''), '처음에는 7항목 모두 미확인');
r = t.partnerSiteRows(JSON.stringify([{ id: 'power', ok: true, note: '콘센트 2구뿐' }, { id: 'net', ok: true }]));
ok(r[0].ok && r[0].note === '콘센트 2구뿐', '확인 표시와 특이사항을 그대로 읽는다');
ok(!r[1].ok, '적지 않은 항목은 미확인');
ok(t.partnerSiteRows('power,lan,net').slice(0, 3).every(x => x.ok), '예전 글자 값도 읽어 준다 (자료가 사라지지 않게)');

console.log('\n[3] 접수함에서 한눈에 보이는지');
const txt = t.partnerSiteChecksText(JSON.stringify([{ id: 'power', ok: true }, { id: 'net', ok: false, note: '6/1 개통 예정' }]));
ok(/확인 1 \/ 7/.test(txt), '몇 개 확인했는지 보여 준다');
ok(/미확인:/.test(txt) && /인터넷 설치 여부 확인/.test(txt), '확인 안 된 항목을 짚어 준다');
ok(/특이사항:/.test(txt) && /6\/1 개통 예정/.test(txt), '특이사항을 보여 준다');

console.log('\n[4] 발주 장비에 의뢰서 품목이 다 있는지');
for (const item of ['포스세트', '오더포스', '키오스크', '테이블오더', '주방프린터', '카드단말기', '설치비']) {
    ok(html.includes(`item: '${item}'`), `발주 장비에 ${item} 이(가) 있다`);
}

console.log('\n[5] 새 접수 구분 [장비설치의뢰서]');
{
    ok(/id: 'install', name: '장비설치의뢰서'/.test(html), "영업본부에 '장비설치의뢰서' 접수 구분이 있다");
    const i = html.indexOf("id: 'install', name: '장비설치의뢰서'");
    const seg = html.slice(i, i + 1400);
    ok(/PARTNER_SHOP_FIELDS/.test(seg), '가맹점 정보를 받는다');
    ok(/PARTNER_HW_FIELDS/.test(seg), '발주 장비를 받는다');
    ok(/PARTNER_SITE_FIELDS/.test(seg), '설치환경 체크를 받는다');
    ok(/PARTNER_INSTALL_FIELDS/.test(seg), '설치 희망일 · 시간을 받는다');
    ok(/io-plan/.test(seg), '매장 도면을 올릴 수 있다');
    ok(!/docsExtra:[\s\S]{0,400}required: true/.test(seg), '이미 계약된 곳이라 필수 서류를 새로 받지 않는다');

    const st = html.indexOf('const PARTNER_INSTALL_ORDER_STEPS');
    const stSeg = html.slice(st, st + 700);
    ok(/'가맹점 정보'/.test(stSeg) && /'발주 장비'/.test(stSeg) && /'설치환경 체크'/.test(stSeg), '단계가 의뢰서 순서와 같다');

    ok(/sales:install/.test(html), '파트너 아이디에 이 접수 구분 권한을 물려준다');
    // 파트너센터는 본부가 아니라 **업무 목록**(PARTNER_TASKS)으로 보여 줍니다.
    // 여기에 올리지 않으면 권한이 있어도 화면에 안 나옵니다.
    const ti = html.indexOf("{ id: 'sales:install', cat:");
    ok(ti > 0, '파트너센터 업무 목록에 올라가 있다 (이게 빠지면 화면에 안 나옴)');
    const tSeg = html.slice(ti, ti + 400);
    ok(/cat: 'hw'/.test(tSeg), "'장비' 분류에 들어간다");
    ok(/name: '장비설치의뢰서'/.test(tSeg), '이름이 장비설치의뢰서다');
    ok(/kw:.*설치/.test(tSeg), '검색어로도 찾을 수 있다');
}

console.log('\n[6] 거래 유형 칸이 없는 접수에서도 설치환경 체크가 보이는지');
{
    const vi = html.indexOf('function partnerFieldVisible(');
    const vEnd = html.indexOf('\n        }', vi) + 10;
    const c2 = vm.createContext({ String, Array });
    vm.runInContext(html.slice(vi, vEnd) + ';globalThis.vis = partnerFieldVisible;', c2);
    const vis = vm.runInContext('vis', c2);
    const f = { showIf: { key: 'custType', notIn: ['dist'] } };
    ok(vis(f, {}) === true, '거래 유형 칸이 없어도 보인다 (장비설치의뢰서)');
    ok(vis(f, { custType: 'franchise' }) === true, '프랜차이즈 신규 개설에서도 보인다');
    ok(vis(f, { custType: 'dist' }) === false, '하드웨어 유통에서는 안 보인다 (설치를 우리가 안 함)');
    ok(vis({ showIf: { key: 'x', in: ['a'] } }, { x: 'a' }) === true, '기존 in 조건도 그대로 동작한다');
}

console.log('\n[7] 설치환경 최종확인 (영업 · 운영)');
{
    ok(/PARTNER_SITE_CONFIRMERS/.test(html), '최종확인 주체가 정의돼 있다');
    const i = html.indexOf('const PARTNER_SITE_CONFIRMERS');
    const seg = html.slice(i, i + 400);
    ok(/'sales'[\s\S]{0,60}영업본부/.test(seg), '영업본부가 확인한다');
    ok(/'ops'[\s\S]{0,60}운영본부/.test(seg), '운영본부도 확인한다');
    ok(/function savePartnerSiteConfirm\(/.test(html), '확인 결과를 저장한다');
    const si = html.indexOf('function savePartnerSiteConfirm(');
    const sSeg = html.slice(si, si + 1200);
    ok(/canHandlePartnerIntake\(c\.dept\)/.test(sSeg), '그 본부 담당자만 체크할 수 있다');
    ok(/by: currentUserName/.test(sSeg) && /at: partnerNowStamp\(\)/.test(sSeg), '누가 언제 확인했는지 남긴다');
    ok(/x\.history/.test(sSeg), '접수 이력에도 남긴다');
    ok(/작성자 미확인/.test(html), '작성자가 확인 안 한 항목을 빨간 글씨로 짚어 준다');
}

console.log('\n[8] 운영본부 설치 요청 — 파트너 접수와 업무센터를 잇는 부분');
{
    ok(/function requestInstallFromIntake\(/.test(html), '설치 요청 기능이 있다');
    const i = html.indexOf('function requestInstallFromIntake(');
    const seg = html.slice(i, i + 4200);
    ok(/if \(x\.workId\)/.test(seg), '이미 넘긴 접수는 두 번 만들지 않는다');
    ok(/type: 'install'/.test(seg), '운영업무센터 장비설치 업무로 만든다');
    ok(/center: 'ops'/.test(seg), '운영본부 것으로 표시한다');
    ok(/siteCheck: rows\.map/.test(seg), '설치환경 체크 내용을 함께 넘긴다');
    ok(/siteConfirm:/.test(seg), '영업·운영 최종확인 내용도 넘긴다');
    ok(/installDevices: devices/.test(seg), '발주 장비를 넘긴다');
    ok(/installReqDate: ex\.installDate/.test(seg), '설치 희망일을 넘긴다');
    ok(/fromIntake: \{ id: x\.id/.test(seg), '원본 접수를 찾아갈 수 있게 표시를 남긴다');
    ok(/saveWorks\(\)/.test(seg) && /savePartnerIntakes\(\)/.test(seg), '업무와 접수를 모두 저장한다');
    ok(/notifyWorkIntake\('ops'/.test(seg), '운영본부에 알린다');
    ok(/x\.status === 'received'/.test(seg), '접수 상태를 처리중으로 올린다');
    ok(/설치환경 미확인/.test(seg), '미확인 항목이 있으면 넘기기 전에 알려 준다');
}

console.log('\n[9] 넘긴 업무가 업무센터에서 실제로 보이는지 (고객 연결)');
{
    ok(/function linkIntakeCustomer\(/.test(html), '가맹점을 고객사에 잇는 기능이 있다');
    const i = html.indexOf('function linkIntakeCustomer(');
    const seg = html.slice(i, i + 1800);
    ok(/custMatchKey\(c\.name, c\.businessNo\) === want/.test(seg), '사업자번호·상호로 이미 있는 고객을 먼저 찾는다 (중복 등록 방지)');
    ok(/customers\.push\(cust\)/.test(seg) && /saveCustomers\(\)/.test(seg), '없으면 새로 등록하고 저장한다');
    ok(/`ox-\$\{cust\.id\}`/.test(seg), '업무센터 고객 id 규칙(ox-고객id)에 맞춘다');
    ok(/customerIdCounter\+\+/.test(seg), '고객 번호를 이어서 쓴다');

    const ri = html.indexOf('function requestInstallFromIntake(');
    const rSeg = html.slice(ri, ri + 3500);
    ok(/const link = linkIntakeCustomer\(x\)/.test(rSeg), '업무를 만들기 전에 고객을 잇는다');
    ok(/customerId: link\.id/.test(rSeg), '업무에 그 고객을 연결한다 (이게 비면 조회가 안 됨)');
    ok(/if \(!link\.id\)/.test(rSeg), '가맹점명·사업자번호가 없으면 넘기지 않고 알려 준다');
    ok(/wcState\.ops\.customerId = link\.id/.test(rSeg), '운영업무센터를 열면 그 가맹점이 바로 조회돼 있다');
    ok(/activeType = 'install'/.test(rSeg), '장비설치 탭으로 맞춰 둔다');
    ok(/rememberWorkCenterCustomer\('ops', link\.id\)/.test(rSeg), '새로고침해도 그 가맹점이 유지된다');
}

console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
