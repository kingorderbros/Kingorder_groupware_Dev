/**
 * 첨부파일 (2026-09-29 · 3단계 — 파일을 자료 안의 base64 에서 Supabase Storage 로)
 *
 * 예전에는 첨부를 base64 로 자료(JSON) 안에 넣거나(자료실 · 개발의뢰 · 파트너 접수 …), 브라우저 메모리에만
 * 두어서(보완서류 · WBS 산출물 · 협업티켓) 새로고침하면 사라졌습니다. 이제 파일은 Storage 버킷 `files` 에 두고
 * 자료에는 { path, name, type, size } 만 남깁니다.
 *
 *   POST /api/files/session           로그인 토큰(직원: Supabase · 파트너: 파트너 토큰) → 파일용 쿠키
 *   POST /api/files/upload?name=&type= 본문 = 파일 그대로 → { file: { path, name, type, size } }
 *   GET  /api/files/get?p=경로[&dl=1]  파일 내려받기 (dl=1 이면 저장 창, 아니면 화면에서 열기)
 *
 * <img src> · <iframe src> 는 머리글(Authorization)을 못 붙이므로, 로그인 뒤 한 번 받은 **쿠키**로 확인합니다
 * (HttpOnly · 경로 /api/files 에만 · 12시간). 버킷은 비공개이고 service_role 로만 읽고 씁니다.
 *
 * 누가 무엇을 볼 수 있나
 *   · 직원   : 모든 파일
 *   · 파트너 : 자기가 올린 파일(partner/<파트너사 id>/…) + 자기에게 보이는 자료(partnerView)에 적힌 파일
 * 이 파일은 판단(쿠키 · 경로 · 권한 · 이름)만 담고 Storage 읽기/쓰기는 [[route]].js 가 합니다 — 가짜 자료로 바로 시험합니다.
 */

export const MAX_BYTES = 20 * 1024 * 1024;        // 한 파일 20MB (WBS 산출물 · 협업티켓과 같은 한도)
export const COOKIE = 'kob_files';
export const COOKIE_HOURS = 12;

const enc = new TextEncoder();
const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)), c => c.charCodeAt(0));

async function hmacKey(secret) {
    // 파트너 토큰과 다른 용도의 열쇠 — 한쪽 서명을 다른 쪽에 쓸 수 없습니다
    const base = await crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const derived = await crypto.subtle.sign('HMAC', base, enc.encode('kob-files-cookie-v1'));
    return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// who: { k: 'staff', id: 이메일 } 또는 { k: 'partner', id: 로그인 아이디, p: 파트너사 id }
export async function makeCookieValue(secret, who, nowMs) {
    const body = b64u(enc.encode(JSON.stringify({ k: who.k, id: who.id, p: who.p || '', exp: Math.floor((nowMs || Date.now()) / 1000) + COOKIE_HOURS * 3600 })));
    const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
    return body + '.' + b64u(sig);
}
export async function readCookieValue(secret, value, nowMs) {
    const t = s(value);
    const dot = t.indexOf('.');
    if (dot < 1) return null;
    const body = t.slice(0, dot), sig = t.slice(dot + 1);
    let good = false;
    try { good = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(sig), enc.encode(body)); } catch (e) { return null; }
    if (!good) return null;
    let o; try { o = JSON.parse(new TextDecoder().decode(unb64u(body))); } catch (e) { return null; }
    if (!o || (o.k !== 'staff' && o.k !== 'partner') || !o.id || !o.exp || o.exp < Math.floor((nowMs || Date.now()) / 1000)) return null;
    return { k: o.k, id: o.id, p: o.p || '', exp: o.exp };
}
export function cookieFrom(request) {
    const raw = s(request.headers.get('Cookie'));
    const m = raw.split(/;\s*/).find(x => x.startsWith(COOKIE + '='));
    return m ? m.slice(COOKIE.length + 1) : '';
}
export function setCookieHeader(value, secure) {
    return `${COOKIE}=${value}; Path=/api/files; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_HOURS * 3600}${secure ? '; Secure' : ''}`;
}

