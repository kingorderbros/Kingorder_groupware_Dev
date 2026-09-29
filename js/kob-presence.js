/**
 * 접속 상태 (2026-09-29) — 누가 지금 그룹웨어를 열어 두었는지 · 마지막 로그인 · 마지막 접속
 *
 *   kobPresence.start({ id })   로그인해서 그룹웨어 화면에 들어온 뒤 한 번 (id = 구성원 id, gwUsers.v1 의 id)
 *   kobPresence.info(id)        → { online, lastLogin, lastSeen }   (시각은 ISO 문자열, 없으면 '')
 *   kobPresence.onlineIds()     → 지금 접속 중인 구성원 id 목록
 *   'kob-presence' 이벤트       접속 · 기록이 바뀌면 (화면이 점 · 숫자를 고칩니다)
 *
 * 접속 중   : Supabase Realtime Presence (채널 gw-presence). 창을 열어 두면 접속 중, 닫으면 곧바로 빠집니다.
 *             채널에는 **구성원 id 만** 싣습니다 (이메일 · 이름은 싣지 않음 — 공개 키로 채널을 볼 수 있어서).
 * 마지막 로그인 : Supabase 로그인 기록(last_sign_in_at) — 아이디 · 비밀번호로 실제 로그인한 때
 * 마지막 접속   : 그룹웨어를 보고 있던 마지막 때 — 들어올 때 · 5분마다(화면을 보고 있을 때) · 다른 창으로 갈 때 · 닫을 때
 * 기록은 app_store 'gwUserPresence.v1' = [{ id, lastLogin, lastSeen }] — 목록이라 여럿이 같이 써도 서로 덮지 않습니다(kob-store 합치기).
 * 로컬 모드(서버 없음)는 나만 접속 중으로 보입니다.
 */
(function () {
    'use strict';
    const KEY = 'gwUserPresence.v1';
    const BEAT_MS = 5 * 60 * 1000;
    let me = null;
    let ch = null;
    let online = new Set();

    const nowIso = () => new Date().toISOString();
    function emit() { try { window.dispatchEvent(new CustomEvent('kob-presence')); } catch (e) { /* 무시 */ } }
    function records() {
        try { const v = JSON.parse((window.kobStorage && kobStorage.getItem(KEY)) || '[]'); return Array.isArray(v) ? v : []; }
        catch (e) { return []; }
    }
    function write(patch) {
        if (!me || !window.kobStorage) return;
        const list = records();
        const i = list.findIndex(r => r && r.id === me.id);
        const next = Object.assign({}, i > -1 ? list[i] : { id: me.id }, patch);
        if (i > -1) list[i] = next; else list.push(next);
        try { kobStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* 저장이 막혀도 화면은 그대로 */ }
    }
    function seen() { write({ lastSeen: nowIso() }); }

    async function start(user) {
        if (me || !user || !user.id) return;
        me = { id: String(user.id) };
        let lastLogin = '';
        const c = window.kobSupabase;
        try {
            if (c && c.auth) {
                const { data } = await c.auth.getSession();
                lastLogin = (data && data.session && data.session.user && data.session.user.last_sign_in_at) || '';
            }
        } catch (e) { /* 로그인 기록을 못 읽으면 마지막 접속만 */ }
        if (!lastLogin && user.justLoggedIn) lastLogin = nowIso();      // 로컬 모드
        write(Object.assign({ lastSeen: nowIso() }, lastLogin ? { lastLogin } : {}));
        online = new Set([me.id]);
        emit();
        if (c && c.channel) {
            try {
                ch = c.channel('gw-presence', { config: { presence: { key: me.id } } });
                ch.on('presence', { event: 'sync' }, () => {
                    const st = ch.presenceState() || {};
                    online = new Set(Object.keys(st));
                    online.add(me.id);                                   // 내 창은 늘 접속 중
                    emit();
                }).subscribe((status) => {
                    if (status === 'SUBSCRIBED') ch.track({ at: nowIso() }).catch(() => {});
                });
            } catch (e) { console.warn('[접속 상태] 실시간 채널을 열지 못했습니다 — 마지막 접속만 기록합니다', e); }
        }
        setInterval(() => { if (document.visibilityState === 'visible') seen(); }, BEAT_MS);
        document.addEventListener('visibilitychange', seen);
        window.addEventListener('pagehide', seen);
        window.addEventListener('storage', (e) => { if (e.key === KEY) emit(); });   // 다른 사람의 마지막 접속이 바뀜
    }
    function info(id) {
        const r = records().find(x => x && x.id === String(id)) || {};
        return { online: online.has(String(id)), lastLogin: r.lastLogin || '', lastSeen: r.lastSeen || '' };
    }
    window.kobPresence = {
        KEY, start, info,
        isOnline: (id) => online.has(String(id)),
        onlineIds: () => Array.from(online),
        enabled: () => !!me
    };
})();
