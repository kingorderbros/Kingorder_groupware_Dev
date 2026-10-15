// 자료실 파일서버 입구 시험 (2026-10-15) — 사내망(http) 우선 · 외부 접속 옵션 · 본부 공용 계정.
// index.html 안의 실제 코드를 꺼내서 돌립니다.
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
const CONF = cut("const ARCHIVE_KEY = 'gwArchive.v1';", '// 자료실 설정을 고칠 수 있는 사람', '자료실 설정');
const LINK = cut('// 지금 화면이 https 인데', 'const ARCHIVE_VIA_KO', '접속 판단');

// saved: 저장돼 있던 설정 · proto: 그룹웨어 화면 프로토콜 · up: 닿는 주소 목록
function boot(saved, proto, up) {
    const ctx = vm.createContext({
        console, JSON, Array, String, Number, Object, Promise, setTimeout, clearTimeout, AbortController,
        location: { protocol: proto },
        fetch: (u) => (up.some(b => u.indexOf(b) === 0) ? Promise.resolve({}) : Promise.reject(new Error('down'))),
        __saved: saved
    });
    vm.runInContext(`
        var currentUserDept = 'sales', currentUserEmail = 'kim@kingorder.co.kr';
        function loadJsonStore(k, f) { return __saved === undefined ? f : __saved; }
        function saveJsonStore() { return true; }
        function deptName(id) { return ({ sales: '영업본부', ops: '운영본부' })[id] || id; }
    ` + CONF + LINK + `
    ;globalThis.__t = { get conf() { return archiveConf; }, get link() { return archiveLink; }, archiveMode, archiveMyAccount,
        archiveResolve, archiveUrlFor, archiveFolderVisible, setDept(d) { currentUserDept = d; } };`, ctx);
    return vm.runInContext('__t', ctx);
}

