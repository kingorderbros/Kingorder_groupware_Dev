// 킹오더일정 — 초대한 사람 기록 · 초대 알림 (2026-11-12)
// index.html 안의 실제 코드를 꺼내서 돌립니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const html = fs.readFileSync(INDEX, 'utf8');
const START = '// ---------- 일정 초대 알림 시작 (2026-11-12) ----------';
const END = '// ---------- 일정 초대 알림 끝 ----------';
const i = html.indexOf(START), j = html.indexOf(END, i);
if (i < 0 || j < 0) { console.error('index.html 에서 일정 초대 알림 부분을 찾지 못했습니다.'); process.exit(1); }

function run() {
    const sent = [];
    const ctx = {
        JSON, Date, Array, Object, String, Set, Map,
        currentUserName: '정장훈',
        collabNotiIdCounter: 1,
        pushNotification: (n) => { sent.push(n); return n; },
        ymd: () => '2026-11-12',
        scheduleTimeLabel: (s) => s.startTime || '종일',
        scheduleCalendar: (s) => ({ short: s.calendar === 'sales-share' ? '영업/진행 공유' : '팀별' })
    };
    vm.createContext(ctx);
    vm.runInContext(html.slice(i, j) + ';globalThis.__t = { stampScheduleInvites, notifyScheduleInvites };', ctx);
    return { t: ctx.__t, sent };
}
const sched = (att) => ({ id: 's1', title: '미팅', date: '2026-11-20', startTime: '10:00', calendar: 'sales-share', salesperson: '정장훈', attendees: att });

console.log('[초대 알림]');
{
    const { t, sent } = run();
    const after = sched([{ name: 'A', status: 'pending' }, { name: 'B', status: 'pending' }]);
    t.stampScheduleInvites(null, after);
    t.notifyScheduleInvites(null, after);
    ok(sent.length === 2 && sent.map(n => n.toUser).sort().join(',') === 'A,B', '새 일정에 A · B 초대 → 알림 2건');
    ok(sent.every(n => n.type === 'schedule-invite' && n.scheduleId === 's1' && n.by === '정장훈'), '종류 schedule-invite · 일정 번호 · 초대한 사람');
    ok(sent[0].detail.includes('정장훈 님이 초대') && sent[0].detail.includes('2026-11-20') && sent[0].detail.includes('영업/진행 공유'), `알림 내용에 초대한 사람 · 날짜 · 캘린더 (${sent[0].detail})`);
    ok(after.attendees.every(a => a.invitedBy === '정장훈' && /^\d{4}-/.test(a.invitedAt || '')), '새로 추가된 참석자에 invitedBy === currentUserName · invitedAt');
}
{
    const { t, sent } = run();
    const before = sched([{ name: 'A', status: 'accepted', invitedBy: '김영업', invitedAt: '2026-11-12T01:00:00Z' }]);
    const after = sched([{ name: 'A', status: 'accepted', invitedBy: '김영업', invitedAt: '2026-11-12T01:00:00Z' }]);
    t.stampScheduleInvites(before, after); t.notifyScheduleInvites(before, after);
    ok(sent.length === 0, '다시 저장해도 기존 참석자에게 초대 알림 없음');
    ok(after.attendees[0].invitedBy === '김영업', '기존 참석자의 초대한 사람은 그대로');
}
{
    const { t, sent } = run();
    const before = sched([{ name: 'A', status: 'pending' }]);
    const after = sched([{ name: 'A', status: 'pending' }, { name: 'C', status: 'pending' }, { name: 'D', status: 'accepted', self: true }, { name: '정장훈', status: 'accepted' }]);
    t.stampScheduleInvites(before, after); t.notifyScheduleInvites(before, after);
    ok(sent.length === 1 && sent[0].toUser === 'C', 'C 를 더하면 C 에게만 1건 · 본인 참가(self) · 나 자신은 알림 없음');
    ok(!after.attendees.find(a => a.name === 'D').invitedBy, '스스로 참가한 사람에게는 invitedBy 없음');
}
{
    const { t, sent } = run();
    const after = Object.assign(sched([{ name: 'A', status: 'pending' }]), { offState: 'cancelled' });
    t.stampScheduleInvites(null, after); t.notifyScheduleInvites(null, after);
    ok(sent.length === 0, '취소된 일정은 초대 알림 없음');
}

// 서버 — 알림 종류 분류
(async () => {
    const push = await import('../functions/api/_push.js');
    ok(push.categoryOf('schedule-invite') === 'schedule', "categoryOf('schedule-invite') === 'schedule'");
    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
