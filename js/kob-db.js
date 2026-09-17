/**
 * 킹오더브라더스 그룹웨어 — 표 단위 저장 계층 (개발환경 · 2026-09-17)
 *
 * kob-store.js(kobStorage)는 "키 하나 = JSON 덩어리 하나" 입니다. 설정값에는 맞지만 업무 자료에는
 * 세 가지가 막혀서(한 건만 고쳐도 목록 전체를 다시 씀 · 첨부가 JSON 안에 들어감 · 검색 불가),
 * 업무 자료는 supabase/schema-v2.sql 로 만든 **표**에 한 건 = 한 줄로 둡니다. 이 파일이 그 통로입니다.
 *
 * 화면 코드를 그대로 두기 위한 약속 두 가지
 *   · 읽기는 **동기**입니다. 본체(index.html)가 맨 위에서부터 동기로 자료를 읽기 때문에,
 *     kob-store.js 가 본체를 실행하기 전에 표를 미리 받아 둡니다 (PRELOAD).
 *   · 화면이 다루는 것은 **업무 객체 그대로**입니다. 판 번호(rev)는 이 파일이 속으로만 들고 있어
 *     화면 객체에 섞이지 않습니다.
 *
 * 쓰기에서 하는 일
 *   · 그 줄만 씁니다 → 옆 사람 자료를 덮어쓰지 않습니다.
 *   · 판 번호를 함께 보냅니다. 내가 읽은 뒤 남이 먼저 고쳤으면 서버가 거절하고,
 *     'kob-db-conflict' 를 던져 화면이 사용자에게 알릴 수 있게 합니다.
 *   · 실패하면 화면의 값은 그대로 두고 다시 시도합니다 (작업 중인 내용을 잃지 않게).
 *
 * 로컬 모드 — config/app-config.js 가 비어 있으면 브라우저 localStorage 에 같은 모양으로 담습니다.
 * 인터넷 없이도 화면을 그대로 시험할 수 있습니다.
 *
 * 쓰는 법
 *   const list = kobDb.rows('schedules');          // 동기 — 업무 객체 배열
 *   await kobDb.save('schedules', obj);            // 넣기/고치기 (obj.id 로 판단)
 *   await kobDb.remove('schedules', id);
 *   const id = await kobDb.nextCode('quote', 'QT-');   // 서버에서 번호 받기
 *   await kobDb.load('settlements');               // 큰 표는 필요할 때 불러오기
 *   window.addEventListener('kob-db-change', e => { ... });   // 내가·남이 고쳤을 때
 */
