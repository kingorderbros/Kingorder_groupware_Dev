// 인바운드 새 건 알림 (2026-11-19) — functions/api/_inbound_notify.js 의 받는 사람 · 알림 모양 · 묶기 · 실행(가짜 Supabase · 가짜 푸시 서버)
const wc = globalThis.crypto || require('crypto').webcrypto;
const subtle = wc.subtle;
const b64u = (b) => Buffer.from(b).toString('base64url');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

(async () => {
    const N = await import('../functions/api/_inbound_notify.js');
    const P = await import('../functions/api/_push.js');

    const groups = [
        { id: 'admin', permissions: ['inbound-center'] },
        { id: 'sales', permissions: ['inbound-center', 'sales'] },
        { id: 'ops', permissions: ['inbound-center', 'ops'] },
        { id: 'payment', permissions: ['payment'] },
        { id: 'vendor', external: true, permissions: ['inbound-center', 'inbound-vendor'] }
    ];
    const users = [
        { id: 'a', name: '관리자', dept: 'admin' },
        { id: 's1', name: '김영업', dept: 'sales', groupId: 'sales' },
        { id: 's2', name: '이영업', dept: 'sales', groupId: 'sales' },
        { id: 's3', name: '퇴사자', dept: 'sales', groupId: 'sales', resigned: true },
        { id: 's4', name: '휴직자', dept: 'sales', groupId: 'sales', onLeave: true },
        { id: 'o1', name: '박운영', dept: 'ops', groupId: 'ops' },
        { id: 'p1', name: '최결제', dept: 'payment', groupId: 'payment' },
        { id: 'p2', name: '정겸직', dept: 'payment', groupId: 'payment', groupIds: ['sales'] },
        { id: 'v1', name: '외주', dept: 'vendor', groupId: 'vendor' }
    ];
    const names = (rec, g, except) => N.inboundRecipients(rec, users, g === undefined ? groups : g, except).sort().join(',');

    console.log('\n[받는 사람]');
    ok(names({ kob: { dept: '영업' } }) === '김영업,이영업', '영업 배정 → 영업본부 직원 (퇴사 · 휴직 제외)');
    ok(names({ kob: { dept: '운영' } }) === '박운영', '운영 배정 → 운영본부 직원');
    ok(names({ kob: { dept: '' } }) === '관리자,김영업,박운영,이영업,정겸직', '미배정 → 인바운드 화면 권한이 있는 직원 모두 (결제본부 · 외주 제외, 겸직 그룹 포함)');
    ok(names({ kob: { dept: '운영' } }, groups, '박운영') === '관리자,김영업,이영업,정겸직', '그 본부에 받을 사람이 없으면(등록한 본인뿐) 화면 권한자 모두');
    ok(names({ kob: { dept: '' } }, []) === '관리자,김영업,박운영,이영업,정겸직', '권한 그룹을 저장한 적이 없으면 화면 기본값(경영진 · 영업 · 운영 그룹)');
    ok(names({ kob: { dept: '영업' } }, [{ id: 'sales', permissions: ['sales'] }, { id: 'ops', permissions: ['inbound-center'] }]) === '관리자,박운영', '영업 그룹에서 인바운드 권한을 빼면 영업 직원은 받지 않음 (받을 사람이 없어 남은 권한자에게)');

    console.log('\n[알림 모양 · 묶기]');
    const now = Date.UTC(2026, 10, 19, 1, 5);   // 한국 10:05
    const rec = { id: 'IN-0101', company: '강남치킨', name: '홍길동', requestNote: '키오스크   설치 문의\n가격', channel: 'kod_contact', source: { label: '킹오더닷컴 · 문의하기' }, kob: { dept: '영업' } };
    const n = N.inboundNotification(rec, '김영업', now);
    ok(n.type === 'inbound-new' && n.inboundId === 'IN-0101' && n.toUser === '김영업' && n.title === '강남치킨', '한 건 알림 — 종류 · 인입 번호 · 받는 사람 · 업체명');
    ok(n.detail === 'IN-0101 · 킹오더닷컴 · 문의하기 · 영업본부 · 키오스크 설치 문의 가격', `내용 = 번호 · 경로 · 본부 · 문의 (얻음 ${n.detail})`);
    ok(n.date === '2026-11-19' && n.time === '10:05' && n.id === 'inb_IN-0101_김영업', '한국 날짜 · 시각, 알림 번호는 인입 번호 + 받는 사람');
    ok(P.categoryOf('inbound-new') === 'inbound' && P.CATEGORIES.some(c => c.id === 'inbound' && c.label === '인바운드'), "푸시 종류 '인바운드' — 알림 설정에서 켜고 끔");
    const p = P.payloadOf(n, { 'inbound-new': '인바운드' });
    ok(p.title === '[인바운드] 강남치킨' && p.url === '/?noti=' + encodeURIComponent(n.id), '푸시 제목 [인바운드] 업체명 · 누르면 그 알림');
    const three = [1, 2, 3].map(i => Object.assign({}, rec, { id: 'IN-02' + i }));
    ok(N.inboundNotifications(three, users, groups, now).filter(x => x.toUser === '김영업').length === 3, '3건까지는 한 건씩');
    const five = [1, 2, 3, 4, 5, 6].map(i => Object.assign({}, rec, { id: 'IN-03' + i, company: '가게' + i }));
    const b = N.inboundNotifications(five, users, groups, now).filter(x => x.toUser === '김영업');
    ok(b.length === 1 && b[0].title === '새 인바운드 6건' && b[0].inboundId === '' && /외 1건$/.test(b[0].detail), '4건 이상은 한 사람에게 한 개로 묶음');

    console.log('\n[실행] 가짜 Supabase · 가짜 푸시 서버');
    {
        const vk = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
        const vjwk = await subtle.exportKey('jwk', vk.privateKey);
        const vpub = new Uint8Array(await subtle.exportKey('raw', vk.publicKey));
        const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', VAPID_PUBLIC_KEY: b64u(vpub), VAPID_PRIVATE_KEY: vjwk.d, VAPID_SUBJECT: 'mailto:t@k.co' };
        const mkSub = async (tail) => {
            const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
            return { endpoint: 'https://fcm.googleapis.com/fcm/send/' + tail, keys: { p256dh: b64u(new Uint8Array(await subtle.exportKey('raw', kp.publicKey))), auth: b64u(wc.getRandomValues(new Uint8Array(16))) } };
        };
        const subs = {
            'gwPushSubs.v1/s1': { subs: [await mkSub('kim')], prefs: {} },
            'gwPushSubs.v1/s2': { subs: [await mkSub('lee')], prefs: { inbound: false } },   // 인바운드 알림 끔
        };
        const saved = new Map(); const pushed = [];
        global.fetch = async (url, init) => {
            const u = decodeURIComponent(String(url));
            const body = init && init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
            const resp = (obj) => ({ ok: true, status: 201, text: async () => JSON.stringify(obj) });
            if (u.startsWith('https://fcm.googleapis.com/')) { pushed.push(u.split('/').pop()); return { ok: true, status: 201, text: async () => '' }; }
            if (u.includes('/rest/v1/app_store') && u.includes('gwUsers.v1')) return resp([{ key: 'gwUsers.v1', value: users }, { key: 'gwPermissionGroups.v2', value: groups }]);
            if (u.includes('/rest/v1/app_store') && u.includes('gwPushSubs.v1')) return resp(Object.keys(subs).filter(k => u.includes(k)).map(k => ({ key: k, value: subs[k] })));
            if (u.includes('/rest/v1/notifications')) { const fresh = body.filter(r => !saved.has(r.id)); fresh.forEach(r => saved.set(r.id, r)); return resp(fresh); }
            return resp([]);
        };
        const r1 = await N.notifyInboundAdded(env, [rec], now);
        ok(r1.ok && r1.made === 2 && saved.has('inb_IN-0101_김영업') && saved.has('inb_IN-0101_이영업'), '영업 배정 건 → 영업 직원 2명 알림함에');
        ok(r1.pushed === 1 && pushed.join() === 'kim', "푸시는 김영업 기기만 (이영업은 '인바운드' 끔)");
        const r2 = await N.notifyInboundAdded(env, [rec], now);
        ok(r2.made === 0 && pushed.length === 1, '같은 건을 다시 불러도 알림 · 푸시가 두 번 가지 않음');
        const r3 = await N.notifyInboundAdded(env, [], now);
        ok(r3.ok && r3.made === 0, '새 건이 없으면 아무것도 하지 않음');
        const r4 = await N.notifyInboundAdded({}, [rec], now);
        ok(r4.ok === false, 'Supabase 설정이 없으면 건너뜀');
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
