/**
 * 킹오더브라더스 그룹웨어 — 저장소 부트스트랩 (개발환경 · 2026-09-16)
 *
 * 본체(index.html 의 <script type="text/x-kob-main">)는 localStorage 대신 **kobStorage** 를 씁니다.
 * kobStorage 는 getItem / setItem / removeItem 만 있는 얇은 문자열 저장소이고, 뒤는 둘 중 하나입니다.
 *
 *   · Supabase 모드 — config/app-config.js 에 supabaseUrl · supabaseAnonKey 가 있으면
 *       app_store(key text, value jsonb) 표를 통째로 읽어 메모리에 얹고(부팅 때 1회),
 *       쓰기는 메모리에 바로 반영한 뒤 Supabase 에 upsert 합니다(300ms 모아서).
 *       다른 사람이 바꾼 값은 Realtime 으로 받아 메모리에 넣고, 본체가 이미 듣고 있는
 *       window 'storage' 이벤트를 흉내 내어 던집니다 → 기존 창 간 동기화 코드가 그대로 동작합니다.
 *   · 로컬 모드 — 설정이 비어 있으면 브라우저 localStorage 를 그대로 씁니다 (시연본과 같음).
 *
 * 브라우저에만 두는 값(LOCAL_ONLY) — 로그인 아이디 기억 · 화면 색 · 작성 중 임시저장 · 토스트 위치 · 이행 표시 —
 * 은 어느 모드에서도 localStorage 에만 둡니다. 사람마다 다른 값이라 공유하면 안 됩니다.
 *
 * 저장소 준비가 끝나면 본체 스크립트를 실행합니다. 본체는 맨 위에서부터 kobStorage 를 동기로 읽으므로
 * (예: let partners = loadJsonStore(...)) **읽기가 끝난 뒤**에 실행해야 합니다.
 */
