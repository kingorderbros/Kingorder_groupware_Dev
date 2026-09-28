// 자료실 본부별 자료 시험 (2026-09-28) — index.html 안의 실제 코드를 꺼내서 돌립니다.
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
const CODE = cut('// ---------- 본부별 자료 (2026-09-28) ----------', '// 지금 화면이 https 인데', '본부별 자료');

// 조직도 · 로그인 사용자는 가짜로 둡니다
const ctx = vm.createContext({ console, JSON, Array, String, Number, Object });
vm.runInContext(`
    const DEPTS = [
        { id: 'sales', name: '영업본부' }, { id: 'ops', name: '운영본부' },
        { id: 'payment', name: '결제본부' }, { id: 'mgmt', name: '관리본부' }
    ];
    function orgDeptList() { return DEPTS; }
    function deptName(id) { const d = DEPTS.find(x => x.id === id); return d ? d.name : id; }
    var __admin = false, __mgr = false, currentUserDept = '';
    function isSystemAdmin() { return __admin; }
    function canManageAllData() { return __admin; }
    function canEditArchive() { return __admin || __mgr; }
    function __as(admin, mgr, dept) { __admin = admin; __mgr = mgr; currentUserDept = dept; }
` + CODE + `
;globalThis.__t = { __as, archivePostDept, archiveDeptOptions, archiveDeptName, archiveEditableDepts, canEditArchivePost };`, ctx);
const t = vm.runInContext('__t', ctx);

console.log('\n[1] 본부 목록');
ok(t.archiveDeptOptions()[0].id === 'company' && t.archiveDeptOptions()[0].name === '전사 공통', '맨 앞은 전사 공통');
ok(t.archiveDeptOptions().length === 5, '전사 공통 + 조직도 본부 4개');
ok(t.archivePostDept({ title: '예전 자료' }) === 'company', '본부가 없는 예전 자료는 전사 공통');
ok(t.archiveDeptName('payment') === '결제본부', '본부 이름을 조직도에서 읽는다');

console.log('\n[2] 관리자');
t.__as(true, false, 'admin');
ok(t.archiveEditableDepts().length === 5, '모든 본부에 올릴 수 있다');
ok(t.canEditArchivePost({ dept: 'ops' }), '다른 본부 자료도 고칠 수 있다');

console.log('\n[3] 영업본부 관리 가능자');
t.__as(false, true, 'sales');
ok(JSON.stringify(t.archiveEditableDepts()) === '["company","sales"]', '전사 공통과 영업본부에만 올릴 수 있다');
ok(t.canEditArchivePost({ dept: 'sales' }), '영업본부 자료는 고칠 수 있다');
ok(t.canEditArchivePost({}), '예전 자료(전사 공통)는 고칠 수 있다');
ok(!t.canEditArchivePost({ dept: 'payment' }), '결제본부 자료는 못 고친다');

console.log('\n[4] 관리 권한 없는 직원');
t.__as(false, false, 'sales');
ok(t.archiveEditableDepts().length === 0, '아무 본부에도 못 올린다');
ok(!t.canEditArchivePost({ dept: 'sales' }), '자기 본부 자료도 못 고친다');

console.log('\n[5] 화면');
ok(/id="arc-dept"/.test(html), '올리기 창에 본부 선택칸이 있다');
ok(/setArchiveDept\(/.test(html), '목록에 본부 고르기가 있다');

// [저장] 을 실제로 눌렀을 때 — 2026-09-29 'id' 를 선언 전에 읽어 저장 자체가 멈추던 것
console.log('\n[6] 저장 버튼');
{
    const i = html.indexOf('        function saveArchivePost() {');
    const SAVE = html.slice(i, html.indexOf('\n        function deleteArchivePost(', i));
    const saveCtx = vm.createContext({ console, JSON, Array, String, Number, Object, Date });
    vm.runInContext(`
        const __el = { 'arc-title': '회의록', 'arc-dept': 'sales', 'arc-id': '', 'arc-cat': 'doc', 'arc-body': '', 'arc-open': '1' };
        const document = { getElementById: id => id === 'arc-pin' ? { checked: false } : { value: __el[id], focus() {} } };
        var archivePosts = [], archiveDraftFiles = [], __alerts = [], __saved = 0, currentUserName = '홍길동';
        function alert(m) { __alerts.push(m); }
        function canEditArchive() { return true; }
        function archiveEditableDepts() { return ['company', 'sales']; }
        function archivePostById(id) { return archivePosts.find(x => x.id === id); }
        function archivePostDept(p) { return p.dept || 'company'; }
        function canEditArchivePost() { return true; }
        function reloadArchivePosts() {}
        function nextArchivePostId() { return 'A-1'; }
        function saveArchivePosts() { __saved++; return true; }
        function closeArchivePost() {} function renderArchive() {} function showAppToast() {}
    ` + SAVE + `
    ;globalThis.__s = () => { let err = ''; try { saveArchivePost(); } catch (e) { err = String(e); } return { err, n: archivePosts.length, saved: __saved, alerts: __alerts }; };`, saveCtx);
    const r = vm.runInContext('__s()', saveCtx);
    ok(!r.err, '저장 중 오류가 나지 않는다' + (r.err ? ' — ' + r.err : ''));
    ok(r.n === 1 && r.saved === 1, '새 자료가 목록에 들어가고 저장된다');
}

console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
