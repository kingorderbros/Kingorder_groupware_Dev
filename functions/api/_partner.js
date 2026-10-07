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
 *
 * 업체 통합 (2026-10-05): 업체(가맹점 · 파트너사 · 본사 · 유통)는 이제 **customers 표**에 있습니다.
 *   · 아이디의 업체는 customers 표에서 찾습니다. 예전 목록(app_store 'gwPartners.v1')은 직원 화면이 옮기기를 마치기 전
 *     (옮김 표시 'gwPartnersMigrated.v1' 이 없을 때)에만 함께 봅니다 — 옮긴 뒤에 지운 업체가 예전 목록으로 되살아나지 않게.
 *   · 업체가 없어진 아이디는 로그인 · 자료 받기가 막힙니다.
 *   · 본사 · 파트너사 아이디는 소속 가맹점(customers 의 parentId 가 그 업체인 곳) 목록과 그 가맹점들의 접수 진행 상태를
 *     **읽기 전용**으로 받습니다 — 서버가 골라서 내려 주고, 담당자 이름 · 연락처 · 금액은 내려 주지 않습니다.
 */

// 2026-10-05 S5 — 1만 → 10만 회 (Cloudflare Workers 가 받는 가장 큰 값). 예전 1만 회로 저장된 것은 로그인할 때 10만 회로 바꿔 둡니다.
export const PBKDF2_ITER = 100000;
export const LEGACY_ITER = 10000;
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
        const iter = Number(acct.pwIter) || LEGACY_ITER;
        const h = await hashPassword(pw, acct.pwSalt, iter);
        return { ok: timingSafeEqual(h.pwHash, acct.pwHash), needUpgrade: iter < PBKDF2_ITER };
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
// 소속 가맹점을 볼 수 있는 업체 유형
export const PARENT_KINDS = ['hq', 'partner'];
export const COMPANY_KEYS = ['gwPartnerAccounts.v1', 'gwPartners.v1', 'gwPartnersMigrated.v1'];
const kindOf = (c) => s((c && (c.kind || c.custType)) || '');
// 아이디의 업체를 찾을 목록 — customers 표의 줄 + (옮기기 전이면) 예전 목록에서 표에 없는 것
export function companyList(customerRows, legacyPartners, migrated) {
    const rows = arr(customerRows).filter(c => c && c.id);
    if (migrated) return rows;
    const have = new Set(rows.map(c => String(c.id)));
    return rows.concat(arr(legacyPartners).filter(p => p && p.id && !have.has(String(p.id))));
}
// 로그인 · 토큰 확인 공용 — io: { storeValues(keys), companies(ids), children(id) } (Supabase 읽기는 [[route]].js 가 넘겨 줍니다)
// 돌려주는 것: null(아이디 없음) 또는 { acct, accounts, company, missing, me }. me 에는 소속 가맹점(shops)까지 담습니다(withShops 일 때).
export async function resolvePartner(io, loginId, opts) {
    const o = opts || {};
    const v = await io.storeValues(COMPANY_KEYS);
    const accounts = arr(v['gwPartnerAccounts.v1']);
    const acct = accounts.find(x => s(x.loginId).toLowerCase() === s(loginId).toLowerCase());
    if (!acct) return null;
    const rows = acct.partnerId ? await io.companies([acct.partnerId]) : [];
    const list = companyList(rows, v['gwPartners.v1'], !!v['gwPartnersMigrated.v1']);
    const f = findAccount(accounts, list, acct.loginId);
    const company = f && f.partner ? f.partner : null;
    const me = { loginId: acct.loginId, partnerId: acct.partnerId, partnerName: company ? partnerName(company) : s(acct.partnerName),
                 kind: kindOf(company), company, shops: [], role: s(acct.role) || 'staff', mustChangePw: acct.mustChangePw === true };
    if (company && o.withShops && PARENT_KINDS.includes(me.kind)) me.shops = arr(await io.children(company.id));
    return { acct, accounts, company, missing: !company, me };
}
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
// 자기 업체 한 줄 — 사내 메모(memo · note)는 뺍니다
export function publicCompany(c) {
    const o = Object.assign({}, c);
    delete o.memo; delete o.note; delete o.fromLegacy;
    return o;
}
// 소속 가맹점 한 곳 — 상호 · 유형 · 주소 · 거래상태 · 계약일 · 설치일만.
// 담당자 이름 · 연락처 · 사업자번호 · 금액은 내려 주지 않습니다 (제3자 제공 동의 없이 상위업체에 넘기지 않음 · 제안서 v2 5절)
// 회원가입 때 '소속 본사 · 파트너사에 제공' 에 동의한 가맹점(consentParentShare)만 담당자 이름 · 연락처를 더합니다 (2026-10-05)
// 2026-10-07 — 접수 화면에서 가맹점을 찾아 고르면 칸을 채우도록:
//   · 주소는 우편번호 · 도로명 · 상세주소로 나눠 줍니다 (주소는 원래 보이던 자료)
//   · 사업자번호 · 대표자명도 **동의한 가맹점만** 더합니다 (담당자 · 연락처와 같은 기준)
export function shopSummary(c) {
    const o = { id: s(c.id), name: partnerName(c), kind: kindOf(c), address: s(c.roadAddress || c.address), status: s(c.status),
                contractDate: s(c.contractDate), installDate: s(c.installDate),
                zipCode: s(c.zipCode), roadAddress: s(c.roadAddress), addressDetail: c.roadAddress ? s(c.addressDetail) : '' };
    if (c.consentParentShare === true) {
        o.contactName = s(c.contactName || c.contact); o.phone = s(c.phone);
        o.businessNo = s(c.businessNo); o.ceo = s(c.ceo);
    }
    return o;
}
// 소속 가맹점의 접수 한 건 — 진행 상태를 보는 데 필요한 것만 (내용 · 첨부 · 담당자 연락처는 빼고)
export function shopIntakeSummary(x) {
    return { id: s(x.id), partnerId: s(x.partnerId), partnerName: s(x.partnerName), dept: s(x.dept), type: s(x.type), title: s(x.title),
             status: s(x.status), at: s(x.at), wantDate: s(x.wantDate) };
}

