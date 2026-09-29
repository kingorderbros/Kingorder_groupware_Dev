// 폰 · PC 푸시 알림 (2026-09-29 · 9단계) — functions/api/_push.js 판단 · 암호 + /api/push/* 흐름.
// 암호는 받는 쪽(브라우저)처럼 직접 풀어 보고, VAPID 서명은 공개 키로 검증합니다. Supabase · 푸시 서비스는 가짜 fetch.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const { webcrypto: wc } = require('crypto');
const subtle = wc.subtle;
const enc = new TextEncoder();

const store = {
    'gwUsers.v1': [
        { id: 'u1', name: '보낸이', dept: 'sales', team: '1팀', email: 'me@k.co', groupId: 'sales' },
        { id: 'u2', name: '김영업', dept: 'sales', team: '1팀', email: 'kim@k.co', groupId: 'sales' },
        { id: 'u3', name: '이영업', dept: 'sales', team: '2팀', email: 'lee@k.co', groupId: 'sales' },
        { id: 'u4', name: '박운영', dept: 'ops', team: '', email: 'park@k.co', groupId: 'ops' },
        { id: 'u5', name: '최영업', dept: 'sales', team: '', email: 'choi@k.co', groupId: 'sales' }
    ]
};
let whoEmail = '';
const pushed = [];                 // 푸시 서비스로 간 요청
let goneEndpoint = '';
global.fetch = async (url, opt = {}) => {
    const u = new URL(String(url)), m = opt.method || 'GET';
    const res = (body, status) => new Response(body === undefined ? null : JSON.stringify(body), { status: status || 200 });
    if (u.pathname === '/auth/v1/user') return whoEmail ? res({ email: whoEmail }) : res({}, 401);
    if (u.pathname === '/rest/v1/app_store') {
        if (m === 'POST') { JSON.parse(opt.body).forEach(r => { store[r.key] = r.value; }); return res(undefined, 201); }
        const k = u.searchParams.get('key') || '';
        const keys = k.startsWith('in.(') ? k.slice(4, -1).split(',').map(x => x.replace(/"/g, '')) : [k.replace(/^eq\./, '')];
        return res(keys.filter(x => x in store).map(x => ({ key: x, value: store[x] })));
    }
    if (u.hostname === 'push.example') { pushed.push({ url: String(url), opt }); return res({}, String(url) === goneEndpoint ? 410 : 201); }
    return res([], 200);
};
const b64u = (b) => Buffer.from(b).toString('base64url');
const unb = (s) => new Uint8Array(Buffer.from(s, 'base64url'));

// 받는 쪽(브라우저) 흉내 — 키 만들기 · 풀기
async function makeBrowser() {
    const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const pub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    const auth = wc.getRandomValues(new Uint8Array(16));
    return { kp, pub, auth };
}
async function hkdf(salt, ikm, info, n) {
    const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8));
}
async function decrypt(b, body) {
    const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
    const asKey = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, b.kp.privateKey, 256));
    const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...b.pub, ...asPub]);
    const ikm = await hkdf(b.auth, shared, info, 32);
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
    const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
    if (pt[pt.length - 1] !== 2) throw new Error('마지막 조각 표시가 없음');
    return new TextDecoder().decode(pt.slice(0, -1));
}

