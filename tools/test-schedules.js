// 일정 저장(4-1) 시험 — index.html 안의 **실제 코드를 꺼내서** 돌립니다.
// 복사본을 시험하면 원본이 바뀌어도 통과해 버리므로, 파일에서 그대로 읽어 씁니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}  (얻음: ${JSON.stringify(a)})`);

// ---------- index.html 에서 일정 저장 부분만 떼어 내기 ----------
const html = fs.readFileSync(INDEX, 'utf8');
const START = 'let schedules = (window.kobDb';
const END = 'function setCalendarView(';
const i = html.indexOf(START), j = html.indexOf(END, i);
if (i < 0 || j < 0) {
    console.error('index.html 에서 일정 저장 부분을 찾지 못했습니다. 코드가 바뀌었다면 이 시험의 표시(START/END)도 고쳐 주세요.');
    process.exit(1);
}
// let 로 선언한 변수는 VM 바깥에서 그냥 보이지 않으므로, 꺼내 볼 통로를 뒤에 붙입니다.
const CODE = html.slice(i, j) + `
;globalThis.__t = {
    get schedules() { return schedules; },
    set schedules(v) { schedules = v; },
    saveSchedules, reloadSchedulesFromDb
};`;
for (const need of ['function saveSchedules(', 'function reloadSchedulesFromDb(', 'kob-db-change', 'kob-db-conflict']) {
    if (!CODE.includes(need)) { console.error('떼어 낸 코드에', need, '가 없습니다.'); process.exit(1); }
}

// ---------- 가짜 kobDb (표 한 장을 흉내) ----------
function makeKobDb(seed) {
    const rows = new Map((seed || []).map(r => [r.id, JSON.parse(JSON.stringify(r))]));
    const log = [];
    return {
        rows: () => Array.from(rows.values()).map(r => JSON.parse(JSON.stringify(r))),
        save: (t, row) => { log.push(['save', row.id]); rows.set(row.id, JSON.parse(JSON.stringify(row))); return Promise.resolve(); },
        remove: (t, id) => { log.push(['remove', id]); rows.delete(id); return Promise.resolve(); },
        __rows: rows, __log: log,
        __writes: () => log.length,
        __reset: () => { log.length = 0; }
    };
}

function run(seed) {
    const listeners = new Map();
    const toasts = [];
    const rendered = { calendar: 0, today: 0 };
    const win = {
        addEventListener: (n, f) => { if (!listeners.has(n)) listeners.set(n, []); listeners.get(n).push(f); },
        dispatchEvent: (e) => { (listeners.get(e.type) || []).forEach(f => f(e)); return true; }
    };
    win.kobDb = makeKobDb(seed);
    const ctx = vm.createContext({
        window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date,
        kobDb: win.kobDb,
        currentUserName: '홍길동',
        renderCalendar: () => { rendered.calendar++; },
        renderTodaySchedule: () => { rendered.today++; },
        showAppToast: (t, tone) => { toasts.push({ t, tone }); }
    });
    vm.runInContext(CODE, ctx);
    const fire = (type, detail) => win.dispatchEvent({ type, detail });
    return { ctx: vm.runInContext('__t', ctx), db: win.kobDb, fire, toasts, rendered };
}

