// 구글 캘린더 연동 — 옮기는 규칙만 따로 시험합니다 (npm run check)
// 구글에 실제로 부르지 않고, 일정 ↔ 구글 일정 사이의 변환과 캘린더 고르기만 봅니다.
let pass = 0, fail = 0;
const ok = (t, c) => { if (c) { pass++; console.log('  ✓ ' + t); } else { fail++; console.error('  ✗ ' + t); } };
const eq = (t, a, b) => ok(t + (a === b ? '' : `  (나온 값: ${JSON.stringify(a)} · 기대: ${JSON.stringify(b)})`), a === b);

const USERS = [
    { id: 'u1', name: '홍길동', email: 'hong@kingorder.co.kr', googleEmail: 'hong.kob@gmail.com', dept: 'sales' },
    { id: 'u2', name: '김영희', email: 'kim@kingorder.co.kr', googleEmail: 'kim.kob@gmail.com', dept: 'ops' },
    { id: 'u3', name: '박철수', email: 'park@kingorder.co.kr', googleEmail: '', dept: 'sales' }
];
const CALS = [
    { key: 'cal:company', kind: 'company', google_calendar_id: 'g-company' },
    { key: 'cal:sales-share', kind: 'sales-share', google_calendar_id: 'g-sales' },
    { key: 'cal:install-as', kind: 'install-as', google_calendar_id: 'g-as' },
    { key: 'cal:team:sales', kind: 'team', dept: 'sales', google_calendar_id: 'g-team-sales' },
    { key: 'cal:personal:hong@kingorder.co.kr', kind: 'personal', member_email: 'hong@kingorder.co.kr', google_calendar_id: 'g-hong' }
];
const fakeStore = { storeValue: async () => USERS, calendars: async () => CALS };

