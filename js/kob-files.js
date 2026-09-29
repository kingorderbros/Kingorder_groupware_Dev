/**
 * 첨부파일 공용 (2026-09-29 · 3단계) — 파일은 Supabase Storage 에, 자료에는 { path, name, type, size } 만.
 *
 *   await kobFiles.upload(file)        → { path, name, type, size }   (로컬 모드면 { dataUrl, name, type, size })
 *   kobFiles.src(f, { download })      → <img src> · <a href> 에 넣을 주소 (예전 자료의 dataUrl · url 도 그대로 돌려줌)
 *   kobFiles.has(f)                    → 실제로 열 수 있는 파일인가 (새로고침으로 사라진 blob: 주소는 false)
 *   await kobFiles.text(f)             → 글 파일 내용
 *   await kobFiles.session()           → 파일용 쿠키 받기 (로그인 직후 · 12시간마다 · 받기 실패 때 자동)
 *
 * 서버는 /api/files/* (functions/api/_files.js). <img> 가 로그인 머리글을 못 붙이므로 쿠키로 확인합니다.
 * 설정(config/app-config.js)에 Supabase 가 없으면 **로컬 모드** — 예전처럼 dataUrl 로 자료 안에 넣습니다.
 */
(function () {
    'use strict';
    const cfg = window.KOB_CONFIG || {};
    const API = cfg.apiBase || '';
    const remote = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
    const MAX_BYTES = 20 * 1024 * 1024;
    const REFRESH_MS = 6 * 3600 * 1000;           // 쿠키는 12시간 — 6시간마다 새로 받습니다
    let lastOk = 0;
    let inflight = null;

    function isPartner() {
        try {
            const q = new URLSearchParams(location.search);
            return q.get('mode') === 'partner' || /(^|#)partner$/.test(location.hash || '');
        } catch (e) { return false; }
    }
    async function authHeader() {
        if (isPartner()) {
            let t = ''; try { t = localStorage.getItem('pcToken.v1') || ''; } catch (e) { /* 차단 */ }
            return t ? 'Bearer ' + t : '';
        }
        try {
            const c = window.kobSupabase;
            if (c && c.auth) {
                const { data } = await c.auth.getSession();
                if (data && data.session) return 'Bearer ' + data.session.access_token;
            }
        } catch (e) { /* 로그인 전 */ }
        return '';
    }
    // 파일용 쿠키 — 로그인 전이면 조용히 false
    function session(force) {
        if (!remote) return Promise.resolve(true);
        if (!force && lastOk && Date.now() - lastOk < REFRESH_MS) return Promise.resolve(true);
        if (inflight) return inflight;
        inflight = (async () => {
            try {
                const h = await authHeader();
                if (!h) return false;
                const r = await fetch(API + '/api/files/session', { method: 'POST', headers: { Authorization: h }, credentials: 'same-origin', cache: 'no-store' });
                if (r.ok) { lastOk = Date.now(); return true; }
                return false;
            } catch (e) { return false; } finally { setTimeout(() => { inflight = null; }, 0); }
        })();
        return inflight;
    }

    function readDataUrl(file) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ''));
            fr.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
            fr.readAsDataURL(file);
        });
    }
    // Blob(줄인 그림 등)도 받습니다 — 이름은 opts.name
    async function upload(file, opts) {
        const o = opts || {};
        const name = String(o.name || (file && file.name) || 'file');
        const type = String(o.type || (file && file.type) || 'application/octet-stream');
        const size = Number(file && file.size) || 0;
        if (size > MAX_BYTES) throw new Error(`한 파일 20MB 까지 올릴 수 있습니다: ${name}`);
        if (!remote) return { name, type, size, dataUrl: await readDataUrl(file) };
        const send = () => fetch(`${API}/api/files/upload?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`, {
            method: 'POST', body: file, credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }
        });
        await session();
        let r = await send();
        if (r.status === 401) { await session(true); r = await send(); }
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok || !j.file) throw new Error(j.error || `파일을 올리지 못했습니다 (${r.status}): ${name}`);
        return j.file;
    }
    // data URL(화면에서 줄인 그림 등) → 올리기
    async function uploadDataUrl(dataUrl, name) {
        if (!remote) {
            const m = /^data:([^;,]+)/.exec(String(dataUrl || ''));
            return { name: name || 'file', type: m ? m[1] : '', size: Math.round(String(dataUrl || '').length * 0.75), dataUrl };
        }
        const blob = await (await fetch(dataUrl)).blob();
        return upload(blob, { name: name || 'file', type: blob.type });
    }

    function src(f, opts) {
        if (!f) return '';
        if (typeof f === 'string') return f;
        if (f.path) {
            const dl = opts && opts.download ? '&dl=1' : '';
            return `${API}/api/files/get?p=${encodeURIComponent(f.path)}&n=${encodeURIComponent(f.name || '')}${dl}`;
        }
        // 예전 자료 — base64 · 이 창에서 방금 고른 파일의 blob 주소
        return f.dataUrl || f.url || f.fileUrl || '';
    }
    function has(f) {
        if (!f) return false;
        if (f.path || f.dataUrl) return true;
        const u = f.url || f.fileUrl || '';
        // blob: 주소는 그 파일을 고른 창에서만 살아 있습니다 (File 객체가 함께 있을 때만 믿습니다)
        if (/^blob:/.test(u)) return !!((f.ref || f.fileRef) instanceof Blob);
        return !!u;
    }
    async function text(f) {
        if (!f) return '';
        const ref = f.ref || f.fileRef;
        if (ref instanceof Blob) return ref.text();
        if (f.path) {
            await session();
            let r = await fetch(src(f), { credentials: 'same-origin' });
            if (r.status === 401) { await session(true); r = await fetch(src(f), { credentials: 'same-origin' }); }
            if (!r.ok) throw new Error('파일을 받지 못했습니다 (' + r.status + ')');
            return r.text();
        }
        const u = f.dataUrl || '';
        if (u.startsWith('data:')) return (await fetch(u)).text();
        return '';
    }

    // 쿠키가 없거나 지나서 그림이 안 뜨면 — 쿠키를 새로 받고 한 번만 다시 부릅니다
    if (remote) {
        document.addEventListener('error', (e) => {
            const el = e.target;
            if (!el || !el.getAttribute) return;
            const s = el.getAttribute('src') || '';
            if (s.indexOf('/api/files/get?') < 0 || el.dataset.kobRetried) return;
            el.dataset.kobRetried = '1';
            session(true).then(okd => { if (okd) el.setAttribute('src', s + (s.includes('&r=') ? '' : '&r=' + Date.now())); });
        }, true);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') session(); });
        setInterval(() => session(), 30 * 60 * 1000);
    }

    window.kobFiles = { remote, MAX_BYTES, session, upload, uploadDataUrl, src, has, text };
    // 켤 때 한 번 — 로그인해 둔 상태면 바로 쿠키를 받아 첫 화면 그림부터 보이게 합니다
    if (remote) setTimeout(() => session(), 0);
})();
