/**
 * 폰 · PC 푸시 알림 (2026-09-29 · 9단계) — 그룹웨어를 닫아 두어도 알림이 뜨게
 *
 *   POST /api/push/subscribe    { subscription, device }   이 기기에서 받기 (로그인한 직원)
 *   POST /api/push/unsubscribe  { endpoint }               이 기기에서 그만 받기
 *   GET  /api/push/status                                  내 기기 수 · 종류별 켜기/끄기
 *   POST /api/push/prefs        { prefs: { work: true, … } }
 *   POST /api/push/send         { n }                      그룹웨어 알림 하나를 받는 사람들에게 보냄
 *
 * 받는 사람은 그룹웨어 알림함과 같은 규칙(notificationsFor)으로 정합니다 — toUser(이름) · toDept(본부) · toTeam(팀).
 * 보낸 사람 자신에게는 보내지 않습니다. 종류별로 끈 사람에게도 보내지 않습니다.
 *
 * 저장: app_store 'gwPushSubs.v1' = [{ id: 구성원 id, subs: [{ endpoint, keys: { p256dh, auth }, device, at }], prefs: { … } }]
 * 암호: Web Push 표준(RFC 8291 aes128gcm + RFC 8292 VAPID) — 따로 라이브러리 없이 WebCrypto 로.
 * 환경변수: VAPID_PUBLIC_KEY(65바이트 base64url) · VAPID_PRIVATE_KEY(32바이트 base64url) · VAPID_SUBJECT(mailto:…)
 * 이 파일은 판단과 암호만 담고, 저장소 읽기/쓰기와 실제 발송(fetch)은 [[route]].js 가 합니다 — 가짜 자료로 시험합니다.
 */

export const KEY = 'gwPushSubs.v1';
export const MAX_SUBS = 10;                    // 한 사람 기기 수 (넘치면 오래된 것부터 뺌)

// 알림 종류 → 직원이 켜고 끄는 묶음
export const CATEGORIES = [
    { id: 'work',      label: '업무 접수' },
    { id: 'collab',    label: '협업티켓' },
    { id: 'directive', label: '지시 업무' },
    { id: 'project',   label: '프로젝트' },
    { id: 'meeting',   label: '영업 회의' },
    { id: 'issue',     label: '이슈 보고' },
    { id: 'dev',       label: '개발의뢰' },
    { id: 'etc',       label: '그 밖의 알림' }
];
export function categoryOf(type) {
    const t = String(type || '');
    if (t.startsWith('work-')) return 'work';
    if (t.startsWith('collab-') || t.startsWith('delay-') || t.startsWith('schedule-change')) return 'collab';
    if (t.startsWith('directive-')) return 'directive';
    if (t.startsWith('project-')) return 'project';
    if (t.startsWith('meeting-')) return 'meeting';
    if (t.startsWith('issue-')) return 'issue';
    if (t.startsWith('dev-')) return 'dev';
    return 'etc';
}

const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : []);
const enc = new TextEncoder();
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (str) => Uint8Array.from(atob(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(str).length + 3) % 4)), c => c.charCodeAt(0));
const concat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let i = 0; parts.forEach(p => { o.set(p, i); i += p.length; }); return o; };

// ---------- 받는 사람 ----------
// users: gwUsers.v1 · n: 그룹웨어 알림 · senderEmail: 보낸 사람
export function recipientsOf(users, n, senderEmail) {
    const me = s(senderEmail).toLowerCase();
    return arr(users).filter(u => {
        if (!u || !u.id) return false;
        if (s(u.email).toLowerCase() === me) return false;                        // 내가 한 일은 나에게 안 보냄
        const hit = (n.toUser && u.name === n.toUser) || (n.toDept && u.dept === n.toDept);
        if (!hit) return false;
        const team = s(u.team);
        return !n.toTeam || !team || n.toTeam === team;                            // 팀 지정 알림은 그 팀만 (팀 없는 사람은 본부 알림을 다 봄)
    });
}
export function wants(rec, category) {
    const p = (rec && rec.prefs) || {};
    return p[category] !== false;                                                  // 처음에는 모두 켜짐
}