(async () => {
    const G = await import('../functions/api/_gcal.js');
    const ctx = await G.buildContext({}, fakeStore);

    console.log('\n[1] 이 일정이 어느 구글 캘린더로 가는가');
    eq('개인 일정은 그 사람의 캘린더로', G.calendarKeyOf({ calendar: 'personal', salesperson: '홍길동' }, ctx), 'cal:personal:hong@kingorder.co.kr');
    eq('팀 일정은 부서 캘린더로', G.calendarKeyOf({ calendar: 'team', dept: 'sales' }, ctx), 'cal:team:sales');
    eq('전사일정', G.calendarKeyOf({ calendar: 'company' }, ctx), 'cal:company');
    eq('영업 공유', G.calendarKeyOf({ calendar: 'sales-share' }, ctx), 'cal:sales-share');
    eq('설치/AS 공유', G.calendarKeyOf({ calendar: 'install-as' }, ctx), 'cal:install-as');
    eq('구글 주소가 없는 사람의 개인 일정은 보낼 곳이 없다', G.calendarKeyOf({ calendar: 'personal', salesperson: '없는사람' }, ctx), '');
    eq('캘린더를 안 고르면 팀으로 본다', G.calendarKeyOf({ dept: 'sales' }, ctx), 'cal:team:sales');

    console.log('\n[2] 그룹웨어 일정 → 구글 일정');
    const timed = G.toGoogleEvent({ id: 's1', title: '가맹점 방문', date: '2026-09-24', startTime: '14:00', endTime: '15:30', calendar: 'team', dept: 'sales', type: 'visit', description: '설치 확인' }, ctx);
    eq('제목', timed.summary, '가맹점 방문');
    eq('시작 시각', timed.start.dateTime, '2026-09-24T14:00:00');
    eq('시간대는 서울', timed.start.timeZone, 'Asia/Seoul');
    eq('종료 시각', timed.end.dateTime, '2026-09-24T15:30:00');
    eq('설명', timed.description, '설치 확인');
    eq('그룹웨어 일정 번호를 숨겨 둔다', timed.extendedProperties.private.kobId, 's1');

    const noEnd = G.toGoogleEvent({ id: 's2', title: '상담', date: '2026-09-24', startTime: '09:00', calendar: 'team', dept: 'sales' }, ctx);
    eq('종료를 안 적으면 1시간짜리로', noEnd.end.dateTime, '2026-09-24T10:00:00');

    const allDay = G.toGoogleEvent({ id: 's3', title: '창립기념일', date: '2026-10-01', allDay: true, calendar: 'company' }, ctx);
    eq('종일이면 날짜만', allDay.start.date, '2026-10-01');
    eq('종일의 끝은 다음 날 (구글 규칙)', allDay.end.date, '2026-10-02');
    ok('종일에는 시각이 없다', !allDay.start.dateTime);

    const noTime = G.toGoogleEvent({ id: 's4', title: '휴가', date: '2026-10-05', startTime: '', calendar: 'personal', salesperson: '홍길동' }, ctx);
    eq('시작 시각이 비면 종일로 본다', noTime.start.date, '2026-10-05');

    const withAtt = G.toGoogleEvent({ id: 's5', title: '회의', date: '2026-09-25', startTime: '10:00', calendar: 'team', dept: 'sales', attendees: [{ name: '홍길동', status: 'accepted' }, { name: '김영희', status: 'pending' }, { name: '박철수', status: 'accepted' }] }, ctx);
    eq('참석자는 구글 주소로 바뀐다', (withAtt.attendees || []).length, 2);
    eq('수락 → accepted', withAtt.attendees[0].responseStatus, 'accepted');
    eq('미응답 → needsAction', withAtt.attendees[1].responseStatus, 'needsAction');
    ok('구글 주소가 없는 사람은 초대에서 빠진다', !withAtt.attendees.some(a => !a.email));

    console.log('\n[3] 구글 일정 → 그룹웨어 일정');
    const teamCal = CALS.find(c => c.key === 'cal:team:sales');
    const fromTimed = G.fromGoogleEvent({
        id: 'ev1', summary: '폰에서 만든 일정', description: '메모',
        start: { dateTime: '2026-09-24T14:00:00+09:00' }, end: { dateTime: '2026-09-24T15:00:00+09:00' },
        creator: { email: 'hong.kob@gmail.com' }
    }, teamCal, null, ctx);
    eq('제목', fromTimed.title, '폰에서 만든 일정');
    eq('날짜', fromTimed.date, '2026-09-24');
    eq('시작 시각', fromTimed.startTime, '14:00');
    eq('종료 시각', fromTimed.endTime, '15:00');
    eq('부서 캘린더에서 왔으면 팀 일정', fromTimed.calendar, 'team');
    eq('부서도 그 캘린더의 부서로', fromTimed.dept, 'sales');
    eq('만든 사람을 구글 주소로 찾아 넣는다', fromTimed.salesperson, '홍길동');
    ok('폰에서 온 일정이라는 표시', fromTimed.fromGoogle === true);

    const utc = G.fromGoogleEvent({ id: 'ev2', summary: '외국 시간대로 온 일정', start: { dateTime: '2026-09-24T05:00:00Z' }, end: { dateTime: '2026-09-24T06:00:00Z' } }, teamCal, null, ctx);
    eq('다른 시간대로 와도 한국 시각으로 바꾼다', utc.startTime, '14:00');
    eq('날짜도 한국 기준', utc.date, '2026-09-24');

    const fromAllDay = G.fromGoogleEvent({ id: 'ev3', summary: '연차', start: { date: '2026-10-05' }, end: { date: '2026-10-06' } }, CALS.find(c => c.kind === 'personal'), null, ctx);
    ok('종일로 들어온다', fromAllDay.allDay === true);
    eq('종일이면 시각은 비운다', fromAllDay.startTime, '');
    eq('개인 캘린더 일정은 개인으로', fromAllDay.calendar, 'personal');
    eq('개인 캘린더 주인이 담당자가 된다', fromAllDay.salesperson, '홍길동');

    console.log('\n[4] 고친 일정 · 참석 응답');
    const before = { id: 's9', title: '옛 제목', date: '2026-09-20', startTime: '09:00', endTime: '10:00', calendar: 'team', dept: 'sales', type: 'visit', progress: 'done', salesperson: '홍길동', attendees: [{ name: '김영희', status: 'pending', self: true }] };
    const after = G.fromGoogleEvent({
        id: 'ev9', summary: '새 제목', start: { dateTime: '2026-09-21T11:00:00+09:00' }, end: { dateTime: '2026-09-21T12:00:00+09:00' },
        attendees: [{ email: 'kim.kob@gmail.com', responseStatus: 'declined' }]
    }, teamCal, before, ctx);
    eq('제목이 바뀐다', after.title, '새 제목');
    eq('날짜가 바뀐다', after.date, '2026-09-21');
    eq('화면에만 있는 값(구분)은 지켜진다', after.type, 'visit');
    eq('진행상황도 지켜진다', after.progress, 'done');
    eq('담당자도 지켜진다', after.salesperson, '홍길동');
    eq('폰에서 누른 불참이 들어온다', after.attendees[0].status, 'declined');
    eq('참석자 이름을 되찾는다', after.attendees[0].name, '김영희');
    ok('참석자에 원래 있던 값도 남는다', after.attendees[0].self === true);

    console.log('\n[5] 되돌이 방지 — 왔다 갔다 해도 같은 내용이어야 합니다');
    const orig = { id: 's10', title: '회의', date: '2026-09-24', startTime: '14:00', endTime: '15:00', calendar: 'team', dept: 'sales', type: 'meeting', description: '메모', attendees: [{ name: '홍길동', status: 'accepted' }] };
    const ev = G.toGoogleEvent(orig, ctx);
    const back = G.fromGoogleEvent(Object.assign({ id: 'ev10' }, ev, { start: { dateTime: '2026-09-24T14:00:00+09:00' }, end: { dateTime: '2026-09-24T15:00:00+09:00' }, attendees: [{ email: 'hong.kob@gmail.com', responseStatus: 'accepted' }] }), teamCal, orig, ctx);
    const again = G.toGoogleEvent(Object.assign({ id: 's10' }, back), ctx);
    eq('두 번 옮겨도 같은 구글 일정이 된다', JSON.stringify(again), JSON.stringify(ev));

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