(async () => {
    const LAN = 'http://192.168.0.50', WAN = 'https://cloud.example.com';

    console.log('\n[1] 처음 설정 · 예전 설정 이어받기');
    let t = boot(undefined, 'https:', []);
    ok(t.conf.wanEnabled === false && t.conf.account === 'dept', '처음에는 외부 접속 꺼짐 · 본부 공용 계정');
    ok(t.archiveMode() === 'lan', '외부 접속이 꺼져 있으면 접속 방식은 사내망만');
    t = boot({ lanUrl: LAN, wanUrl: WAN, mode: 'auto' }, 'https:', []);
    ok(t.conf.wanEnabled === true, '예전 설정에 바깥 주소(자동)가 있었으면 외부 접속 켜진 것으로');
    t = boot({ lanUrl: LAN, wanUrl: WAN, mode: 'lan' }, 'https:', []);
    ok(t.conf.wanEnabled === false, '예전 설정이 사내망만이면 외부 접속 꺼진 것으로');
    t = boot({ lanUrl: LAN, deptAccounts: [1, 2] }, 'https:', []);
    ok(!Array.isArray(t.conf.deptAccounts), '잘못된 본부 계정 값은 버린다');

    console.log('\n[2] 사내망 http + 그룹웨어 https');
    t = boot({ lanUrl: LAN, wanEnabled: false }, 'https:', []);
    await t.archiveResolve();
    ok(t.link.state === 'nocheck' && t.link.url === LAN, '확인을 건너뛰고(nocheck) 사내망 주소로 연다');
    ok(t.archiveUrlFor('/영업본부') === LAN + '/index.php/apps/files/?dir=' + encodeURIComponent('/영업본부'), '폴더 바로가기 주소');
    t = boot({ lanUrl: LAN, wanUrl: WAN, wanEnabled: false, mode: 'wan' }, 'https:', [WAN]);
    await t.archiveResolve();
    ok(t.link.via === 'lan' && t.link.state === 'nocheck', '외부 접속이 꺼져 있으면 바깥 주소가 적혀 있어도 쓰지 않는다');
    t = boot({ lanUrl: '', wanEnabled: false }, 'https:', []);
    await t.archiveResolve();
    ok(t.link.state === 'unset', '사내망 주소가 없으면 unset');

    console.log('\n[3] 그룹웨어도 http 일 때 (사내 서버에 올린 경우) — 사내망을 직접 확인');
    t = boot({ lanUrl: LAN, wanEnabled: false }, 'http:', [LAN]);
    await t.archiveResolve();
    ok(t.link.state === 'ok' && t.link.via === 'lan', '닿으면 ok');
    t = boot({ lanUrl: LAN, wanEnabled: false }, 'http:', []);
    await t.archiveResolve();
    ok(t.link.state === 'down', '안 닿으면 down');

    console.log('\n[4] 외부 접속 켬');
    t = boot({ lanUrl: LAN, wanUrl: WAN, wanEnabled: true, mode: 'auto' }, 'https:', [WAN]);
    await t.archiveResolve();
    ok(t.link.state === 'ok' && t.link.via === 'wan', '자동 — 사내망(http)을 확인할 수 없으면 바깥이 닿을 때 바깥으로');
    t = boot({ lanUrl: LAN, wanUrl: WAN, wanEnabled: true, mode: 'auto' }, 'https:', []);
    await t.archiveResolve();
    ok(t.link.state === 'nocheck' && t.link.via === 'lan', '자동 — 바깥도 안 닿으면 사내망으로 열어 본다');
    t = boot({ lanUrl: LAN, wanUrl: WAN, wanEnabled: true, mode: 'wan' }, 'https:', [WAN]);
    await t.archiveResolve();
    ok(t.link.state === 'ok' && t.link.url === WAN, '바깥만');
    t = boot({ lanUrl: 'https://192.168.0.50', wanUrl: WAN, wanEnabled: true, mode: 'auto' }, 'https:', ['https://192.168.0.50']);
    await t.archiveResolve();
    ok(t.link.state === 'ok' && t.link.via === 'lan', '자동 — 사내망이 https 면 예전처럼 사내망을 먼저 확인');

    console.log('\n[5] 내 파일서버 계정');
    t = boot({ lanUrl: LAN, account: 'dept', deptAccounts: { sales: { loginId: 'nc_sales', memo: '비번은 본부장' } } }, 'https:', []);
    ok(t.archiveMyAccount().loginId === 'nc_sales' && t.archiveMyAccount().memo === '비번은 본부장', '본부 공용 — 내 본부 계정');
    t.setDept('ops');
    ok(t.archiveMyAccount().loginId === '', '본부 공용 — 등록 안 된 본부는 빈 값');
    t = boot({ lanUrl: LAN, account: 'personal', deptAccounts: { sales: { loginId: 'nc_sales' } } }, 'https:', []);
    ok(t.archiveMyAccount().loginId === 'kim@kingorder.co.kr', '개인 계정 — 로그인 이메일');
    ok(!/password|pw/i.test(JSON.stringify(t.conf)), '설정에 비밀번호 칸이 없다');

    console.log('\n[6] 폴더 바로가기 — 직원은 자기 본부 + 전사만');
    t = boot(undefined, 'https:', []);
    const seen = () => t.conf.folders.filter(t.archiveFolderVisible).map(f => f.name).join(',');
    ok(seen() === '공통자료,영업본부,양식 · 규정', '영업본부 직원 — 공통자료 · 영업본부 · 양식규정');
    t.setDept('ops');
    ok(seen() === '공통자료,운영본부,양식 · 규정', '운영본부 직원 — 공통자료 · 운영본부 · 양식규정');
    ok(t.archiveFolderVisible({ dept: 'ops' }) && !t.archiveFolderVisible({ dept: 'sales' }), '본부 칸에 id 를 적어도 맞춘다');
    ok(t.archiveFolderVisible({ dept: '' }) && t.archiveFolderVisible({ dept: '전사 공통' }), '빈칸 · 전사 공통은 모두에게');
    t.setDept('');
    ok(seen() === '공통자료,양식 · 규정', '본부가 없는 사람은 전사 폴더만');

    console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
    process.exit(fail ? 1 : 0);
})();