// ---------- 파트너센터가 받는 자료 ----------
// 누구에게 보여도 되는 설정값 (양식 · 서류 목록 · 조직 이름 등)
export const SHARED_KEYS = ['gwHolidays.v1', 'gwPartnerTypeDocs.v1', 'gwPartnerIntakeDocs.v1', 'gwAsOptions.v1', 'gwOrgDepts.v1', 'gwOrgDeptsRemoved.v1',
                            'gwOrgTeams.v1', 'gwOrgNoTeamLabel.v1', 'gwInboundMaxContact.v1'];
// 파트너사 몫만 거르는 자료
export const OWN_KEYS = ['gwPartners.v1', 'gwPartnerAccounts.v1', 'gwPartnerDeptPerm.v1', 'gwPartnerIntakes.v1', 'gwDevRequests.v1',
                         'gwInboundRecords.v1', 'gwArchivePosts.v1', 'gwDevNotiQueue.v1'];
// 서버가 만들어 내려 주는 읽기 전용 자료 (app_store 에 없는 키) — 본사 · 파트너사의 소속 가맹점 (2026-10-05)
export const SHOP_KEYS = ['gwPartnerShops.v1', 'gwPartnerShopIntakes.v1'];
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
    // 자기 업체 — customers 표에서 찾은 것(me.company)이 있으면 그것, 없으면 예전 목록에서
    out['gwPartners.v1'] = me.company ? [publicCompany(me.company)] : arr(store['gwPartners.v1']).filter(p => p && p.id === me.partnerId).map(publicCompany);
    out['gwPartnerAccounts.v1'] = arr(store['gwPartnerAccounts.v1']).filter(a => a && s(a.loginId).toLowerCase() === s(me.loginId).toLowerCase()).map(publicAccount);
    const perm = store['gwPartnerDeptPerm.v1'] && typeof store['gwPartnerDeptPerm.v1'] === 'object' ? store['gwPartnerDeptPerm.v1'] : {};
    out['gwPartnerDeptPerm.v1'] = perm[me.loginId] ? { [me.loginId]: perm[me.loginId] } : {};
    out['gwPartnerIntakes.v1'] = arr(store['gwPartnerIntakes.v1']).filter(x => owns('gwPartnerIntakes.v1', x, me));
    out['gwDevRequests.v1'] = arr(store['gwDevRequests.v1']).filter(x => x && x.status !== 'draft' && owns('gwDevRequests.v1', x, me));
    const ib = store['gwInboundRecords.v1'];
    out['gwInboundRecords.v1'] = { seq: Number(ib && ib.seq) || 0, records: listOf('gwInboundRecords.v1', ib).filter(x => owns('gwInboundRecords.v1', x, me)) };
    out['gwArchivePosts.v1'] = arr(store['gwArchivePosts.v1']).filter(x => x && x.open);
    out['gwDevNotiQueue.v1'] = [];     // 사내 알림 대기열 — 파트너는 넣기만 합니다
    // 소속 가맹점 (본사 · 파트너사만) — 목록과 그 가맹점들이 낸 접수의 진행 상태. 읽기 전용이라 WRITE_KEYS 에 없습니다
    const shops = arr(me.shops).filter(c => c && c.id && String(c.id) !== String(me.partnerId));
    const shopIds = new Set(shops.map(c => String(c.id)));
    out['gwPartnerShops.v1'] = shops.map(shopSummary);
    out['gwPartnerShopIntakes.v1'] = shopIds.size
        ? arr(store['gwPartnerIntakes.v1']).filter(x => x && shopIds.has(String(x.partnerId))).map(shopIntakeSummary) : [];
    // 소속 가맹점 가입 신청 — 상위업체 승인이 켜진 업체의 업체관리자 아이디에만 (route 가 me.shopSignups 를 채움)
    if (Array.isArray(me.shopSignups)) out['gwPartnerShopSignups.v1'] = me.shopSignups;
    out['gwPartnerMe.v1'] = { role: s(me.role) || 'staff', canApproveShops: Array.isArray(me.shopSignups) };
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
                list.push(sanitizeNew(key, Object.assign({}, item, { id: nid }), me));
                return;
            }
            // 이미 있는 자기 건 — 파트너가 바꿀 수 있는 칸만 서버 값 위에 얹습니다 (2026-09-28)
            const merged = mergeExisting(key, list[i], item, me);
            if (merged === null) { rejected.push(id); return; }
            list[i] = merged;
            return;
        }
        if (key === 'gwDevRequests.v1') { rejected.push(id); return; }            // 개발의뢰는 사내에서만 만듭니다
        taken.add(id);
        list.push(sanitizeNew(key, item, me));
    });
    // 파트너 화면에는 지우는 기능이 없습니다 — 지우기 요청은 모두 받지 않습니다
    // (목록을 못 읽어 빈 목록을 저장하는 경우에도 서버 자료가 지워지지 않게 · 2026-09-28)
    arr(removes).forEach(rid => rejected.push(String(rid)));
    return done({ list, renamed, rejected });
}

