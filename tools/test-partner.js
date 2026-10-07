// 파트너센터 서버 통로 시험 (2026-09-28 · 자료 보호 2단계) — functions/api/_partner.js 판단만.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

(async () => {
    const P = await import('../functions/api/_partner.js');
    const SECRET = 'service-role-secret';

    console.log('\n[1] 비밀번호');
    const h = await P.hashPassword('abcd1234');
    ok(h.pwHash.length === 64 && h.pwSalt.length === 32 && h.pwIter === P.PBKDF2_ITER, 'PBKDF2 결과 · 소금 · 횟수를 남긴다');
    ok((await P.checkPassword(h, 'abcd1234')).ok, '맞는 비밀번호');
    ok(!(await P.checkPassword(h, 'abcd1235')).ok, '틀린 비밀번호');
    const old = await P.checkPassword({ pw: '1234' }, '1234');
    ok(old.ok && old.needUpgrade, '예전 평문도 받아 주고 암호화가 필요하다고 알린다');
    ok(!(await P.checkPassword({ pw: '' }, '')).ok, '비밀번호가 없는 계정은 로그인 불가');
    ok(!(await P.checkPassword({}, 'x')).ok, '비밀번호 칸이 아예 없어도 불가');

    console.log('\n[2] 토큰');
    const t = await P.makeToken(SECRET, 'p1', 'PA-1');
    const r = await P.readToken(SECRET, t);
    ok(r && r.loginId === 'p1' && r.partnerId === 'PA-1', '만든 토큰을 읽는다');
    ok(!(await P.readToken('other', t)), '다른 열쇠로 만든 것은 거절');
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ l: 'p2', p: 'PA-2', exp: 9999999999 })).toString('base64url') + '.' + sig;
    ok(!(await P.readToken(SECRET, forged)), '내용을 바꾸면 거절');
    ok(!(await P.readToken(SECRET, await P.makeToken(SECRET, 'p1', 'PA-1', Date.now() - 8 * 86400000))), '7일 지난 토큰은 거절');
    ok(!(await P.readToken(SECRET, 'garbage')), '엉터리 토큰은 거절');

    console.log('\n[3] 파트너가 받는 자료');
    const store = {
        'gwPartners.v1': [{ id: 'PA-1', name: '가나\n상사' }, { id: 'PA-2', name: '다라' }],
        'gwPartnerAccounts.v1': [{ loginId: 'p1', partnerId: 'PA-1', pwHash: 'h', pwSalt: 's', pwIter: 1 }, { loginId: 'p2', partnerId: 'PA-2', pw: '1234' }],
        'gwPartnerDeptPerm.v1': { p1: ['sales:new'], p2: ['ops:as'] },
        'gwPartnerIntakes.v1': [{ id: 'PI-1', partnerId: 'PA-1' }, { id: 'PI-2', partnerId: 'PA-2' }],
        'gwDevRequests.v1': [{ id: 'D1', partnerId: 'PA-1', status: 'working' }, { id: 'D2', partnerId: 'PA-1', status: 'draft' }, { id: 'D3', partnerId: 'PA-2' }, { id: 'D4', partnerName: '가나 상사', status: 'done' }],
        // 실제 저장 모양 — { seq, records } (2026-09-28 검토: 배열로 시험해서 버그를 놓쳤음)
        'gwInboundRecords.v1': { seq: 3, records: [{ id: 'IN-0001', vendor: '가나 상사' }, { id: 'IN-0002', vendor: '다라' }] },
        'gwArchivePosts.v1': [{ id: 'A1', open: true }, { id: 'A2', open: false }],
        'gwUsers.v1': [{ email: 'staff@k.co' }],
        'gwOrgDepts.v1': [{ id: 'sales' }]
    };
    const f = P.findAccount(store['gwPartnerAccounts.v1'], store['gwPartners.v1'], 'P1');
    ok(f && f.partnerName === '가나 상사', '계정 찾기 · 파트너사 이름(줄바꿈은 띄어쓰기)');
    const me = { loginId: 'p1', partnerId: 'PA-1', partnerName: f.partnerName };
    const v = P.partnerView(store, me);
    ok(!('gwUsers.v1' in v), '직원 목록은 내려가지 않는다');
    ok(v['gwPartners.v1'].length === 1 && v['gwPartners.v1'][0].id === 'PA-1', '파트너사는 자기 것만');
    ok(v['gwPartnerAccounts.v1'].length === 1 && !('pwHash' in v['gwPartnerAccounts.v1'][0]) && !('pw' in v['gwPartnerAccounts.v1'][0]), '계정은 자기 것만 · 비밀번호 칸 없음');
    ok(JSON.stringify(v['gwPartnerDeptPerm.v1']) === '{"p1":["sales:new"]}', '권한은 자기 아이디만');
    ok(v['gwPartnerIntakes.v1'].map(x => x.id).join() === 'PI-1', '접수는 자기 것만');
    ok(v['gwDevRequests.v1'].map(x => x.id).join() === 'D1,D4', '개발의뢰는 자기 것만 · 작성 중(draft) 제외 · 옛 자료는 이름으로');
    ok(v['gwInboundRecords.v1'].records.map(x => x.id).join() === 'IN-0001' && v['gwInboundRecords.v1'].seq === 3, '인바운드는 자기 업체 것만 · 다음 번호(seq) 도 함께');
    ok(v['gwArchivePosts.v1'].map(x => x.id).join() === 'A1', '자료실은 공개 글만');
    ok(v['gwOrgDepts.v1'].length === 1, '공용 설정은 그대로');

    console.log('\n[4] 파트너 저장 합치기');
    let w = P.applyPartnerWrite('gwPartnerIntakes.v1', store['gwPartnerIntakes.v1'], [{ id: 'PI-1', partnerId: 'PA-1', memo: '고침' }, { id: 'PI-3', partnerId: 'PA-2', memo: '새 건' }], [], me);
    ok(w.list.find(x => x.id === 'PI-1').memo === undefined, '자기 기존 접수라도 파트너가 고칠 수 없는 칸은 그대로 (2026-09-28)');
    ok(w.list.find(x => x.id === 'PI-3').partnerId === 'PA-1', '새 건의 파트너사는 서버가 자기 것으로 적는다');
    ok(w.list.find(x => x.id === 'PI-2').partnerId === 'PA-2' && !w.list.find(x => x.id === 'PI-2').memo, '남의 건은 그대로');
    w = P.applyPartnerWrite('gwPartnerIntakes.v1', store['gwPartnerIntakes.v1'], [{ id: 'PI-2', memo: '번호만 겹친 새 건' }], [], me);
    ok(w.renamed['PI-2'] === 'PI-3' && w.list.find(x => x.id === 'PI-2').partnerId === 'PA-2', '번호가 남의 것과 겹치면 빈 번호로 새로 넣고 남의 건은 그대로');
    w = P.applyPartnerWrite('gwPartnerIntakes.v1', store['gwPartnerIntakes.v1'], [], ['PI-1', 'PI-2'], me);
    ok(w.list.find(x => x.id === 'PI-1') && w.list.find(x => x.id === 'PI-2') && w.rejected.includes('PI-1'), '파트너의 지우기 요청은 받지 않는다 (자기 것도)');
    w = P.applyPartnerWrite('gwInboundRecords.v1', store['gwInboundRecords.v1'], [{ id: 'IN-0002', vendor: '가나 상사', memo: 'x' }], [], me);
    ok(w.list.records.find(x => x.id === 'IN-0002').vendor === '다라' && w.renamed['IN-0002'] === 'IN-0003', '인바운드 번호가 겹치면 새 번호 · 남의 것은 그대로');
    ok(w.list.records.length === 3 && w.list.seq === 4, '인바운드는 { seq, records } 모양을 지키고 다음 번호를 올린다');
    w = P.applyPartnerWrite('gwInboundRecords.v1', store['gwInboundRecords.v1'], [{ id: 'IN-0003', memo: '새 건' }], [], me);
    ok(w.list.records.some(x => x.id === 'IN-0001') && w.list.records.some(x => x.id === 'IN-0002' && x.vendor === '다라'), '다른 업체 인입은 지워지지 않는다');
    // 같은 요청 안에서 새 번호가 뒤의 새 건과 겹치지 않게
    const two = [{ id: 'PI-9-001', partnerId: 'PA-2' }, { id: 'PI-9-002', partnerId: 'PA-2' }];
    w = P.applyPartnerWrite('gwPartnerIntakes.v1', two, [{ id: 'PI-9-001', title: '첫째' }, { id: 'PI-9-002', title: '둘째' }, { id: 'PI-9-003', title: '셋째' }], [], me);
    const mine = w.list.filter(x => x.partnerId === 'PA-1').map(x => x.title).sort().join();
    ok(mine === '둘째,셋째,첫째' && w.list.length === 5, '같은 요청의 새 건끼리 번호가 겹쳐도 하나도 잃지 않는다');
    w = P.applyPartnerWrite('gwDevRequests.v1', store['gwDevRequests.v1'], [{ id: 'D1', partnerId: 'PA-2', status: 'review' }, { id: 'D3', status: 'x' }, { id: 'D9' }], ['D1'], me);
    const d1 = w.list.find(x => x.id === 'D1');
    ok(d1.status === 'review' && d1.partnerId === 'PA-1', '개발의뢰는 진행만 고치고 상대 파트너사는 못 바꾼다');
    ok(w.list.find(x => x.id === 'D3').status === undefined && !w.list.find(x => x.id === 'D9'), '남의 개발의뢰 · 새 개발의뢰는 받지 않는다');
    ok(w.rejected.includes('D3') && w.rejected.includes('D9') && w.list.find(x => x.id === 'D1'), '개발의뢰는 지우지 못한다');
    w = P.applyPartnerWrite('gwDevNotiQueue.v1', [{ id: 'n1' }], [{ id: 'n1' }, { id: 'n2' }], ['n1'], me);
    ok(w.list.map(x => x.id).join() === 'n1,n2', '알림 대기열은 새 것만 붙이고 지우지 않는다');
    let threw = false; try { P.applyPartnerWrite('gwUsers.v1', [], [], [], me); } catch (e) { threw = true; }
    ok(threw, '그 밖의 자료는 저장 거절');

    console.log('\n[5] 파트너가 고칠 수 있는 칸만 (2026-09-28)');
    {
        const srv = [{ id: 'PI-5', partnerId: 'PA-1', status: 'working', payStatus: '미결제', assignee: '김', replies: [{ side: 'kob', text: '안내' }], history: [{ text: '접수' }] }];
        let r = P.applyPartnerWrite('gwPartnerIntakes.v1', srv, [{ id: 'PI-5', partnerId: 'PA-1', status: 'done', payStatus: '결제완료', assignee: '', replies: [], history: [], title: '바꿈' }], [], me);
        const x = r.list[0];
        ok(x.status === 'working' && x.payStatus === '미결제' && x.assignee === '김' && x.replies.length === 1 && x.history.length === 1 && x.title === undefined,
           '접수: 상태 · 결제 · 담당 · 답변 · 기록 · 내용을 파트너가 바꾸지 못한다');
        const rej = [{ id: 'PI-6', partnerId: 'PA-1', status: 'rejected', reRequestedTo: '', history: [{ text: '접수' }] }];
        r = P.applyPartnerWrite('gwPartnerIntakes.v1', rej, [{ id: 'PI-6', status: 'rejected', reRequestedTo: 'PI-7', history: [{ text: '접수' }, { text: '재요청 (PI-7)' }, { text: '끼워 넣기' }] }], [], me);
        ok(r.list[0].reRequestedTo === 'PI-7' && r.list[0].history.length === 2, '반려 접수의 재요청 연결 · 기록 한 줄만 받는다');
        r = P.applyPartnerWrite('gwPartnerIntakes.v1', [], [{ id: 'PI-8', status: 'done', assignee: '누구', payStatus: '결제완료', replies: [{ side: 'kob' }], history: [{ text: '접수' }, { text: '가짜' }] }], [], me);
        ok(r.list[0].status === 'received' && r.list[0].assignee === '' && r.list[0].payStatus === undefined && r.list[0].replies.length === 0 && r.list[0].history.length === 1,
           '새 접수: 상태는 접수완료 · 사내 칸은 비운다');

        const dev = [{ id: 'D5', partnerId: 'PA-1', status: 'working', progress: 30, title: '원래', thread: [{ side: 'kob', text: '요청' }], history: [] }];
        r = P.applyPartnerWrite('gwDevRequests.v1', dev, [{ id: 'D5', partnerId: 'PA-1', status: 'working', progress: 60, title: '바꿈', thread: [{ side: 'kob', text: '요청' }, { side: 'partner', text: '진행 중' }, { side: 'kob', text: '가짜 사내 답' }] }], [], me);
        ok(r.list[0].progress === 60 && r.list[0].title === '원래' && r.list[0].thread.length === 2 && r.list[0].thread[1].side === 'partner',
           '개발의뢰: 진행률 · 파트너 대화만 받고 의뢰 내용 · 사내 대화는 못 넣는다');
        r = P.applyPartnerWrite('gwDevRequests.v1', dev, [{ id: 'D5', partnerId: 'PA-1', status: 'done' }], [], me);
        ok(r.list[0].status === 'working', '개발의뢰: 검수완료(done)는 파트너가 못 한다');
        r = P.applyPartnerWrite('gwDevRequests.v1', dev, [{ id: 'D5', partnerId: 'PA-1', status: 'review' }], [], me);
        ok(r.list[0].status === 'review' && r.list[0].progress === 100, '개발의뢰: 검수요청은 된다(진행률 100)');
        r = P.applyPartnerWrite('gwDevRequests.v1', [{ id: 'D6', partnerId: 'PA-1', status: 'draft' }], [{ id: 'D6', status: 'working' }], [], me);
        ok(r.rejected.includes('D6') && r.list[0].status === 'draft', '개발의뢰: 작성 중(draft)은 건드리지 못한다');

        const ib = { seq: 5, records: [{ id: 'IN-0004', vendor: '가나 상사', company: '옛', phone: '1', kob: { result: '영업수주', owner: '김' } }] };
        r = P.applyPartnerWrite('gwInboundRecords.v1', ib, [{ id: 'IN-0004', vendor: '다른이름', company: '새', kob: { result: '실패' } }], [], me);
        const q = r.list.records[0];
        ok(q.company === '새' && q.phone === undefined && q.vendor === '가나 상사' && q.kob.result === '영업수주', '인바운드: 업체 칸만 바뀌고 업체 이름 · 사내 처리(kob)는 그대로');
        r = P.applyPartnerWrite('gwInboundRecords.v1', ib, [{ id: 'IN-0005', company: '신규', kob: { result: '영업수주' }, secret: 1 }], [], me);
        const n = r.list.records.find(x => x.id === 'IN-0005');
        ok(n.kob.result === '' && n.vendor === '가나 상사' && n.secret === undefined, '새 인입: 사내 처리 칸은 비우고 업체 칸만');
    }

    console.log('\n[업체 통합 2026-10-05] customers 표에서 업체 찾기 · 소속 가맹점');
    {
        // 가짜 Supabase — app_store 키와 customers 표
        const mkIo = (storeObj, rows) => ({
            calls: [],
            storeValues: async (keys) => { const o = {}; keys.forEach(k => { if (storeObj[k] !== undefined) o[k] = storeObj[k]; }); return o; },
            companies: async (ids) => rows.filter(r => ids.includes(r.id)),
            children: async (id) => rows.filter(r => r.parentId === id)
        });
        const rows = [
            { id: 'p17', name: '오케팅홀딩스', kind: 'partner', memo: '사내 메모', note: '비고', fee: { small: 1.1 } },
            { id: 'c5', name: '역삼점', kind: 'partnerShop', parentId: 'p17', roadAddress: '서울 강남구 역삼로 1', contactName: '김점주', phone: '010-1', businessNo: '111', rentFee: 220000, status: '거래중' },
            { id: 'c6', name: '선릉점', kind: 'partnerShop', parentId: 'p17', address: '서울 강남구 선릉로 2' },
            { id: 'c7', name: '남의가게', kind: 'partnerShop', parentId: 'p99' },
            { id: 'h1', name: '치킨본사', kind: 'hq' },
            { id: 'c8', name: '본사가맹1', kind: 'franchise', parentId: 'h1' }
        ];
        const accts = [{ loginId: 'ptn00001', partnerId: 'p17', pwHash: 'h', pwSalt: 's' }, { loginId: 'ptn00002', partnerId: 'c5' },
                       { loginId: 'ptn00003', partnerId: 'gone' }, { loginId: 'old1', partnerId: 'p50' }];
        const st = { 'gwPartnerAccounts.v1': accts, 'gwPartners.v1': [{ id: 'p50', name: '예전업체', custType: 'partner' }, { id: 'p17', name: '예전이름' }] };

        let r = await P.resolvePartner(mkIo(st, rows), 'PTN00001', { withShops: true });
        ok(r && !r.missing && r.company.id === 'p17' && r.me.partnerName === '오케팅홀딩스', '표에 있는 업체를 찾는다 (예전 목록의 같은 id 보다 표가 먼저)');
        ok(r.me.kind === 'partner' && r.me.shops.map(x => x.id).join(',') === 'c5,c6', '파트너사는 소속 가맹점(상위업체 = 자기)만 받는다');
        r = await P.resolvePartner(mkIo(st, rows), 'ptn00001');
        ok(r.me.shops.length === 0, '소속 가맹점은 withShops 일 때만 읽는다 (저장 · 파일 확인 때는 안 읽음)');
        r = await P.resolvePartner(mkIo(st, rows), 'ptn00002', { withShops: true });
        ok(r.me.kind === 'partnerShop' && r.me.shops.length === 0, '가맹점 아이디는 소속 가맹점을 받지 않는다');
        r = await P.resolvePartner(mkIo(st, rows), 'ptn00003');
        ok(r && r.missing, '업체가 없어진 아이디는 missing (로그인 · 자료 받기 막음)');
        ok((await P.resolvePartner(mkIo(st, rows), 'nobody')) === null, '없는 아이디는 null');
        r = await P.resolvePartner(mkIo(st, rows), 'old1');
        ok(r && !r.missing && r.me.partnerName === '예전업체', '옮기기 전에는 예전 목록(gwPartners.v1)에서도 찾는다');
        r = await P.resolvePartner(mkIo(Object.assign({}, st, { 'gwPartnersMigrated.v1': { at: 'x' } }), rows), 'old1');
        ok(r && r.missing, '옮김 표시가 있으면 예전 목록은 보지 않는다 (지운 업체가 되살아나지 않게)');

        const full = await P.resolvePartner(mkIo(st, rows), 'ptn00001', { withShops: true });
        const store2 = { 'gwPartnerIntakes.v1': [{ id: 'PI-1', partnerId: 'p17', title: '내 것' }, { id: 'PI-2', partnerId: 'c5', title: '역삼 접수', status: 'working', content: '내용', byPhone: '010', docs: [1] },
                                                 { id: 'PI-3', partnerId: 'c7', title: '남의 것' }] };
        const v2 = P.partnerView(store2, full.me);
        ok(v2['gwPartners.v1'].length === 1 && v2['gwPartners.v1'][0].id === 'p17' && v2['gwPartners.v1'][0].memo === undefined && v2['gwPartners.v1'][0].note === undefined,
           '자기 업체는 표에서 · 사내 메모(memo · note)는 뺀다');
        ok(v2['gwPartnerIntakes.v1'].map(x => x.id).join(',') === 'PI-1', '내 접수 목록에는 내 것만 (소속 가맹점 접수가 섞이지 않음)');
        const shop = v2['gwPartnerShops.v1'].find(x => x.id === 'c5');
        ok(v2['gwPartnerShops.v1'].length === 2 && shop.name === '역삼점' && shop.address === '서울 강남구 역삼로 1' && shop.status === '거래중', '소속 가맹점: 상호 · 주소 · 거래상태');
        ok(!('contactName' in shop) && !('phone' in shop) && !('businessNo' in shop) && !('rentFee' in shop), '소속 가맹점: 담당자 · 연락처 · 사업자번호 · 금액은 내려가지 않는다');
        // 2026-10-07 — 추가 장비 구매 [검색] 이 칸을 채우도록: 주소는 나눠서, 사업자번호 · 대표자명은 동의한 곳만
        ok(shop.zipCode === '' && shop.roadAddress === '서울 강남구 역삼로 1' && !('ceo' in shop) && !('mobile' in shop), '동의 없는 가맹점: 주소는 나눠 주고 대표자명 · 휴대폰은 없다');
        const agreed = P.shopSummary({ id: 'c9', name: '삼성점', roadAddress: '서울 강남구 삼성로 3', addressDetail: '2층', zipCode: '06100',
                                       businessNo: '123-45-67890', ceo: '박대표', mobile: '010-9999-0000', consentParentShare: true });
        ok(agreed.businessNo === '123-45-67890' && agreed.ceo === '박대표' && agreed.mobile === '010-9999-0000' && agreed.zipCode === '06100' && agreed.addressDetail === '2층',
           '동의한 가맹점: 사업자번호 · 대표자명 · 휴대폰 · 우편번호 · 상세주소를 준다');
        ok(P.shopSummary({ id: 'c10', name: '옛점', address: '서울 어딘가 1 3층', addressDetail: '3층' }).addressDetail === '',
           '도로명이 없는 옛 자료는 상세주소를 따로 주지 않는다 (주소에 이미 들어 있음)');
        // 2026-10-07 — 발주 장비 목록: 그 계정 단가 하나만 · 월정액 · 미사용 제외 · 단가 숨김 계정
        const book = [
            { id: 'A', cat: '포스', name: '포스 세트', price: 900000, cost: 500000, tiers: { partner: 850000, direct: 990000 }, partnerPrice: { p17: 800000 }, hqPrice: { visible: 870000 } },
            { id: 'B', cat: '포스', name: '월 유지보수', kind: '월정액', tiers: { partner: 10000 } },
            { id: 'C', cat: '포스', name: '옛 장비', active: false, price: 1 },
            { id: 'D', cat: '키오스크', name: '키오스크', price: 1200000 }
        ];
        const pv = (co, pid) => P.partnerPriceView(book, co, pid);
        ok(pv({ kind: 'partner' }, 'p99').map(x => x.id).join(',') === 'A,D', '발주 장비: 월정액 · 미사용은 빼고 보낸다');
        ok(pv({ kind: 'partner' }, 'p99')[0].price === 850000 && pv({ kind: 'partner' }, 'p99')[1].price === 1200000, '파트너사 단가, 없으면 킹오더 공급가');
        ok(pv({ kind: 'partner' }, 'p17')[0].price === 800000, '파트너사별 개별단가가 먼저');
        ok(pv({ kind: 'franchise', franchiseHq: 'visible' }, 'c7')[0].price === 870000, '프랜차이즈는 정책 단가');
        ok(!('price' in pv({ kind: 'franchise', franchiseHq: 'hidden' }, 'c7')[0]) && !('price' in pv({ kind: 'partnerShop' }, 'p17')[0]) && !('price' in pv({}, 'x')[0]),
           '가격비공개형 · 파트너사 가맹점 · 유형 미지정에는 단가를 보내지 않는다');
        const one = pv({ kind: 'partner' }, 'p99')[0];
        ok(!('cost' in one) && !('tiers' in one) && !('partnerPrice' in one) && !('hqPrice' in one), '매입가 · 다른 유형 · 다른 업체 단가는 보내지 않는다');
        const si = v2['gwPartnerShopIntakes.v1'];
        ok(si.length === 1 && si[0].id === 'PI-2' && si[0].status === 'working' && si[0].content === undefined && si[0].byPhone === undefined && si[0].docs === undefined,
           '소속 가맹점 접수: 그 가맹점 것만 · 진행 상태만 (내용 · 연락처 · 서류 없음)');
        ok(!P.WRITE_KEYS.includes('gwPartnerShops.v1') && !P.WRITE_KEYS.includes('gwPartnerShopIntakes.v1'), '소속 가맹점 자료는 파트너가 저장할 수 없다');
        const hq = await P.resolvePartner(mkIo({ 'gwPartnerAccounts.v1': [{ loginId: 'h', partnerId: 'h1' }] }, rows), 'h', { withShops: true });
        ok(hq.me.shops.map(x => x.id).join(',') === 'c8', '본사는 소속 프랜차이즈 가맹점을 받는다');
        const plain = P.partnerView(store2, { loginId: 'x', partnerId: 'c5', partnerName: '역삼점' });
        ok(plain['gwPartnerShops.v1'].length === 0 && plain['gwPartnerShopIntakes.v1'].length === 0, '소속이 없으면 빈 목록');
        ok(P.companyList([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }], false).map(x => x.id).join(',') === 'a,b' && P.companyList([{ id: 'a' }], [{ id: 'b' }], true).length === 1,
           'companyList: 옮기기 전엔 표 + 예전 목록(겹치는 id 는 표), 옮긴 뒤엔 표만');
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
