// 킹오더일정 — 확인 기록 · 새 일정 숫자 · 변경됨 (2026-11-12)
// index.html 안의 **실제 코드를 꺼내서** 돌립니다 (test-schedules.js 와 같은 방식).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const html = fs.readFileSync(INDEX, 'utf8');
const START = 'let schedules = (window.kobDb';
const END = 'function setCalendarView(';
const i = html.indexOf(START), j = html.indexOf(END, i);
if (i < 0 || j < 0) { console.error('index.html 에서 일정 저장 부분을 찾지 못했습니다.'); process.exit(1); }
const CODE = html.slice(i, j) + `
;globalThis.__t = {
    get schedules() { return schedules; }, set schedules(v) { schedules = v; },
    saveSchedules, reloadSchedulesFromDb,
    scheduleIsNewForMe, scheduleIsChangedForMe, calNewCounts, CAL_NEW_SINCE
};`;
for (const need of ['function scheduleIsNewForMe(', 'function scheduleIsChangedForMe(', 'function calNewCounts(', 'CAL_NEW_SINCE']) {
    if (!CODE.includes(need)) { console.error('떼어 낸 코드에', need, '가 없습니다.'); process.exit(1); }
}

function setup(opts) {
    const o = opts || {};
    const rows = new Map((o.seed || []).map(r => [r.id, JSON.parse(JSON.stringify(r))]));
    const saves = [];
    const reads = new Map(Object.entries(o.reads || {}));
    const ctx = {
        console, JSON, Map, Set, Date, Array, Object, String, Math, Promise,
        setTimeout: () => 0, clearTimeout: () => { }, setInterval: () => 0,
        window: {
            addEventListener: () => { },
            kobDb: {
                rows: () => Array.from(rows.values()).map(r => JSON.parse(JSON.stringify(r))),
                save: (t, row) => { saves.push(JSON.parse(JSON.stringify(row))); rows.set(row.id, row); return Promise.resolve(); },
                remove: () => Promise.resolve()
            },
            kobReads: { mine: () => reads },
            kobAuth: null
        },
        document: { getElementById: () => null, visibilityState: 'hidden' },
        currentUserName: o.me || '정장훈',
        currentUserEmail: o.email || 'daniel@k.co',
        // 화면의 다른 규칙 — 이 시험에 필요한 만큼만 (실제 규칙은 test-schedules · e2e 가 봅니다)
        canViewSchedule: (s) => !(s.calendar === 'personal' && s.salesperson !== (o.me || '정장훈')),
        scheduleCalendarId: (s) => s.calendar || 'team',
        scheduleMasterId: (id) => String(id).split('~')[0],
        isBirthdaySchedule: (s) => !!s.birthday,
        isScheduleOff: (s) => !!s.offState,
        scheduleOrganizer: (s) => s.salesperson || ''
    };
    ctx.window.kobDb.rows.bind(null);
    ctx.kobDb = ctx.window.kobDb;
    ctx.kobReads = ctx.window.kobReads;
    vm.createContext(ctx);
    vm.runInContext(CODE, ctx);
    return { t: ctx.__t, saves, reads, ctx };
}

const NEW = '2026-11-12T03:00:00.000Z';
const OLD = '2026-11-11T03:00:00.000Z';
const base = (x) => Object.assign({ date: '2026-11-20', startTime: '10:00', endTime: '11:00', title: '미팅', calendar: 'team', salesperson: '김영업', createdBy: 'kim@k.co', createdAt: NEW, attendees: [] }, x);