// ---------- 파트너가 고칠 수 있는 칸 (2026-09-28) ----------
// 파트너 화면 코드를 모두 따라가 본 결과입니다. 여기 없는 칸(처리 상태 · 담당 · 결제 · 답변 · 사내 처리 칸 …)은
// 파트너가 보낸 값이 무엇이든 서버 값을 그대로 둡니다.
const clone = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
// 기록(history · thread) — 서버에 있는 것은 그대로 두고, 뒤에 붙인 것 중 조건에 맞는 것만 받습니다
function appended(serverArr, incomingArr, max, okEntry) {
    const base = arr(serverArr).slice();
    const extra = arr(incomingArr).slice(base.length).filter(okEntry).slice(0, max);
    return base.concat(extra);
}
const DEV_PARTNER_STEPS = ['received', 'working', 'hold', 'review'];
const INBOUND_VENDOR_FIELDS = ['inDate', 'routes', 'services', 'company', 'name', 'bizNo', 'phone', 'email', 'firstContactAt', 'requestNote', 'needs'];
const INTAKE_STAFF_FIELDS = ['rejectKind', 'rejectAlt', 'holdReason', 'payStatus', 'taxInvoice', 'payMemo', 'method', 'deptWork', 'siteConfirm',
                             'workId', 'workAt', 'adminEditedAt', 'adminEditedBy'];

