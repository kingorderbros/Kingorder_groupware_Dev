// 가짜 Supabase (메모리) — 서버 코드(functions/api/[[route]].js)를 실제 DB 없이 돌려 보는 시험용 (2026-10-05)
//   · REST: app_store(key · value) · 그 밖의 표(id · data · rev — customers 등). PostgREST 거르기 중 서버가 쓰는 것만:
//           eq · in · like · data->>칸=eq · biz_no(=data.bizNo) · select · limit · order
//   · Auth: /auth/v1/user — tokens 에 넣은 토큰이면 그 이메일로 로그인한 직원
// 쓰는 법: const mock = makeMock({ store: { 'gwUsers.v1': [...] }, tables: { customers: [{ id, data }] }, tokens: { 'tok': 'a@b.c' } });
//          global.fetch = mock.fetch;   (Supabase 가 아닌 주소는 realFetch 로 넘깁니다)
const BASE = 'https://mock.supabase.co';

function makeMock(seed) {
    const sd = seed || {};
    const store = new Map(Object.entries(sd.store || {}).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
    const tables = new Map();
    Object.entries(sd.tables || {}).forEach(([t, rows]) => tables.set(t, new Map(rows.map(r => [r.id, { id: r.id, data: JSON.parse(JSON.stringify(r.data || {})), rev: r.rev || 1 }]))));
    const tokens = Object.assign({}, sd.tokens || {});
    const log = [];
    const realFetch = sd.realFetch || (typeof fetch === 'function' ? fetch : null);
    const T = (n) => { if (!tables.has(n)) tables.set(n, new Map()); return tables.get(n); };
    const res = (status, body) => new Response(body === undefined || body === null ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const list = (v) => { const m = /^in\.\((.*)\)$/.exec(v); return m ? m[1].split(',').map(x => x.trim().replace(/^"|"$/g, '')) : null; };

    function filterRows(rows, params, getField) {
        let out = rows;
        for (const [k, v] of params) {
            if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
            const field = (r) => getField(r, k);
            if (v.startsWith('eq.')) { const want = v.slice(3); out = out.filter(r => String(field(r) ?? '') === want); }
            else if (v.startsWith('in.')) { const want = list(v) || []; out = out.filter(r => want.includes(String(field(r) ?? ''))); }
            else if (v.startsWith('like.')) { const pre = v.slice(5).replace(/\*$/, ''); out = out.filter(r => String(field(r) ?? '').startsWith(pre)); }
        }
        const lim = Number(params.get('limit')) || 0;
        return lim ? out.slice(0, lim) : out;
    }
    async function handle(url, opt) {
        const u = new URL(url);
        const method = (opt && opt.method) || 'GET';
        const body = opt && opt.body ? JSON.parse(opt.body) : undefined;
        if (u.pathname === '/auth/v1/user') {
            const tok = String((opt && opt.headers && (opt.headers.Authorization || opt.headers.authorization)) || '').replace(/^Bearer\s+/i, '');
            return tokens[tok] ? res(200, { id: 'u-' + tok, email: tokens[tok] }) : res(401, { msg: 'bad token' });
        }
        const m = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
        if (!m) return res(404, { msg: 'mock: 모르는 주소 ' + u.pathname });
        const t = m[1];
        log.push([method, t, u.search]);
        if (t === 'app_store') {
            if (method === 'GET') {
                const rows = Array.from(store.entries()).map(([key, value]) => ({ key, value }));
                const out = filterRows(rows, u.searchParams, (r, k) => r[k]);
                const sel = (u.searchParams.get('select') || 'key,value').split(',');
                return res(200, out.map(r => Object.fromEntries(sel.map(c => [c, JSON.parse(JSON.stringify(r[c]))]))));
            }
            if (method === 'POST') { (Array.isArray(body) ? body : [body]).forEach(r => store.set(r.key, JSON.parse(JSON.stringify(r.value)))); return res(201, null); }
            return res(405, {});
        }
        const tb = T(t);
        const getField = (r, k) => {
            if (k === 'id' || k === 'rev') return r[k];
            const j = /^data->>(.+)$/.exec(k); if (j) return r.data[j[1]];
            if (k === 'biz_no') return r.data.bizNo;
            if (k === 'name') return r.data.name;
            return r.data[k];
        };
        if (method === 'GET') {
            const out = filterRows(Array.from(tb.values()), u.searchParams, getField);
            const sel = (u.searchParams.get('select') || 'id,data').split(',');
            return res(200, out.map(r => Object.fromEntries(sel.filter(c => c in r || c === 'updated_by' || c === 'updated_at').map(c => [c, JSON.parse(JSON.stringify(r[c] === undefined ? null : r[c]))]))));
        }
        if (method === 'POST') {
            (Array.isArray(body) ? body : [body]).forEach(r => {
                if (tb.has(r.id) && !/merge-duplicates/.test(String((opt.headers || {}).Prefer || ''))) throw new Error('mock: 이미 있는 줄 ' + r.id);
                tb.set(r.id, { id: r.id, data: JSON.parse(JSON.stringify(r.data || {})), rev: r.rev || 1, updated_by: r.updated_by || null });
            });
            return res(201, null);
        }
        if (method === 'PATCH') {
            const hit = filterRows(Array.from(tb.values()), u.searchParams, getField);
            hit.forEach(r => { Object.assign(r, JSON.parse(JSON.stringify(body))); });
            return res(200, hit.map(r => ({ id: r.id, data: r.data, rev: r.rev })));
        }
        if (method === 'DELETE') { filterRows(Array.from(tb.values()), u.searchParams, getField).forEach(r => tb.delete(r.id)); return res(204, null); }
        return res(405, {});
    }
    return {
        BASE, store, tables, tokens, log,
        env: { SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role' },
        fetch: async (url, opt) => {
            const s = String(url && url.url ? url.url : url);
            if (s.startsWith(BASE)) {
                const o = Object.assign({}, opt || {});
                if (o.headers && typeof Headers !== 'undefined' && o.headers instanceof Headers) { const h = {}; o.headers.forEach((v, k) => { h[k] = v; }); o.headers = h; }
                return handle(s, o);
            }
            if (!realFetch) throw new Error('mock: 바깥 주소 ' + s);
            return realFetch(url, opt);
        },
        get: (k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
        row: (t, id) => { const r = T(t).get(id); return r ? JSON.parse(JSON.stringify(Object.assign({ id: r.id }, r.data, { __rev: r.rev }))) : null; }
    };
}
module.exports = { makeMock, BASE };