(function () {
    'use strict';

    // 본체가 시작할 때 이미 있어야 하는 표 — 미리 받아 둡니다.
    const PRELOAD = [
        'schedules', 'customers', 'works', 'contracts', 'quotes', 'cases', 'notices',
        'projects', 'collab_requests', 'todos', 'partner_intakes', 'install_checks',
        'pay_doc_requests', 'price_book',
        'notifications', 'local_tasks'          // 3차에서 추가 (알림함 · 자부서 업무)
    ];
    // 엑셀로 수천 줄이 들어오는 표 — 그 화면을 열 때 kobDb.load() 로 받습니다.
    const ON_DEMAND = ['settlements', 'pg_fees', 'supplies', 'attachments'];
    const ALL = PRELOAD.concat(ON_DEMAND);

    const PAGE = 1000;                 // 한 번에 받아 오는 줄 수 (그 이상은 나눠 받습니다)
    const RETRY_MS = [1000, 3000, 8000];

    let client = null;                 // supabase-js 클라이언트 (kob-store.js 가 넘겨 줍니다)
    let mode = 'local';
    let authed = false;                // 지금 로그인되어 있는지 (표는 로그인한 사람에게만 열려 있습니다)
    const store = new Map();           // 표 이름 → Map(id → { data, rev })
    const loaded = new Set();          // 이미 받아 온 표
    const inflight = new Map();        // '표:id' → Promise — 같은 줄을 동시에 쓰지 않도록
    const failed = new Map();          // '표:id' → { table, id, kind } — 다시 보낼 것

    const now = () => new Date().toISOString();
    // '저장한 사람' 으로 남길 값. 본체가 window 에 실어 주지만(로그인할 때),
    // 혹시 빠져도 전역에서 한 번 더 찾아봅니다. (let 로 선언한 변수는 window 에 안 보이므로 try 로 감쌉니다)
    const who = () => {
        const w = window.currentUserEmail;
        if (typeof w === 'string' && w) return w;
        try { if (typeof currentUserEmail === 'string' && currentUserEmail) return currentUserEmail; }
        catch (e) { /* 아직 로그인 전 */ }
        return null;
    };
    const tbl = (t) => { if (!store.has(t)) store.set(t, new Map()); return store.get(t); };
    const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    function fire(name, detail) {
        try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) { /* 아주 옛 브라우저 */ }
    }

    // ---------- 로컬 모드 저장소 ----------
    // 표 하나를 배열 한 덩어리로 localStorage 에 둡니다. 모양은 서버와 같게 맞춥니다.
    const lsKey = (t) => 'kobDb.' + t;
    function lsRead(t) {
        try { const v = JSON.parse(window.localStorage.getItem(lsKey(t)) || '[]'); return Array.isArray(v) ? v : []; }
        catch (e) { return []; }
    }
    function lsWrite(t) {
        const rows = Array.from(tbl(t).entries()).map(([id, e]) => ({ id, data: e.data, rev: e.rev }));
        try { window.localStorage.setItem(lsKey(t), JSON.stringify(rows)); return true; }
        catch (e) {
            fire('kob-db-error', { table: t, message: '브라우저 저장 공간이 부족합니다.' });
            return false;
        }
    }

    // ---------- 표 하나 받아 오기 ----------
    async function fetchTable(t) {
        const m = tbl(t);
        m.clear();
        if (mode !== 'supabase') {
            lsRead(t).forEach(r => m.set(r.id, { data: r.data, rev: r.rev || 1 }));
            loaded.add(t);
            return m.size;
        }
        for (let from = 0; ; from += PAGE) {
            const { data, error } = await client
                .from(t).select('id,data,rev').order('id', { ascending: true }).range(from, from + PAGE - 1);
            if (error) throw error;
            (data || []).forEach(r => m.set(r.id, { data: r.data || {}, rev: r.rev || 1 }));
            if (!data || data.length < PAGE) break;
        }
        loaded.add(t);
        return m.size;
    }

    // ---------- 다른 사람이 고친 것 받기 ----------
    function watch(t) {
        if (mode !== 'supabase') return;
        try {
            client.channel('db:' + t)
                .on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => {
                    const m = tbl(t);
                    const id = (p.new && p.new.id) || (p.old && p.old.id);
                    if (!id) return;
                    if (p.eventType === 'DELETE') {
                        if (!m.has(id)) return;
                        m.delete(id);
                        fire('kob-db-change', { table: t, id, reason: 'remote-delete' });
                        return;
                    }
                    const cur = m.get(id);
                    // 내가 방금 쓴 값이 되돌아온 것이면 알리지 않습니다 (화면이 헛되이 다시 그리지 않게)
                    if (cur && cur.rev === p.new.rev) return;
                    m.set(id, { data: p.new.data || {}, rev: p.new.rev || 1 });
                    fire('kob-db-change', { table: t, id, reason: 'remote' });
                })
                .subscribe();
        } catch (e) {
            console.warn('[kob-db] 실시간 구독 실패 — 저장은 되지만 남의 변경은 새로고침해야 보입니다:', t, e);
        }
    }

    // ---------- 쓰기 ----------
    // 같은 줄에 대한 쓰기가 겹치지 않도록 줄마다 차례를 세웁니다.
    function queue(key, run) {
        const prev = inflight.get(key) || Promise.resolve();
        const next = prev.catch(() => {}).then(run).finally(() => {
            if (inflight.get(key) === next) inflight.delete(key);
        });
        inflight.set(key, next);
        return next;
    }

    async function pushRow(t, id, isNew) {
        const m = tbl(t);
        const e = m.get(id);
        if (!e) return;                                  // 그새 지워졌으면 보낼 것이 없습니다

        if (mode !== 'supabase') { lsWrite(t); return; }

        for (let i = 0; ; i++) {
            try {
                if (isNew) {
                    const { data, error } = await client
                        .from(t).insert({ id, data: e.data, updated_by: who() }).select('rev').single();
                    if (error) throw error;
                    e.rev = data.rev;
                } else {
                    const { data, error } = await client
                        .from(t).update({ data: e.data, updated_by: who() })
                        .eq('id', id).eq('rev', e.rev).select('rev');
                    if (error) throw error;
                    if (!data || !data.length) {          // 판이 달라 거절 — 남이 먼저 고쳤습니다
                        const cur = await client.from(t).select('data,rev').eq('id', id).maybeSingle();
                        const mine = e.data;
                        if (cur.data) {
                            m.set(id, { data: cur.data.data || {}, rev: cur.data.rev });
                        } else {
                            m.delete(id);                 // 남이 지운 뒤였습니다
                        }
                        failed.delete(t + ':' + id);
                        fire('kob-db-conflict', { table: t, id, mine, theirs: cur.data ? cur.data.data : null });
                        fire('kob-db-change', { table: t, id, reason: 'conflict' });
                        return;
                    }
                    e.rev = data[0].rev;
                }
                failed.delete(t + ':' + id);
                return;
            } catch (err) {
                if (i < RETRY_MS.length) { await wait(RETRY_MS[i]); continue; }
                // 끝내 못 보냈습니다 — 화면의 값은 그대로 두고(작업 내용 보존) 다시 보낼 목록에 넣습니다.
                failed.set(t + ':' + id, { table: t, id, kind: isNew ? 'insert' : 'update' });
                fire('kob-db-error', { table: t, id, message: (err && err.message) || String(err) });
                return;
            }
        }
    }

    async function pushDelete(t, id) {
        if (mode !== 'supabase') { lsWrite(t); return; }
        for (let i = 0; ; i++) {
            try {
                const { error } = await client.from(t).delete().eq('id', id);
                if (error) throw error;
                failed.delete(t + ':' + id);
                return;
            } catch (err) {
                if (i < RETRY_MS.length) { await wait(RETRY_MS[i]); continue; }
                failed.set(t + ':' + id, { table: t, id, kind: 'delete' });
                fire('kob-db-error', { table: t, id, message: (err && err.message) || String(err) });
                return;
            }
        }
    }

    // ---------- 로그인 상태에 맞춰 다시 받아 오기 ----------
    // 표는 **로그인한 사람에게만** 열려 있습니다(RLS). 그런데 이 파일이 자료를 미리 받는 시점은
    // 아직 로그인 화면이 뜨기 전이라, 그때는 한 줄도 오지 않습니다(막힌 것이 아니라 빈 결과로 옵니다).
    // 그래서 로그인이 끝나는 순간 다시 받아 오고, 로그아웃하면 화면에 남은 자료를 비웁니다.
    async function reloadAll(reason) {
        const list = Array.from(new Set(PRELOAD.concat(Array.from(loaded))));
        for (const t of list) {
            try { await fetchTable(t); }
            catch (e) { console.error('[kob-db] 다시 받기 실패:', t, e); }
        }
        fire('kob-db-change', { table: null, id: null, reason });
    }

    function hookAuth() {
        if (mode !== 'supabase' || !client.auth || !client.auth.onAuthStateChange) return;
        try {
            client.auth.onAuthStateChange((event, session) => {
                const on = !!(session && session.access_token);
                if (on === authed) return;
                authed = on;
                if (on) {
                    reloadAll('signin');
                } else {
                    store.forEach(m => m.clear());          // 다음 사람이 앞사람 자료를 보지 못하게
                    loaded.clear();
                    fire('kob-db-change', { table: null, id: null, reason: 'signout' });
                }
            });
        } catch (e) {
            console.warn('[kob-db] 로그인 상태를 따라가지 못합니다 — 로그인 뒤 새로고침이 필요할 수 있습니다', e);
        }
    }

    // ---------- 화면이 쓰는 것 ----------
    window.kobDb = {
        get mode() { return mode; },
        get tables() { return ALL.slice(); },

        /** 이 표가 준비됐는지 (큰 표는 load() 를 부르기 전까지 false) */
        ready(t) { return loaded.has(t); },

        /** 목록 — 동기. 화면이 마음대로 고쳐도 원본이 상하지 않도록 사본을 줍니다. */
        rows(t) { return Array.from(tbl(t).values()).map(e => clone(e.data)); },

        /** 한 건 — 동기. 없으면 null */
        get(t, id) { const e = tbl(t).get(String(id)); return e ? clone(e.data) : null; },

        /** 몇 건인지 — 동기 */
        count(t) { return tbl(t).size; },

        /** 큰 표를 필요할 때 받아 오기 (이미 받았으면 그냥 돌아옵니다) */
        async load(t, force) {
            if (loaded.has(t) && !force) return tbl(t).size;
            const n = await fetchTable(t);
            watch(t);
            fire('kob-db-change', { table: t, id: null, reason: 'load' });
            return n;
        },

        /**
         * 넣기·고치기. row.id 가 이미 있으면 고치고, 없으면 넣습니다.
         * 화면 값은 즉시 바뀌고(동기), 서버 전송은 뒤에서 이어집니다.
         */
        save(t, row) {
            if (!row || row.id === undefined || row.id === null || row.id === '') {
                return Promise.reject(new Error('id 가 없는 자료는 저장할 수 없습니다: ' + t));
            }
            const id = String(row.id);
            const m = tbl(t);
            const isNew = !m.has(id);
            const prev = m.get(id);
            m.set(id, { data: clone(row), rev: prev ? prev.rev : 0 });
            fire('kob-db-change', { table: t, id, reason: 'local' });
            return queue(t + ':' + id, () => pushRow(t, id, isNew));
        },

        /** 지우기 */
        remove(t, id) {
            const key = String(id);
            if (!tbl(t).has(key)) return Promise.resolve();
            tbl(t).delete(key);
            fire('kob-db-change', { table: t, id: key, reason: 'local-delete' });
            return queue(t + ':' + key, () => pushDelete(t, key));
        },

        /**
         * 번호 받기 — 서버가 세므로 두 사람이 동시에 만들어도 겹치지 않습니다.
         * 로컬 모드에서는 이 브라우저 안에서만 셉니다.
         */
        async nextCode(kind, prefix, width) {
            const w = width || 4;
            if (mode === 'supabase') {
                const { data, error } = await client.rpc('next_code', { p_kind: kind, p_prefix: prefix, p_width: w });
                if (error) throw error;
                return data;
            }
            const k = 'kobDb.seq.' + kind;
            let n = 0;
            try { n = Number(window.localStorage.getItem(k) || 0) || 0; } catch (e) { /* 무시 */ }
            n += 1;
            try { window.localStorage.setItem(k, String(n)); } catch (e) { /* 무시 */ }
            return prefix + String(n).padStart(w, '0');
        },

        /** 아직 서버에 못 보낸 것이 있는지 (화면 아래 상태 표시용) */
        get pending() { return failed.size; },

        /** 지금 로그인 상태로 보이는지 — 표가 열려 있는지와 같은 뜻입니다 */
        get authed() { return mode !== 'supabase' ? true : authed; },

        /** 모든 표를 다시 받아 오기 (로그인 직후에는 저절로 불립니다) */
        reload() { return reloadAll('reload'); },

        /** 못 보낸 것 다시 보내기 */
        async retry() {
            const list = Array.from(failed.values());
            failed.clear();
            for (const f of list) {
                await queue(f.table + ':' + f.id,
                    () => (f.kind === 'delete' ? pushDelete(f.table, f.id) : pushRow(f.table, f.id, f.kind === 'insert')));
            }
            return failed.size;
        },

        /** kob-store.js 가 본체를 실행하기 전에 부릅니다. 화면에서 직접 부르지 마세요. */
        async __init(supabaseClient, storeMode) {
            client = supabaseClient || null;
            mode = (storeMode === 'supabase' && client) ? 'supabase' : 'local';
            const failedTables = [];
            for (const t of PRELOAD) {
                try { await fetchTable(t); watch(t); }
                catch (e) {
                    // 표 하나를 못 받아도 화면은 떠야 합니다 — 그 표만 비워 두고 알립니다.
                    console.error('[kob-db] 표를 받지 못했습니다:', t, e);
                    loaded.delete(t);
                    failedTables.push(t);
                }
            }
            if (failedTables.length) fire('kob-db-error', { table: failedTables.join(', '), message: '자료를 받지 못했습니다.' });
            hookAuth();                       // 로그인이 끝나면 다시 받아 옵니다

            // 못 보낸 것이 있으면 창을 닫기 전에 한 번 더 시도합니다.
            window.addEventListener('beforeunload', () => { if (failed.size) window.kobDb.retry(); });
            return { mode, tables: loaded.size, failed: failedTables };
        }
    };
})();
