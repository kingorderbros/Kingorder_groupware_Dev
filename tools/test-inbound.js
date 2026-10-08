// 인바운드 수집 (2026-10-08) — functions/api/_inbound.js 와 /api/inbound/* 흐름. 메일 서버 · 네이버 · 메타 · 구글 · Supabase 는 모두 가짜.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

// ---- 가짜 Supabase (app_store · inbound_secrets) ----
const store = {}, secretsTbl = {};
let users = [{ email: 'admin@company.com', groupId: 'admin', name: '관리자' }, { email: 'sales@company.com', groupId: 'sales', name: '영업' }];
store['gwUsers.v1'] = users;
store['gwPermissionGroups.v2'] = { groups: [{ id: 'sales', permissions: ['inbound-center', 'inbound-kob'] }] };
const tokens = { 'tok-admin': 'admin@company.com', 'tok-sales': 'sales@company.com' };

// ---- 가짜 외부 API ----
const NAVER = {
    blog: { items: [{ title: '<b>킹오더</b> 테이블오더 후기', link: 'https://blog.naver.com/abc/1', description: '써 보니 <b>킹오더</b> 좋네요', bloggername: '사장님A', bloggerlink: 'blog.naver.com/abc', postdate: '20261007' },
                    { title: '우리 글', link: 'https://blog.naver.com/kingorder_b/9', description: '자사 글', bloggername: '킹오더', bloggerlink: 'blog.naver.com/kingorder_b', postdate: '20261006' }] },
    cafearticle: { items: [{ title: '테이블오더 <b>킹오더</b> 어떤가요', link: 'https://cafe.naver.com/jihosoccer123/1', description: '수수료 없다던데', cafename: '아프니까 사장이다', cafeurl: 'https://cafe.naver.com/jihosoccer123' }] },
};
const RSS = '<?xml version="1.0"?><rss><channel><item><title><![CDATA[키오스크 렌탈 vs 구매]]></title><link>https://blog.naver.com/kingorder_b/2236?fromRss=true</link><description><![CDATA[<p>본문</p>]]></description><pubDate>Tue, 22 Sep 2026 10:00:00 +0900</pubDate></item></channel></rss>';
const CSV = '인입일자,인입 경로,게시판 서비스 유형,업체명,이름,사업자등록번호,휴대전화,이메일\n2026-09-29,기타,"QR오더, 키오스크",테스트상회,홍길동,,010-1111-2222,a@b.c\n';
global.fetch = async (url, opt = {}) => {
    const u = new URL(String(url)), m = opt.method || 'GET';
    const res = (body, status, ct) => new Response(body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body)), { status: status || 200, headers: { 'Content-Type': ct || 'application/json' } });
    const h = (k) => (opt.headers || {})[k] || (opt.headers && opt.headers.get ? opt.headers.get(k) : '');
    if (u.hostname === 'openapi.naver.com') {
        if (h('X-Naver-Client-Secret') !== 'nsecret') return res({ errorMessage: 'Authentication failed' }, 401);
        const kind = u.pathname.split('/').pop().replace('.json', '');
        return res(NAVER[kind] || { items: [] });
    }
    if (u.hostname === 'rss.blog.naver.com') return res(RSS, 200, 'application/xml');
    if (u.hostname === 'docs.google.com') return res(CSV, 200, 'text/csv');
    if (u.hostname === 'graph.facebook.com') {
        if (u.searchParams.get('access_token') !== 'igtok') return res({ error: { message: 'Invalid OAuth access token' } }, 400);
        if (u.pathname.endsWith('/media')) return res({ data: [{ id: 'm1', caption: '가을 이벤트', permalink: 'https://instagram.com/p/x', comments: { data: [
            { id: 'c1', text: '키오스크 견적 문의요 010-2222-3333', username: 'shop_owner', timestamp: '2026-10-07T08:20:00+0000' },
            { id: 'c2', text: '감사합니다', username: 'k1ngorder', timestamp: '2026-10-07T09:00:00+0000' }] } }] });
        if (u.pathname.endsWith('/conversations')) return res({ data: [{ messages: { data: [{ id: 'dm1', message: '축제 렌탈 가능할까요', from: { username: 'festival_kr' }, created_time: '2026-10-07T10:00:00+0000' }] } }] });
    }
    if (u.pathname === '/auth/v1/user') {
        const t = String(h('Authorization')).replace(/^Bearer\s+/, '');
        return tokens[t] ? res({ email: tokens[t] }) : res({ msg: 'bad' }, 401);
    }
    if (u.pathname === '/rest/v1/app_store') {
        if (m === 'POST') { JSON.parse(opt.body).forEach(r => { store[r.key] = r.value; }); return res(undefined, 201); }
        const kq = u.searchParams.get('key') || '';
        if (kq.startsWith('in.')) { const ks = decodeURIComponent(kq).slice(4, -1).split(',').map(s => s.replace(/"/g, '')); return res(ks.filter(k => k in store).map(k => ({ key: k, value: store[k] }))); }
        const k = kq.replace(/^eq\./, '');
        return res(k in store ? [{ value: store[k] }] : []);
    }
    if (u.pathname === '/rest/v1/inbound_secrets') {
        if (m === 'POST') { JSON.parse(opt.body).forEach(r => { secretsTbl[r.name] = r; }); return res(undefined, 201); }
        if (m === 'DELETE') { delete secretsTbl[(u.searchParams.get('name') || '').replace(/^eq\./, '')]; return res(undefined, 204); }
        return res(Object.values(secretsTbl));
    }
    return res([], 200);
};

// ---- 가짜 메일 서버 (IMAP) ----
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const HTML = `<table><tr><td>등록자</td><td>비회원</td></tr><tr><td>등록위치</td><td>입력폼</td></tr><tr><td>등록시각</td><td>2026-09-30 14:35</td></tr></table>
<h3>응답</h3><p><b>개인정보 수집동의</b><br>동의</p><p><b>작성자</b><br>신○○</p><p><b>이메일</b><br>test@hospital.com</p>
<p><b>연락처</b><br>01050630889</p><p><b>문의유형</b><br>키오스크</p><p><b>문의내용</b><br>병원 접수용 키오스크<br>내용 확인 부탁드립니다</p>`;
const MAIL = [
    'From: =?UTF-8?B?' + b64('아임웹') + '?= <noreply@imweb.me>',
    'Subject: =?UTF-8?B?' + b64('[킹오더브라더스] 새 입력폼 응답') + '?=',
    'Date: Wed, 30 Sep 2026 14:35:10 +0900',
    'Message-ID: <abc123@imweb.me>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="BND"',
    '', '--BND', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '', 'plain', '--BND',
    'Content-Type: text/html; charset="utf-8"', 'Content-Transfer-Encoding: base64', '', b64(HTML).replace(/(.{76})/g, '$1\r\n'), '--BND--', ''
].join('\r\n');
const OTHER = 'From: someone@x.com\r\nSubject: hello\r\nMessage-ID: <zzz@x>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n안녕\r\n';
let imapLog = [];
function fakeConnect({ hostname }) {
    let ctl;
    const readable = new ReadableStream({ start(c) { ctl = c; } });
    const enc = new TextEncoder();
    const send = (s) => ctl.enqueue(typeof s === 'string' ? enc.encode(s) : s);
    send('* OK IMAP ready\r\n');
    const writable = new WritableStream({ write(chunk) {
        const line = new TextDecoder().decode(chunk).trim();
        imapLog.push(line);
        const [tag, ...rest] = line.split(' ');
        const c = rest.join(' ');
        if (/^LOGIN/.test(c)) return send(c.includes('"apppw"') ? `${tag} OK LOGIN done\r\n` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
        if (/^SELECT/.test(c)) return send(`* 2 EXISTS\r\n${tag} OK [READ-WRITE] SELECT done\r\n`);
        if (/^UID SEARCH/.test(c)) return send(`* SEARCH 11 12\r\n${tag} OK SEARCH done\r\n`);
        if (/^UID FETCH/.test(c)) {
            const a = Buffer.from(MAIL, 'utf8'), b = Buffer.from(OTHER, 'utf8');
            send(`* 1 FETCH (UID 11 BODY[] {${a.length}}\r\n`); send(a); send(')\r\n');
            send(`* 2 FETCH (UID 12 BODY[] {${b.length}}\r\n`); send(b); send(')\r\n');
            return send(`${tag} OK FETCH done\r\n`);
        }
    } });
    return { readable, writable, close() { try { ctl.close(); } catch (e) { /* 닫힘 */ } } };
}

(async () => {
    const I = await import('../functions/api/_inbound.js');

    console.log('\n[1] 값 다듬기');
    ok(I.normPhone('01050630889') === '010-5063-0889' && I.normPhone('0212345678') === '02-1234-5678', '연락처 형식');
    ok(I.phoneLooksWrong('010-1234-55') && !I.phoneLooksWrong('010-1234-5678'), '자릿수 부족 연락처 판별');
    ok(JSON.stringify(I.normServices(['포스(결제대행)', '무인내장고', 'QR오더', '키오스크'])) === JSON.stringify(['포스연동', '무인 냉장고', 'QR오더', '키오스크']), '사이트별 서비스 이름 → 인바운드 서비스 유형');
    ok(I.routeFromSource({ utm_source: 'naver', utm_medium: 'cpc' }, ['블로그']) === '검색광고', 'UTM 이 고객 응답보다 먼저');
    ok(I.routeFromSource({}, ['블로그']) === '블로그' && I.routeFromSource({}, []) === '기타', 'UTM 이 없으면 고객 응답, 그것도 없으면 기타');
    ok(I.deptByRules({ requestNote: '키오스크 프린터 고장' }, {}) === '운영' && I.deptByRules({ requestNote: '도입 문의' }, {}) === '영업', '운영 낱말이면 운영본부, 아니면 영업본부');

    console.log('\n[2] 아임웹 알림 메일 본문 해석 (인입관리 분석/image.png 모양)');
    const sample = '등록자 비회원\n등록위치 입력폼\n등록시각 2026-09-30 14:35\n\n응답\n개인정보 수집동의\n동의\n작성자\n신성규\n이메일\n625003@jesushospital.com\n연락처\n01050630889\n문의유형\n키오스크\n문의내용\n';
    const p = I.parseNotifyText(sample);
    ok(p.at === '2026-09-30 14:35' && p.name === '신성규' && p.email === '625003@jesushospital.com' && p.phone === '01050630889' && p.services === '키오스크' && p.message === '', '등록시각 · 작성자 · 이메일 · 연락처 · 문의유형 · 빈 문의내용');
    const p2 = I.parseNotifyText('작성자: 김철수\n문의내용\n첫 줄\n내용 확인 부탁\n연락처\n010-1111-2222');
    ok(p2.name === '김철수' && p2.message === '첫 줄\n내용 확인 부탁' && p2.phone === '010-1111-2222', '한 줄 항목 · 여러 줄 문의내용 · 문의내용 안의 「내용」 낱말');
    const rec = I.notifyToRecord(sample, { messageId: 'm1', subject: '[킹오더] 입력폼' }, {});
    ok(rec.inDate === '2026-09-30' && rec.phone === '010-5063-0889' && rec.flags.includes('문의내용 없음') && rec.extKey === 'mail:m1' && rec.kob.dept === '영업', '인입 건 모양 · 확인 필요 표시 · 중복 열쇠 · 기본 영업본부');

    console.log('\n[3] 메일함(IMAP) 읽기');
    const log = [];
    const mails = await I.imapFetch({ host: 'imap.test', user: 'kob', password: 'apppw', sinceDays: 7, limit: 20, from: 'imweb.me' }, fakeConnect, log);
    ok(mails.length === 2 && mails[0].uid === '11', '두 통을 받음');
    ok(mails[0].subject === '[킹오더브라더스] 새 입력폼 응답' && mails[0].messageId === 'abc123@imweb.me', '제목(인코딩된 머리) · Message-ID');
    ok(/작성자\n신○○/.test(mails[0].text) && /연락처\n01050630889/.test(mails[0].text), 'HTML 본문(base64)을 줄 글로');
    ok(imapLog.some(l => /UID SEARCH SINCE \d+-\w{3}-\d{4} FROM "imweb.me"/.test(l)) && imapLog.some(l => /BODY\.PEEK\[\]/.test(l)), '날짜 · 보낸 사람으로 검색, 읽음 표시 안 함(PEEK)');
    ok(log.some(l => l.includes('"********"')) && !log.some(l => l.includes('apppw')), '기록에 비밀번호를 남기지 않음');
    let err = '';
    try { await I.imapFetch({ host: 'imap.test', user: 'kob', password: 'wrong' }, fakeConnect, []); } catch (e) { err = e.message; }
    ok(/Invalid credentials/.test(err), '틀린 비밀번호는 메일 서버 응답을 그대로 알림');

    const cfg = I.withDefaults({ mail: { user: 'kob', subject: '입력폼' }, naver: { clientId: 'nid' }, insta: { igUserId: 'ig1', pageId: 'pg1' }, sheet: { url: 'https://docs.google.com/spreadsheets/d/AbC_1/edit#gid=77' } });
    const run = await I.runSource('mail', cfg, { mailPassword: 'apppw' }, { connect: fakeConnect });
    ok(run.items.length === 1 && run.items[0].record.name === '신○○' && run.items[0].record.requestNote.includes('병원 접수용'), '제목 조건으로 알림 메일만 · 인입 건으로');

    console.log('\n[4] 네이버 검색 · 블로그 RSS · 인스타 · 구글 시트');
    const nv = await I.runSource('naver', cfg, { naverClientSecret: 'nsecret' }, {});
    ok(nv.items.length === 2 && !nv.items.some(x => x.link.includes('kingorder_b')), '자사 블로그(kingorder_b)는 빼고 · 키워드가 달라도 같은 글은 한 번');   // 블로그 2(자사 1 제외) + 카페 1
    ok(nv.items.some(x => x.record.channel === 'cafe' && x.record.routes[0] === '카페') && nv.items.every(x => !x.record.kob.dept), '카페 · 블로그 언급은 미배정으로');
    err = ''; try { await I.runSource('naver', cfg, { naverClientSecret: 'bad' }, {}); } catch (e) { err = e.message; } ok(/401/.test(err), '틀린 키는 네이버 오류를 알림');
    const bl = await I.runSource('blog', cfg, {}, {});
    ok(bl.posts.length === 1 && bl.posts[0].link === 'https://blog.naver.com/kingorder_b/2236' && bl.posts[0].date === '2026-09-22', 'RSS 글 목록 (fromRss 꼬리 뗌)');
    const ig = await I.runSource('insta', cfg, { igAccessToken: 'igtok' }, {});
    ok(ig.items.length === 2 && !ig.items.some(x => x.title.includes('k1ngorder')), '댓글 1 + DM 1 (우리 계정 답글은 뺌)');
    ok(ig.items.find(x => x.record.extKey === 'ig:dm:dm1'), 'DM 중복 열쇠');
    ok(I.sheetCsvUrl(cfg.sheet.url) === 'https://docs.google.com/spreadsheets/d/AbC_1/export?format=csv&gid=77', '시트 주소 → CSV 주소 (gid 유지)');
    const sh = await I.runSource('sheet', cfg, {}, {});
    ok(sh.rows.length === 2 && sh.rows[1][2] === 'QR오더, 키오스크', 'CSV 따옴표 칸');

    console.log('\n[5] /api/inbound/* 흐름');
    const { onRequest } = await import('../functions/api/[[route]].js');
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const call = async (path, opt = {}) => {
        const r = await onRequest({ request: new Request('https://gw.test' + path, opt), env });
        return { status: r.status, h: r.headers, j: r.status === 204 ? {} : await r.json() };
    };
    const post = (path, b, extra) => call(path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}), body: JSON.stringify(b) });
    const FORM = { site: 'kingorder', form: 'contact', page: '/contact', utm_source: 'naver', utm_medium: 'cpc', utm_campaign: '파워링크', keyword: '테이블오더 가격',
        fields: { company: '한끼식당', name: '김', phone: '01024812481', email: 'a@b.c', 'referral[]': ['검색광고'], 'interests[]': ['테이블오더', '포스 연동'], message: '연동 되나요' }, submissionId: 's1' };

    let r = await post('/api/inbound/form', FORM, { Origin: 'https://evil.example' });
    ok(r.status === 403, '허용 목록에 없는 사이트는 막음');
    r = await call('/api/inbound/form', { method: 'OPTIONS', headers: { Origin: 'https://qrking.co.kr' } });
    ok(r.status === 204 && r.h.get('Access-Control-Allow-Origin') === 'https://qrking.co.kr', '허용 사이트 사전 확인(CORS)');
    r = await post('/api/inbound/form?dry=1', FORM, { Origin: 'https://xn--9m1bt07agwh.com' });
    ok(r.j.dry && r.j.record.routes[0] === '검색광고' && r.j.record.source.keyword === '테이블오더 가격' && r.j.record.services.join() === '테이블오더,포스연동' && !store['gwInboundRecords.v1'], '시험 전송은 정리 결과만 · 저장 안 함');
    store['gwInboundRecords.v1'] = { seq: 5, records: [{ id: 'IN-0004', inDate: new Date().toISOString().slice(0, 10), phone: '010-2481-2481', company: '전 건', kob: { dept: '운영' } }] };
    r = await post('/api/inbound/form', FORM, { Origin: 'https://xn--9m1bt07agwh.com' });
    const saved = store['gwInboundRecords.v1'];
    ok(r.j.ok && /^IN-\d{6}-[0-9A-Z]{3}$/.test(r.j.id) && saved.records.length === 2 && saved.seq === 5, '저장 — 날짜 붙은 번호, 화면 번호(seq)는 그대로');
    ok(saved.records[0].dupOf === 'IN-0004' && saved.records[0].kob.dept === '운영', '같은 연락처 재문의 → 이전 건 본부로 · 표시');
    r = await post('/api/inbound/form', FORM, { Origin: 'https://xn--9m1bt07agwh.com' });
    ok(r.j.duplicate && store['gwInboundRecords.v1'].records.length === 2, '같은 제출(submissionId)은 두 번 넣지 않음');
    r = await post('/api/inbound/form', { fields: { name: '봇', phone: '01011112222' }, _hp: 'x' });
    ok(r.j.ok && store['gwInboundRecords.v1'].records.length === 2, '숨은 칸을 채운 로봇은 받은 척만');
    r = await post('/api/inbound/form', { fields: { name: '연락처 없음' } });
    ok(r.status === 400, '연락처 · 이메일이 모두 없으면 거절');

    r = await call('/api/inbound/status');
    ok(r.status === 401, '상태는 로그인 필요');
    r = await call('/api/inbound/status', { headers: { Authorization: 'Bearer tok-sales' } });
    ok(r.status === 403, '수집 권한(inbound-sources) 없는 영업 계정은 막음');
    r = await post('/api/inbound/secret', { name: 'naverClientSecret', value: 'nsecret' }, { Authorization: 'Bearer tok-sales' });
    ok(r.status === 403, '비밀 값 저장은 관리자만');
    r = await post('/api/inbound/secret', { name: 'naverClientSecret', value: 'nsecret' }, { Authorization: 'Bearer tok-admin' });
    ok(r.j.ok && secretsTbl.naverClientSecret.value === 'nsecret', '관리자는 저장');
    r = await call('/api/inbound/status', { headers: { Authorization: 'Bearer tok-admin' } });
    ok(r.j.secrets.naverClientSecret.set && r.j.secrets.naverClientSecret.from === 'table' && !JSON.stringify(r.j).includes('nsecret'), '상태에는 넣었는지만 — 값은 내보내지 않음');
    env.INBOUND_NAVER_CLIENT_SECRET = 'nsecret';
    r = await call('/api/inbound/status', { headers: { Authorization: 'Bearer tok-admin' } });
    ok(r.j.secrets.naverClientSecret.from === 'env', '환경변수가 있으면 그것이 먼저');
    store['gwInboundSources.v1'] = { naver: { clientId: 'nid' } };
    r = await post('/api/inbound/preview', { source: 'naver', settings: { naver: { keywords: ['킹오더'], kinds: ['cafearticle'] } } }, { Authorization: 'Bearer tok-admin' });
    ok(r.j.ok && r.j.items.length === 1 && r.j.items[0].record.channel === 'cafe', '미리보기 — 저장 전 설정으로도 시험');
    r = await post('/api/inbound/preview', { source: 'mail' }, { Authorization: 'Bearer tok-admin' });
    ok(r.j.ok === false && /아이디/.test(r.j.error), '설정이 비면 할 일을 알려 줌');

    console.log('\n[6] 자동 수집');
    store['gwInboundSources.v1'] = { insta: { igUserId: 'ig1', pageId: 'pg1' }, auto: { insta: true, intervalMin: 10 } };
    env.INBOUND_IG_ACCESS_TOKEN = 'igtok';
    const before = store['gwInboundRecords.v1'].records.length;
    let a = await I.autoPull(env, null, {});
    ok(a.ran && a.ran.insta.ok && a.ran.insta.added === 2 && store['gwInboundRecords.v1'].records.length === before + 2, '켠 소스만 가져와 등록');
    a = await I.autoPull(env, null, {});
    ok(a.skipped === 'not-due', '간격 전에는 다시 안 감');
    store['gwInboundAutoState.v1'] = {};
    a = await I.autoPull(env, null, {});
    ok(a.ran.insta.added === 0 && a.ran.insta.skipped === 2, '이미 넣은 댓글 · DM 은 다시 넣지 않음');
    store['gwInboundSources.v1'] = {};
    a = await I.autoPull(env, null, {});
    ok(a.skipped === 'off', '기본은 모두 꺼짐');

    console.log(`\n인바운드 수집: ${pass} 통과 · ${fail} 실패`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
