// 진행 내역 업데이트 요청 알림 (2026-11-20) — functions/api/_progress_remind.js 의 점검 시각 · 지체 계산 · 받는 사람 · 실행(가짜 Supabase · 가짜 푸시 서버)
const wc = globalThis.crypto || require('crypto').webcrypto;
const subtle = wc.subtle;
const b64u = (b) => Buffer.from(b).toString('base64url');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

(async () => {
    const R = await import('../functions/api/_progress_remind.js');
    const kst = (date, time) => Date.parse(`${date}T${time}:00+09:00`);
    // 2026-11-23 은 월요일
    console.log('\n[점검 시각]');
    ok(R.shouldRun(kst('2026-11-23', '09:00'), {}) && R.shouldRun(kst('2026-11-23', '09:09'), {}), '평일 09:00~09:09 점검');
    ok(!R.shouldRun(kst('2026-11-23', '08:59'), {}) && !R.shouldRun(kst('2026-11-23', '09:10'), {}), '그 밖의 시각은 안 함');
    ok(!R.shouldRun(kst('2026-11-22', '09:05'), {}) && !R.shouldRun(kst('2026-11-21', '09:05'), {}), '토 · 일 안 함');
    ok(!R.shouldRun(kst('2026-11-23', '09:05'), { '2026-11-23': '대체공휴일' }), '공휴일 안 함');

    console.log('\n[지체 계산 — 화면과 같은 기준]');
    const today = '2026-11-23';
    const base = { status: 'working', assignee: '김영업', receivedAt: '2026-11-10' };
    ok(R.progressState(Object.assign({}, base, { workingSince: '2026-11-20 10:00' }), today).stall === 3, '진행 시작 후 3일 내역 없음 → 지체 3일');
    ok(R.progressState(Object.assign({}, base, { workingSince: '2026-11-21 10:00' }), today).stall === 0, '2일은 아직 아님');
    ok(R.progressState(Object.assign({}, base, { workingSince: '2026-11-10', progressLog: [{ kind: 'action', loggedAt: '2026-11-22 09:00' }] }), today).stall === 0, '최근 진행 내역이 있으면 아님');
    ok(R.progressState(Object.assign({}, base, { workingSince: '2026-11-10', progressLog: [{ kind: 'system', loggedAt: '2026-11-22 09:00' }, { kind: 'check', loggedAt: '2026-11-22 09:00' }] }), today).stall === 13, '시스템 기록 · 확인은 진행 내역으로 치지 않음');
    const lateSt = R.progressState(Object.assign({}, base, { workingSince: '2026-11-15', dueDate: '2026-11-20' }), today);
    ok(lateSt.stall === 8 && lateSt.lateNeed && lateSt.late === 3, '완료 예정일 지남 · 지연 사유 없음도 함께');

    console.log('\n[대상 · 받는 사람]');
    const users = [{ id: 'u1', name: '김영업', groupId: 'sales' }, { id: 'u2', name: '박운영', groupId: 'ops' }, { id: 'u3', name: '퇴사자', groupId: 'sales', resigned: true }, { id: 'u4', name: '대표', groupId: 'admin' }, { id: 'u5', name: '이겸직', groupId: 'sales', groupIds: ['ops'] }];
    const groups = [{ id: 'sales', permissions: ['sales'] }, { id: 'ops', permissions: ['ops', 'ops-progress-optional'] }, { id: 'admin', permissions: ['ops-progress-optional'] }];
    ok(R.remindable('김영업', users, groups) && R.remindable('대표', users, groups), '영업 담당자 · 관리자는 받음 (관리자 그룹의 전체 권한은 보지 않음)');
    ok(!R.remindable('박운영', users, groups) && !R.remindable('이겸직', users, groups), '진행 내역 입력 선택 권한(운영 그룹 · 겸직 포함)은 뺌');
    ok(!R.remindable('퇴사자', users, groups) && !R.remindable('없는사람', users, groups), '퇴사자 · 계정 없는 이름은 뺌');
    ok(!R.remindable('박운영', users, []), '권한 그룹을 저장한 적이 없으면 운영 그룹은 기본으로 뺌');
    const w = (id, extra) => Object.assign({ id, center: 'sales', title: '견적 ' + id, status: 'working', assignee: '김영업', workingSince: '2026-11-18 10:00', receivedAt: '2026-11-17' }, extra || {});
    const items = [w('S-1'), w('S-2', { center: 'ops' }), w('S-3', { quoteId: 'Q-1' }), w('S-4', { status: 'assigned' }), w('S-5', { assignee: '박운영' }), w('S-6', { progressLog: [{ kind: 'action', loggedAt: '2026-11-22 18:00' }] })].map(R.workItem)
        .concat([
            { id: 'IN-1', company: '홍대국밥', kob: { dept: '영업', owner: '김영업', contactAt: '2026-11-17', progressLog: [] } },
            { id: 'IN-2', company: '운영건', kob: { dept: '운영', owner: '김영업', contactAt: '2026-11-17' } },
            { id: 'IN-3', company: '수주건', kob: { dept: '영업', owner: '김영업', contactAt: '2026-11-17', result: '영업수주' } },
            { id: 'IN-4', company: '보류건', kob: { dept: '영업', owner: '김영업', contactAt: '2026-11-17', result: '보류' } },
            { id: 'IN-5', company: '미컨택', kob: { dept: '영업', owner: '김영업' } },
            { id: 'IN-6', company: '스팸', spam: true, kob: { dept: '영업', owner: '김영업', contactAt: '2026-11-01' } }
        ].map(R.inboundItem)).filter(Boolean);
    const now = kst(today, '09:00');
    const notis = R.progressReminders(items, users, groups, now);
    ok(notis.map(n => n.progId).sort().join() === 'IN-1,S-1', `대상: 영업 진행중 · 지체 건만 (얻음 ${notis.map(n => n.progId).join()})`);
    const n1 = notis.find(n => n.progId === 'S-1');
    ok(n1.type === 'work-progress-remind' && n1.toUser === '김영업' && n1.progSrc === 'sales' && n1.id === 'prog_work_S-1_2026-11-23' && n1.date === today && n1.time === '09:00', '알림 모양 — 종류 · 받는 사람 · 화면 연결 · 하루 한 번 번호');
    ok(/5일째 진행 내역이 없습니다/.test(n1.detail) && /지체 사유/.test(n1.detail), `알림 내용 (${n1.detail})`);
    ok(notis.find(n => n.progId === 'IN-1').progSrc === 'inbound' && /6일째/.test(notis.find(n => n.progId === 'IN-1').detail), '인바운드는 고객 컨택일자부터 셈');

    console.log('\n[실행] 가짜 Supabase · 가짜 푸시 서버');
    {
        const vk = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
        const vjwk = await subtle.exportKey('jwk', vk.privateKey);
        const vpub = new Uint8Array(await subtle.exportKey('raw', vk.publicKey));
        const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', VAPID_PUBLIC_KEY: b64u(vpub), VAPID_PRIVATE_KEY: vjwk.d, VAPID_SUBJECT: 'mailto:t@k.co' };
        const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
        const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/kim', keys: { p256dh: b64u(new Uint8Array(await subtle.exportKey('raw', kp.publicKey))), auth: b64u(wc.getRandomValues(new Uint8Array(16))) } };
        const saved = new Map(); const pushed = []; let reads = 0; let holidays = {};
        global.fetch = async (url, init) => {
            const u = decodeURIComponent(String(url));
            const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
            const resp = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
            if (u.startsWith('https://fcm.googleapis.com/')) { pushed.push(u.split('/').pop()); return { ok: true, status: 201, text: async () => '' }; }
            reads++;
            if (u.includes('/rest/v1/app_store') && u.includes('gwUsers.v1')) return resp([
                { key: 'gwUsers.v1', value: users }, { key: 'gwPermissionGroups.v2', value: { version: 2, groups } },
                { key: 'gwInboundRecords.v1', value: { seq: 9, records: [{ id: 'IN-1', company: '홍대국밥', kob: { dept: '영업', owner: '김영업', contactAt: '2026-11-17' } }] } },
                { key: 'gwHolidays.v1', value: { days: holidays } }]);
            if (u.includes('/rest/v1/app_store') && u.includes('gwPushSubs.v1')) return resp([{ key: 'gwPushSubs.v1/u1', value: { subs: [sub], prefs: {} } }]);
            if (u.includes('/rest/v1/works')) return resp(u.includes('offset=0') ? [{ id: 'S-1', data: w('S-1') }, { id: 'S-6', data: w('S-6', { progressLog: [{ kind: 'action', loggedAt: '2026-11-22 18:00' }] }) }] : []);
            if (u.includes('/rest/v1/notifications') && (!init || !init.method || init.method === 'GET')) { const day = (u.match(/like\.prog_\*_(\d{4}-\d{2}-\d{2})/) || [])[1]; return resp(Array.from(saved.keys()).filter(id => id.endsWith('_' + day)).map(id => ({ id }))); }
            if (u.includes('/rest/v1/notifications')) { const fresh = body.filter(r => !saved.has(r.id)); fresh.forEach(r => saved.set(r.id, r)); return resp(fresh); }
            return resp([]);
        };
        const r0 = await R.runProgressReminders(env, kst(today, '10:30'));
        ok(r0.skipped && reads === 0, '점검 시각이 아니면 아무것도 읽지 않음');
        const r1 = await R.runProgressReminders(env, now);
        ok(r1.ok && r1.made === 2 && saved.has('prog_work_S-1_2026-11-23') && saved.has('prog_inbound_IN-1_2026-11-23'), `알림함에 2건 (${JSON.stringify(r1)})`);
        ok(r1.pushed === 2 && pushed.length === 2, '담당자 기기로 푸시');
        const r2 = await R.runProgressReminders(env, kst(today, '09:05'));
        ok(r2.made === 0 && pushed.length === 2, '같은 날 다시 돌아도 두 번 가지 않음');
        const r3 = await R.runProgressReminders(env, kst('2026-11-24', '09:00'));
        ok(r3.made === 2, '다음 날 아침 다시 알림 (내역을 입력할 때까지)');
        holidays = { '2026-11-25': '시험 공휴일' };
        const r4 = await R.runProgressReminders(env, kst('2026-11-25', '09:00'));
        ok(r4.skipped && r4.made === undefined, '공휴일은 건너뜀');
        ok((await R.runProgressReminders({}, now)).ok === false, 'Supabase 설정이 없으면 건너뜀');
        // 기기가 한도(20)를 넘으면 — 이번에 20대, 나머지는 다음 분에 (검토 반영)
        const many = []; const manyUsers = users.slice(); const manySubs = {};
        for (let i = 1; i <= 25; i++) {
            manyUsers.push({ id: 'm' + i, name: '영업' + i, groupId: 'sales' });
            many.push({ id: 'W-' + i, data: w('W-' + i, { assignee: '영업' + i }) });
            const kp2 = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
            manySubs['gwPushSubs.v1/m' + i] = { subs: [{ endpoint: 'https://fcm.googleapis.com/fcm/send/m' + i, keys: { p256dh: b64u(new Uint8Array(await subtle.exportKey('raw', kp2.publicKey))), auth: b64u(wc.getRandomValues(new Uint8Array(16))) } }], prefs: {} };
        }
        const f1 = global.fetch; pushed.length = 0;
        global.fetch = async (url, init) => {
            const u = decodeURIComponent(String(url));
            const resp = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
            if (u.includes('/rest/v1/app_store') && u.includes('gwUsers.v1')) return resp([{ key: 'gwUsers.v1', value: manyUsers }, { key: 'gwPermissionGroups.v2', value: { version: 2, groups } }, { key: 'gwHolidays.v1', value: { days: {} } }]);
            if (u.includes('/rest/v1/app_store') && u.includes('gwPushSubs.v1')) return resp(Object.keys(manySubs).filter(k => u.includes('"' + k + '"')).map(k => ({ key: k, value: manySubs[k] })));
            if (u.includes('/rest/v1/works')) return resp(u.includes('offset=0') ? many : []);
            return f1(url, init);
        };
        const d = '2026-11-26';
        const m1 = await R.runProgressReminders(env, kst(d, '09:00'));
        const m2 = await R.runProgressReminders(env, kst(d, '09:01'));
        const m3 = await R.runProgressReminders(env, kst(d, '09:02'));
        ok(m1.pushed === 20 && m1.left === 5 && m2.pushed === 5 && m2.left === 0 && m3.made === 0 && new Set(pushed).size === 25, `기기 25대 — 첫 분 20대 · 다음 분 5대, 빠지는 사람 없음 (${JSON.stringify([m1, m2, m3])})`);
        global.fetch = f1;
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
