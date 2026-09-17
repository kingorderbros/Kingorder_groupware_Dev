// 협업티켓 · 알림 · 자부서업무 · 내 할 일 · 공지 · 프로젝트 저장(4-4) 시험
// index.html 안의 **실제 코드를 꺼내서** 돌립니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}  (얻음: ${JSON.stringify(a)})`);

const html = fs.readFileSync(INDEX, 'utf8');
function slice(a, b, label) {
    const i = html.indexOf(a), j = html.indexOf(b, i);
    if (i < 0 || j < 0) { console.error(`index.html 에서 ${label} 부분을 못 찾았습니다.`); process.exit(1); }
    return html.slice(i, j);
}

const KINDS = [
    { label: '협업티켓', var: 'collabRequests', table: 'collab_requests', fn: 'CollabRequests',
      counter: 'collabIdCounter', start: 12, mk: (n) => ({ id: 'collab_' + n, title: '자료 요청', status: 'pending', targetDept: 'ops' }),
      big: 'collab_42', code: slice('let collabRequests = (window.kobDb', 'let collabIdCounter', '협업티켓') },
    { label: '알림', var: 'collabNotifications', table: 'notifications', fn: 'Notifications',
      counter: 'collabNotiIdCounter', start: 1, mk: (n) => ({ id: 'cnoti_' + n, type: 'collab-completed', toUser: '홍길동', read: false }),
      big: 'cnoti_42', code: slice('let collabNotifications = (window.kobDb', 'let collabNotiIdCounter', '알림') },
    { label: '자부서 업무', var: 'localTasks', table: 'local_tasks', fn: 'LocalTasks',
      counter: 'localTaskIdCounter', start: 10, mk: (n) => ({ id: 'local_' + n, dept: 'ops', title: '정기 점검', status: '진행중' }),
      big: 'local_42', code: slice('let localTasks = (window.kobDb', 'let localTaskIdCounter', '자부서 업무') },
    { label: '내 할 일', var: 'myTodos', table: 'todos', fn: 'MyTodos',
      counter: 'myTodoIdCounter', start: 12, mk: (n) => ({ id: 'todo_' + n, owner: '홍길동', title: '보고서', done: false }),
      big: 'todo_42', code: slice('let myTodos = (window.kobDb', 'let myTodoIdCounter', '내 할 일') },
    { label: '공지사항', var: 'notices', table: 'notices', fn: 'Notices',
      counter: 'noticeIdCounter', start: 3, mk: (n) => ({ id: 'n' + n, title: '전사 공지', author: '관리자' }),
      big: 'n42', code: slice('let notices = (window.kobDb', 'let noticeIdCounter', '공지사항') },
    { label: '프로젝트', var: 'projects', table: 'projects', fn: 'Projects',
      counter: 'projectSeq', start: 3, mk: (n) => ({ id: 'P-2608-' + String(n).padStart(3, '0'), name: 'POS 전환', wbs: [], issues: [] }),
      big: 'P-2608-042', code: slice('let projects = (window.kobDb', 'let projectSeq', '프로젝트') }
];

function makeKobDb(seed) {
    const rows = new Map((seed || []).map(r => [r.id, JSON.parse(JSON.stringify(r))]));
    const log = [];
    return {
        rows: () => Array.from(rows.values()).map(r => JSON.parse(JSON.stringify(r))),
        save: (t, row) => { log.push(['save', row.id]); rows.set(row.id, JSON.parse(JSON.stringify(row))); return Promise.resolve(); },
        remove: (t, id) => { log.push(['remove', id]); rows.delete(id); return Promise.resolve(); },
        __rows: rows, __writes: () => log.length, __reset: () => { log.length = 0; }
    };
}

function run(k, seed) {
    const ls = new Map();
    const win = {
        addEventListener: (n, f) => { if (!ls.has(n)) ls.set(n, []); ls.get(n).push(f); },
        dispatchEvent: (e) => { (ls.get(e.type) || []).forEach(f => f(e)); return true; }
    };
    win.kobDb = makeKobDb(seed);
    const ctx = vm.createContext({
        window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date, RegExp, Math,
        kobDb: win.kobDb, currentUserName: '홍길동', currentUserRole: 'admin'
    });
    vm.runInContext(`let ${k.counter} = ${k.start};`, ctx);
    vm.runInContext(k.code + `
;globalThis.__t = {
    get list(){ return ${k.var}; }, set list(v){ ${k.var} = v; },
    save: save${k.fn}, reload: reload${k.fn}FromDb, syncCounter: sync${k.fn}IdCounter,
    get counter(){ return ${k.counter}; }
};`, ctx);
    return { t: vm.runInContext('__t', ctx), db: win.kobDb, win };
}