(function () {
    'use strict';
    const cfg = window.KOB_CONFIG || {};
    const LOCAL_ONLY = [/^savedLoginId$/, /^pcSavedLoginId$/, /^gwTheme$/, /^pcTheme$/, /^gwPartnerIntakeDraft\.v1$/,
                        /^gwToastPos\.v1$/, /^gwPartnerDeptPerm\.newMenus\./,
                        /^gwWcLastCustomer\.v1$/,
                        /^pcToken\.v1$/];   // 파트너센터 로그인 토큰 — 이 브라우저에만 (2026-09-28)   // 업무센터에서 마지막으로 보던 고객 — 사람마다 다름
    const isLocalOnly = (k) => LOCAL_ONLY.some(re => re.test(String(k)));

    // ---------- 로그인 전에는 서버에 쓰지 않습니다 (2026-09-28) ----------
    // 화면이 켜질 때 '값이 없으면 기본값을 저장' 하는 곳이 여럿 있습니다. 로그인 전(anon)에 그런 쓰기가 나가면
    //   · app_store 를 로그인 사용자로 좁힌 뒤에는 거절되고, 재시도 대기열에 남아 있다가
    //   · 로그인하는 순간 통과해서 **실제 자료(직원 · 파트너 계정 등)를 기본값으로 덮을 수 있습니다.**
    // 그래서 로그인하지 않은 상태의 쓰기는 이 화면 메모리에만 두고 서버로 보내지 않습니다.
    // 파트너센터(?mode=partner)는 app_store 를 직접 만지지 않고 서버(/api/partner/*)를 거칩니다 — 아래 '파트너 모드'.
    // 예전 주소(…#partner)도 파트너센터입니다 — 화면(isPartnerMode)과 같은 기준 (2026-09-28 검토)
    const VIEW_MODE = (function () {
        try { return new URLSearchParams(window.location.search).get('mode') || (window.location.hash === '#partner' ? 'partner' : ''); }
        catch (e) { return ''; }
    })();
    let authed = false;               // Supabase 로그인 세션이 있는지
    let warnedAnon = false;
    function canPush(k) { return authed; }
    function holdAnon(k) {
        if (!warnedAnon) { warnedAnon = true; console.info('[kob-store] 로그인 전이라 서버에 저장하지 않습니다 (이 화면에만 반영):', k); }
    }

    const cache = new Map();          // key → 문자열(JSON) — Supabase 모드에서만 씁니다
    const synced = new Map();         // key → 마지막으로 서버와 맞춘 값(문자열) — 저장할 때 '내가 바꾼 건' 을 가려내는 기준
    let client = null;                // supabase-js 클라이언트
    let mode = 'local';
    const pending = new Map();        // key → 값(또는 null=삭제) — 모아 보낼 쓰기
    let flushTimer = null;

    const ls = {
        get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* 용량 초과 · 차단 — 메모리에는 남습니다 */ } },
        del(k) { try { window.localStorage.removeItem(k); } catch (e) { /* 무시 */ } }
    };

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(flush, 300);
    }
    // ---------- 목록 자료 합쳐 저장하기 (2026-09-28) ----------
    // 설정 자료는 '키 하나 = 목록 통째' 라, 두 사람이 비슷한 때 저장하면 나중 사람이 앞사람의 변경을 덮었습니다.
    // 목록(id 가 있는 항목들, 또는 { records: [...] } 묶음)이면 저장 직전에 서버의 최신 값을 다시 읽고,
    // **내가 바꾼 항목(추가 · 수정 · 삭제)만** 그 위에 얹어 저장합니다. 같은 항목을 둘 다 고쳤으면 나중 것이 이깁니다.
    function listShape(str) {
        let v; try { v = JSON.parse(str); } catch (e) { return null; }
        const isList = (a) => Array.isArray(a) && a.every(x => x && typeof x === 'object' && x.id !== undefined && x.id !== null);
        if (isList(v)) return { list: v, wrap: null };
        if (v && typeof v === 'object' && !Array.isArray(v) && isList(v.records)) return { list: v.records, wrap: v };
        return null;
    }
    // 번호를 바꾸면 안 되는 목록 — id 가 사람 번호 같은 '뜻 있는 값' 인 것 (같은 사람이 두 창에서 처음 쓰면 남의 번호가 되어 버림)
    const NO_RENAME_KEYS = ['gwUserPresence.v1'];
    // 이 창에서 번호를 바꾼 기록 — 키 → Map(옛 번호 → 새 번호). 화면 변수가 아직 옛 번호로 저장하면 여기서 새 번호로 고쳐 보냅니다.
    const renames = new Map();
    // mergeLists → { str, renamed: { 옛 번호: 새 번호 } } (합칠 수 없으면 null)
    function mergeLists(baseStr, mineStr, serverStr, keyName) {
        const mine = listShape(mineStr), server = listShape(serverStr);
        if (!mine || !server || (!!mine.wrap !== !!server.wrap)) return null;          // 목록이 아니면 합치지 않고 통째로
        const base = baseStr == null ? null : listShape(baseStr);
        const key = (x) => String(x.id);
        const before = new Map((base ? base.list : []).map(x => [key(x), JSON.stringify(x)]));
        const mineIds = new Set(mine.list.map(key));
        const changed = mine.list.filter(x => before.get(key(x)) !== JSON.stringify(x));      // 내가 더하거나 고친 것
        const removed = base ? Array.from(before.keys()).filter(id => !mineIds.has(id)) : []; // 내가 지운 것
        const out = server.list.filter(x => !removed.includes(key(x)));
        // 둘이 같은 때 새 항목을 만들어 번호가 겹치면(둘 다 base 에 없던 번호) 내 것을 비어 있는 다음 번호로 — 남의 새 항목을 덮지 않게 (2026-09-29)
        const taken = new Set(out.map(key).concat(mine.list.map(key)));
        const renamed = {};
        const freeId = (id) => {
            const m = /^(.*?)(\d+)$/.exec(String(id));
            if (!m) { let n = 2; while (taken.has(`${id}-${n}`)) n++; return `${id}-${n}`; }
            let n = Number(m[2]);
            let cand;
            do { n++; cand = m[1] + String(n).padStart(m[2].length, '0'); } while (taken.has(cand));
            return cand;
        };
        changed.forEach(x => {
            const i = out.findIndex(y => key(y) === key(x));
            if (i > -1 && base && !before.has(key(x)) && JSON.stringify(out[i]) !== JSON.stringify(x) && !NO_RENAME_KEYS.includes(keyName)) {
                const nid = freeId(x.id);
                taken.add(nid);
                const newId = typeof x.id === 'number' ? Number(nid) || nid : nid;
                renamed[key(x)] = newId;
                out.push(Object.assign({}, x, { id: newId }));
                return;
            }
            if (i > -1) out[i] = x; else out.push(x);
        });
        // 순서는 내 목록 순서를 따르고, 내가 모르는(남이 더한) 항목은 그 자리 뒤에 둡니다
        const order = new Map(mine.list.map((x, i) => [key(x), i]));
        out.sort((a, b) => (order.has(key(a)) ? order.get(key(a)) : 1e9) - (order.has(key(b)) ? order.get(key(b)) : 1e9));
        if (!mine.wrap) return { str: JSON.stringify(out), renamed };
        const w = Object.assign({}, server.wrap, mine.wrap, { records: out });
        if (typeof server.wrap.seq === 'number' || typeof mine.wrap.seq === 'number') {
            w.seq = Math.max(Number(server.wrap.seq) || 0, Number(mine.wrap.seq) || 0);
            // 바꾼 번호보다 다음 번호(seq)가 작으면 다음에 만든 것이 또 겹칩니다 — 올려 둡니다 (2026-09-29 검토)
            Object.values(renamed).forEach(nid => { const m = /(\d+)$/.exec(String(nid)); if (m) w.seq = Math.max(w.seq, Number(m[1]) + 1); });
        }
        return { str: JSON.stringify(w), renamed };
    }
    // 화면 값에 아직 옛 번호로 남은 '내 항목' 을 새 번호로 (새 번호가 이미 있으면 화면이 다시 읽은 것이라 그대로)
    //   옛 번호 자리에는 남의 항목이 있으므로(화면은 그것을 모름) 마지막으로 맞춘 서버 값에서 다시 넣어 둡니다.
    function applyRenames(k, v) {
        const map = renames.get(k);
        if (!map || !map.size) return v;
        const sh = listShape(v);
        if (!sh) return v;
        const ids = new Set(sh.list.map(x => String(x.id)));
        const syncedSh = synced.has(k) ? listShape(synced.get(k)) : null;
        let hit = false;
        sh.list.slice().forEach(x => {
            const old = String(x.id);
            const nid = map.get(old);
            if (nid === undefined || ids.has(String(nid))) return;
            x.id = nid; hit = true;
            const theirs = syncedSh && syncedSh.list.find(y => String(y.id) === old);
            if (theirs) sh.list.push(JSON.parse(JSON.stringify(theirs)));
        });
        if (!hit) return v;
        return JSON.stringify(sh.wrap ? Object.assign({}, sh.wrap, { records: sh.list }) : sh.list);
    }
    let flushing = false;
    async function flush() {
        flushTimer = null;
        if (!client || !pending.size) return;
        if (flushing) { scheduleFlush(); return; }             // 앞 저장이 끝난 뒤에 (같은 키를 겹쳐 보내지 않게)
        // 보내는 순간에도 한 번 더 — 그사이 로그아웃했으면 보내지 않습니다
        const batch = Array.from(pending.entries()).filter(([k]) => canPush(k)); pending.clear();
        if (!batch.length) return;
        flushing = true;
        const dels = batch.filter(([, v]) => v === null).map(([key]) => key);
        try {
            const plain = [];
            for (let [key, v] of batch) {         // v 는 applyRenames 로 바뀔 수 있어 let
                if (v === null) continue;
                if (!listShape(v)) { plain.push({ key, value: safeJson(v), updated_at: new Date().toISOString() }); continue; }
                // 목록 — 서버 최신 값 위에 내 변경만 얹기
                const orig = v;
                v = applyRenames(key, v);                          // 화면이 옛 번호로 저장해도 남의 항목을 덮지 않게
                const { data: row, error: e1 } = await client.from('app_store').select('value').eq('key', key).maybeSingle();
                if (e1) throw e1;
                const serverStr = row ? toStr(row.value) : null;
                let out = v;
                if (serverStr !== null && serverStr !== synced.get(key)) {
                    const merged = mergeLists(synced.has(key) ? synced.get(key) : null, v, serverStr, key);
                    if (merged !== null) {
                        out = merged.str;
                        const ks = Object.keys(merged.renamed);
                        if (ks.length) { const m = renames.get(key) || new Map(); ks.forEach(o => m.set(o, merged.renamed[o])); renames.set(key, m); }
                    }
                }
                const { error: e2 } = await client.from('app_store').upsert([{ key, value: safeJson(out), updated_at: new Date().toISOString() }], { onConflict: 'key' });
                if (e2) throw e2;
                synced.set(key, out);
                // 합친 결과가 내 화면 값과 다르면(남의 변경이 들어왔으면) 화면에 알립니다 — 그사이 새로 쓴 값은 건드리지 않음
                if (out !== orig && cache.get(key) === orig && !pending.has(key)) {
                    cache.set(key, out); ls.set(key, out);
                    try { window.dispatchEvent(new StorageEvent('storage', { key, oldValue: orig, newValue: out, storageArea: window.localStorage })); } catch (e) { /* 새로고침으로 */ }
                }
            }
            if (plain.length) {
                const { error } = await client.from('app_store').upsert(plain, { onConflict: 'key' }); if (error) throw error;
                plain.forEach(r => synced.set(r.key, toStr(r.value)));
            }
            if (dels.length) { const { error } = await client.from('app_store').delete().in('key', dels); if (error) throw error; dels.forEach(k => synced.delete(k)); }
            setStatus('ok');
        } catch (e) {
            console.error('[kob-store] 저장 실패 — 다시 시도합니다', e);
            batch.forEach(([k, v]) => { if (!pending.has(k)) pending.set(k, v); });   // 새 쓰기가 있으면 그것을 우선
            setStatus('error', e.message || String(e));
            setTimeout(scheduleFlush, 3000);
        } finally {
            flushing = false;
        }
    }
    // 문자열 값은 jsonb 에 담기 위해 JSON 으로 해석해 보고, 아니면 문자열 그대로
    function safeJson(str) { try { return JSON.parse(str); } catch (e) { return str; } }
    function toStr(v) { return typeof v === 'string' ? v : JSON.stringify(v); }

    // 화면 오른쪽 아래 작은 상태 표시 (개발환경에서 어느 저장소를 쓰는지 · 저장이 실패하는지 바로 보이게)
    function setStatus(state, detail) {
        let el = document.getElementById('kob-store-status');
        if (!el) {
            el = document.createElement('div'); el.id = 'kob-store-status';
            el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9998;font:11px/1.4 system-ui,sans-serif;padding:3px 8px;border-radius:999px;opacity:.85;pointer-events:none;';
            document.body.appendChild(el);
        }
        const env = cfg.env ? ` · ${cfg.env}` : '';
        if (state === 'error') { el.style.background = '#fee2e2'; el.style.color = '#991b1b'; el.textContent = `저장 실패 — 다시 시도 중${env}`; el.title = detail || ''; }
        else if (mode === 'supabase') { el.style.background = '#dcfce7'; el.style.color = '#166534'; el.textContent = `Supabase${env}`; }
        else if (mode === 'partner') { el.style.background = '#dcfce7'; el.style.color = '#166534'; el.textContent = `서버${env}`; }
        else { el.style.background = '#e5e7eb'; el.style.color = '#374151'; el.textContent = `로컬 저장소${env} — Supabase 미설정`; }
    }

    window.kobStorage = {
        getItem(k) {
            if (mode === 'local' || isLocalOnly(k)) return ls.get(k);
            return cache.has(k) ? cache.get(k) : null;
        },
        setItem(k, v) {
            const s = String(v);
            if (mode === 'local' || isLocalOnly(k)) { ls.set(k, s); return; }
            if (mode === 'partner') { pcSet(k, s); return; }
            // 내용이 같으면 보내지 않습니다 — 화면을 그릴 때마다 저장하는 곳(예: 파트너사 목록)이 있어
            // 같은 값을 통째로 다시 올리면 그사이 남이 고친 것을 덮을 수 있습니다 (2026-09-28)
            if (cache.get(k) === s && !pending.has(k)) return;
            cache.set(k, s); ls.set(k, s);            // 로컬에도 사본 (오프라인 · 새로고침 직후 대비)
            if (!canPush(k)) { holdAnon(k); return; }
            pending.set(k, s); scheduleFlush();
        },
        removeItem(k) {
            if (mode === 'local' || isLocalOnly(k)) { ls.del(k); return; }
            if (mode === 'partner') { cache.delete(k); return; }     // 파트너는 목록을 통째로 지우지 못합니다 — 화면에서만
            cache.delete(k); ls.del(k);
            if (!canPush(k)) { holdAnon(k); return; }
            pending.set(k, null); scheduleFlush();
        },
        get mode() { return mode; },
        get authed() { return mode === 'supabase' ? authed : (mode === 'partner' ? !!pcSession : true); },
        // 모아 둔 쓰기를 지금 보냅니다 — 로그아웃 직전에 부릅니다 (2026-09-28)
        flush() { if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; } return flush(); }
    };

    // ==================== 파트너 모드 (?mode=partner · 2026-09-28 자료 보호 2단계) ====================
    // 로그인  : kobPartner.login(아이디, 비밀번호) → 서버가 확인하고 토큰을 줍니다 → 화면이 새로 불러옵니다
    // 켤 때   : 토큰이 있으면 GET /api/partner/boot 로 **그 파트너사 몫만** 받아 메모리에 얹고 본체를 실행합니다
    // 저장    : 파트너가 쓰는 4개 자료만, 바뀐 건(upserts · removes)만 POST /api/partner/save 로 보냅니다.
    //           서버가 그 파트너사 것인지 확인한 뒤 반영하고, 반영된 목록을 돌려주면 메모리에 얹습니다.
    // 새 소식 : 30초마다(또 창으로 돌아올 때) 다시 받아 바뀐 키는 'storage' 이벤트로 화면에 알립니다.
    const API = cfg.apiBase || '';
    const PC_TOKEN_KEY = 'pcToken.v1';
    const PC_WRITE_KEYS = ['gwPartnerIntakes.v1', 'gwDevRequests.v1', 'gwDevNotiQueue.v1', 'gwInboundRecords.v1'];
    let pcSession = null;             // { loginId, partnerId, partnerName }
    const pcChain = new Map();        // 키 → 진행 중인 저장 (같은 키는 차례대로)
    const pcBusy = new Map();         // 키 → 보내는 중인 저장 수 (그동안 받아 온 옛 값으로 덮지 않게)
    const pcWrites = new Map();       // 키 → 이 화면에서 쓴 횟수 — 받아 오는 사이에 쓴 키는 받은 (옛) 값으로 덮지 않습니다
    function pcToken() { return ls.get(PC_TOKEN_KEY) || ''; }
    async function pcFetch(method, path, bodyObj) {
        const res = await fetch(API + path, {
            method, cache: 'no-store',
            headers: Object.assign({ 'Content-Type': 'application/json' }, pcToken() ? { Authorization: 'Bearer ' + pcToken() } : {}),
            body: bodyObj === undefined ? undefined : JSON.stringify(bodyObj)
        });
        const j = await res.json().catch(() => ({}));
        return { status: res.status, j };
    }
    function fireStorage(key, oldValue, newValue) {
        try { window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: window.localStorage })); } catch (e) { /* 새로고침으로 */ }
    }
    // 목록 두 개의 차이 — id 기준
    function pcDiff(oldStr, newStr) {
        let a = [], b = [];
        try { a = JSON.parse(oldStr || '[]'); } catch (e) { a = []; }
        try { b = JSON.parse(newStr || '[]'); } catch (e) { b = []; }
        // 인바운드처럼 { seq, records } 묶음으로 저장되는 자료는 records 를 견줍니다 (2026-09-28 검토)
        if (a && !Array.isArray(a) && Array.isArray(a.records)) a = a.records;
        if (b && !Array.isArray(b) && Array.isArray(b.records)) b = b.records;
        if (!Array.isArray(a)) a = []; if (!Array.isArray(b)) b = [];
        const before = new Map(a.filter(x => x && x.id !== undefined).map(x => [String(x.id), JSON.stringify(x)]));
        const upserts = b.filter(x => x && x.id !== undefined && before.get(String(x.id)) !== JSON.stringify(x));
        const now = new Set(b.filter(x => x && x.id !== undefined).map(x => String(x.id)));
        const removes = Array.from(before.keys()).filter(id => !now.has(id));
        return { upserts, removes };
    }
    function pcSet(k, s) {
        const old = cache.has(k) ? cache.get(k) : null;
        if (old === s) return;
        cache.set(k, s);
        pcWrites.set(k, (pcWrites.get(k) || 0) + 1);
        if (!pcSession || !PC_WRITE_KEYS.includes(k)) { holdAnon(k); return; }
        const d = pcDiff(old, s);
        if (!d.upserts.length && !d.removes.length) return;
        pcBusy.set(k, (pcBusy.get(k) || 0) + 1);
        const prev = pcChain.get(k) || Promise.resolve();
        const next = prev.then(() => pcSend(k, d, 0, old, s)).finally(() => pcBusy.set(k, pcBusy.get(k) - 1));
        pcChain.set(k, next.catch(() => {}));
    }
    async function pcSend(k, d, attempt, oldStr, newStr) {
        try {
            const { status, j } = await pcFetch('POST', '/api/partner/save', { key: k, upserts: d.upserts, removes: d.removes });
            if (status === 401) { pcExpired(); return; }
            if (!j.ok) throw new Error(j.error || ('서버 오류 ' + status));
            setStatus('ok');
            if (j.rejected && j.rejected.length) console.warn('[kob-store] 서버가 받지 않은 건:', k, j.rejected);
            // 서버에 반영된 목록으로 맞춥니다 (번호가 겹쳐 새 번호를 받은 건도 여기서 바뀝니다)
            const fresh = JSON.stringify(j.value);
            const cur = cache.get(k);
            if (fresh !== cur) { cache.set(k, fresh); fireStorage(k, cur, fresh); }
        } catch (e) {
            console.error('[kob-store] 파트너 저장 실패', k, e);
            setStatus('error', e.message || String(e));
            if (attempt < 2) { await new Promise(r => setTimeout(r, 3000)); return pcSend(k, d, attempt + 1, oldStr, newStr); }
            // 끝내 못 보냈으면 화면 값을 저장 전으로 되돌립니다 — 그대로 두면 다음 저장 때 차이가 없어 영영 안 보내집니다 (2026-09-28 검토)
            if (cache.get(k) === newStr && oldStr !== undefined) {
                if (oldStr === null) cache.delete(k); else cache.set(k, oldStr);
                fireStorage(k, newStr, oldStr);
            }
            alert('저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.\n(방금 입력한 내용은 저장되지 않았습니다)\n\n' + (e.message || e));
        }
    }
    function pcExpired() {
        ls.del(PC_TOKEN_KEY);
        alert('로그인이 끝났습니다. 다시 로그인해 주세요.');
        window.location.reload();
    }
    async function pcPull() {
        if (!pcSession) return;
        const writesAtStart = new Map(pcWrites);
        let r;
        try { r = await pcFetch('GET', '/api/partner/boot'); } catch (e) { return; }
        if (r.status === 401) { pcExpired(); return; }
        if (!r.j || !r.j.ok) return;
        Object.keys(r.j.store || {}).forEach(k => {
            if (pcBusy.get(k) > 0) return;
            if ((pcWrites.get(k) || 0) !== (writesAtStart.get(k) || 0)) return;   // 받아 오는 사이에 이 화면이 쓴 키
            const fresh = JSON.stringify(r.j.store[k]);
            const cur = cache.has(k) ? cache.get(k) : null;
            if (fresh === cur) return;
            cache.set(k, fresh);
            fireStorage(k, cur, fresh);
        });
    }
    async function bootPartner() {
        mode = 'partner';
        if (pcToken()) {
            try {
                const r = await pcFetch('GET', '/api/partner/boot');
                if (r.status === 401) ls.del(PC_TOKEN_KEY);
                else if (r.j && r.j.ok) {
                    pcSession = r.j.session;
                    Object.keys(r.j.store || {}).forEach(k => cache.set(k, JSON.stringify(r.j.store[k])));
                }
            } catch (e) { console.error('[kob-store] 파트너 자료를 받지 못했습니다', e); }
        }
        if (pcSession) {
            setInterval(pcPull, 30000);
            window.addEventListener('focus', pcPull);
        }
    }
    window.kobPartner = {
        get session() { return pcSession; },
        // 성공하면 토큰을 남기고 { ok: true } — 화면은 새로 불러 들어갑니다
        async login(loginId, pw) {
            let r;
            try { r = await pcFetch('POST', '/api/partner/login', { loginId, pw }); }
            catch (e) { return { ok: false, error: '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }; }
            if (!r.j || !r.j.ok) return { ok: false, error: (r.j && r.j.error) || ('서버 오류 ' + r.status) };
            ls.set(PC_TOKEN_KEY, r.j.token);
            return { ok: true };
        },
        async logout() {
            await Promise.all(Array.from(pcChain.values()));     // 보내는 중인 저장은 끝내고
            ls.del(PC_TOKEN_KEY);
            window.location.reload();
        }
    };

    function loadScript(src) {
        return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('스크립트를 못 받아 옴: ' + src)); document.head.appendChild(s); });
    }
    function runMain() {
        const holder = document.getElementById('kob-main');
        if (!holder) return;
        const s = document.createElement('script');
        s.textContent = holder.textContent;           // 전역 범위에서 실행 — 인라인 onclick 이 함수를 찾을 수 있게
        document.body.appendChild(s);
        holder.remove();
    }

    async function boot() {
        if (VIEW_MODE === 'partner' && cfg.supabaseUrl && cfg.supabaseAnonKey) {
            await bootPartner();
            if (window.kobDb && window.kobDb.__init) { try { await window.kobDb.__init(null, 'local'); } catch (e) { /* 파트너는 표를 쓰지 않습니다 */ } }
            runMain();
            document.documentElement.setAttribute('data-kob-ready', '1');
            setStatus('ok');
            return;
        }
        if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
            try {
                if (!window.supabase) await loadScript(cfg.supabaseJs || 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
                client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
                window.kobSupabase = client;              // 로그인(js/kob-auth.js)이 같은 클라이언트를 씁니다
                // 남아 있는 로그인 세션이 있으면 그 권한으로 읽습니다 (없으면 anon)
                try { const { data: sd } = await client.auth.getSession(); authed = !!(sd && sd.session); } catch (e) { authed = false; }
                try {
                    client.auth.onAuthStateChange((event, session) => {
                        const was = authed;
                        authed = !!(session && session.access_token);
                        if (!authed) pending.clear();     // 로그아웃 — 보내지 못한 것도 버립니다 (다음 사람 이름으로 나가지 않게)
                        // 이 화면에서 누른 로그아웃이 아닌데 로그인이 끊겼으면(다른 탭 · 기기에서 로그아웃, 만료)
                        // 조용히 저장이 멈추지 않도록 알리고 로그인 화면으로 보냅니다 (2026-09-28 검토)
                        if (was && !authed && !window.__kobLoggingOut) {
                            setStatus('error', '로그인이 끊겼습니다');
                            setTimeout(() => { alert('로그인이 끊겼습니다 (다른 곳에서 로그아웃했거나 시간이 지났습니다).\n다시 로그인해 주세요.'); window.location.reload(); }, 0);
                        }
                    });
                } catch (e) { /* 로그인 상태를 못 따라가면 처음 값(authed)을 그대로 씁니다 */ }
                const { data, error } = await client.from('app_store').select('key,value');
                if (error) throw error;
                (data || []).forEach(r => { cache.set(r.key, toStr(r.value)); synced.set(r.key, toStr(r.value)); });
                mode = 'supabase';
                // 다른 창 · 다른 사람의 변경 — Realtime (표에 REPLICA IDENTITY FULL 이 있어야 삭제도 옵니다)
                try {
                    client.channel('app_store').on('postgres_changes', { event: '*', schema: 'public', table: 'app_store' }, (p) => {
                        const key = (p.new && p.new.key) || (p.old && p.old.key);
                        if (!key) return;
                        const oldValue = cache.get(key) ?? null;
                        if (p.eventType === 'DELETE') { cache.delete(key); synced.delete(key); }
                        else { synced.set(key, toStr(p.new.value)); if (!pending.has(key)) cache.set(key, toStr(p.new.value)); }
                        const newValue = cache.get(key) ?? null;
                        if (oldValue === newValue) return;                    // 내가 방금 쓴 값이 돌아온 것
                        try { window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: window.localStorage })); }
                        catch (e) { /* 일부 브라우저는 StorageEvent 생성을 막습니다 — 그때는 새로고침으로 */ }
                    }).subscribe();
                } catch (e) { console.warn('[kob-store] Realtime 구독 실패 — 저장은 되지만 다른 창의 변경은 새로고침해야 보입니다', e); }
            } catch (e) {
                console.error('[kob-store] Supabase 연결 실패 — 로컬 저장소로 갑니다', e);
                mode = 'local'; client = null; window.kobSupabase = null;
            }
        }
        // 업무 자료(표)도 본체가 시작하기 전에 받아 둡니다 — 본체가 맨 위에서부터 동기로 읽기 때문입니다.
        if (window.kobDb && window.kobDb.__init) {
            try { await window.kobDb.__init(client, mode); }
            catch (e) { console.error('[kob-store] 표 자료 준비 실패 — 그 화면은 비어 보입니다', e); }
        }
        runMain();
        document.documentElement.setAttribute('data-kob-ready', '1');   // 로그인 버튼을 살립니다 (index.html 머리의 <style>)
        setStatus('ok');
        window.addEventListener('beforeunload', () => { if (pending.size) flush(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