// ---------- 구독 기록 고치기 (목록 통째 → 새 목록) ----------
export function addSub(list, userId, sub, device, now) {
    const out = arr(list).map(r => Object.assign({}, r));
    let rec = out.find(r => r.id === userId);
    if (!rec) { rec = { id: userId, subs: [], prefs: {} }; out.push(rec); }
    // 같은 기기(endpoint)는 한 번만 — 다른 사람 기록에 같은 기기가 있으면 거기서는 뺍니다 (기기를 넘겨받은 경우)
    out.forEach(r => { r.subs = arr(r.subs).filter(x => x.endpoint !== sub.endpoint); });
    rec.subs = rec.subs.concat([{ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, device: s(device).slice(0, 80), at: now || new Date().toISOString() }])
        .slice(-MAX_SUBS);
    return out;
}
export function removeSub(list, endpoint) {
    return arr(list).map(r => Object.assign({}, r, { subs: arr(r.subs).filter(x => x.endpoint !== endpoint) }));
}
export function setPrefs(list, userId, prefs) {
    const out = arr(list).map(r => Object.assign({}, r));
    let rec = out.find(r => r.id === userId);
    if (!rec) { rec = { id: userId, subs: [], prefs: {} }; out.push(rec); }
    const clean = {};
    CATEGORIES.forEach(c => { if (prefs && typeof prefs[c.id] === 'boolean') clean[c.id] = prefs[c.id]; });
    rec.prefs = Object.assign({}, rec.prefs || {}, clean);
    return out;
}
export function validSubscription(sub) {
    try {
        const u = new URL(s(sub && sub.endpoint));
        return u.protocol === 'https:' && unb64u(sub.keys.p256dh).length === 65 && unb64u(sub.keys.auth).length === 16;
    } catch (e) { return false; }
}

// ---------- 알림 문구 ----------
export function payloadOf(n, labels) {
    const title = s(n.title) || '알림';
    const label = (labels && labels[n.type]) || '';
    const detail = s(n.detail).replace(/<[^>]*>/g, '').slice(0, 140);
    return {
        title: label ? `[${label}] ${title}` : title,
        body: detail || '그룹웨어에서 확인해 주세요.',
        tag: 'kob-' + s(n.id || Date.now()),
        url: '/?noti=' + encodeURIComponent(s(n.id))
    };
}

// ---------- VAPID (RFC 8292) ----------
async function vapidKey(pubB64, privB64) {
    const pub = unb64u(pubB64);
    const jwk = { kty: 'EC', crv: 'P-256', d: s(privB64), x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
export async function vapidHeader(endpoint, env, nowSec) {
    const aud = new URL(endpoint).origin;
    const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const body = b64u(enc.encode(JSON.stringify({ aud, exp: (nowSec || Math.floor(Date.now() / 1000)) + 12 * 3600, sub: s(env.VAPID_SUBJECT) || 'mailto:admin@kingorder.co.kr' })));
    const key = await vapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));   // r||s 64바이트 (JWS 모양 그대로)
    return `vapid t=${head}.${body}.${b64u(sig)}, k=${s(env.VAPID_PUBLIC_KEY)}`;
}

// ---------- 내용 암호화 (RFC 8291 · aes128gcm) ----------
async function hkdf(salt, ikm, info, bytes) {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}
export async function encryptPayload(sub, plaintext, fixed) {
    const uaPub = unb64u(sub.keys.p256dh);
    const auth = unb64u(sub.keys.auth);
    const as = (fixed && fixed.asKeys) || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
    const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
    const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
    const salt = (fixed && fixed.salt) || crypto.getRandomValues(new Uint8Array(16));
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const data = concat(typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext, new Uint8Array([2]));   // 마지막 조각 표시
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, data));
    const rs = new Uint8Array([0, 0, 16, 0]);                                          // 4096
    return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
// 보낼 요청 하나 — fetch(url, init) 로 그대로 씁니다
export async function buildRequest(sub, payloadObj, env) {
    const body = await encryptPayload(sub, JSON.stringify(payloadObj));
    return {
        url: sub.endpoint,
        init: {
            method: 'POST',
            headers: {
                'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal',
                Authorization: await vapidHeader(sub.endpoint, env)
            },
            body
        }
    };
}
export function keysReady(env) {
    try { return unb64u(env.VAPID_PUBLIC_KEY).length === 65 && unb64u(env.VAPID_PRIVATE_KEY).length === 32; } catch (e) { return false; }
}