console.log('[새 일정 숫자]');
{
    const { t } = setup();
    ok(t.CAL_NEW_SINCE === '2026-11-12', '기능 시작일 2026-11-12');
    const list = [
        base({ id: 'a' }),
        base({ id: 'b', calendar: 'sales-share' }),
        base({ id: 'c', calendar: 'personal', salesperson: '김영업' }),           // 남의 개인 일정 — 볼 수 없음
        base({ id: 'd', salesperson: '정장훈', createdBy: 'daniel@k.co' }),       // 내가 등록
        base({ id: 'e', createdAt: OLD }),                                          // 기능 시작 전
        base({ id: 'f', offState: 'cancelled' }),                                   // 취소됨
        base({ id: 'g', createdAt: undefined })                                     // 등록 시각 없음(예전 일정)
    ];
    const c = t.calNewCounts(list);
    ok(c.team === 1, `팀별 1건 (얻음 ${c.team})`);
    ok(c['sales-share'] === 1, `영업/진행 공유 1건 (얻음 ${c['sales-share']})`);
    ok(!c.personal, 'newCount 는 볼 수 없는 일정을 세지 않는다');
    ok(!t.scheduleIsNewForMe(list[3]), '내가 등록한 일정은 새로움 아님');
    ok(!t.scheduleIsNewForMe(list[4]), 'createdAt 이 2026-11-11 인 일정은 새로움 아님');
    ok(!t.scheduleIsNewForMe(list[5]), '취소된 일정은 새로움 아님');
    ok(!t.scheduleIsNewForMe(list[6]), '등록 시각이 없는 예전 일정은 새로움 아님');
    ok(t.scheduleIsNewForMe(base({ id: 'k', createdAt: '2026-11-11T16:00:00.000Z' })), '한국 시간 11-12 01:00 에 만든 일정은 새로움 (UTC 로는 11-11)');
    ok(!t.scheduleIsNewForMe(base({ id: 'k2', createdAt: '2026-11-11T14:59:00.000Z' })), '한국 시간 11-11 23:59 에 만든 일정은 새로움 아님');
    // 반복 일정 회차는 한 건으로
    const rc = t.calNewCounts([base({ id: 'r~2026-11-20' }), base({ id: 'r~2026-11-27' })]);
    ok(rc.team === 1, `반복 일정 회차 여러 개도 1건 (얻음 ${rc.team})`);
}
{
    const { t } = setup({ reads: { a: { first: NEW, last: NEW } } });
    ok(!t.scheduleIsNewForMe(base({ id: 'a' })), '확인한 일정은 새로움 아님');
}

console.log('[변경됨]');
{
    const { t } = setup({ reads: { a: { first: NEW, last: '2026-11-12T04:00:00.000Z' } } });
    ok(t.scheduleIsChangedForMe(base({ id: 'a', changedAt: '2026-11-12T05:00:00.000Z', changedBy: '김영업' })), '확인 뒤 남이 바꾸면 변경됨');
    ok(!t.scheduleIsChangedForMe(base({ id: 'a', changedAt: '2026-11-12T03:30:00.000Z', changedBy: '김영업' })), '확인 전에 바뀐 것은 변경됨 아님');
    ok(!t.scheduleIsChangedForMe(base({ id: 'a', changedAt: '2026-11-12T05:00:00.000Z', changedBy: '정장훈' })), '내가 바꾼 것은 변경됨 아님');
    const c = t.calNewCounts([base({ id: 'a', changedAt: '2026-11-12T05:00:00.000Z', changedBy: '김영업' })]);
    ok(c.team === 1, '변경됨도 숫자에 포함');
}

console.log('[저장할 때 시각 찍기]');
{
    const seed = [{ id: 's1', date: '2026-11-20', startTime: '10:00', endTime: '11:00', title: '미팅', calendar: 'team', salesperson: '김영업', attendees: [{ name: '정장훈', status: 'pending' }], createdAt: NEW }];
    const { t, saves } = setup({ seed });
    t.schedules.push({ id: 'n1', date: '2026-11-21', title: '새 일정', calendar: 'team', attendees: [] });
    t.saveSchedules();
    const n1 = saves.find(x => x.id === 'n1');
    ok(n1 && /^\d{4}-\d\d-\d\dT/.test(n1.createdAt || ''), 'saveSchedules 가 새 일정에 createdAt 을 넣음');
    ok(n1 && !n1.changedAt, '새 일정에는 changedAt 없음');
    // 응답만 바꿈
    t.schedules.find(x => x.id === 's1').attendees[0].status = 'accepted';
    t.saveSchedules();
    const s1a = saves.filter(x => x.id === 's1').pop();
    ok(s1a && !s1a.changedAt, '응답 상태만 바꿀 때 changedAt 을 바꾸지 않음');
    ok(s1a && s1a.createdAt === NEW, '기존 createdAt 은 그대로');
    // 시간 바꿈
    t.schedules.find(x => x.id === 's1').startTime = '13:00';
    t.saveSchedules();
    const s1b = saves.filter(x => x.id === 's1').pop();
    ok(s1b && s1b.changedAt && s1b.changedBy === '정장훈', '시간을 바꾸면 changedAt · changedBy');
    // 참석자 추가
    const before = s1b.changedAt;
    t.schedules.find(x => x.id === 's1').attendees.push({ name: '박설치', status: 'pending' });
    t.saveSchedules();
    const s1c = saves.filter(x => x.id === 's1').pop();
    ok(s1c && s1c.changedAt && s1c !== s1b, '참석자를 더하면 changedAt');
}

console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
