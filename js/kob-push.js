/**
 * 폰 · PC 푸시 알림 — 화면 쪽 (2026-09-29 · 9단계). 서버는 functions/api/_push.js.
 *
 *   await kobPush.state()      → { supported, permission, subscribed, ready, ios, standalone }
 *   await kobPush.enable()     → 이 기기에서 받기 (권한 묻기 → 구독 → 서버에 등록)
 *   await kobPush.disable()    → 이 기기에서 그만 받기
 *   await kobPush.status()     → { devices, prefs, categories }  (서버)
 *   await kobPush.setPrefs(p)  → 종류별 켜기/끄기
 *   kobPush.send(n, label)     → 그룹웨어 알림을 받는 사람들의 폰 · PC 로 (기다리지 않음)
 *
 * 아이폰 · 아이패드는 사파리에서 [공유 › 홈 화면에 추가] 한 뒤 **그 아이콘으로 열어야** 받을 수 있습니다 (iOS 16.4 이상).
 * 로컬 모드(서버 없음)에서는 아무것도 하지 않습니다.
 */
(function () {
    'use strict';
    const cfg = window.KOB_CONFIG || {};
    const API = cfg.apiBase || '';
    const remote = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
    let pubKey = null;

    const ua = () => navigator.userAgent || '';
    const isIos = () => /iPhone|iPad|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    const supported = () => remote && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    async function authHeaders() {
        const h = { 'Content-Type': 'application/json' };
        try {
            const c = window.kobSupabase;
            if (c && c.auth) { const { data } = await c.auth.getSession(); if (data && data.session) h.Authorization = 'Bearer ' + data.session.access_token; }
        } catch (e) { /* 로그인 전 */ }
        return h;
    }
    async function api(method, path, body) {
        const r = await fetch(API + path, { method, headers: await authHeaders(), body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.ok === false) throw new Error(j.error || ('서버 오류 ' + r.status));
        return j;
    }
    async function key() {
        if (pubKey !== null) return pubKey;
        try { const j = await api('GET', '/api/push/key'); pubKey = j.ready ? j.publicKey : ''; } catch (e) { pubKey = ''; }
        return pubKey;
    }
    function b64ToBytes(s) {
        const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4));
        return Uint8Array.from(b, c => c.charCodeAt(0));
    }
    // 서비스 워커가 끝내 준비되지 않아도 화면이 멈추지 않게 8초까지만 기다립니다 (2026-09-29 검토)
    async function reg() {
        const r = await Promise.race([navigator.serviceWorker.ready, new Promise(res => setTimeout(() => res(null), 8000))]);
        if (!r) throw new Error('알림 준비(서비스 워커)가 되지 않았습니다. 새로고침한 뒤 다시 눌러 주세요.');
        return r;
    }
    const isPartnerPage = () => { try { const q = new URLSearchParams(location.search); return q.get('mode') === 'partner' || location.hash === '#partner'; } catch (e) { return false; } };
    async function currentSub() {
        if (!supported()) return null;
        try { return await (await reg()).pushManager.getSubscription(); } catch (e) { return null; }
    }
    function deviceName() {
        const u = ua();
        const os = /iPhone/.test(u) ? '아이폰' : /iPad/.test(u) ? '아이패드' : /Android/.test(u) ? '안드로이드' : /Windows/.test(u) ? '윈도우 PC' : /Mac/.test(u) ? '맥' : '기기';
        const br = /Edg\//.test(u) ? '엣지' : /Chrome\//.test(u) ? '크롬' : /Firefox\//.test(u) ? '파이어폭스' : /Safari\//.test(u) ? '사파리' : '';
        return br ? `${os} · ${br}` : os;
    }

    async function state() {
        const k = supported() ? await key() : '';
        const sub = await currentSub();
        // 브라우저에 구독이 있어도 서버에서 '내 것' 이 아니면(같은 기기를 앞사람이 켜 둔 경우) 아직 안 켠 것으로 봅니다
        let mine = !!sub;
        if (sub) { try { mine = !!(await api('GET', '/api/push/status?endpoint=' + encodeURIComponent(sub.endpoint))).thisDevice; } catch (e) { mine = true; } }
        return {
            supported: supported(), ready: !!k, ios: isIos(), standalone: standalone(),
            permission: ('Notification' in window) ? Notification.permission : 'unsupported',
            subscribed: !!sub && mine
        };
    }
    async function enable() {
        if (!supported()) throw new Error(isIos() && !standalone()
            ? '아이폰은 사파리에서 [공유 › 홈 화면에 추가] 한 뒤, 홈 화면의 그룹웨어 아이콘으로 열어야 알림을 받을 수 있습니다.'
            : '이 브라우저는 알림을 받을 수 없습니다.');
        const k = await key();
        if (!k) throw new Error('서버에 알림 키가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.');
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error(perm === 'denied'
            ? '알림이 차단되어 있습니다. 브라우저(또는 폰) 설정에서 이 사이트의 알림을 허용한 뒤 다시 눌러 주세요.'
            : '알림 허용을 누르지 않았습니다.');
        const r = await reg();
        let sub = await r.pushManager.getSubscription();
        if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(k) });
        await api('POST', '/api/push/subscribe', { subscription: sub.toJSON(), device: deviceName() });
        return true;
    }
    async function disable() {
        const sub = await currentSub();
        if (!sub) return true;
        const endpoint = sub.endpoint;
        try { await sub.unsubscribe(); } catch (e) { /* 이미 풀림 */ }
        try { await api('POST', '/api/push/unsubscribe', { endpoint }); } catch (e) { /* 서버는 다음 발송 때 410 으로 정리 */ }
        return true;
    }
    const status = () => api('GET', '/api/push/status');
    const setPrefs = (prefs) => api('POST', '/api/push/prefs', { prefs });
    // 기다리지 않습니다 — 푸시가 안 가도 그룹웨어 알림함에는 이미 들어갔습니다
    function send(n, label) {
        if (!remote || !n || !(n.toUser || n.toDept) || isPartnerPage()) return;   // 파트너 화면은 그룹웨어가 옮겨 받을 때 보냅니다
        if (!n.id) return;
        // 서버는 저장된 알림(notifications 표)을 다시 읽어 보냅니다 — 여기서는 번호만 (2026-09-29 검토)
        api('POST', '/api/push/send', { id: n.id, label: label || '' })
            .catch(e => console.warn('[푸시] 보내지 못했습니다', e && e.message));
    }

    window.kobPush = { remote, supported, isIos, standalone, state, enable, disable, status, setPrefs, send };
})();
