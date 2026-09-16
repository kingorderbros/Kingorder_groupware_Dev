#!/usr/bin/env node
/**
 * 목업(소스/Index_ver1.0.html) → 개발환경 index.html 변환 (2026-09-16)
 *
 *   node tools/strip-sample-data.js ../소스/Index_ver1.0.html index.html
 *
 * 하는 일
 *   1) 샘플 데이터(고객사 · 파트너사 · 계약 · 견적 · 업무 · 일정 · 프로젝트 · 협업티켓 · 인바운드 · 단가표 …)를 빈 배열로
 *   2) 사용자 목록은 관리자 1명만 남기고, 사용자 · 차량 목록을 저장소(kobStorage)에 남게 함
 *   3) 저장소 호출(localStorage.* · loadJsonStore/saveJsonStore)을 kobStorage(Supabase ↔ 로컬 폴백)로 갈아 끼움
 *   4) API_BASE 를 config/app-config.js 의 값으로
 *   5) 본체 스크립트를 <script type="text/x-kob-main"> 로 감싸, js/kob-store.js 가 저장소를 먼저 불러온 뒤 실행하게 함
 *
 * 원본(소스 폴더)은 건드리지 않습니다. 목업을 고친 뒤 다시 돌리면 개발환경 index.html 이 새로 만들어집니다.
 * (개발환경에서 index.html 을 직접 고쳤다면 이 스크립트를 다시 돌리기 전에 그 변경을 목업에도 반영해야 합니다)
 */
const fs = require('fs');
const path = require('path');

const [,, srcArg, outArg] = process.argv;
const SRC = path.resolve(srcArg || path.join(__dirname, '..', '..', '소스', 'Index_ver1.0.html'));
const OUT = path.resolve(outArg || path.join(__dirname, '..', 'index.html'));

// 2026-09-16 부터 개발환경 index.html 에만 있는 기능(로그인 비밀번호 · 조직도 admin 제외 …)이 생겼습니다.
// 이 스크립트는 목업에서 새로 뽑으므로 그 기능이 사라집니다. 알고 돌리는 경우에만 --force 를 붙입니다.
if (fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8').includes('js/kob-auth.js') && !process.argv.includes('--force')) {
    console.error('중단: ' + OUT + ' 에는 목업에 없는 개발환경 전용 기능(로그인 비밀번호 등)이 들어 있습니다.');
    console.error('  다시 뽑으면 그 기능이 사라집니다. 정말 덮어쓰려면 --force 를 붙이세요 (CHANGELOG.md 의 2026-09-16 항목 참고).');
    process.exit(2);
}

let html = fs.readFileSync(SRC, 'utf8');
const report = [];

