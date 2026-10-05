// 파트너센터 보안(S1~S7) · 회원가입 · 승인 시험 (2026-10-05)
//   [1~4] functions/api/_signup.js 판단만
//   [5~]  functions/api/[[route]].js 를 가짜 Supabase(tools/mock-supabase.js) 위에서 그대로 — 가입 → 승인 → 로그인 → 임시 비밀번호 → 잠금 …
const { makeMock } = require('./mock-supabase.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

(async () => {
    const S = await import('../functions/api/_signup.js');
    const P = await import('../functions/api/_partner.js');

    console.log('\n[1] 비밀번호 규칙 · 임시 비밀번호');
    ok(S.passwordProblem('Abcd1234!x', 'kim01') === '', '10자 · 4종류 → 통과');
    ok(S.passwordProblem('abcd1234!x', 'kim01') === '', '소문자 · 숫자 · 특수 3종류 → 통과');
    ok(/10자/.test(S.passwordProblem('Ab1!', 'x')), '10자 미만 거절');
    ok(/3종류/.test(S.passwordProblem('abcdefghij', 'x')), '한 종류뿐이면 거절');
    ok(/3종류/.test(S.passwordProblem('abcdefgh12', 'x')), '두 종류면 거절');
    ok(/아이디/.test(S.passwordProblem('Kim01Kim01!!', 'kim01')), '아이디가 들어가면 거절');
    const tps = Array.from({ length: 30 }, () => S.tempPassword());
    ok(tps.every(t => t.length === 12 && S.passwordProblem(t, 'ptn00001') === ''), '임시 비밀번호 30개 모두 12자 · 규칙 통과');
    ok(new Set(tps).size === 30 && tps.every(t => !/[0O1lI]/.test(t)), '모두 다르고 헷갈리는 글자 없음');

    console.log('\n[2] 실패 잠금');
    let g = {}, r;
    for (let i = 1; i <= 4; i++) { r = S.guardFail(g, 'Kim01', 1000); g = r.guard; }
    ok(!r.locked && r.fails === 4 && !S.guardState(g, 'kim01', 1000).locked, '4번까지는 안 잠김 (아이디 대소문자 무시)');
    r = S.guardFail(g, 'kim01', 2000); g = r.guard;
    ok(r.locked && S.guardState(g, 'kim01', 2000 + 9 * 60000).locked, '5번째에 잠기고 10분 동안 유지');
    ok(!S.guardState(g, 'kim01', 2000 + 10 * 60000 + 1).locked, '10분 지나면 풀림');
    r = S.guardFail(g, 'kim01', 2000 + 11 * 60000);
    ok(r.fails === 1 && !r.locked, '풀린 뒤 다시 틀리면 1번부터');
    ok(!('kim01' in S.guardClear(g, 'KIM01')), '잠금 해제');

    console.log('\n[3] 가입 신청 확인');
    const parent = { id: 'p17', name: '오케팅홀딩스', kind: 'partner' };
    const base = { kind: 'partnerShop', parentId: 'p17', name: '역삼점', businessNo: '2201120003', ceo: '최사장', contactName: '최사장', phone: '010-1111-0003',
                   email: 'a@b.co', loginId: 'yeoksam1', pw: 'Abcd1234!x', pw2: 'Abcd1234!x', consents: { privacy: true, parentShare: true } };
    const ctx = { accounts: [{ loginId: 'taken1' }], signups: [{ id: 'SU-0007', status: 'pending', loginId: 'wait01' }], parent, nowMs: Date.parse('2026-10-05T01:00:00Z'), ip: '1.2.3.4' };
    r = S.validateSignup(base, ctx);
    ok(r.rec && r.rec.id === 'SU-0008' && r.rec.status === 'pending' && r.rec.company.businessNo === '220-11-20003', '정상 신청 → 승인대기 · 번호 이어짐 · 사업자번호 모양 맞춤');
    ok(r.rec.parentId === 'p17' && r.rec.parentName === '오케팅홀딩스' && r.rec.consents.parentShare === true && r.rec.consents.version, '소속 · 제공 동의 · 동의 판');
    ok(!('pw' in r.rec) && !('pw2' in r.rec), '신청서에 평문 비밀번호 없음');
    const bad = (patch, re, m) => { const x = S.validateSignup(Object.assign({}, base, patch), ctx); ok(x.error && re.test(x.error), m + ' — ' + (x.error || '통과해 버림')); };
    bad({ kind: 'zzz' }, /유형/, '모르는 유형');
    bad({ parentId: '' }, /소속/, '소속 없이 파트너사 가맹점');
    bad({ parentId: 'p99' }, /찾지 못/, '다른 소속 id');
    bad({ businessNo: '123' }, /10자리/, '사업자번호 자릿수');
    bad({ loginId: 'Ab' }, /4~20/, '아이디 규칙');
    bad({ loginId: 'ptn00009' }, /ptn/, 'ptn 으로 시작');
    bad({ loginId: 'taken1' }, /이미 쓰고/, '이미 있는 아이디');
    bad({ loginId: 'wait01' }, /신청 중/, '신청 중인 아이디');
    bad({ pw: 'short', pw2: 'short' }, /10자/, '약한 비밀번호');
    bad({ pw2: 'Abcd1234!y' }, /확인/, '비밀번호 확인 다름');
    bad({ consents: { privacy: false } }, /동의/, '필수 동의 없음');
    bad({ phone: '12' }, /연락처/, '연락처');
    bad({ name: 'x'.repeat(101) }, /길/, '너무 긴 상호');
    r = S.validateSignup(Object.assign({}, base, { kind: 'direct', parentId: 'p17' }), ctx);
    ok(r.rec && r.rec.parentId === '' && r.rec.consents.parentShare === false, '개인 가맹점은 소속 · 제공 동의를 두지 않음');
    let rate = {};
    for (let i = 0; i < 5; i++) { const x = S.rateCheck(rate, '9.9.9.9', 1000 + i); rate = x.rate; }
    ok(!S.rateCheck(rate, '9.9.9.9', 2000).ok && S.rateCheck(rate, '8.8.8.8', 2000).ok && S.rateCheck(rate, '9.9.9.9', 1000 + 3600001).ok, '같은 IP 1시간 5번까지 · 다른 IP · 1시간 뒤');
    ok(JSON.stringify(S.parentSearch([parent, { id: 'h1', name: '오케이본사', kind: 'hq' }], 'partner', '오케')) === '[{"id":"p17","name":"오케팅홀딩스"}]', '상위업체 찾기: 유형 · 상호만');
    ok(S.parentSearch([parent], 'partner', '오').length === 0 && S.parentSearch([parent], 'direct', '오케팅').length === 0, '한 글자 · 다른 유형은 빈 목록');

    console.log('\n[4] 승인 · 반려 · 상위업체 권한');
    const su = Object.assign({}, S.validateSignup(base, ctx).rec, await P.hashPassword('Abcd1234!x'));
    let ap = S.approveSignup(su, { companyId: 'c9', by: 'daniel@k.co', firstOfCompany: true });
    ok(ap.company.id === 'c9' && ap.company.kind === 'partnerShop' && ap.company.parentId === 'p17' && ap.company.consentParentShare === true && ap.company.type === '잠재고객', '새 업체: 유형 · 소속 · 제공 동의 · 가맹점 기본값');
    ok(ap.account.loginId === 'yeoksam1' && ap.account.id === 'yeoksam1' && ap.account.partnerId === 'c9' && ap.account.role === 'admin' && ap.account.pwHash === su.pwHash && !ap.account.mustChangePw, '아이디: 업체관리자 · 신청 때 비밀번호 그대로');
    ok(ap.menus.includes('ops:as') && !ap.menus.includes('sales:newshop'), '가맹점 메뉴 묶음');
    ok(ap.signup.status === 'approved' && !('pwHash' in ap.signup), '신청서는 승인 · 비밀번호 칸 지움');
    ap = S.approveSignup(su, { existing: { id: 'c3', name: '역삼 김밥', kind: 'partnerShop', memo: '사내' }, by: 'x' });
    ok(ap.company.id === 'c3' && ap.company.name === '역삼 김밥' && ap.company.memo === '사내' && ap.company.consentParentShare === true, '기존 업체 연결: 업체 정보는 그대로 · 동의만 더함');
    const rj = S.rejectSignup(su, '사업자번호 확인 필요', 'x');
    ok(rj.status === 'rejected' && rj.reason === '사업자번호 확인 필요' && !('pwHash' in rj), '반려: 사유 · 비밀번호 지움');
    const co = { id: 'p17', kind: 'partner', allowShopApproval: true };
    ok(S.parentMayApprove({ parentApprove: true }, co, { role: 'admin' }), '전체 스위치 · 업체 설정 · 업체관리자 → 승인 가능');
    ok(!S.parentMayApprove({}, co, { role: 'admin' }) && !S.parentMayApprove({ parentApprove: true }, Object.assign({}, co, { allowShopApproval: false }), { role: 'admin' })
       && !S.parentMayApprove({ parentApprove: true }, co, { role: 'staff' }) && !S.parentMayApprove({ parentApprove: true }, Object.assign({}, co, { kind: 'direct' }), { role: 'admin' }), '셋 중 하나라도 빠지면 불가');
    const pv = S.parentSignupView([su, Object.assign({}, su, { id: 'SU-2', parentId: 'p99' }), Object.assign({}, su, { id: 'SU-3', consents: { parentShare: false } })], 'p17');
    ok(pv.length === 2 && pv[0].phone === '010-1111-0003' && pv[1].phone === '' && !('pwHash' in pv[0]), '상위업체에게는 자기 소속만 · 연락처는 동의했을 때만');

    // ================= 서버 그대로 =================
    console.log('\n[5] 서버 — 가입 신청 → 승인대기 로그인 → 직원 승인 → 로그인');
    const mock = makeMock({
        store: {
            'gwUsers.v1': [{ email: 'daniel@kingorder.co.kr', groupId: 'admin' }, { email: 'sales@kingorder.co.kr', groupId: 'sales' }],
            'gwPermissionGroups.v2': { groups: [{ id: 'sales', permissions: ['sales-home'] }] },
            'gwPartnersMigrated.v1': { at: 'x' },
            'gwPartnerAccounts.v1': [{ loginId: 'okt01', partnerId: 'p17', active: true, role: 'admin', ...(await P.hashPassword('Oldpass123!', null, 10000)) }],
            'gwPartnerIntakes.v1': []
        },
        tables: { customers: [
            { id: 'p17', data: { id: 'p17', name: '오케팅홀딩스', kind: 'partner', custType: 'partner' } },
            { id: 'h1', data: { id: 'h1', name: '맛나치킨 본사', kind: 'hq' } },
            { id: 'c4', data: { id: 'c4', name: '기존가게', kind: 'partnerShop', parentId: 'p17', bizNo: '220-11-55555', businessNo: '220-11-55555' } }
        ] },
        tokens: { 'tok-admin': 'daniel@kingorder.co.kr', 'tok-sales': 'sales@kingorder.co.kr' }
    });
    global.fetch = mock.fetch;
    const { onRequest } = await import('../functions/api/[[route]].js');
    const call = async (method, path, body, token, ip) => {
        const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '1.1.1.1' };
        if (token) headers.Authorization = 'Bearer ' + token;
        const res = await onRequest({ request: new Request('https://gw' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env: mock.env });
        return Object.assign({ status: res.status }, await res.json().catch(() => ({})));
    };
    let x = await call('GET', '/api/partner/signup/parents?kind=partner&q=오케');
    ok(x.ok && x.list.length === 1 && x.list[0].id === 'p17' && !('kind' in x.list[0]), '상위업체 찾기 (로그인 없이 · 상호만)');
    x = await call('GET', '/api/partner/signup/config');
    ok(x.ok && x.turnstileSiteKey === '', '봇 확인 키가 없으면 빈 값 (dev)');
    const form = Object.assign({}, base, { loginId: 'newshop1' });
    x = await call('POST', '/api/partner/signup', form);
    ok(x.ok && x.id === 'SU-0001', '가입 신청 → SU-0001');
    let sl = mock.get('gwPartnerSignups.v1');
    ok(sl.length === 1 && sl[0].status === 'pending' && sl[0].pwHash && sl[0].pwIter === 100000 && !sl[0].pw, '서버에 승인대기 · 비밀번호는 10만 회 암호화만');
    x = await call('POST', '/api/partner/signup', form);
    ok(!x.ok && /신청 중/.test(x.error), '같은 아이디로 또 신청 불가');
    x = await call('POST', '/api/partner/login', { loginId: 'newshop1', pw: 'Abcd1234!x' });
    ok(!x.ok && x.pending && /승인을 기다/.test(x.error), '승인 전 로그인 → 승인 대기 안내');
    x = await call('POST', '/api/partner/login', { loginId: 'newshop1', pw: 'Wrong1234!x' });
    ok(!x.ok && !x.pending, '비밀번호가 틀리면 승인 대기 여부를 알려 주지 않음');
    x = await call('POST', '/api/partner-admin/signup-decide', { id: 'SU-0001', decision: 'approve' }, 'tok-sales');
    ok(x.status === 403, "'partner-ids' 권한이 없는 직원은 승인 불가");
    x = await call('POST', '/api/partner-admin/signup-decide', { id: 'SU-0001', decision: 'approve' });
    ok(x.status === 401, '로그인 안 한 사람도 불가');
    x = await call('POST', '/api/partner-admin/signup-decide', { id: 'SU-0001', decision: 'approve' }, 'tok-admin');
    ok(x.ok && x.companyId === 'c5' && x.loginId === 'newshop1', '관리자 승인 → 새 업체 c5 (c 번호 이어짐)');
    const c5 = mock.row('customers', 'c5');
    ok(c5 && c5.kind === 'partnerShop' && c5.parentId === 'p17' && c5.consentParentShare === true && c5.__rev === 1, '업체 표에 새 줄 (유형 · 소속 · 제공 동의)');
    const acc = mock.get('gwPartnerAccounts.v1').find(a => a.loginId === 'newshop1');
    ok(acc && acc.partnerId === 'c5' && acc.role === 'admin' && acc.id === 'newshop1', '아이디가 생김 (업체관리자 · id)');
    ok(mock.get('gwPartnerAccounts.v1').every(a => a.id), '목록의 모든 아이디에 id (저장 계층 합치기용)');
    ok(Array.isArray(mock.get('gwPartnerDeptPerm.v1').newshop1), '메뉴 권한도 생김');
    ok(mock.get('gwPartnerSignups.v1')[0].status === 'approved' && !mock.get('gwPartnerSignups.v1')[0].pwHash, '신청서 승인 · 비밀번호 칸 지움');
    x = await call('POST', '/api/partner-admin/signup-decide', { id: 'SU-0001', decision: 'approve' }, 'tok-admin');
    ok(!x.ok && /이미 처리/.test(x.error), '두 번 승인 불가');
    x = await call('POST', '/api/partner/login', { loginId: 'newshop1', pw: 'Abcd1234!x' });
    ok(x.ok && x.token && x.session.partnerId === 'c5' && x.session.mustChangePw === false, '승인 뒤 신청 때 비밀번호로 로그인');
    const tokShop = x.token;
    x = await call('GET', '/api/partner/boot', undefined, tokShop);
    ok(x.ok && x.store['gwPartners.v1'][0].id === 'c5', '자료 받기 — 자기 업체');

    console.log('\n[6] 서버 — 기존 업체 연결 · 반려');
    x = await call('POST', '/api/partner/signup', Object.assign({}, form, { loginId: 'oldshop1', businessNo: '220-11-55555', consents: { privacy: true, parentShare: false } }), null, '2.2.2.2');
    ok(x.ok && mock.get('gwPartnerSignups.v1').find(s => s.id === x.id).existingCompanyId === 'c4', '같은 사업자번호 업체를 찾아 둠');
    const sidOld = x.id;
    x = await call('POST', '/api/partner-admin/signup-decide', { id: sidOld, decision: 'approve', linkCompanyId: 'c4' }, 'tok-admin');
    ok(x.ok && x.companyId === 'c4' && mock.row('customers', 'c4').__rev === 2 && mock.row('customers', 'c4').name === '기존가게', '기존 업체에 연결 — 판 번호 올림 · 업체 정보 그대로');
    x = await call('POST', '/api/partner/signup', Object.assign({}, form, { loginId: 'reject01' }), null, '3.3.3.3');
    const sidRej = x.id;
    x = await call('POST', '/api/partner-admin/signup-decide', { id: sidRej, decision: 'reject', reason: '사업자 확인 불가' }, 'tok-admin');
    ok(x.ok, '반려');
    x = await call('POST', '/api/partner/login', { loginId: 'reject01', pw: 'Abcd1234!x' });
    ok(!x.ok && /반려/.test(x.error) && /사업자 확인 불가/.test(x.error), '반려된 아이디로 로그인 → 반려 사유 안내');

    console.log('\n[7] 서버 — 실패 잠금 · 잠금 해제 · 기록');
    for (let i = 1; i <= 4; i++) x = await call('POST', '/api/partner/login', { loginId: 'okt01', pw: 'Wrong' + i });
    ok(!x.ok && /4\/5/.test(x.error), '틀릴 때마다 몇 번째인지 알림');
    x = await call('POST', '/api/partner/login', { loginId: 'okt01', pw: 'Wrong5' });
    ok(!x.ok && x.locked, '5번째에 잠김');
    x = await call('POST', '/api/partner/login', { loginId: 'okt01', pw: 'Oldpass123!' });
    ok(!x.ok && x.locked && /분 뒤/.test(x.error), '잠긴 동안은 맞는 비밀번호도 거절');
    x = await call('POST', '/api/partner-admin/unlock', { loginId: 'okt01' }, 'tok-admin');
    ok(x.ok, '직원이 잠금 해제');
    x = await call('POST', '/api/partner/login', { loginId: 'okt01', pw: 'Oldpass123!' });
    ok(x.ok, '해제 뒤 로그인');
    const okt = mock.get('gwPartnerAccounts.v1').find(a => a.loginId === 'okt01');
    ok(okt.pwIter === 100000 && P.LEGACY_ITER === 10000, '예전 1만 회 비밀번호는 로그인 때 10만 회로 바뀜 (S5)');
    const au = mock.get('gwPartnerAudit.v1');
    ok(au.some(e => e.action === 'login' && e.ok === false && /잠금/.test(e.note)) && au.some(e => e.action === 'unlock' && e.by === 'daniel@kingorder.co.kr')
       && au.some(e => e.action === 'signup-approve') && au.some(e => e.action === 'signup') && au.every(e => e.at && e.ip), '기록: 실패 · 잠금 · 해제 · 가입 · 승인 (때 · IP)');

    console.log('\n[8] 서버 — 임시 비밀번호 · 첫 로그인 변경 · 본인 변경');
    x = await call('POST', '/api/partner-admin/temp-password', { loginId: 'okt01' }, 'tok-admin');
    ok(x.ok && x.password && x.password.length === 12 && x.account.mustChangePw === true && x.account.tempPwUntil, '임시 비밀번호 — 12자 · 한 번만 돌려줌 · 72시간');
    const temp = x.password;
    ok(!JSON.stringify(mock.store.get('gwPartnerAccounts.v1')).includes(temp), '서버에는 임시 비밀번호 평문이 없음');
    x = await call('POST', '/api/partner/login', { loginId: 'okt01', pw: 'Oldpass123!' });
    ok(!x.ok, '예전 비밀번호는 더 안 됨');
    x = await call('POST', '/api/partner/login', { loginId: 'okt01', pw: temp });
    ok(x.ok && x.session.mustChangePw === true, '임시 비밀번호로 로그인 → 바꿔야 함 표시');
    const tokOkt = x.token;
    x = await call('GET', '/api/partner/boot', undefined, tokOkt);
    ok(x.status === 403 && x.mustChange && x.session.loginId === 'okt01', '바꾸기 전에는 자료 받기 막힘 (S4)');
    x = await call('POST', '/api/partner/save', { key: 'gwPartnerIntakes.v1', upserts: [{ id: 'PI-1' }] }, tokOkt);
    ok(x.status === 403, '저장도 막힘');
    x = await call('POST', '/api/partner/password', { current: temp, next: 'short' }, tokOkt);
    ok(!x.ok && /10자/.test(x.error), '새 비밀번호도 규칙 검사');
    x = await call('POST', '/api/partner/password', { current: 'nope', next: 'Newpass123!x' }, tokOkt);
    ok(!x.ok && /지금 비밀번호/.test(x.error), '지금 비밀번호가 틀리면 거절');
    x = await call('POST', '/api/partner/password', { current: temp, next: 'Newpass123!x' }, tokOkt);
    ok(x.ok, '임시 → 새 비밀번호');
    x = await call('GET', '/api/partner/boot', undefined, tokOkt);
    ok(x.ok, '바꾼 뒤에는 자료 받기 됨');
    x = await call('POST', '/api/partner/login', { loginId: 'okt01', pw: 'Newpass123!x' });
    ok(x.ok && x.session.mustChangePw === false, '새 비밀번호로 로그인');
    // 기간 지난 임시 비밀번호
    x = await call('POST', '/api/partner-admin/temp-password', { loginId: 'newshop1' }, 'tok-admin');
    const temp2 = x.password;
    const accs = mock.get('gwPartnerAccounts.v1'); accs.find(a => a.loginId === 'newshop1').tempPwUntil = '2020-01-01T00:00:00Z'; mock.store.set('gwPartnerAccounts.v1', accs);
    x = await call('POST', '/api/partner/login', { loginId: 'newshop1', pw: temp2 });
    ok(!x.ok && /기간/.test(x.error), '72시간 지난 임시 비밀번호는 거절');

    console.log('\n[9] 서버 — 상위업체(파트너사) 승인 · 소속 가맹점 연락처');
    x = await call('POST', '/api/partner/signup', Object.assign({}, form, { loginId: 'byparent1', businessNo: '2201199999' }), null, '4.4.4.4');
    const sidP = x.id;
    let tokP = (await call('POST', '/api/partner/login', { loginId: 'okt01', pw: 'Newpass123!x' })).token;
    x = await call('GET', '/api/partner/boot', undefined, tokP);
    ok(x.ok && !('gwPartnerShopSignups.v1' in x.store) && x.store['gwPartnerMe.v1'].canApproveShops === false, '스위치가 꺼져 있으면 상위업체에 신청 목록이 안 감');
    x = await call('POST', '/api/partner/signup-decide', { id: sidP, decision: 'approve' }, tokP);
    ok(x.status === 403, '꺼져 있으면 상위업체 승인 불가');
    mock.store.set('gwPartnerSignupPolicy.v1', { parentApprove: true });
    const p17 = mock.tables.get('customers').get('p17'); p17.data.allowShopApproval = true;
    x = await call('GET', '/api/partner/boot', undefined, tokP);
    const ss = x.store['gwPartnerShopSignups.v1'];
    ok(Array.isArray(ss) && ss.length === 1 && ss[0].id === sidP && ss[0].phone === '010-1111-0003' && !('pwHash' in ss[0]), '켜면 업체관리자에게 자기 소속 신청만 (제공 동의 → 연락처)');
    x = await call('POST', '/api/partner/signup-decide', { id: sidP, decision: 'approve' }, tokP);
    ok(x.ok && mock.row('customers', x.companyId).parentId === 'p17' && mock.get('gwPartnerSignups.v1').find(s => s.id === sidP).decidedBy === 'partner:okt01', '상위업체 승인 → 그 업체 소속으로 · 누가 승인했는지 기록');
    x = await call('GET', '/api/partner/boot', undefined, tokP);
    const shops = x.store['gwPartnerShops.v1'];
    const c5s = shops.find(c => c.id === 'c5'), c4s = shops.find(c => c.id === 'c4');
    ok(c5s && c5s.phone === '010-1111-0003' && c4s && !('phone' in c4s), '소속 가맹점 연락처는 제공 동의한 곳만 (c5 동의 · c4 기존 업체는 동의 안 함)');
    // 업체관리자가 아닌 아이디
    const accs2 = mock.get('gwPartnerAccounts.v1'); accs2.find(a => a.loginId === 'okt01').role = 'staff'; mock.store.set('gwPartnerAccounts.v1', accs2);
    x = await call('POST', '/api/partner/signup', Object.assign({}, form, { loginId: 'byparent2', businessNo: '2201188888' }), null, '5.5.5.5');
    const sidP2 = x.id;
    x = await call('POST', '/api/partner/signup-decide', { id: sidP2, decision: 'approve' }, tokP);
    ok(x.status === 403, '업체관리자가 아니면 승인 불가');
    accs2.find(a => a.loginId === 'okt01').role = 'admin'; mock.store.set('gwPartnerAccounts.v1', accs2);
    x = await call('POST', '/api/partner/signup', Object.assign({}, form, { loginId: 'other01', businessNo: '2201177777', kind: 'franchise', parentId: 'h1' }), null, '6.6.6.6');
    x = await call('POST', '/api/partner/signup-decide', { id: x.id, decision: 'approve' }, tokP);
    ok(x.status === 403 && /소속 신청이 아닙/.test(x.error), '다른 업체 소속 신청은 승인 불가');

    console.log('\n[10] 서버 — 가입 횟수 제한');
    let last;
    for (let i = 0; i < 6; i++) last = await call('POST', '/api/partner/signup', Object.assign({}, form, { loginId: 'spam' + i + 'x', businessNo: '22011' + String(10000 + i) }), null, '7.7.7.7');
    ok(last.status === 429, '같은 IP 에서 1시간 6번째 신청은 429');

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
