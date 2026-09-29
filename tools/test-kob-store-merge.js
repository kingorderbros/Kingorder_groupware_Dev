// 목록 자료 합쳐 저장하기 시험 (2026-09-28) — js/kob-store.js 를 가짜 브라우저 · 가짜 Supabase 에 올려 돌립니다.
// 두 사람이 비슷한 때 같은 목록을 저장해도 서로의 변경이 사라지지 않는지 봅니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'kob-store.js'), 'utf8');

// ---------- 가짜 Supabase (app_store 한 표) ----------
function makeServer(init) {
    const rows = new Map(Object.entries(init).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
    const client = {
        auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        from(t) {
            const q = { _key: null };
            q.select = (cols) => {
                if (cols === 'key,value') return Promise.resolve({ data: Array.from(rows.entries()).map(([key, value]) => ({ key, value })), error: null });
                return q;
            };
            q.eq = (c, v) => { q._key = v; return q; };
            q.maybeSingle = () => Promise.resolve({ data: rows.has(q._key) ? { value: rows.get(q._key) } : null, error: null });
            q.upsert = (list) => { list.forEach(r => rows.set(r.key, JSON.parse(JSON.stringify(r.value)))); return Promise.resolve({ error: null }); };
            q.delete = () => ({ in: (c, keys) => { keys.forEach(k => rows.delete(k)); return Promise.resolve({ error: null }); } });
            return q;
        }
    };
    return { rows, client };
}
function boot(server) {
    const ls = new Map(), events = [];
    const el = () => ({ style: {}, setAttribute() {}, remove() {}, textContent: '' });
    const win = {
        KOB_CONFIG: { supabaseUrl: 'https://x', supabaseAnonKey: 'k' },
        supabase: { createClient: () => server.client },
        localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
        location: { search: '', hash: '' },
        addEventListener() {}, dispatchEvent(e) { events.push(e); },
        setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 5)), clearTimeout
    };
    const document = { readyState: 'complete', getElementById: () => null, createElement: el, body: { appendChild() {} }, head: { appendChild() {} },
                       documentElement: { setAttribute() {} } };
    class StorageEvent { constructor(type, init) { Object.assign(this, init, { type }); } }
    const ctx = vm.createContext({ window: win, document, console, JSON, Promise, Map, Set, Array, Object, String, Number, Math, Date, URLSearchParams,
                                   setTimeout: win.setTimeout, clearTimeout, StorageEvent, alert() {} });
    vm.runInContext(SRC, ctx);
    return { store: win.kobStorage, events, win };
}
const wait = (ms) => new Promise(r => setTimeout(r, ms || 30));
const flushNow = async (st) => { await st.flush(); await wait(); };

