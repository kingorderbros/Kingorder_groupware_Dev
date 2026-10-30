// 일정 알림 (2026-10-23) — functions/api/_reminders.js 의 시각 계산 · 받는 사람 · 반복 회차 · 실행(가짜 Supabase · 푸시 없음)
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

(async () => {
    const R = await import('../functions/api/_reminders.js');
    const P = await import('../functions/api/_push.js');
    const at = (date, time) => R.kstMillis(date, time);

    console.log('\n[시각] 한국 시간 기준');
    {
        const t = R.reminderTimes({ reminder: '15min', startTime: '10:00' }, '2026-10-24');
        ok(t.at === at('2026-10-24', '09:45'), '10:00 일정의 15분 전 = 09:45');
        const d = R.reminderTimes({ reminder: '1day', startTime: '14:30' }, '2026-10-24');
        ok(d.at === at('2026-10-23', '14:30'), '1일 전 = 전날 같은 시각');
        const s = R.reminderTimes({ reminder: 'sameday', startTime: '15:00' }, '2026-10-24');
        ok(s.at === at('2026-10-24', '08:30'), '당일 오전 = 그날 08:30');
        const a = R.reminderTimes({ reminder: '15min', allDay: true }, '2026-10-24');
        ok(a.at === at('2026-10-24', '08:45'), '종일 일정은 09:00 기준 (15분 전 = 08:45)');
        ok(R.reminderTimes({ reminder: 'none', startTime: '10:00' }, '2026-10-24') === null, '알림 없음이면 계산하지 않음');
        ok(R.kstDate(at('2026-10-24', '00:10')) === '2026-10-24', '한국 자정 직후 날짜가 하루 밀리지 않음');
    }

    console.log('\n[보낼 때] 1분마다 돌며 지난 10분 안의 알림만');
    {
        const sch = { id: 's1', title: '고객 미팅', date: '2026-10-24', startTime: '10:00', reminder: '15min', salesperson: '김영업' };
        ok(R.dueReminders([sch], at('2026-10-24', '09:44')).length === 0, '알림 시각 전에는 보내지 않음');
        ok(R.dueReminders([sch], at('2026-10-24', '09:45')).length === 1, '알림 시각에 보냄');
        ok(R.dueReminders([sch], at('2026-10-24', '09:52')).length === 1, '서버가 늦게 돌아도 10분 안이면 따라잡음');
        ok(R.dueReminders([Object.assign({}, sch, { offState: 'cancelled' })], at('2026-10-24', '09:45')).length === 0, '취소된 일정은 알리지 않음 (2026-10-30)');
        ok(R.dueReminders([Object.assign({}, sch, { offState: 'deleted' })], at('2026-10-24', '09:45')).length === 0, '삭제된 일정은 알리지 않음 (2026-10-30)');
        ok(R.dueReminders([sch], at('2026-10-24', '09:56')).length === 0, '10분이 넘게 지난 알림은 보내지 않음');
        const rec = { id: 's2', title: '주간 회의', date: '2026-10-05', startTime: '09:00', reminder: '15min', recur: { freq: 'weekly', days: [1], interval: 1 } };
        ok(R.dueReminders([rec], at('2026-10-26', '08:45')).length === 1, '반복 일정 — 그 회차(10/26 월)에 보냄');
        ok(R.dueReminders([rec], at('2026-10-27', '08:45')).length === 0, '반복 일정 — 회차가 아닌 날(화)은 보내지 않음');
        const ex = Object.assign({}, rec, { recur: Object.assign({}, rec.recur, { exdates: ['2026-10-26'] }) });
        ok(R.dueReminders([ex], at('2026-10-26', '08:45')).length === 0, '지운 회차는 보내지 않음');
        ok(R.dueReminders([Object.assign({}, sch, { fromWork: { kind: 'wc', auto: true } })], at('2026-10-24', '09:45')).length === 0, '업무 접수로 저절로 만든 일정은 알리지 않음');
        ok(R.recurDates({ date: '2026-01-31', recur: { freq: 'monthly' } }, '2026-02-01', '2026-03-31').join(',') === '2026-03-31', '매월 31일 — 2월은 건너뜀');
    }

    console.log('\n[당일 오전] 기본값으로 들어간 것은 보내지 않고, 직접 고른 것만 (2026-10-28)');
    {
        const sd = { id: 'sd1', title: '오후 방문', date: '2026-10-24', startTime: '14:00', reminder: 'sameday', salesperson: '김영업' };
        ok(R.dueReminders([sd], at('2026-10-24', '08:30')).length === 0, '직접 고르지 않은 당일 오전 — 보내지 않음');
        ok(R.dueReminders([Object.assign({}, sd, { reminderPicked: true })], at('2026-10-24', '08:30')).length === 1, '직접 고른 당일 오전 — 보냄');
        ok(R.dueReminders([Object.assign({}, sd, { reminder: '15min' })], at('2026-10-24', '13:45')).length === 1, '15분 전은 표시 없어도 보냄 (기본값으로 들어가지 않는 값)');
        const early = Object.assign({}, sd, { startTime: '08:00', reminderPicked: true });
        ok(R.dueReminders([early], at('2026-10-24', '07:30')).length === 1, '08:30 전에 시작하는 일정의 당일 오전 — 시작 30분 전에 보냄');
    }

    console.log('\n[받는 사람] 담당자 · 등록자 · 참석자(거부 제외) · 퇴사자 제외');
    {
        const users = [{ id: 'u1', name: '김영업', email: 'kim@k.co' }, { id: 'u2', name: '이등록', email: 'lee@k.co' },
                       { id: 'u3', name: '박참석', email: 'p@k.co' }, { id: 'u4', name: '최거부', email: 'c@k.co' }, { id: 'u5', name: '정퇴사', email: 'j@k.co', resigned: true }];
        const sch = { salesperson: '김영업', createdBy: 'LEE@k.co', attendees: [{ name: '박참석', status: 'accepted' }, { name: '최거부', status: 'declined' }, { name: '정퇴사', status: 'pending' }, { name: '김영업', status: 'accepted' }] };
        ok(R.reminderRecipients(sch, users).sort().join(',') === ['김영업', '박참석', '이등록'].sort().join(','), '김영업 · 이등록 · 박참석 (중복 · 거부 · 퇴사 제외)');
    }

    console.log('\n[알림 한 건]');
    {
        const item = R.dueReminders([{ id: 's3', title: '설치', date: '2026-10-24', startTime: '10:00', endTime: '11:00', reminder: '15min', salesperson: '김영업' }], at('2026-10-24', '09:45'))[0];
        const n = R.reminderNotification(item, '김영업');
        ok(n.type === 'schedule-reminder' && n.toUser === '김영업' && n.toDept === '', '종류 · 받는 사람 (본부 전체로 퍼지지 않게 toDept 비움)');
        ok(n.detail.includes('15분 전') && n.detail.includes('10:00~11:00'), '문구에 알림 종류 · 시간');
        ok(n.id === R.reminderNotification(item, '김영업').id && n.id !== R.reminderNotification(item, '박참석').id, '번호가 사람마다 정해져 두 번 가지 않음');
        ok(n.scheduleId === 's3', '누르면 그 일정을 엶');
        ok(P.categoryOf('schedule-reminder') === 'schedule' && P.categoryOf('schedule-change') === 'collab', '푸시 종류 — 일정 알림 (일정 변경 요청은 협업 그대로)');
    }

    console.log('\n[실행] 가짜 Supabase — 넣은 것만 새 알림, 이미 보낸 것은 건너뜀');
    {
        const rows = { notifications: new Map() };
        const sched = [{ id: 's9', data: { title: '오후 미팅', date: '2026-10-24', startTime: '14:00', reminder: '15min', salesperson: '김영업' } },
                       { id: 's10', data: { title: '알림 없음', date: '2026-10-24', startTime: '14:00', reminder: 'none', salesperson: '김영업' } }];
        const calls = [];
        global.fetch = async (url, init) => {
            const u = String(url); calls.push(u);
            const body = init && init.body ? JSON.parse(init.body) : null;
            const resp = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
            if (u.includes('/rest/v1/schedules')) return resp(sched.filter(r => r.data.reminder !== 'none'));
            if (u.includes('/rest/v1/app_store') && u.includes('gwUsers.v1')) return resp([{ value: [{ id: 'u1', name: '김영업', email: 'kim@k.co' }] }]);
            if (u.includes('/rest/v1/notifications')) {
                const fresh = body.filter(r => !rows.notifications.has(r.id));
                fresh.forEach(r => rows.notifications.set(r.id, r));
                return resp(fresh);
            }
            return resp([]);
        };
        const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
        const r1 = await R.runScheduleReminders(env, at('2026-10-24', '13:45'));
        ok(r1.ok && r1.due === 1 && r1.made === 1, '알림 1건 생성');
        const r2 = await R.runScheduleReminders(env, at('2026-10-24', '13:46'));
        ok(r2.ok && r2.made === 0, '1분 뒤 다시 돌아도 같은 알림은 만들지 않음');
        const r3 = await R.runScheduleReminders(env, at('2026-10-24', '12:00'));
        ok(r3.ok && r3.due === 0 && calls.filter(c => c.includes('notifications')).length === 2, '보낼 것이 없으면 일정 한 번만 읽고 끝');
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
