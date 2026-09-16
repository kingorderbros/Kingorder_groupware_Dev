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
 *   · 로컬 모드 — 설정이 비어 있으면 브라우저 localStorage 를 그대로 씁니다 (목업과 같음).
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
                        /^gwToastPos\.v1$/, /^gwPartnerDeptPerm\.newMenus\./];
    const isLocalOnly = (k) => LOCAL_ONLY.some(re => re.test(String(k)));

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
        const batch = Array.from(pending.entries()); pending.clear();
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
        else { el.style.background = '#e5e7eb'; el.style.color = '#374151'; el.textContent = `로컬 저장소${env} — Supabase 미설정`; }
    }

    window.kobStorage = {
        getItem(k) {
            if (mode !== 'supabase' || isLocalOnly(k)) return ls.get(k);
            return cache.has(k) ? cache.get(k) : null;
        },
        setItem(k, v) {
            const s = String(v);
            if (mode !== 'supabase' || isLocalOnly(k)) { ls.set(k, s); return; }
            cache.set(k, s); ls.set(k, s);            // 로컬에도 사본 (오프라인 · 새로고침 직후 대비)
            pending.set(k, s); scheduleFlush();
        },
        removeItem(k) {
            if (mode !== 'supabase' || isLocalOnly(k)) { ls.del(k); return; }
            cache.delete(k); ls.del(k);
            pending.set(k, null); scheduleFlush();
        },
        get mode() { return mode; }
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
        if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
            try {
                if (!window.supabase) await loadScript(cfg.supabaseJs || 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
                client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
                window.kobSupabase = client;              // 로그인(js/kob-auth.js)이 같은 클라이언트를 씁니다
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
        runMain();
        setStatus('ok');
        window.addEventListener('beforeunload', () => { if (pending.size) flush(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
