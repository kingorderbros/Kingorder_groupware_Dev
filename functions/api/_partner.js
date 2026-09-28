/**
 * 파트너센터 서버 통로 (2026-09-28 · 자료 보호 2단계)
 *
 * 예전 파트너센터는 브라우저가 app_store 를 통째로 받아 **브라우저 안에서** 비밀번호를 맞춰 보고,
 * 저장도 목록 전체를 app_store 에 바로 썼습니다. 그래서 모든 파트너사의 비밀번호(평문)와 자료가
 * 공개 키만으로 누구에게나 보였습니다. 이제는
 *   · 로그인      POST /api/partner/login  { loginId, pw }  → { token, session }
 *   · 자료 받기   GET  /api/partner/boot   (Authorization: Bearer 토큰) → 그 파트너사 몫만
 *   · 저장        POST /api/partner/save   { key, upserts:[…], removes:[id…] } → 그 파트너사 것만 반영
 * 를 서버(service_role)가 맡습니다. 이 파일은 그 판단(비밀번호 · 토큰 · 거르기 · 합치기)만 담고,
 * Supabase 읽기/쓰기는 [[route]].js 가 합니다 — 그래서 가짜 자료로 바로 시험할 수 있습니다.
 *
 * 비밀번호: PBKDF2-SHA256 (소금 16바이트 · 10,000회). 화면(그룹웨어 › 파트너 ID 관리)도 같은 방식으로 만들어 저장합니다.
 *   예전 평문(pw)은 첫 로그인 때 서버가 암호화로 바꿔 둡니다.
 * 토큰: 서명한 { l: 아이디, p: 파트너사 id, exp } — 서명 열쇠는 service_role 키에서 뽑아 따로 설정할 것이 없습니다.
 */

export const PBKDF2_ITER = 10000;
export const TOKEN_DAYS = 7;

const enc = new TextEncoder();
const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)), c => c.charCodeAt(0));
const hex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

// ---------- 비밀번호 ----------
export async function hashPassword(pw, saltHex, iter) {
    const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
    const n = iter || PBKDF2_ITER;
    const key = await crypto.subtle.importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: n }, key, 256);
    return { pwSalt: hex(salt), pwHash: hex(bits), pwIter: n };
}
// 맞으면 true. 예전 평문(pw)도 받아 줍니다 — 그때는 needUpgrade 로 알립니다
export async function checkPassword(acct, pw) {
    if (!acct) return { ok: false };
    if (acct.pwHash && acct.pwSalt) {
        const h = await hashPassword(pw, acct.pwSalt, acct.pwIter || PBKDF2_ITER);
        return { ok: timingSafeEqual(h.pwHash, acct.pwHash), needUpgrade: false };
    }
    if (typeof acct.pw === 'string' && acct.pw !== '') return { ok: timingSafeEqual(acct.pw, String(pw)), needUpgrade: true };
    return { ok: false };
}
function timingSafeEqual(a, b) {
    a = String(a); b = String(b);
    let d = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return d === 0;
}

// ---------- 토큰 ----------
async function hmacKey(secret) {
    // service_role 키를 그대로 쓰지 않고, 이 용도의 열쇠를 한 번 뽑아 씁니다
    const base = await crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const derived = await crypto.subtle.sign('HMAC', base, enc.encode('kob-partner-token-v1'));
    return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function makeToken(secret, loginId, partnerId, nowMs) {
    const body = b64u(enc.encode(JSON.stringify({ l: loginId, p: partnerId, exp: Math.floor((nowMs || Date.now()) / 1000) + TOKEN_DAYS * 86400 })));
    const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
    return body + '.' + b64u(sig);
}
export async function readToken(secret, token, nowMs) {
    const t = s(token);
    const dot = t.indexOf('.');
    if (dot < 1) return null;
    const body = t.slice(0, dot), sig = t.slice(dot + 1);
    let good = false;
    try { good = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(sig), enc.encode(body)); } catch (e) { return null; }
    if (!good) return null;
    let o; try { o = JSON.parse(new TextDecoder().decode(unb64u(body))); } catch (e) { return null; }
    if (!o || !o.l || !o.exp || o.exp < Math.floor((nowMs || Date.now()) / 1000)) return null;
    return { loginId: o.l, partnerId: o.p || '' };
}