(async () => {
    console.log('\n[1] 시작할 때 저장된 일정을 불러오는지');
    {
        const { ctx } = run([{ id: 's1', title: '주간회의', date: '2026-09-18' }]);
        eq(ctx.schedules.length, 1, '저장돼 있던 일정을 들고 시작한다');
        eq(ctx.schedules[0].title, '주간회의', '내용도 그대로');
    }

    console.log('\n[2] 새 일정 · 수정 · 삭제가 저장되는지');
    {
        const { ctx, db } = run([]);
        ctx.schedules.push({ id: 's1', title: '고객 방문', date: '2026-09-18' });
        ctx.saveSchedules();
        eq(db.__rows.size, 1, '새 일정이 저장된다');
        eq(db.__rows.get('s1').title, '고객 방문', '내용이 그대로 들어간다');

        ctx.schedules[0].title = '고객 방문(변경)';
        ctx.saveSchedules();
        eq(db.__rows.get('s1').title, '고객 방문(변경)', '고친 내용이 반영된다');

        ctx.schedules = ctx.schedules.filter(s => s.id !== 's1');
        ctx.saveSchedules();
        eq(db.__rows.size, 0, '지우면 저장소에서도 사라진다');
    }

    console.log('\n[3] 바뀌지 않았으면 헛되이 보내지 않는지');
    {
        const { ctx, db } = run([{ id: 's1', title: '회의', date: '2026-09-18' }]);
        db.__reset();
        ctx.saveSchedules();
        ctx.saveSchedules();
        eq(db.__writes(), 0, '아무것도 안 바꾸고 저장하면 한 건도 보내지 않는다');

        ctx.schedules[0].date = '2026-09-19';
        ctx.saveSchedules();
        eq(db.__writes(), 1, '한 건만 바꾸면 한 건만 보낸다');
    }

    console.log('\n[4] 참석자 응답처럼 속 내용만 바뀌어도 저장되는지');
    {
        const { ctx, db } = run([{ id: 's1', title: '회의', attendees: [{ name: '홍길동', status: 'pending' }] }]);
        db.__reset();
        ctx.schedules[0].attendees[0].status = 'accepted';
        ctx.saveSchedules();
        eq(db.__rows.get('s1').attendees[0].status, 'accepted', '참석 응답이 저장된다');
        eq(db.__writes(), 1, '그 한 건만 보낸다');
    }

    console.log('\n[5] 다른 사람이 고쳤을 때 화면이 따라가는지');
    {
        const { ctx, db, fire, rendered } = run([{ id: 's1', title: '옛 제목' }]);
        db.__rows.set('s1', { id: 's1', title: '남이 고친 제목' });
        fire('kob-db-change', { table: 'schedules', id: 's1', reason: 'remote' });
        eq(ctx.schedules[0].title, '남이 고친 제목', '남이 고친 내용을 받아 온다');
        ok(rendered.calendar > 0, '캘린더를 다시 그린다');
    }

    console.log('\n[6] 내가 방금 한 것 때문에 되돌아오지는 않는지');
    {
        const { ctx, db, fire } = run([]);
        ctx.schedules.push({ id: 's1', title: '내가 넣은 것' });
        ctx.saveSchedules();
        ctx.schedules[0].title = '아직 저장 안 한 수정';
        fire('kob-db-change', { table: 'schedules', id: 's1', reason: 'local' });
        eq(ctx.schedules[0].title, '아직 저장 안 한 수정', '내 화면의 편집 중 내용이 되돌아가지 않는다');
    }

    console.log('\n[7] 다른 표의 변경에는 반응하지 않는지');
    {
        const { fire, rendered } = run([{ id: 's1', title: '회의' }]);
        const before = rendered.calendar;
        fire('kob-db-change', { table: 'customers', id: 'c1', reason: 'remote' });
        eq(rendered.calendar, before, '고객사가 바뀌어도 캘린더를 다시 그리지 않는다');
    }

    console.log('\n[8] 로그인 직후 자료를 받아 오는지');
    {
        const { ctx, db, fire } = run([]);
        db.__rows.set('s9', { id: 's9', title: '로그인 후 보이는 일정' });
        fire('kob-db-change', { table: null, id: null, reason: 'signin' });
        eq(ctx.schedules.length, 1, '로그인하면 일정이 들어온다');
        eq(ctx.schedules[0].title, '로그인 후 보이는 일정', '내용도 맞다');
    }

    console.log('\n[9] 충돌했을 때 알려 주는지');
    {
        const { ctx, db, fire, toasts } = run([{ id: 's1', title: '내가 본 것' }]);
        db.__rows.set('s1', { id: 's1', title: '남이 먼저 고친 것' });
        fire('kob-db-conflict', {
            table: 'schedules', id: 's1',
            mine: { id: 's1', title: '내가 고치려던 것' },
            theirs: { id: 's1', title: '남이 먼저 고친 것' }
        });
        eq(toasts.length, 1, '사용자에게 알린다');
        ok(/다른 사람이 먼저 고쳤습니다/.test(toasts[0].t), '무슨 일인지 알려 준다');
        ok(/남이 먼저 고친 것/.test(toasts[0].t), '어느 일정인지 알려 준다');
        eq(ctx.schedules[0].title, '남이 먼저 고친 것', '화면을 최신 내용으로 맞춘다');
    }

    console.log('\n[10] 저장소가 없어도 화면이 뜨는지 (옛 브라우저·불러오기 실패)');
    {
        const listeners = new Map();
        const win = { addEventListener: (n, f) => { if (!listeners.has(n)) listeners.set(n, []); listeners.get(n).push(f); }, dispatchEvent: () => true };
        const ctx = vm.createContext({ window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date, currentUserName: '홍길동' });
        let threw = null, t = null;
        try {
            vm.runInContext(CODE, ctx);
            t = vm.runInContext('__t', ctx);
            t.saveSchedules();
        } catch (e) { threw = e; }
        ok(!threw, 'kobDb 가 없어도 터지지 않는다' + (threw ? ' — ' + threw.message : ''));
        eq(t && t.schedules, [], '빈 목록으로 시작한다');
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