(async () => {
    const P = await import('../functions/api/_push.js');
    // 서버 VAPID 키
    const vk = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const vjwk = await subtle.exportKey('jwk', vk.privateKey);
    const vpub = new Uint8Array(await subtle.exportKey('raw', vk.publicKey));
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', VAPID_PUBLIC_KEY: b64u(vpub), VAPID_PRIVATE_KEY: vjwk.d, VAPID_SUBJECT: 'mailto:t@k.co' };

    console.log('\n[1] 종류 · 받는 사람');
    ok(P.categoryOf('work-received') === 'work' && P.categoryOf('collab-requested') === 'collab' && P.categoryOf('delay-inquiry') === 'collab'
        && P.categoryOf('schedule-change-result') === 'collab' && P.categoryOf('dev-review') === 'dev' && P.categoryOf('뭔가') === 'etc', '알림 종류를 묶음으로');
    const names = (n) => P.recipientsOf(store['gwUsers.v1'], n, 'me@k.co').map(u => u.name).join();
    ok(names({ toUser: '김영업' }) === '김영업', '사람 앞 알림');
    ok(names({ toDept: 'sales' }) === '김영업,이영업,최영업', '본부 앞 알림 — 보낸 사람은 빼고');
    ok(names({ toDept: 'sales', toTeam: '1팀' }) === '김영업,최영업', '팀 지정 — 그 팀 + 팀 없는 사람 (알림함과 같은 규칙)');
    ok(names({ toUser: '보낸이' }) === '', '나에게 온 것이라도 내가 한 일이면 안 보냄');

    console.log('\n[2] 구독 기록');
    const b1 = await makeBrowser(), b2 = await makeBrowser();
    const sub1 = { endpoint: 'https://push.example/a', keys: { p256dh: b64u(b1.pub), auth: b64u(b1.auth) } };
    const sub2 = { endpoint: 'https://push.example/b', keys: { p256dh: b64u(b2.pub), auth: b64u(b2.auth) } };
    ok(P.validSubscription(sub1) && !P.validSubscription({ endpoint: 'http://x', keys: sub1.keys }) && !P.validSubscription({ endpoint: 'https://x', keys: { p256dh: 'x', auth: 'y' } }), '구독 정보 확인 (https · 키 길이)');
    let l = P.addSub([], 'u2', sub1, '아이폰');
    l = P.addSub(l, 'u2', sub1, '아이폰');
    ok(l[0].subs.length === 1, '같은 기기는 한 번만');
    l = P.addSub(l, 'u4', sub1, '넘겨받은 폰');
    ok(l.find(r => r.id === 'u2').subs.length === 0 && l.find(r => r.id === 'u4').subs.length === 1, '기기를 다른 사람이 쓰면 앞사람 기록에서 빠짐');
    l = P.setPrefs(l, 'u4', { meeting: false, 이상한칸: true });
    ok(P.wants(l.find(r => r.id === 'u4'), 'work') && !P.wants(l.find(r => r.id === 'u4'), 'meeting') && !('이상한칸' in l.find(r => r.id === 'u4').prefs), '종류별 끄기 (처음엔 모두 켜짐 · 모르는 칸은 버림)');
    ok(P.removeSub(l, sub1.endpoint).every(r => !r.subs.length), '그만 받기');

    console.log('\n[3] 암호 · 서명');
    const body = await P.encryptPayload(sub1, JSON.stringify({ title: '안녕하세요 👋', body: '업무가 접수되었습니다' }));
    const plain = await decrypt(b1, body);
    ok(JSON.parse(plain).title === '안녕하세요 👋', '받는 쪽 키로 풀면 원래 내용 (RFC 8291 aes128gcm)');
    let wrong = false; try { await decrypt(b2, body); } catch (e) { wrong = true; }
    ok(wrong, '다른 기기 키로는 못 푼다');
    const hdr = await P.vapidHeader(sub1.endpoint, env);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(hdr);
    const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
    const good = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk.publicKey, unb(m[3]), enc.encode(m[1] + '.' + m[2]));
    ok(good && claims.aud === 'https://push.example' && claims.sub === 'mailto:t@k.co' && m[4] === env.VAPID_PUBLIC_KEY, 'VAPID 서명이 공개 키로 검증된다 (aud · sub · k)');
    ok(P.keysReady(env) && !P.keysReady({}), '키가 없으면 준비 안 됨');

    const { onRequest } = await import('../functions/api/[[route]].js');
    const call = async (who, method, path, bodyObj, e) => {
        whoEmail = who;
        const r = await onRequest({ request: new Request('https://gw' + path, { method, headers: who ? { Authorization: 'Bearer t' } : {}, body: method === 'GET' ? undefined : JSON.stringify(bodyObj || {}) }), env: e || env });
        return { status: r.status, j: await r.json().catch(() => null) };
    };

    console.log('\n[4] 서버 흐름');
    ok((await call('', 'POST', '/api/push/subscribe', { subscription: sub1 })).status === 401, '로그인 없으면 401');
    ok((await call('kim@k.co', 'POST', '/api/push/subscribe', { subscription: sub1, device: '아이폰' })).status === 200, '김영업 폰 구독');
    ok((await call('park@k.co', 'POST', '/api/push/subscribe', { subscription: sub2, device: 'PC' })).status === 200, '박운영 PC 구독');
    let r = await call('kim@k.co', 'GET', '/api/push/status');
    ok(r.j.devices.length === 1 && r.j.prefs.work === true && r.j.categories.length === 8, '내 상태 — 기기 1대 · 모두 켜짐');
    r = await call('me@k.co', 'POST', '/api/push/send', { n: { id: 'N1', type: 'work-received', title: '킹오더 강남점', detail: '<b>설치</b> 접수', toDept: 'sales', toTeam: '1팀' }, label: '업무접수' });
    ok(r.j.sent === 1 && pushed.length === 1 && pushed[0].url === sub1.endpoint, '영업 1팀 알림 → 김영업 폰에만 (박운영 · 보낸 사람 제외)');
    const got = JSON.parse(await decrypt(b1, new Uint8Array(pushed[0].opt.body)));
    ok(got.title === '[업무접수] 킹오더 강남점' && got.body === '설치 접수' && got.url === '/?noti=N1', '폰에 뜰 문구 — 제목 · 본문(태그 뺌) · 누르면 갈 곳');
    ok(pushed[0].opt.headers['Content-Encoding'] === 'aes128gcm' && /^vapid t=/.test(pushed[0].opt.headers.Authorization) && pushed[0].opt.headers.TTL, '보내는 머리글 (aes128gcm · VAPID · TTL)');
    await call('kim@k.co', 'POST', '/api/push/prefs', { prefs: { work: false } });
    pushed.length = 0;
    r = await call('me@k.co', 'POST', '/api/push/send', { n: { id: 'N2', type: 'work-received', title: 'x', toUser: '김영업' } });
    ok(r.j.sent === 0 && pushed.length === 0, '업무 접수를 끈 사람에게는 안 보냄');
    r = await call('me@k.co', 'POST', '/api/push/send', { n: { id: 'N3', type: 'issue-reported', title: 'y', toUser: '김영업' } });
    ok(r.j.sent === 1, '다른 종류(이슈)는 그대로 받음');
    goneEndpoint = sub2.endpoint; pushed.length = 0;
    r = await call('me@k.co', 'POST', '/api/push/send', { n: { id: 'N4', type: 'dev-review', title: 'z', toUser: '박운영' } });
    ok(r.j.removed === 1 && !store['gwPushSubs.v1'].find(x => x.id === 'u4').subs.length, '브라우저가 버린 구독(410)은 지운다');
    r = await call('me@k.co', 'POST', '/api/push/send', { n: { id: 'N5', type: 'x', toUser: '김영업' } }, Object.assign({}, env, { VAPID_PRIVATE_KEY: '' }));
    ok(r.status === 200 && r.j.sent === 0 && /VAPID/.test(r.j.skipped), '키를 아직 안 넣었으면 조용히 건너뜀 (화면 알림은 그대로)');
    r = await call('', 'GET', '/api/push/key');
    ok(r.j.ready && r.j.publicKey === env.VAPID_PUBLIC_KEY, '공개 키는 로그인 없이 받음');
    ok((await call('kim@k.co', 'POST', '/api/push/unsubscribe', { endpoint: sub1.endpoint })).status === 200 && !store['gwPushSubs.v1'].find(x => x.id === 'u2').subs.length, '그만 받기');

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
