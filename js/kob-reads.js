/**
 * 일정 확인 기록 — 누가 일정 상세를 열어 봤는지 (킹오더일정 · 2026-11-12). 서버는 supabase/schema-v10.sql.
 *
 *   kobReads.setMe({ email, name })   로그인한 사람 (로컬 모드 확인 목록에 씁니다)
 *   await kobReads.load()             내 확인 기록을 받아 옵니다 (로그인 뒤 한 번)
 *   kobReads.mine()                   → Map(일정 id → { first, last })  — 동기
 *   await kobReads.markSeen(id)       상세를 열었을 때. 화면 값은 바로 바뀌고 서버는 뒤에서
 *   await kobReads.markAllSeen(ids)   '모두 확인'
 *   await kobReads.counts(ids)        → Map(일정 id → 확인 인원 수)
 *   await kobReads.readers(id)        → [{ name, first, last }]  (등록자 · 참석자가 아니면 서버가 빈 목록)
 *   window 'kob-reads-change'         내 확인 기록이 바뀌면 (다른 기기 포함)
 *
 * 일정 줄(schedules)은 건드리지 않습니다. 일정 id 는 반복 일정이면 원래 일정 id(회차 아님)를 씁니다.
 * 로컬 모드(설정 비어 있음)는 브라우저 localStorage('kobReads.v1')에 같은 모양으로 둡니다.
 */
(function () {
    'use strict';
    const LS = 'kobReads.v1';
    const mineMap = new Map();
    let me = { email: '', name: '' };
    let watching = false;

    const client = () => (window.kobSupabase && window.kobStorage && window.kobStorage.mode === 'supabase') ? window.kobSupabase : null;
    const fire = () => { try { window.dispatchEvent(new CustomEvent('kob-reads-change')); } catch (e) { /* 옛 브라우저 */ } };
    const iso = () => new Date().toISOString();
    const clean = (ids) => Array.from(new Set((ids || []).map(x => String(x || '')).filter(Boolean)));

    function lsRead() { try { const v = JSON.parse(localStorage.getItem(LS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
    function lsWrite() {
        const o = {}; mineMap.forEach((v, k) => { o[k] = v; });
        try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { /* 저장 공간 부족 — 화면 값은 남습니다 */ }
    }

    function setMe(u) { me = { email: String((u && u.email) || '').toLowerCase(), name: String((u && u.name) || '') }; }

    async function load() {
        const c = client();
        if (!c) {
            mineMap.clear();
            const o = lsRead(); Object.keys(o).forEach(k => mineMap.set(k, o[k]));
            fire();
            return mineMap.size;
        }
        const rows = [];
        for (let from = 0; ; from += 1000) {
            const { data, error } = await c.from('schedule_reads').select('schedule_id,first_seen,last_seen').range(from, from + 999);
            if (error) { console.warn('[확인 기록] 받지 못했습니다 — schema-v10.sql 실행 여부를 확인해 주세요.', error.message); return 0; }
            (data || []).forEach(r => rows.push(r));
            if (!data || data.length < 1000) break;
        }
        mineMap.clear();
        rows.forEach(r => mineMap.set(r.schedule_id, { first: r.first_seen, last: r.last_seen }));
        watch(c);
        fire();
        return mineMap.size;
    }

    // 다른 기기(휴대폰 ↔ 컴퓨터)에서 확인한 것 — 내 줄만 옵니다 (select 정책)
    function watch(c) {
        if (watching) return; watching = true;
        try {
            c.channel('db:schedule_reads').on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_reads' }, (p) => {
                const r = p.new || {};
                if (!r.schedule_id || String(r.user_email || '').toLowerCase() !== me.email) return;
                mineMap.set(r.schedule_id, { first: r.first_seen, last: r.last_seen });
                fire();
            }).subscribe();
        } catch (e) { /* 실시간이 막혀도 화면은 동작 */ }
    }

    function mine() { return mineMap; }

    async function markAllSeen(idsIn) {
        const ids = clean(idsIn);
        if (!ids.length) return;
        const t = iso();
        ids.forEach(id => { const cur = mineMap.get(id); mineMap.set(id, { first: (cur && cur.first) || t, last: t }); });
        fire();
        const c = client();
        if (!c) { lsWrite(); return; }
        const { error } = await c.rpc('schedule_mark_seen', { ids });
        if (error) console.warn('[확인 기록] 저장하지 못했습니다', error.message);
    }
    function markSeen(id) { return markAllSeen([id]); }

    async function counts(idsIn) {
        const ids = clean(idsIn); const out = new Map();
        if (!ids.length) return out;
        const c = client();
        if (!c) { ids.forEach(id => { if (mineMap.has(id)) out.set(id, 1); }); return out; }
        const { data, error } = await c.rpc('schedule_read_counts', { ids });
        if (error) { console.warn('[확인 기록] 인원 수를 받지 못했습니다', error.message); return out; }
        (data || []).forEach(r => out.set(r.schedule_id, r.n));
        return out;
    }

    async function readers(id) {
        const c = client();
        if (!c) { const r = mineMap.get(String(id)); return r ? [{ name: me.name, first: r.first, last: r.last }] : []; }
        const { data, error } = await c.rpc('schedule_readers', { sid: String(id) });
        if (error) { console.warn('[확인 기록] 확인 목록을 받지 못했습니다', error.message); return []; }
        return (data || []).map(r => ({ name: r.user_name, first: r.first_seen, last: r.last_seen }));
    }

    window.kobReads = { setMe, load, mine, markSeen, markAllSeen, counts, readers };
})();