// ---------- 계정 ----------
const partnerName = (p) => (p ? s(String(p.name || '').replace(/\n/g, ' ')) : '');
// 토큰의 아이디로 지금 계정을 다시 찾습니다 — 중지 · 삭제 · 파트너사 변경을 매번 반영합니다
export function findAccount(accounts, partners, loginId) {
    const a = (Array.isArray(accounts) ? accounts : []).find(x => s(x.loginId).toLowerCase() === s(loginId).toLowerCase());
    if (!a) return null;
    const p = (Array.isArray(partners) ? partners : []).find(x => x.id === a.partnerId) || null;
    return { acct: a, partner: p, partnerName: partnerName(p) || s(a.partnerName) };
}
// 화면에 내려보낼 계정 — 비밀번호 칸은 뺍니다
export function publicAccount(a) {
    const o = Object.assign({}, a);
    delete o.pw; delete o.pwHash; delete o.pwSalt; delete o.pwIter;
    return o;
}

// ---------- 파트너센터가 받는 자료 ----------
// 누구에게 보여도 되는 설정값 (양식 · 서류 목록 · 조직 이름 등)
export const SHARED_KEYS = ['gwPartnerTypeDocs.v1', 'gwPartnerIntakeDocs.v1', 'gwAsOptions.v1', 'gwOrgDepts.v1', 'gwOrgDeptsRemoved.v1',
                            'gwOrgTeams.v1', 'gwOrgNoTeamLabel.v1', 'gwInboundMaxContact.v1'];
// 파트너사 몫만 거르는 자료
export const OWN_KEYS = ['gwPartners.v1', 'gwPartnerAccounts.v1', 'gwPartnerDeptPerm.v1', 'gwPartnerIntakes.v1', 'gwDevRequests.v1',
                         'gwInboundRecords.v1', 'gwArchivePosts.v1', 'gwDevNotiQueue.v1'];
export const ALL_KEYS = SHARED_KEYS.concat(OWN_KEYS);
// 파트너가 저장할 수 있는 자료
export const WRITE_KEYS = ['gwPartnerIntakes.v1', 'gwDevRequests.v1', 'gwDevNotiQueue.v1', 'gwInboundRecords.v1'];

const arr = (v) => (Array.isArray(v) ? v : []);
// 인바운드(gwInboundRecords.v1)는 목록이 아니라 { seq, records } 묶음으로 저장됩니다 (2026-09-28 검토에서 발견).
// 이 키는 records 를 목록으로 다루고, seq(다음 번호)는 그대로 지니고 다닙니다.
const WRAPPED_KEYS = ['gwInboundRecords.v1'];
const listOf = (key, v) => (WRAPPED_KEYS.includes(key) ? arr(v && v.records) : arr(v));
// 이 건이 이 파트너사 것인지
export function owns(key, item, me) {
    if (!item || typeof item !== 'object') return false;
    if (key === 'gwPartnerIntakes.v1') return item.partnerId === me.partnerId;
    if (key === 'gwDevRequests.v1') return (item.partnerId ? item.partnerId === me.partnerId : (!!me.partnerName && item.partnerName === me.partnerName));
    if (key === 'gwInboundRecords.v1') return !!me.partnerName && s(item.vendor) === me.partnerName;
    return false;
}
// store: { key → 값 } (app_store 에서 읽은 것). me: { loginId, partnerId, partnerName }
export function partnerView(store, me) {
    const out = {};
    SHARED_KEYS.forEach(k => { if (store[k] !== undefined && store[k] !== null) out[k] = store[k]; });
    out['gwPartners.v1'] = arr(store['gwPartners.v1']).filter(p => p && p.id === me.partnerId);
    out['gwPartnerAccounts.v1'] = arr(store['gwPartnerAccounts.v1']).filter(a => a && s(a.loginId).toLowerCase() === s(me.loginId).toLowerCase()).map(publicAccount);
    const perm = store['gwPartnerDeptPerm.v1'] && typeof store['gwPartnerDeptPerm.v1'] === 'object' ? store['gwPartnerDeptPerm.v1'] : {};
    out['gwPartnerDeptPerm.v1'] = perm[me.loginId] ? { [me.loginId]: perm[me.loginId] } : {};
    out['gwPartnerIntakes.v1'] = arr(store['gwPartnerIntakes.v1']).filter(x => owns('gwPartnerIntakes.v1', x, me));
    out['gwDevRequests.v1'] = arr(store['gwDevRequests.v1']).filter(x => x && x.status !== 'draft' && owns('gwDevRequests.v1', x, me));
    const ib = store['gwInboundRecords.v1'];
    out['gwInboundRecords.v1'] = { seq: Number(ib && ib.seq) || 0, records: listOf('gwInboundRecords.v1', ib).filter(x => owns('gwInboundRecords.v1', x, me)) };
    out['gwArchivePosts.v1'] = arr(store['gwArchivePosts.v1']).filter(x => x && x.open);
    out['gwDevNotiQueue.v1'] = [];     // 사내 알림 대기열 — 파트너는 넣기만 합니다
    return out;
}

