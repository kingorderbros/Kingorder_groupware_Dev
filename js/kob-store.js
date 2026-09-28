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
    const VIEW_MODE = (function () { try { return new URLSearchParams(window.location.search).get('mode') || ''; } catch (e) { return ''; } })();
    let authed = false;               // Supabase 로그인 세션이 있는지
    let warnedAnon = false;
    function canPush(k) { return authed; }
    function holdAnon(k) {
        if (!warnedAnon) { warnedAnon = true; console.info('[kob-store] 로그인 전이라 서버에 저장하지 않습니다 (이 화면에만 반영):', k); }
    }

    const cache = new Map();          // key → 문자열(JSON) — Supabase 모드에서만 씁니다
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
    async function flush() {
        flushTimer = null;
        if (!client || !pending.size) return;
        // 보내는 순간에도 한 번 더 — 그사이 로그아웃했으면 보내지 않습니다
        const batch = Array.from(pending.entries()).filter(([k]) => canPush(k)); pending.clear();
        if (!batch.length) return;
        const ups = batch.filter(([, v]) => v !== null).map(([key, v]) => ({ key, value: safeJson(v), updated_at: new Date().toISOString() }));
        const dels = batch.filter(([, v]) => v === null).map(([key]) => key);
        try {
            if (ups.length) { const { error } = await client.from('app_store').upsert(ups, { onConflict: 'key' }); if (error) throw error; }
            if (dels.length) { const { error } = await client.from('app_store').delete().in('key', dels); if (error) throw error; }
            setStatus('ok');
        } catch (e) {
            console.error('[kob-store] 저장 실패 — 다시 시도합니다', e);
            batch.forEach(([k, v]) => { if (!pending.has(k)) pending.set(k, v); });   // 새 쓰기가 있으면 그것을 우선
            setStatus('error', e.message || String(e));
            setTimeout(scheduleFlush, 3000);
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
        if (!pcSession || !PC_WRITE_KEYS.includes(k)) { holdAnon(k); return; }
        const d = pcDiff(old, s);
        if (!d.upserts.length && !d.removes.length) return;
        pcBusy.set(k, (pcBusy.get(k) || 0) + 1);
        const prev = pcChain.get(k) || Promise.resolve();
        const next = prev.then(() => pcSend(k, d, 0)).finally(() => pcBusy.set(k, pcBusy.get(k) - 1));
        pcChain.set(k, next.catch(() => {}));
    }
    async function pcSend(k, d, attempt) {
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
            if (attempt < 2) { await new Promise(r => setTimeout(r, 3000)); return pcSend(k, d, attempt + 1); }
            alert('저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.\n\n' + (e.message || e));
        }
    }
    function pcExpired() {
        ls.del(PC_TOKEN_KEY);
        alert('로그인이 끝났습니다. 다시 로그인해 주세요.');
        window.location.reload();
    }
    async function pcPull() {
        if (!pcSession) return;
        let r;
        try { r = await pcFetch('GET', '/api/partner/boot'); } catch (e) { return; }
        if (r.status === 401) { pcExpired(); return; }
        if (!r.j || !r.j.ok) return;
        Object.keys(r.j.store || {}).forEach(k => {
            if (pcBusy.get(k) > 0) return;
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
                        authed = !!(session && session.access_token);
                        if (!authed) pending.clear();     // 로그아웃 — 보내지 못한 것도 버립니다 (다음 사람 이름으로 나가지 않게)
                    });
                } catch (e) { /* 로그인 상태를 못 따라가면 처음 값(authed)을 그대로 씁니다 */ }
                const { data, error } = await client.from('app_store').select('key,value');
                if (error) throw error;
                (data || []).forEach(r => cache.set(r.key, toStr(r.value)));
                mode = 'supabase';
                // 다른 창 · 다른 사람의 변경 — Realtime (표에 REPLICA IDENTITY FULL 이 있어야 삭제도 옵니다)
                try {
                    client.channel('app_store').on('postgres_changes', { event: '*', schema: 'public', table: 'app_store' }, (p) => {
                        const key = (p.new && p.new.key) || (p.old && p.old.key);
                        if (!key) return;
                        const oldValue = cache.get(key) ?? null;
                        if (p.eventType === 'DELETE') cache.delete(key); else cache.set(key, toStr(p.new.value));
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
