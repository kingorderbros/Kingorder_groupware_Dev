/**
 * 킹오더브라더스 그룹웨어 — 로그인 · 비밀번호 (개발환경 · 2026-09-16)
 *
 * 화면(index.html)은 비밀번호를 직접 다루지 않고 **kobAuth** 만 부릅니다. 뒤는 둘 중 하나입니다.
 *
 *   · Supabase 모드 — config/app-config.js 에 Supabase 설정이 있으면 **Supabase Auth** 를 씁니다.
 *       로그인 · 비밀번호 변경 · 재설정 메일은 브라우저가 Supabase 에 직접 요청하고,
 *       계정 만들기 · 임시 비밀번호 발급 · 이메일 변경 · 삭제는 관리자 권한이 필요해
 *       Pages Functions(/api/auth/*, service_role) 를 거칩니다.
 *   · 로컬 모드 — 설정이 비어 있으면 비밀번호를 SHA-256 으로 바꿔 kobStorage(gwAuthLocal.v1) 에 둡니다.
 *       인터넷 없이도 같은 흐름(임시 비밀번호 → 첫 로그인 때 변경)을 시험할 수 있습니다.
 *       메일은 보낼 수 없으므로 재설정은 관리자의 [비밀번호 초기화] 로만 됩니다.
 *
 * 계정의 이름 · 소속 · 권한은 지금까지처럼 gwUsers.v1(localUsers) 에 있고, 비밀번호만 여기서 다룹니다.
 * 두 쪽은 **이메일**로 이어집니다.
 *
 * 흐름
 *   관리자가 계정 등록 → setTemp(email) 로 임시 비밀번호 발급 → 본인에게 전달
 *   본인 첫 로그인 → signIn() 이 mustChange=true 를 돌려줌 → 화면이 새 비밀번호를 받아 changePassword()
 *   비밀번호를 잊음 → requestReset(email) → 메일의 링크로 들어오면 recovery() 가 true → changePassword()
 */
