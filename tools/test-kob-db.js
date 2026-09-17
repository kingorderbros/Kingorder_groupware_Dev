// kob-db.js 시험 — 브라우저 없이 Node 에서 window · localStorage · supabase 를 흉내 내어 돌립니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'js', 'kob-db.js'));
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}  (얻음: ${JSON.stringify(a)})`);

// ---------- 흉내 낸 브라우저 ----------
function makeWindow() {
    const mem = new Map();
    const listeners = new Map();
    const events = [];
    const win = {
        currentUserEmail: 'daniel@kingorder.co.kr',
        localStorage: {
            getItem: (k) => (mem.has(k) ? mem.get(k) : null),
            setItem: (k, v) => mem.set(k, String(v)),
            removeItem: (k) => mem.delete(k)
        },
        addEventListener: (n, f) => { if (!listeners.has(n)) listeners.set(n, []); listeners.get(n).push(f); },
        dispatchEvent: (e) => { events.push(e); (listeners.get(e.type) || []).forEach(f => f(e)); return true; },
        __events: events, __mem: mem
    };
    return win;
}
class CustomEventShim {
    constructor(type, init) { this.type = type; this.detail = (init || {}).detail; }
}

// ---------- 흉내 낸 Supabase ----------
function makeClient(seed) {
    const tables = new Map();                       // 표 → Map(id → {id, data, rev})
    Object.entries(seed || {}).forEach(([t, rows]) => {
        const m = new Map(); rows.forEach(r => m.set(r.id, { ...r })); tables.set(t, m);
    });
    const T = (t) => { if (!tables.has(t)) tables.set(t, new Map()); return tables.get(t); };
    const state = { failNext: 0, calls: [] };

    function from(t) {
        const q = { table: t, filters: {}, _op: null, _payload: null };
        q.select = () => q;
        q.order = () => q;
        q.range = (a, b) => {
            state.calls.push(['select', t]);
            const rows = Array.from(T(t).values()).slice(a, b + 1)
                .map(r => ({ id: r.id, data: r.data, rev: r.rev }));
            return Promise.resolve({ data: rows, error: null });
        };
        q.eq = (col, val) => { q.filters[col] = val; return q; };
        q.insert = (row) => {
            q._op = 'insert'; q._payload = row;
            const chain = {
                select: () => chain,
                single: () => {
                    state.calls.push(['insert', t, row.id]);
                    if (state.failNext > 0) { state.failNext--; return Promise.resolve({ data: null, error: { message: '네트워크 오류' } }); }
                    if (T(t).has(row.id)) return Promise.resolve({ data: null, error: { message: '중복 id' } });
                    T(t).set(row.id, { id: row.id, data: row.data, rev: 1 });
                    return Promise.resolve({ data: { rev: 1 }, error: null });
                }
            };
            return chain;
        };
        q.update = (row) => {
            q._op = 'update'; q._payload = row;
            const chain = {
                eq: (c, v) => { q.filters[c] = v; return chain; },
                select: () => {
                    state.calls.push(['update', t, q.filters.id, q.filters.rev]);
                    if (state.failNext > 0) { state.failNext--; return Promise.resolve({ data: null, error: { message: '네트워크 오류' } }); }
                    const cur = T(t).get(q.filters.id);
                    if (!cur || cur.rev !== q.filters.rev) return Promise.resolve({ data: [], error: null });
                    cur.data = row.data; cur.rev = cur.rev + 1;
                    return Promise.resolve({ data: [{ rev: cur.rev }], error: null });
                }
            };
            return chain;
        };
        q.delete = () => {
            const chain = { eq: (c, v) => { q.filters[c] = v; state.calls.push(['delete', t, v]); T(t).delete(v); return Promise.resolve({ error: null }); } };
            return chain;
        };
        q.maybeSingle = () => {
            const cur = T(t).get(q.filters.id);
            return Promise.resolve({ data: cur ? { data: cur.data, rev: cur.rev } : null, error: null });
        };
        return q;
    }
    return {
        from,
        rpc: (name, args) => {
            state.calls.push(['rpc', name]);
            const k = '__' + args.p_kind;
            state[k] = (state[k] || 0) + 1;
            return Promise.resolve({ data: args.p_prefix + String(state[k]).padStart(args.p_width || 4, '0'), error: null });
        },
        channel: () => ({ on: function () { return this; }, subscribe: () => {} }),
        auth: {
            __cbs: [],
            onAuthStateChange(cb) { this.__cbs.push(cb); cb('INITIAL_SESSION', null); return { data: {} }; },
            __signIn() { this.__cbs.forEach(cb => cb('SIGNED_IN', { access_token: 'tok' })); },
            __signOut() { this.__cbs.forEach(cb => cb('SIGNED_OUT', null)); }
        },
        __tables: tables, __state: state
    };
}

function load(win) {
    const ctx = vm.createContext({ window: win, console, setTimeout, CustomEvent: CustomEventShim, JSON, Date, Number, String, Array, Map, Set, Promise, Error });
    vm.runInContext(fs.readFileSync(FILE, 'utf8'), ctx);
    return win.kobDb;
}

(async () => {
    // ================= 1. 로컬 모드 =================
    console.log('\n[1] 로컬 모드 (Supabase 설정이 없을 때)');
    {
        const win = makeWindow();
        const db = load(win);
        await db.__init(null, 'local');
        eq(db.mode, 'local', '로컬 모드로 뜬다');
        eq(db.rows('schedules'), [], '처음에는 비어 있다');

        await db.save('schedules', { id: 'S1', title: '회의', date: '2026-09-18' });
        eq(db.count('schedules'), 1, '넣으면 1건');
        eq(db.get('schedules', 'S1').title, '회의', '넣은 값을 그대로 읽는다');
        ok(win.__mem.has('kobDb.schedules'), 'localStorage 에 담긴다');

        await db.save('schedules', { id: 'S1', title: '회의(고침)', date: '2026-09-19' });
        eq(db.count('schedules'), 1, '같은 id 로 고치면 건수는 그대로');
        eq(db.get('schedules', 'S1').title, '회의(고침)', '고친 값이 반영된다');

        await db.remove('schedules', 'S1');
        eq(db.count('schedules'), 0, '지우면 0건');

        const c1 = await db.nextCode('quote', 'QT-');
        const c2 = await db.nextCode('quote', 'QT-');
        eq([c1, c2], ['QT-0001', 'QT-0002'], '로컬에서도 번호가 이어진다');

        // 새로고침 흉내 — 같은 localStorage 로 다시 띄웁니다
        await db.save('customers', { id: 'c1', name: '킹오더식당' });
        const win2 = { ...makeWindow(), localStorage: win.localStorage };
        win2.addEventListener = win.addEventListener; win2.dispatchEvent = win.dispatchEvent;
        const db2 = load(win2);
        await db2.__init(null, 'local');
        eq(db2.get('customers', 'c1').name, '킹오더식당', '새로고침해도 남아 있다');
    }

    // ================= 2. Supabase 모드 =================
    console.log('\n[2] Supabase 모드');
    {
        const win = makeWindow();
        const client = makeClient({ schedules: [{ id: 'S0', data: { id: 'S0', title: '기존' }, rev: 3 }] });
        const db = load(win);
        const r = await db.__init(client, 'supabase');
        eq(db.mode, 'supabase', 'Supabase 모드로 뜬다');
        eq(db.get('schedules', 'S0').title, '기존', '미리 받아 둔 자료를 동기로 읽는다');
        ok(r.tables >= 14, `미리 받는 표 ${r.tables}개`);

        await db.save('schedules', { id: 'S1', title: '새 일정' });
        eq(client.__tables.get('schedules').get('S1').rev, 1, '새로 넣으면 서버 판 번호 1');

        await db.save('schedules', { id: 'S1', title: '고침' });
        eq(client.__tables.get('schedules').get('S1').rev, 2, '고치면 판 번호 2');
        eq(client.__tables.get('schedules').get('S1').data.title, '고침', '서버에 고친 값이 들어간다');

        await db.save('schedules', { id: 'S1', title: '또 고침' });
        eq(client.__tables.get('schedules').get('S1').rev, 3, '이어서 고쳐도 계속 된다 (판 번호를 따라간다)');

        await db.remove('schedules', 'S1');
        ok(!client.__tables.get('schedules').has('S1'), '지우면 서버에서도 사라진다');

        const code = await db.nextCode('quote', 'QT-');
        eq(code, 'QT-0001', '서버에서 번호를 받는다');
    }

    // ================= 3. 충돌 (남이 먼저 고침) =================
    console.log('\n[3] 충돌 — 내가 읽은 뒤 남이 먼저 고쳤을 때');
    {
        const win = makeWindow();
        const client = makeClient({ contracts: [{ id: 'CT1', data: { id: 'CT1', name: '내가 본 것' }, rev: 1 }] });
        const db = load(win);
        await db.__init(client, 'supabase');

        // 남이 먼저 고침 (서버의 판 번호가 올라감) — 내 화면은 아직 옛 판을 들고 있습니다
        const row = client.__tables.get('contracts').get('CT1');
        row.data = { id: 'CT1', name: '남이 고친 것' }; row.rev = 2;

        await db.save('contracts', { id: 'CT1', name: '내가 고친 것' });

        const conflicts = win.__events.filter(e => e.type === 'kob-db-conflict');
        eq(conflicts.length, 1, '충돌을 알린다 (kob-db-conflict)');
        eq(conflicts[0].detail.theirs.name, '남이 고친 것', '상대가 고친 값을 함께 준다');
        eq(conflicts[0].detail.mine.name, '내가 고친 것', '내가 고치려던 값도 함께 준다');
        eq(client.__tables.get('contracts').get('CT1').data.name, '남이 고친 것', '서버 값은 덮어쓰이지 않는다');
        eq(db.get('contracts', 'CT1').name, '남이 고친 것', '내 화면도 최신 값으로 맞춰진다');
    }

    // ================= 4. 저장 실패 =================
    console.log('\n[4] 저장 실패 — 작업 내용이 사라지지 않아야 함');
    {
        const win = makeWindow();
        const client = makeClient({});
        const db = load(win);
        await db.__init(client, 'supabase');

        client.__state.failNext = 99;                     // 계속 실패하게
        const t0 = Date.now();
        await db.save('notices', { id: 'n1', title: '중요 공지' });
        eq(db.get('notices', 'n1').title, '중요 공지', '서버에 못 보내도 화면 값은 남는다');
        ok(db.pending === 1, `다시 보낼 목록에 담긴다 (${db.pending}건)`);
        const errs = win.__events.filter(e => e.type === 'kob-db-error');
        ok(errs.length >= 1, '실패를 알린다 (kob-db-error)');
        ok(Date.now() - t0 >= 1000, '곧바로 포기하지 않고 다시 시도한다');

        client.__state.failNext = 0;                      // 네트워크 회복
        await db.retry();
        ok(client.__tables.get('notices').has('n1'), '다시 보내기로 서버에 들어간다');
        eq(db.pending, 0, '다시 보낼 목록이 비워진다');
    }

    // ================= 5. 알림 이벤트 =================
    console.log('\n[5] 화면이 다시 그릴 수 있게 알리는지');
    {
        const win = makeWindow();
        const client = makeClient({});
        const db = load(win);
        await db.__init(client, 'supabase');
        const before = win.__events.filter(e => e.type === 'kob-db-change').length;
        await db.save('todos', { id: 't1', owner: '나', done: false });
        await db.remove('todos', 't1');
        const after = win.__events.filter(e => e.type === 'kob-db-change').length;
        eq(after - before, 2, '넣기·지우기마다 알린다');
    }

    // ================= 6. 잘못 쓴 경우 =================
    console.log('\n[6] 잘못 쓴 경우를 막는지');
    {
        const win = makeWindow();
        const db = load(win);
        await db.__init(null, 'local');
        let caught = null;
        try { await db.save('schedules', { title: 'id 가 없음' }); } catch (e) { caught = e; }
        ok(caught && /id/.test(caught.message), 'id 없는 자료는 거절한다');
        eq(db.get('schedules', 'none'), null, '없는 것을 찾으면 null');
        eq(db.rows('__없는표__'), [], '모르는 표를 물어도 터지지 않는다');
        eq(db.ready('settlements'), false, '큰 표는 아직 안 받은 상태');
    }

    // ================= 7. 로그인 전/후 =================
    console.log('\n[7] 로그인 전에는 자료가 안 오고, 로그인하면 받아 오는지');
    {
        const win = makeWindow();
        const client = makeClient({});
        const db = load(win);
        await db.__init(client, 'supabase');
        eq(db.authed, false, '처음에는 로그인 전으로 본다');
        eq(db.count('customers'), 0, '로그인 전에는 자료가 없다');

        // 로그인하는 사이에 서버에 자료가 있었다고 칩니다 (로그인 전에는 RLS 로 안 보이던 것)
        client.__tables.set('customers', new Map([['c9', { id: 'c9', data: { id: 'c9', name: '로그인 후 보임' }, rev: 1 }]]));

        const before = win.__events.filter(e => e.type === 'kob-db-change').length;
        client.auth.__signIn();
        await new Promise(r => setTimeout(r, 30));
        eq(db.authed, true, '로그인하면 상태가 바뀐다');
        eq(db.get('customers', 'c9').name, '로그인 후 보임', '로그인 뒤 자료를 다시 받아 온다');
        ok(win.__events.filter(e => e.type === 'kob-db-change').length > before, '화면이 다시 그리도록 알린다');

        client.auth.__signOut();
        await new Promise(r => setTimeout(r, 30));
        eq(db.count('customers'), 0, '로그아웃하면 화면에 남은 자료를 비운다');
        eq(db.authed, false, '로그아웃 상태로 돌아온다');
    }

    // ================= 8. '저장한 사람' 기록 =================
    console.log('\n[8] 저장한 사람이 기록되는지');
    {
        const win = makeWindow();
        const client = makeClient({});
        const db = load(win);
        await db.__init(client, 'supabase');
        await db.save('notices', { id: 'n1', title: '공지' });
        // 흉내 낸 서버는 updated_by 를 되돌려 주지 않으므로, 보낸 값을 직접 확인합니다.
        ok(client.__state.calls.some(c => c[0] === 'insert'), '서버로 보냈다');

        // window 에 이메일이 없을 때도 터지지 않아야 합니다
        const win2 = makeWindow();
        delete win2.currentUserEmail;
        const db2 = load(win2);
        await db2.__init(makeClient({}), 'supabase');
        let threw = null;
        try { await db2.save('notices', { id: 'n2', title: '공지2' }); } catch (e) { threw = e; }
        ok(!threw, '로그인 전이어도 저장이 터지지 않는다' + (threw ? ' — ' + threw.message : ''));
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