(async () => {
    for (const k of KINDS) {
        console.log(`\n========== ${k.label} → ${k.table} ==========`);
        {
            const { t } = run(k, [k.mk(1)]);
            eq(t.list.length, 1, '저장돼 있던 것을 들고 시작한다');
        }
        {
            const { t, db } = run(k, []);
            const row = k.mk(9);
            t.list.push(row);
            t.save();
            eq(db.__rows.size, 1, '새로 넣은 것이 저장된다');

            t.list[0].memo = '메모';
            t.save();
            eq(db.__rows.get(row.id).memo, '메모', '수정이 반영된다');

            t.list = t.list.filter(x => x.id !== row.id);
            t.save();
            eq(db.__rows.size, 0, '삭제가 반영된다');
        }
        {
            const { t, db } = run(k, [k.mk(1)]);
            db.__reset();
            t.save(); t.save();
            eq(db.__writes(), 0, '안 바꾸면 한 건도 안 보낸다');
        }
        {
            const { t } = run(k, [{ ...k.mk(1), id: k.big }]);
            t.syncCounter();
            ok(t.counter > 42, `번호가 저장된 것(42) 뒤로 이어진다 — 다음 ${t.counter}`);
        }
        {
            const { t, db, win } = run(k, []);
            const row = k.mk(3);
            db.__rows.set(row.id, row);
            win.dispatchEvent({ type: 'kob-db-change', detail: { table: null, id: null, reason: 'signin' } });
            eq(t.list.length, 1, '로그인 직후 받아 온다');

            db.__rows.set(row.id, { ...row, memo: '남이 고침' });
            win.dispatchEvent({ type: 'kob-db-change', detail: { table: k.table, id: row.id, reason: 'remote' } });
            eq(t.list[0].memo, '남이 고침', '남이 고친 내용을 받아 온다');

            win.dispatchEvent({ type: 'kob-db-change', detail: { table: '다른표', id: 'x', reason: 'remote' } });
            eq(t.list.length, 1, '다른 표의 변경에는 반응하지 않는다');

            t.list[0].memo = '편집 중';
            win.dispatchEvent({ type: 'kob-db-change', detail: { table: k.table, id: row.id, reason: 'local' } });
            eq(t.list[0].memo, '편집 중', '내가 방금 한 것으로 편집 중 내용이 되돌아가지 않는다');
        }
    }

    console.log('\n========== 자료마다 다른 점 ==========');

    console.log('\n[알림] 읽음 표시가 저장되는지');
    {
        const k = KINDS.find(x => x.table === 'notifications');
        const { t, db } = run(k, [k.mk(1)]);
        db.__reset();
        t.list[0].read = true;
        t.save();
        eq(db.__rows.get('cnoti_1').read, true, '읽음 표시가 저장된다 (다른 기기에서도 읽은 것으로 보임)');
        eq(db.__writes(), 1, '그 한 건만 보낸다');
    }

    console.log('\n[프로젝트] WBS·이슈가 함께 저장되는지');
    {
        const k = KINDS.find(x => x.table === 'projects');
        const { t, db } = run(k, [k.mk(1)]);
        db.__reset();
        t.list[0].wbs.push({ id: 'WB-31', name: '현장 실사', progress: 0 });
        t.list[0].issues.push({ id: 'IS-3', text: '자재 지연', resolved: false });
        t.save();
        const saved = db.__rows.get('P-2608-001');
        eq(saved.wbs.length, 1, 'WBS 가 프로젝트와 함께 저장된다');
        eq(saved.issues[0].text, '자재 지연', '이슈도 함께 저장된다');
    }

    console.log('\n[협업 요청 알림] 새 요청을 보내면 알림이 만들어지는지');
    {
        const html2 = fs.readFileSync(INDEX, 'utf8');
        ok(/'collab-requested':\s*\{/.test(html2), '알림 종류에 협업 요청이 있다');
        const i = html2.indexOf("type: 'collab-requested'");
        ok(i > 0, '협업 요청을 보낼 때 알림을 만든다');
        const seg = html2.slice(i - 400, i + 400);
        ok(/toDept:\s*newReq\.targetDept/.test(seg), '받는 부서 앞으로 보낸다');
        ok(/toUser:\s*newReq\.assigneeUser/.test(seg), '담당자를 지정했으면 그 사람 앞으로도 보낸다');
        ok(/ticketId:\s*newReq\.id/.test(seg), '알림을 누르면 그 티켓을 열 수 있게 연결한다');
    }

    console.log('\n[공통] 저장소가 없어도 터지지 않는지');
    for (const k of KINDS) {
        const ls = new Map();
        const win = { addEventListener: (n, f) => { if (!ls.has(n)) ls.set(n, []); ls.get(n).push(f); }, dispatchEvent: () => true };
        const ctx = vm.createContext({ window: win, console, JSON, Map, Set, Array, String, Number, Promise, Error, Date, RegExp, Math, currentUserName: '홍길동', currentUserRole: 'admin' });
        vm.runInContext(`let ${k.counter} = ${k.start};`, ctx);
        let threw = null;
        try {
            vm.runInContext(k.code + `;globalThis.__t = { save: save${k.fn} };`, ctx);
            vm.runInContext('__t', ctx).save();
        } catch (e) { threw = e; }
        ok(!threw, `${k.label}: kobDb 가 없어도 안 터진다` + (threw ? ' — ' + threw.message : ''));
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