// ---------- 파트너 저장 합치기 ----------
// 새로 만든 건의 번호가 남의 것과 겹치면(파트너는 제 것만 보고 번호를 매기므로) 비어 있는 번호로 바꿉니다
function freeId(id, taken) {
    const m = /^(.*?)(\d+)$/.exec(String(id));
    if (!m) { let n = 2; while (taken.has(`${id}-${n}`)) n++; return `${id}-${n}`; }
    const width = m[2].length;
    let n = Number(m[2]);
    let cand = id;
    while (taken.has(cand)) { n++; cand = m[1] + String(n).padStart(width, '0'); }
    return cand;
}
// current: 서버에 있는 전체 목록. 돌려주는 것: { list: 새 전체 목록, renamed: {옛 id → 새 id}, rejected: [id…] }
export function applyPartnerWrite(key, current, upserts, removes, me) {
    if (!WRITE_KEYS.includes(key)) throw new Error('파트너가 저장할 수 없는 자료입니다: ' + key);
    const wrapped = WRAPPED_KEYS.includes(key);
    let list = listOf(key, current).slice();
    const done = (res) => {
        if (!wrapped) return res;
        // 다음 번호 — 저장된 seq 와 지금 가장 큰 번호 + 1 중 큰 쪽
        const maxNo = res.list.reduce((m, x) => { const n = Number((/(\d+)$/.exec(String(x && x.id)) || [])[1]); return n > m ? n : m; }, 0);
        const seq = Math.max(Number(current && current.seq) || 0, maxNo + 1);
        return Object.assign({}, res, { list: Object.assign({}, current && typeof current === 'object' ? current : {}, { seq, records: res.list }) });
    };
    const renamed = {}, rejected = [];
    const ups = arr(upserts).filter(x => x && typeof x === 'object' && x.id !== undefined && x.id !== null && x.id !== '');

    if (key === 'gwDevNotiQueue.v1') {
        // 알림은 새로 넣기만 — 같은 id 는 건너뛰고 최근 50건만 둡니다
        ups.forEach(n => { if (!list.some(x => x && String(x.id) === String(n.id))) list.push(n); });
        return { list: list.slice(-50), renamed, rejected };
    }

    // 이미 있는 번호 + 이번에 들어온 번호 모두 — 새 번호를 고를 때 같은 요청의 다른 건과도 겹치지 않게
    const taken = new Set(list.map(x => x && String(x.id)).concat(ups.map(x => String(x.id))));
    ups.forEach(item => {
        const id = String(item.id);
        const i = list.findIndex(x => x && String(x.id) === id);
        if (i > -1) {
            if (!owns(key, list[i], me)) {
                if (key === 'gwDevRequests.v1') { rejected.push(id); return; }   // 남의 개발의뢰는 건드리지 못합니다
                // 번호만 겹친 새 건 — 빈 번호로 바꿔 새로 넣습니다
                const nid = freeId(id, taken);
                taken.add(nid); renamed[id] = nid;
                list.push(stamp(key, Object.assign({}, item, { id: nid }), me));
                return;
            }
            const next = stamp(key, item, me);
            // 개발의뢰의 상대 파트너사는 사내가 정한 그대로 둡니다
            if (key === 'gwDevRequests.v1') { next.partnerId = list[i].partnerId; next.partnerName = list[i].partnerName; }
            list[i] = next;
            return;
        }
        if (key === 'gwDevRequests.v1') { rejected.push(id); return; }            // 개발의뢰는 사내에서만 만듭니다
        taken.add(id);
        list.push(stamp(key, item, me));
    });
    arr(removes).forEach(rid => {
        if (key === 'gwDevRequests.v1') { rejected.push(String(rid)); return; }  // 개발의뢰는 지우지 못합니다
        const i = list.findIndex(x => x && String(x.id) === String(rid));
        if (i > -1 && owns(key, list[i], me)) list.splice(i, 1);
        else if (i > -1) rejected.push(String(rid));
    });
    return done({ list, renamed, rejected });
}
// 소유를 나타내는 칸은 서버가 다시 적습니다 — 다른 파트너사 이름으로 넣지 못하게
function stamp(key, item, me) {
    const o = Object.assign({}, item);
    if (key === 'gwPartnerIntakes.v1') o.partnerId = me.partnerId;
    if (key === 'gwInboundRecords.v1') o.vendor = me.partnerName;
    if (key === 'gwDevRequests.v1' && !o.partnerId) o.partnerName = me.partnerName;
    return o;
}