function mergeExisting(key, server, incoming, me) {
    const o = clone(server);
    if (key === 'gwPartnerIntakes.v1') {
        // 반려된 접수를 다시 요청할 때만 — 원 접수에 '재요청 연결' 과 기록 한 줄
        if (server.status === 'rejected' && !server.reRequestedTo && incoming.reRequestedTo && typeof incoming.reRequestedTo === 'string') {
            o.reRequestedTo = incoming.reRequestedTo;
            o.history = appended(server.history, incoming.history, 1, (h) => h && typeof h === 'object' && /재요청/.test(String(h.text || '')));
        }
        return o;
    }
    if (key === 'gwDevRequests.v1') {
        if (server.status === 'draft') return null;                          // 작성 중인 의뢰는 파트너에게 안 보입니다
        const st = incoming.status;
        if (st !== server.status && DEV_PARTNER_STEPS.includes(st) && server.status !== 'done') {
            o.status = st;
            if (server.status === 'rework' && st === 'received') { o.reworkRound = (Number(server.reworkRound) || 0) + 1; o.progress = 0; }
            if (st === 'review') o.progress = 100;
            if (st === 'hold') { o.holdReason = String(incoming.holdReason || ''); o.holdBy = me.partnerName; o.holdAt = String(incoming.holdAt || ''); }
        }
        if ((o.status === 'working') && incoming.progress !== undefined && incoming.progress !== server.progress) {
            const n = Math.round(Number(incoming.progress));
            if (!isNaN(n)) o.progress = Math.max(0, Math.min(100, n));
        }
        const fromPartner = (e) => e && typeof e === 'object' && e.side === 'partner' && e.system !== true;
        o.thread = appended(server.thread, incoming.thread, 20, fromPartner);
        o.history = appended(server.history, incoming.history, 20, fromPartner);
        if (incoming.partnerSeenAt) o.partnerSeenAt = String(incoming.partnerSeenAt);
        if (incoming.updatedAt) o.updatedAt = String(incoming.updatedAt);
        return o;
    }
    if (key === 'gwInboundRecords.v1') {
        INBOUND_VENDOR_FIELDS.forEach(f => { if (f in incoming) o[f] = clone(incoming[f]); else delete o[f]; });
        o.vendor = server.vendor;                                            // 업체 이름 · 사내 처리 칸(kob)은 그대로
        return o;
    }
    return o;
}
function sanitizeNew(key, item, me) {
    const o = clone(item);
    if (key === 'gwPartnerIntakes.v1') {
        o.partnerId = me.partnerId;
        o.status = 'received'; o.assignee = ''; o.rejectReason = ''; o.reRequestedTo = ''; o.replies = [];
        INTAKE_STAFF_FIELDS.forEach(f => { delete o[f]; });
        o.history = arr(o.history).slice(0, 1);
    }
    if (key === 'gwInboundRecords.v1') {
        const keep = { id: o.id, createdAt: o.createdAt || new Date().toISOString(), vendor: me.partnerName,
                       kob: { contactAt: '', salesStatus: '', result: '', failReason: '', owner: '', extras: [] } };
        INBOUND_VENDOR_FIELDS.forEach(f => { if (f in o) keep[f] = o[f]; });
        return keep;
    }
    return o;
}