// 저장 경로 — 이름은 자료에만 두고 경로는 영문 · 숫자로 (Storage 가 한글 · 특수문자 경로를 싫어합니다)
export function extOf(name) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(s(name));
    return m ? m[1].toLowerCase() : '';
}
export function newPath(who, name, now) {
    const d = now || new Date();
    const ym = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const id = crypto.randomUUID();
    const ext = extOf(name);
    const head = who.k === 'partner' ? `partner/${safeSeg(who.p || 'none')}` : 'staff';
    return `${head}/${ym}/${id}${ext ? '.' + ext : ''}`;
}
// 파트너사 id → 폴더 이름. 영문 · 숫자 · _ · - 로만 된 id 는 그대로, 아니면 해시를 붙여 서로 다른 id 가 같은 폴더가 되지 않게 (2026-09-29 검토)
export function safeSeg(v) {
    const x = s(v);
    if (/^[A-Za-z0-9_-]{1,40}$/.test(x)) return x;
    let h = 0x811c9dc5;                                                   // FNV-1a 32비트
    for (const b of new TextEncoder().encode(x)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return ('x_' + x.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) + '_' + h.toString(16)).slice(0, 40);
}
// 경로 모양 확인 — 위에서 만든 모양만 받습니다 (../ 같은 것은 거절)
export function validPath(p) {
    return /^(staff|partner\/[A-Za-z0-9_-]{1,40})\/\d{4}\/\d{2}\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/.test(s(p));
}

// 파트너에게 보이는 자료 가운데 **직원만 쓰는 곳**에 적힌 직원 파일 경로 (2026-09-29 검토)
//   파트너는 자기 접수 · 인바운드 · 개발의뢰 답글에 아무 글이나 쓸 수 있으므로 그곳은 보지 않습니다.
//   · 공용 설정(SHARED_KEYS) · 공개 자료실 글 · 개발의뢰(파트너가 쓴 답글 · 기록 빼고)
const STAFF_PATH_RE = /staff\/\d{4}\/\d{2}\/[0-9a-f-]{36}(?:\.[a-z0-9]{1,8})?/g;
export function staffPathsIn(view, sharedKeys) {
    const out = new Set();
    const take = (v) => { try { (JSON.stringify(v) || '').replace(STAFF_PATH_RE, (m) => { out.add(m); return m; }); } catch (e) { /* 무시 */ } };
    const v = view || {};
    (sharedKeys || []).forEach(k => take(v[k]));
    take(v['gwArchivePosts.v1']);
    (Array.isArray(v['gwDevRequests.v1']) ? v['gwDevRequests.v1'] : []).forEach(d => {
        if (!d || typeof d !== 'object') return;
        const staffOnly = Object.assign({}, d);
        staffOnly.thread = (Array.isArray(d.thread) ? d.thread : []).filter(e => !(e && e.side === 'partner'));
        staffOnly.history = (Array.isArray(d.history) ? d.history : []).filter(e => !(e && e.side === 'partner'));
        take(staffOnly);
    });
    return out;
}
// 파트너가 이 파일을 볼 수 있나 — 자기 파트너사 폴더이거나, 위의 '직원만 쓰는 곳' 에 적힌 직원 파일일 때.
export function partnerMayRead(path, who, view, sharedKeys) {
    if (!validPath(path)) return false;
    if (path.startsWith(`partner/${safeSeg(who.p)}/`)) return true;
    if (!path.startsWith('staff/')) return false;
    return staffPathsIn(view, sharedKeys).has(path);
}

// 내려받을 때 파일 이름 — 한글 이름도 깨지지 않게 (RFC 5987)
export function dispositionHeader(name, download) {
    const n = s(name) || 'file';
    const ascii = n.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(n)}`;
}
// 브라우저에서 바로 열어도 되는 종류만 inline — 나머지(html · svg 등 스크립트가 돌 수 있는 것)는 늘 내려받기로
export function inlineSafe(type) {
    const t = s(type).toLowerCase();
    return /^image\/(png|jpe?g|gif|webp|bmp)$/.test(t) || t === 'application/pdf' || t === 'text/plain';
}