(function () {
    'use strict';
    const cfg = window.KOB_CONFIG || {};
    const API = cfg.apiBase || '';
    const LOCAL_KEY = 'gwAuthLocal.v1';
    // 재설정 메일의 링크로 들어왔는지 — supabase-js 가 주소의 토큰을 지우기 전에 미리 봐 둡니다
    const recoveryHint = /type=recovery/.test(window.location.hash) || /[?&]code=/.test(window.location.search);

    const norm = (e) => String(e || '').trim().toLowerCase();
    const client = () => window.kobSupabase || null;
    let localSession = null;

    // 임시 비밀번호 — 헷갈리는 글자(0 O o l 1 I)는 뺍니다. 영문 + 숫자 10자
    function tempPassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        const a = new Uint32Array(10);
        window.crypto.getRandomValues(a);
        let pw = Array.from(a, n => chars[n % chars.length]).join('');
        if (!/[0-9]/.test(pw)) pw = pw.slice(0, 9) + '7';           // 숫자가 하나도 없으면 하나 넣습니다
        if (!/[A-Za-z]/.test(pw)) pw = 'k' + pw.slice(1);
        return pw;
    }
    // 새 비밀번호 규칙 — 화면과 서버가 같은 기준을 씁니다
    function validate(pw) {
        const s = String(pw || '');
        if (s.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
        if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return '영문과 숫자를 함께 넣어 주세요.';
        return '';
    }

    // ---------- 로컬 모드 ----------
    async function sha(text) {
        if (!(window.crypto && window.crypto.subtle)) return 'plain:' + text;   // 오래된 브라우저 · file:// — 시험용
        const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const hashOf = (email, pw) => sha(norm(email) + '|' + String(pw));
    function readLocal() { try { return JSON.parse(window.kobStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch (e) { return {}; } }
    function writeLocal(o) { window.kobStorage.setItem(LOCAL_KEY, JSON.stringify(o)); }

    const local = {
        mode: 'local',
        async status() { return { mode: 'local', empty: !Object.keys(readLocal()).length }; },
        async bootstrap(email) {
            if (Object.keys(readLocal()).length) throw new Error('처음 설정은 이미 끝났습니다.');
            return local.setTemp(email);
        },
        async setTemp(email) {
            const pw = tempPassword();
            const o = readLocal();
            o[norm(email)] = { hash: await hashOf(email, pw), mustChange: true, at: new Date().toISOString() };
            writeLocal(o);
            return { password: pw };
        },
        async signIn(email, pw) {
            const rec = readLocal()[norm(email)];
            if (!rec) throw new Error('NO_ACCOUNT');
            if (rec.hash !== await hashOf(email, pw)) throw new Error('BAD_PASSWORD');
            localSession = { email: norm(email) };
            return { mustChange: !!rec.mustChange };
        },
        async changePassword(newPw, currentPw) {
            if (!localSession) throw new Error('로그인 상태가 아닙니다.');
            const o = readLocal();
            const rec = o[localSession.email];
            if (currentPw !== undefined && rec && rec.hash !== await hashOf(localSession.email, currentPw)) throw new Error('현재 비밀번호가 맞지 않습니다.');
            o[localSession.email] = { hash: await hashOf(localSession.email, newPw), mustChange: false, at: new Date().toISOString() };
            writeLocal(o);
        },
        async requestReset() {
            throw new Error('로컬 저장소 모드에서는 이메일을 보낼 수 없습니다.\n관리자에게 [사용자/권한관리 › 비밀번호 초기화] 를 요청해 주세요.');
        },
        async rename(oldEmail, newEmail) {
            const o = readLocal();
            if (o[norm(oldEmail)] && norm(oldEmail) !== norm(newEmail)) { o[norm(newEmail)] = o[norm(oldEmail)]; delete o[norm(oldEmail)]; writeLocal(o); }
        },
        async remove(email) { const o = readLocal(); delete o[norm(email)]; writeLocal(o); },
        async signOut() { localSession = null; },
        async recovery() { return false; },
        // 서버(/api)가 있어야 하는 기능 — 로컬 모드에서는 쓸 수 없습니다
        async call() { throw new Error('이 기능은 Supabase 설정(config/app-config.js)이 있어야 씁니다.'); }
    };

    // ---------- Supabase 모드 ----------
    // 관리자만 부르는 서버 요청 — 지금 로그인한 사람의 토큰을 함께 보내고, 서버가 관리자인지 확인합니다
    async function api(path, body, method) {
        const { data } = await client().auth.getSession();
        const token = data && data.session ? data.session.access_token : '';
        const res = await fetch(API + path, {
            method: method || 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.ok === false) throw new Error(j.error || ('서버 오류 ' + res.status));
        return j;
    }
    const remote = {
        mode: 'supabase',
        async status() {
            try { const r = await (await fetch(API + '/api/auth/status', { cache: 'no-store' })).json(); return { mode: 'supabase', empty: !!r.empty, error: r.ok === false ? r.error : '' }; }
            catch (e) { return { mode: 'supabase', empty: false, error: '서버(/api)에 연결하지 못했습니다. npm run dev 로 실행했는지, .dev.vars 가 있는지 확인해 주세요.' }; }
        },
        bootstrap: (email) => api('/api/auth/bootstrap', { email }),
        setTemp: (email, name) => api('/api/auth/users', { email, name }),
        // 관리자 토큰을 붙여 서버를 부르는 통로 — 구글 캘린더 연동(/api/calendar/*)이 씁니다
        call: (path, body, method) => api(path, body, method),
        async signIn(email, pw) {
            const { data, error } = await client().auth.signInWithPassword({ email: norm(email), password: String(pw) });
            if (error) {
                if (/invalid login/i.test(error.message)) throw new Error('BAD_PASSWORD');
                if (/email not confirmed/i.test(error.message)) throw new Error('아직 확인되지 않은 계정입니다. 관리자에게 비밀번호 초기화를 요청해 주세요.');
                throw new Error(error.message);
            }
            const meta = (data && data.user && data.user.user_metadata) || {};
            return { mustChange: !!meta.must_change_password };
        },
        async changePassword(newPw, currentPw) {
            if (currentPw !== undefined) {
                // Supabase 는 바꿀 때 현재 비밀번호를 묻지 않으므로, 한 번 더 로그인해 확인합니다
                const { data } = await client().auth.getUser();
                const email = data && data.user ? data.user.email : '';
                const { error: e1 } = await client().auth.signInWithPassword({ email, password: String(currentPw) });
                if (e1) throw new Error('현재 비밀번호가 맞지 않습니다.');
            }
            const { error } = await client().auth.updateUser({ password: String(newPw), data: { must_change_password: false } });
            if (error) {
                if (/same password|different from the old/i.test(error.message)) throw new Error('지금 쓰는 비밀번호와 다른 것으로 정해 주세요.');
                throw new Error(error.message);
            }
        },
        async requestReset(email) {
            const redirectTo = window.location.origin + window.location.pathname;
            const { error } = await client().auth.resetPasswordForEmail(norm(email), { redirectTo });
            if (error) {
                if (/rate limit|security purposes/i.test(error.message)) throw new Error('잠시 뒤에 다시 시도해 주세요 (메일 발송 제한).');
                throw new Error(error.message);
            }
        },
        rename: (oldEmail, newEmail, name) => api('/api/auth/users', { email: oldEmail, newEmail, name }, 'PATCH'),
        remove: (email) => api('/api/auth/users', { email }, 'DELETE'),
        async signOut() { try { await client().auth.signOut(); } catch (e) { /* 이미 끝난 세션 */ } },
        // 재설정 메일의 링크로 들어왔고 그 세션이 살아 있으면 true — 화면은 새 비밀번호 입력창을 띄웁니다
        async recovery() {
            if (!recoveryHint) return false;
            const first = await client().auth.getSession();
            if (first.data && first.data.session) return true;
            return new Promise(resolve => {                // 주소의 토큰을 아직 읽는 중이면 잠깐 기다립니다
                let done = false;
                const sub = client().auth.onAuthStateChange((ev, session) => {
                    if (done) return;
                    if ((ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN') && session) { done = true; sub.data.subscription.unsubscribe(); resolve(true); }
                });
                setTimeout(async () => {
                    if (done) return; done = true; sub.data.subscription.unsubscribe();
                    const { data } = await client().auth.getSession();
                    resolve(!!(data && data.session));
                }, 3000);
            });
        }
    };

    const pick = () => (client() ? remote : local);
    window.kobAuth = {
        get mode() { return pick().mode; },
        tempPassword, validate,
        status: () => pick().status(),
        bootstrap: (email) => pick().bootstrap(email),
        setTemp: (email, name) => pick().setTemp(email, name),
        signIn: (email, pw) => pick().signIn(email, pw),
        changePassword: (newPw, currentPw) => pick().changePassword(newPw, currentPw),
        requestReset: (email) => pick().requestReset(email),
        rename: (oldEmail, newEmail, name) => pick().rename(oldEmail, newEmail, name),
        remove: (email) => pick().remove(email),
        signOut: () => pick().signOut(),
        recovery: () => pick().recovery(),
        call: (path, body, method) => pick().call(path, body, method)
    };
})();