// ---------- 도구 ----------
// NAME = [ ... ] 의 배열 리터럴 본문을 빈 배열로 바꿉니다 (대괄호 짝을 세어 끝을 찾음. 문자열 안의 괄호는 리터럴 시드에 없다는 전제)
function emptyArrayLiteral(startRegex, label) {
    const m = html.match(startRegex);
    if (!m) throw new Error('찾지 못함: ' + label);
    const openAt = m.index + m[0].length - 1;             // '[' 위치
    let depth = 0, i = openAt, inStr = null;
    for (; i < html.length; i++) {
        const ch = html[i];
        if (inStr) { if (ch === '\\') { i++; continue; } if (ch === inStr) inStr = null; continue; }
        if (ch === '\'' || ch === '"' || ch === '`') { inStr = ch; continue; }
        if (ch === '[') depth++;
        else if (ch === ']') { depth--; if (depth === 0) break; }
    }
    const body = html.slice(openAt + 1, i);
    const recs = (body.match(/^\s*\{/gm) || []).length;
    html = html.slice(0, openAt) + '[]' + html.slice(i + 1);
    report.push(`${label}: ${recs}건 → []`);
}
function replaceOnce(from, to, label) {
    const n = html.split(from).length - 1;
    if (n !== 1) throw new Error(`${label}: 한 번 있어야 하는데 ${n}번 있음`);
    html = html.replace(from, to);
    report.push(label);
}

// ---------- 1) 샘플 데이터 비우기 ----------
[
    ['pgFeeRecords', /^\s{8}let pgFeeRecords = \[/m],
    ['payDocRequests', /^\s{8}let payDocRequests = \[/m],
    ['partners', /^\s{8}let partners = \[/m],
    ['contracts', /^\s{8}let contracts = \[/m],
    ['quotes', /^\s{8}let quotes = \[/m],
    ['projects', /^\s{8}let projects = \[/m],
    ['supplyRecords', /^\s{8}let supplyRecords = \[/m],
    ['collabRequests', /^\s{8}let collabRequests = \[/m],
    ['inboundRecords', /^\s{8}let inboundRecords = \[/m],
    ['priceBook', /^\s{8}let priceBook = \[/m],
    ['schedules', /^\s{8}let schedules = \[/m],
    ['cases', /^\s{8}let cases = \[/m],
    ['myTodos', /^\s{8}let myTodos = \[/m],
    ['localTasks', /^\s{8}let localTasks = \[/m],
    ['customers', /^\s{8}let customers = \[/m],
    ['notices', /^\s{8}let notices = \[/m],
    ['vehicleReserves', /^\s{8}let vehicleReserves = \[/m],
    ['vehicleLogs', /^\s{8}let vehicleLogs = \[/m],
    ['salesMeetings(기본값)', /^\s{8}let salesMeetings = loadJsonStore\(MEETING_KEY, \[/m],
    ['salesIssues(기본값)', /^\s{8}let salesIssues = loadJsonStore\(ISSUE_KEY, \[/m],
    ['devRequests(기본값)', /^\s{8}let devRequests = loadJsonStore\(DEVREQ_KEY, \[/m],
    ['corpCards(기본값)', /^\s{8}let corpCards = loadJsonStore\(CORP_CARD_KEY, \[/m],
    ['cardBatches(기본값)', /^\s{8}let cardBatches = loadJsonStore\(CARD_BATCH_KEY, \[/m],
    ['cardTxns(기본값)', /^\s{8}let cardTxns = loadJsonStore\(CARD_TXN_KEY, \[/m]
].forEach(([label, re]) => emptyArrayLiteral(re, label));

// 업무센터 두 곳의 고객 · 업무 시드 (객체 속성)
['baseCustomers', 'works'].forEach(prop => {
    let guard = 0;
    while (true) {
        const re = new RegExp(`^\\s{16}${prop}: \\[(?!\\])`, 'm');
        if (!re.test(html)) break;
        emptyArrayLiteral(re, `WORK_CENTERS.${prop}`);
        if (++guard > 10) throw new Error('무한 반복: ' + prop);
    }
});

// 파트너 접수 · 자료실 시드 함수 → 빈 배열
{
    const s = html.indexOf('        function seedPartnerIntakes() {');
    const e = html.indexOf('\n        }\n', s) + '\n        }\n'.length;
    if (s < 0) throw new Error('seedPartnerIntakes 못 찾음');
    html = html.slice(0, s) + '        function seedPartnerIntakes() { return []; }   // 개발환경 — 시드 없음\n' + html.slice(e);
    report.push('seedPartnerIntakes → []');
}
replaceOnce(`            const seed = () => ([{
                id: 'AR-2609-001', cat: 'manual', title: '포스 사용 매뉴얼 (v2.1)',
                body: '포스 기본 사용법과 자주 묻는 설정을 정리했습니다.\\n설치 후 가맹점에 함께 전달해 주세요.',
                open: true, pin: true, by: '운영본부', at: '2026-09-10 09:00', files: [], hit: 0
            }]);`, `            const seed = () => ([]);   // 개발환경 — 시드 없음`, '자료실 시드 → []');

// 카드 사용내역 시드 도우미 — 시드가 없어졌으니 함수도 뺍니다
{
    const s = html.indexOf('        function seedCardTxn(');
    if (s < 0) throw new Error('seedCardTxn 못 찾음');
    const e = html.indexOf('\n        }\n', s) + '\n        }\n'.length;
    html = html.slice(0, s) + html.slice(e);
    report.push('seedCardTxn() 제거');
}

// ---------- 2) 사용자 · 차량 — 관리자 1명, 저장소에 남게 ----------
emptyArrayLiteral(/^\s{8}let localUsers = \[/m, 'localUsers');
replaceOnce('        let localUsers = [];',
`        // 개발환경 — 첫 로그인용 관리자 한 명만. 나머지는 사용자/권한관리에서 등록하며 저장소(gwUsers.v1)에 남습니다.
        const USERS_KEY = 'gwUsers.v1';
        let localUsers = loadJsonStore(USERS_KEY, [
            { id: 'u1', name: '관리자', dept: 'admin', team: '', rank: '관리자', email: 'admin@company.com', groupId: 'admin', level: 'admin',
              duty: '시스템 관리', phone: '', mobile: '', birthday: '', joinedAt: '', note: '초기 관리자 계정 — 실제 담당자를 등록한 뒤 지우거나 고치세요' }
        ]);
        function saveLocalUsers() { saveJsonStore(USERS_KEY, localUsers); }`, 'localUsers → 관리자 1명 + 저장');
// 초기 관리자(dept 'admin')는 시스템 계정이라 조직도에 그리지 않습니다 (사용자/권한관리 목록에는 나옵니다)
replaceOnce("        const ORG_HIDDEN_DEPTS = ['vendor'];",
`        // 'admin' — 개발환경의 초기 관리자 계정(시스템 계정)은 사람이 아니므로 조직도에 넣지 않습니다.
        //   사용자/권한관리 목록에는 그대로 나오므로 거기서 고치거나 지웁니다.
        const ORG_HIDDEN_DEPTS = ['vendor', 'admin'];`, '조직도에서 admin 계정 제외');
replaceOnce("        let userIdCounter = 17;", "        let userIdCounter = Math.max(2, ...localUsers.map(u => parseInt(String(u.id).replace(/\\D/g, ''), 10) + 1 || 2));", 'userIdCounter 보정');
replaceOnce(`                localUsers.push(Object.assign({ id: 'u' + userIdCounter++ }, data));
            }
            closeOrgEdit();`,
            `                localUsers.push(Object.assign({ id: 'u' + userIdCounter++ }, data));
            }
            saveLocalUsers();
            closeOrgEdit();`, 'localUsers 추가·수정 저장');
replaceOnce(`            localUsers = localUsers.filter(x => x.id !== id);`,
            `            localUsers = localUsers.filter(x => x.id !== id);
            saveLocalUsers();`, 'localUsers 삭제 저장');

emptyArrayLiteral(/^\s{8}let vehicles = \[/m, 'vehicles');
replaceOnce('        let vehicles = [];',
`        const VEHICLES_KEY = 'gwVehicles.v1';   // 개발환경 — 차량은 법인차량관리에서 등록하며 저장소에 남습니다 (모바일 운행일지 API 도 이 값을 읽습니다)
        let vehicles = loadJsonStore(VEHICLES_KEY, []);
        function saveVehicles() { saveJsonStore(VEHICLES_KEY, vehicles); }`, 'vehicles → 저장');
replaceOnce("        let vehicleIdCounter = 4;", "        let vehicleIdCounter = Math.max(1, ...vehicles.map(v => parseInt(String(v.id).replace(/\\D/g, ''), 10) + 1 || 1));", 'vehicleIdCounter 보정');
replaceOnce(`                alert('차량이 등록되었습니다.');
            }
            renderVehicles();`,
            `                alert('차량이 등록되었습니다.');
            }
            saveVehicles();
            renderVehicles();`, 'vehicles 추가·수정 저장');
replaceOnce(`            vehicles = vehicles.filter(x => x.id !== id);`,
            `            vehicles = vehicles.filter(x => x.id !== id);
            saveVehicles();`, 'vehicles 삭제 저장');

// 업무센터 첫 화면의 '미리 골라 둔 고객'(시드 o1 · s1)은 없으므로 비웁니다 — 고객을 조회하면 채워집니다
replaceOnce("            ops:   { customerId: 'o1', activeType: 'as',", "            ops:   { customerId: '', activeType: 'as',", '업무센터 기본 고객(ops) 비움');
replaceOnce("            sales: { customerId: 's1', activeType: 'activity',", "            sales: { customerId: '', activeType: 'activity',", '업무센터 기본 고객(sales) 비움');
// 관리자 계정 · 차량 목록은 처음 켤 때 저장소에 한 번 적어 둡니다 (법인차량 API 의 /api/drivers · /api/vehicles 가 읽는 값)
replaceOnce("        function saveLocalUsers() { saveJsonStore(USERS_KEY, localUsers); }",
            "        function saveLocalUsers() { saveJsonStore(USERS_KEY, localUsers); }\n        if (!kobStorage.getItem(USERS_KEY)) saveLocalUsers();", '관리자 계정 첫 저장');

// ---------- 3) 저장소 — 본체 스크립트 안의 localStorage → kobStorage ----------
const mainStart = html.indexOf('    <script>\n        // ==================== 운행내역 백엔드 API 설정');
const mainEnd = html.lastIndexOf('    </script>');
if (mainStart < 0 || mainEnd < 0 || mainEnd < mainStart) throw new Error('본체 스크립트 경계를 못 찾음');
let main = html.slice(mainStart, mainEnd + '    </script>'.length);
const before = (main.match(/localStorage\./g) || []).length;
main = main.replace(/\blocalStorage\./g, 'kobStorage.');
report.push(`본체 스크립트 localStorage.* ${before}곳 → kobStorage.*`);
// 본체를 실행 보류 스크립트로
main = main.replace(/^    <script>/, '    <script type="text/x-kob-main" id="kob-main">');
html = html.slice(0, mainStart) + main + html.slice(mainEnd + '    </script>'.length);

// API_BASE → 설정값
replaceOnce("        const API_BASE = '';", "        const API_BASE = (window.KOB_CONFIG && window.KOB_CONFIG.apiBase) || '';   // 개발환경 — config/app-config.js", 'API_BASE → 설정');

// 화면 판 표시에 환경 이름
replaceOnce("            document.querySelectorAll('.js-pc-build').forEach(el => { el.textContent = PC_BUILD; });",
            "            document.querySelectorAll('.js-pc-build').forEach(el => { el.textContent = PC_BUILD + ((window.KOB_CONFIG || {}).env ? ` · ${window.KOB_CONFIG.env}` : ''); });", '화면 판에 환경 이름');

// 저장소 부트스트랩 스크립트 태그 (본체 앞)
replaceOnce('    <script type="text/x-kob-main" id="kob-main">',
`    <!-- 개발환경 — 설정 · 저장소 부트스트랩. 저장소(Supabase 또는 로컬)를 먼저 불러온 뒤 아래 본체를 실행합니다. -->
    <script src="config/app-config.js"></script>
    <script src="js/kob-store.js"></script>
    <script type="text/x-kob-main" id="kob-main">`, '부트스트랩 태그');

// ---------- 4) 단일 파일 표시 · 제목 ----------
html = html.replace(/<title>[^<]*<\/title>/, '<title>킹오더브라더스 그룹웨어 (개발환경)</title>');

fs.writeFileSync(OUT, html, 'utf8');
console.log(`만들었습니다 → ${OUT}\n  ${(fs.statSync(SRC).size / 1048576).toFixed(2)}MB → ${(fs.statSync(OUT).size / 1048576).toFixed(2)}MB`);
report.forEach(r => console.log('  · ' + r));