(async () => {
    console.log('\n[1] 남이 그사이 더한 항목이 사라지지 않는다');
    {
        const sv = makeServer({ 'gwList.v1': [{ id: 'a', n: 1 }] });
        const A = boot(sv); await wait();
        sv.rows.set('gwList.v1', [{ id: 'a', n: 1 }, { id: 'b', n: 1 }]);                 // 다른 사람이 b 를 더함 (이 창은 모름)
        A.store.setItem('gwList.v1', JSON.stringify([{ id: 'a', n: 2 }]));                // 이 창은 a 만 고침
        await flushNow(A.store);
        const out = sv.rows.get('gwList.v1');
        ok(out.length === 2 && out.find(x => x.id === 'a').n === 2 && out.find(x => x.id === 'b'), '서버: a 는 고친 값 · b 는 그대로');
        ok(JSON.parse(A.store.getItem('gwList.v1')).length === 2, '이 창에도 b 가 들어온다');
        ok(A.events.some(e => e.key === 'gwList.v1'), '화면이 다시 그리도록 알린다(storage 이벤트)');
    }
    console.log('\n[2] 내가 지운 것만 지운다');
    {
        const sv = makeServer({ 'gwList.v1': [{ id: 'a' }, { id: 'b' }] });
        const A = boot(sv); await wait();
        sv.rows.set('gwList.v1', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
        A.store.setItem('gwList.v1', JSON.stringify([{ id: 'b' }]));                        // a 를 지움
        await flushNow(A.store);
        ok(sv.rows.get('gwList.v1').map(x => x.id).sort().join() === 'b,c', '서버: a 만 빠지고 남이 더한 c 는 남는다');
    }
    console.log('\n[3] 남이 지운 것을 되살리지 않는다');
    {
        const sv = makeServer({ 'gwList.v1': [{ id: 'a' }, { id: 'b' }] });
        const A = boot(sv); await wait();
        sv.rows.set('gwList.v1', [{ id: 'a' }]);                                            // 남이 b 를 지움
        A.store.setItem('gwList.v1', JSON.stringify([{ id: 'a', x: 1 }, { id: 'b' }]));     // 이 창은 a 만 고침(b 는 그대로 들고 있음)
        await flushNow(A.store);
        ok(sv.rows.get('gwList.v1').map(x => x.id).join() === 'a' && sv.rows.get('gwList.v1')[0].x === 1, '서버: b 는 지워진 채 · a 는 고친 값');
    }
    console.log('\n[4] { seq, records } 묶음 (인바운드)');
    {
        const sv = makeServer({ 'gwInbound.v1': { seq: 3, records: [{ id: 'IN-1' }, { id: 'IN-2' }] } });
        const A = boot(sv); await wait();
        sv.rows.set('gwInbound.v1', { seq: 4, records: [{ id: 'IN-1' }, { id: 'IN-2' }, { id: 'IN-3' }] });
        A.store.setItem('gwInbound.v1', JSON.stringify({ seq: 4, records: [{ id: 'IN-9' }, { id: 'IN-1' }, { id: 'IN-2' }] }));
        await flushNow(A.store);
        const o = sv.rows.get('gwInbound.v1');
        ok(o.records.map(x => x.id).sort().join() === 'IN-1,IN-2,IN-3,IN-9' && o.seq === 4, '두 사람이 더한 인입이 모두 남고 seq 는 큰 쪽');
    }
    console.log('\n[5] 목록이 아닌 값은 예전처럼 통째로');
    {
        const sv = makeServer({ 'gwConf.v1': { a: 1 } });
        const A = boot(sv); await wait();
        sv.rows.set('gwConf.v1', { a: 1, b: 2 });
        A.store.setItem('gwConf.v1', JSON.stringify({ a: 5 }));
        await flushNow(A.store);
        ok(JSON.stringify(sv.rows.get('gwConf.v1')) === '{"a":5}', '설정 묶음은 내 값으로');
    }
    console.log('\n[6] 아무도 안 바꿨으면 그대로 저장');
    {
        const sv = makeServer({ 'gwList.v1': [{ id: 'a' }] });
        const A = boot(sv); await wait();
        A.store.setItem('gwList.v1', JSON.stringify([{ id: 'a' }, { id: 'z' }]));
        await flushNow(A.store);
        ok(sv.rows.get('gwList.v1').map(x => x.id).join() === 'a,z' && !A.events.some(e => e.key === 'gwList.v1'), '저장되고 화면 알림은 없음');
    }

    console.log('\n[7] 둘이 같은 번호로 새 항목을 만들면 (2026-09-29)');
    {
        const sv = makeServer({ 'gwList.v1': [{ id: 'CT-00001', who: 'x' }] });
        const A = boot(sv); await wait();
        sv.rows.set('gwList.v1', [{ id: 'CT-00001', who: 'x' }, { id: 'CT-00002', who: '남' }]);          // 다른 사람이 CT-00002 를 먼저 만듦
        A.store.setItem('gwList.v1', JSON.stringify([{ id: 'CT-00001', who: 'x' }, { id: 'CT-00002', who: '나' }]));   // 나도 CT-00002
        await flushNow(A.store);
        const out = sv.rows.get('gwList.v1');
        ok(out.find(x => x.id === 'CT-00002').who === '남', '남이 먼저 만든 항목은 그대로');
        ok(out.length === 3 && out.find(x => x.id === 'CT-00003' && x.who === '나'), '내 새 항목은 비어 있는 다음 번호(CT-00003)로 들어간다');
        ok(JSON.parse(A.store.getItem('gwList.v1')).some(x => x.id === 'CT-00003') && A.events.some(e => e.key === 'gwList.v1'), '이 창에도 바뀐 번호가 들어오고 화면에 알린다');
    }
    {
        const sv = makeServer({ 'gwList.v1': [{ id: 'a', n: 1 }] });
        const A = boot(sv); await wait();
        sv.rows.set('gwList.v1', [{ id: 'a', n: 5 }]);                                        // 남이 a 를 고침 (새 항목 아님)
        A.store.setItem('gwList.v1', JSON.stringify([{ id: 'a', n: 2 }]));                    // 나도 a 를 고침
        await flushNow(A.store);
        ok(sv.rows.get('gwList.v1').length === 1 && sv.rows.get('gwList.v1')[0].n === 2, '원래 있던 항목을 둘 다 고친 것은 예전처럼 나중 것 (번호를 바꾸지 않음)');
    }

    console.log('\n[8] 번호를 바꾼 뒤 — 검토에서 나온 것 (2026-09-29)');
    {
        const sv = makeServer({ 'gwList.v1': [{ id: 'CT-00001', who: 'x' }] });
        const A = boot(sv); await wait();
        sv.rows.set('gwList.v1', [{ id: 'CT-00001', who: 'x' }, { id: 'CT-00002', who: '남' }]);
        A.store.setItem('gwList.v1', JSON.stringify([{ id: 'CT-00001', who: 'x' }, { id: 'CT-00002', who: '나' }]));
        await flushNow(A.store);
        // 화면 변수가 아직 옛 번호(CT-00002 = 내 것)로 한 번 더 저장
        A.store.setItem('gwList.v1', JSON.stringify([{ id: 'CT-00001', who: 'x' }, { id: 'CT-00002', who: '나', memo: '고침' }]));
        await flushNow(A.store);
        const out = sv.rows.get('gwList.v1');
        ok(out.find(x => x.id === 'CT-00002').who === '남' && out.find(x => x.id === 'CT-00003').memo === '고침' && out.length === 3, '화면이 옛 번호로 다시 저장해도 남의 항목을 덮지 않고 내 항목(새 번호)에 들어간다');
    }
    {
        const sv = makeServer({ 'gwUserPresence.v1': [{ id: 'u1', lastSeen: 'a' }] });
        const A = boot(sv); await wait();
        sv.rows.set('gwUserPresence.v1', [{ id: 'u1', lastSeen: 'a' }, { id: 'u5', lastSeen: 'PC' }]);   // 같은 사람이 다른 창에서 먼저
        A.store.setItem('gwUserPresence.v1', JSON.stringify([{ id: 'u1', lastSeen: 'a' }, { id: 'u5', lastSeen: '폰' }]));
        await flushNow(A.store);
        const out = sv.rows.get('gwUserPresence.v1');
        ok(out.length === 2 && !out.find(x => x.id === 'u6') && out.find(x => x.id === 'u5').lastSeen === '폰', '접속 기록(사람 번호)은 번호를 바꾸지 않는다 — 남의 번호(u6)에 기록이 붙지 않음');
    }
    {
        const sv = makeServer({ 'gwInboundRecords.v1': { seq: 14, records: [{ id: 'IN-0013' }] } });
        const A = boot(sv); await wait();
        sv.rows.set('gwInboundRecords.v1', { seq: 15, records: [{ id: 'IN-0013' }, { id: 'IN-0014', who: '남' }] });
        A.store.setItem('gwInboundRecords.v1', JSON.stringify({ seq: 15, records: [{ id: 'IN-0013' }, { id: 'IN-0014', who: '나' }] }));
        await flushNow(A.store);
        const out = sv.rows.get('gwInboundRecords.v1');
        ok(out.records.find(x => x.id === 'IN-0015' && x.who === '나') && out.seq >= 16, '인바운드 번호를 바꾸면 다음 번호(seq)도 그 뒤로 올린다');
    }

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
