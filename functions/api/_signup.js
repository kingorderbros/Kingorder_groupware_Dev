/**
 * 파트너센터 계정 보안 · 회원가입 (2026-10-05 · 제안서 v2 6.2 S1~S7 · 4.1 회원가입)
 *
 * 판단만 담습니다(가짜 자료로 바로 시험할 수 있게). Supabase 읽기/쓰기는 [[route]].js 가 합니다.
 *   · S1 비밀번호 규칙 — 6자 이상 · 영문과 숫자를 섞어서 (2026-10-05 사용자 요청으로 쉽게 바꿈)
 *   · S2 실패 잠금     — 5번 잇달아 틀리면 10분 잠금 (app_store 'gwPartnerLoginGuard.v1', 서버만 씀)
 *   · S4 첫 로그인 변경 — 임시 비밀번호(서버가 12자로 만듦, 72시간)로 들어오면 바꾸기 전에는 다른 일을 못 함
 *   · S6 기록          — 생성 · 승인 · 발급 · 로그인 성공/실패를 'gwPartnerAudit.v1' 에 (최근 1,000건)
 *   · 회원가입         — 'gwPartnerSignups.v1' 에 한 건씩 '승인대기' 로. 승인하면 업체(customers 표) · 아이디를 만듭니다.
 *     (제안서는 별도 표 partner_signups 였지만, SQL 을 따로 실행하지 않아도 되게 app_store 키로 둡니다.
 *      app_store 는 9/28 3단계로 로그인한 직원만 읽고, 파트너 · 비로그인은 서버를 거쳐야만 닿습니다.)
 */

export const GUARD_KEY = 'gwPartnerLoginGuard.v1';
export const AUDIT_KEY = 'gwPartnerAudit.v1';
export const SIGNUP_KEY = 'gwPartnerSignups.v1';
export const POLICY_KEY = 'gwPartnerSignupPolicy.v1';
export const RATE_KEY = 'gwPartnerSignupRate.v1';
export const LOCK_FAILS = 5;
export const LOCK_MINUTES = 10;
export const TEMP_HOURS = 72;
export const AUDIT_MAX = 1000;
export const CONSENT_VERSION = '2026-10-05';

const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// ---------- S1 비밀번호 규칙 ----------
// 문제가 없으면 '' — 화면(index.html partnerPwProblem)도 같은 규칙입니다
export function passwordProblem(pw, loginId) {
    // 2026-10-05 사용자 요청으로 쉽게 — 6자 이상 · 영문과 숫자를 섞어서 (특수문자는 넣어도 되고 안 넣어도 됨)
    const p = String(pw === null || pw === undefined ? '' : pw);
    if (p.length < 6) return '비밀번호는 6자 이상이어야 합니다.';
    if (p.length > 64) return '비밀번호는 64자까지입니다.';
    if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return '비밀번호는 영문과 숫자를 섞어 주세요.';
    return '';
}
// 임시 비밀번호 — 12자 · 대문자 · 소문자 · 숫자 · 특수문자 모두 (헷갈리는 글자 0 O 1 l I 는 뺌)
export function tempPassword() {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*?'];
    const all = sets.join('');
    const r = new Uint32Array(16); crypto.getRandomValues(r);
    const out = sets.map((set, i) => set[r[i] % set.length]);
    for (let i = 4; i < 12; i++) out.push(all[r[i] % all.length]);
    // 섞기 (앞 네 자리가 늘 같은 종류가 되지 않게)
    for (let i = out.length - 1; i > 0; i--) { const j = r[(i + 4) % r.length] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out.join('');
}

// ---------- S2 실패 잠금 ----------
export function guardState(guard, loginId, nowMs) {
    const g = obj(obj(guard)[s(loginId).toLowerCase()]);
    const until = Number(g.lockUntil) || 0;
    return { fails: Number(g.fails) || 0, locked: until > (nowMs || Date.now()), until };
}
// 틀렸을 때 — 돌려주는 것: { guard: 새 값, locked, fails }
export function guardFail(guard, loginId, nowMs) {
    const now = nowMs || Date.now();
    const id = s(loginId).toLowerCase();
    const all = Object.assign({}, obj(guard));
    const g = Object.assign({}, obj(all[id]));
    if ((Number(g.lockUntil) || 0) > 0 && Number(g.lockUntil) <= now) g.fails = 0;     // 잠금이 풀린 뒤에는 처음부터
    g.fails = (Number(g.fails) || 0) + 1;
    g.lastFailAt = new Date(now).toISOString();
    if (g.fails >= LOCK_FAILS) { g.lockUntil = now + LOCK_MINUTES * 60000; g.lockedAt = new Date(now).toISOString(); }
    all[id] = g;
    return { guard: all, locked: g.fails >= LOCK_FAILS, fails: g.fails };
}
export function guardClear(guard, loginId) {
    const all = Object.assign({}, obj(guard));
    delete all[s(loginId).toLowerCase()];
    return all;
}

// ---------- S6 기록 ----------
// e: { action, loginId, by, ok, note, ip }
export function auditAppend(list, e, nowMs) {
    const rec = Object.assign({ at: new Date(nowMs || Date.now()).toISOString() }, e);
    return arr(list).concat([rec]).slice(-AUDIT_MAX);
}

// ---------- 아이디 ----------
export const SIGNUP_LOGIN_RE = /^[a-z0-9]{4,20}$/;
// 회원가입 때 업체가 정하는 아이디 — 영문 소문자 · 숫자 4~20자 · ptn 으로 시작 불가(자동 번호와 겹치지 않게) · 이미 있거나 승인 대기 중이면 불가
export function loginIdProblem(loginId, accounts, signups) {
    const id = s(loginId).toLowerCase();
    if (!SIGNUP_LOGIN_RE.test(id)) return '아이디는 영문 소문자 · 숫자 4~20자로 정해 주세요.';
    if (/^ptn/.test(id)) return "'ptn' 으로 시작하는 아이디는 쓸 수 없습니다 (킹오더가 만드는 아이디 번호입니다).";
    if (arr(accounts).some(a => s(a.loginId).toLowerCase() === id)) return '이미 쓰고 있는 아이디입니다.';
    if (arr(signups).some(x => x && x.status === 'pending' && s(x.loginId).toLowerCase() === id)) return '이미 가입 신청 중인 아이디입니다.';
    return '';
}
const digits = (v) => s(v).replace(/\D/g, '');
export function bizNoFormat(v) { const d = digits(v); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : s(v); }

// ---------- 회원가입 ----------
export const SIGNUP_KINDS = ['direct', 'franchise', 'partnerShop', 'partner', 'hq', 'dist'];
export const PARENT_KIND = { franchise: 'hq', partnerShop: 'partner' };
const LIMITS = { name: 100, ceo: 50, address: 200, zipCode: 10, roadAddress: 150, addressDetail: 50, contactName: 50, phone: 20, email: 100 };
const LIMIT_LABELS = { name: '상호', ceo: '대표자명', address: '주소', zipCode: '우편번호', roadAddress: '도로명주소', addressDetail: '상세주소', contactName: '담당자 이름', phone: '연락처', email: '이메일' };
// 업체 유형별 처음 열어 줄 파트너센터 메뉴 — 화면의 PARTNER_PERM_PRESETS 와 같은 묶음입니다 (고칠 때 함께)
export const PRESET_MENUS = {
    full: ['sales', 'sales:newshop', 'sales:buyhw', 'sales:donate', 'sales:general',
           'payment', 'payment:map-simple', 'payment:map-device', 'payment:franchise', 'payment:agent', 'payment:login-info', 'payment:settle',
           'ops', 'ops:as', 'ops:change', 'ops:menu'],
    dist: ['sales', 'sales:buyhw', 'ops', 'ops:as', 'ops:change'],
    shop: ['ops', 'ops:as', 'ops:change', 'ops:menu', 'payment', 'payment:settle']
};
export function presetForKind(kind) { return kind === 'partner' || kind === 'hq' ? 'full' : (kind === 'dist' ? 'dist' : 'shop'); }

export function nextSignupId(list) {
    const max = arr(list).reduce((m, x) => { const r = /^SU-(\d+)$/.exec(s(x && x.id)); return r ? Math.max(m, Number(r[1])) : m; }, 0);
    return 'SU-' + String(max + 1).padStart(4, '0');
}
// 가입 신청 확인 — ctx: { accounts, signups, parent(상위업체 줄 또는 null), existing(같은 사업자번호 업체 또는 null), nowMs, ip }
// 돌려주는 것: { error } 또는 { rec } (비밀번호 암호화는 [[route]].js 가 rec 에 붙입니다)
export function validateSignup(input, ctx) {
    const i = obj(input), c = obj(ctx);
    const kind = s(i.kind);
    if (!SIGNUP_KINDS.includes(kind)) return { error: '업체 유형을 골라 주세요.' };
    const parentKind = PARENT_KIND[kind] || '';
    const parent = c.parent || null;
    if (parentKind) {
        if (!s(i.parentId)) return { error: parentKind === 'hq' ? '소속 프랜차이즈 본사를 찾아 골라 주세요.' : '소속 파트너사를 찾아 골라 주세요.' };
        if (!parent || s(parent.id) !== s(i.parentId) || s(parent.kind || parent.custType) !== parentKind) return { error: '고른 소속 업체를 찾지 못했습니다. 다시 찾아 골라 주세요.' };
    }
    const co = {};
    for (const k of Object.keys(LIMITS)) {
        const v = s(i[k]);
        if (v.length > LIMITS[k]) return { error: `${LIMIT_LABELS[k]}이(가) 너무 길어요 (${LIMITS[k]}자까지).` };
        co[k] = v;
    }
    // 주소 — 검색으로 찾은 도로명 · 상세를 나눠 받고, 한 줄 주소(address)도 함께 둡니다 (2026-10-05)
    if (!co.address && (co.roadAddress || co.addressDetail)) co.address = [co.roadAddress, co.addressDetail].filter(Boolean).join(' ').slice(0, 200);
    if (!co.roadAddress && co.address) co.roadAddress = co.address.slice(0, 150);
    if (!co.name) return { error: '상호(업체명)를 넣어 주세요.' };
    if (digits(i.businessNo).length !== 10) return { error: '사업자등록번호 10자리를 넣어 주세요.' };
    co.businessNo = bizNoFormat(i.businessNo);
    co.bizType = s(i.bizType) === 'corp' ? 'corp' : (s(i.bizType) === 'personal' ? 'personal' : '');
    if (!co.ceo) return { error: '대표자명을 넣어 주세요.' };
    if (!co.contactName) return { error: '담당자 이름을 넣어 주세요.' };
    if (digits(co.phone).length < 9 || digits(co.phone).length > 11) return { error: '담당자 연락처를 확인해 주세요.' };
    if (co.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(co.email)) return { error: '이메일 주소를 확인해 주세요.' };
    const loginId = s(i.loginId).toLowerCase();
    const idErr = loginIdProblem(loginId, c.accounts, c.signups);
    if (idErr) return { error: idErr };
    const pwErr = passwordProblem(i.pw, loginId);
    if (pwErr) return { error: pwErr };
    if (String(i.pw) !== String(i.pw2 === undefined ? i.pw : i.pw2)) return { error: '비밀번호 확인이 맞지 않습니다.' };
    const consents = obj(i.consents);
    if (consents.privacy !== true) return { error: '개인정보 수집 · 이용에 동의해야 가입할 수 있습니다.' };
    const now = c.nowMs || Date.now();
    const rec = {
        id: nextSignupId(c.signups), status: 'pending', at: new Date(now).toISOString(),
        kind, parentId: parentKind ? s(parent.id) : '', parentName: parentKind ? s(String(parent.name || '').replace(/\n/g, ' ')) : '',
        company: co, loginId,
        consents: { privacy: true, parentShare: parentKind ? consents.parentShare === true : false, version: CONSENT_VERSION, at: new Date(now).toISOString() },
        existingCompanyId: c.existing ? s(c.existing.id) : '',
        ip: s(c.ip).slice(0, 64)
    };
    return { rec };
}
// 가입 신청 횟수 제한 — 같은 IP 에서 1시간에 5번까지 (S7)
export function rateCheck(rate, ip, nowMs, max, windowMs) {
    const now = nowMs || Date.now(), lim = max || 5, win = windowMs || 3600000;
    const all = {};
    Object.entries(obj(rate)).forEach(([k, list]) => { const keep = arr(list).filter(t => now - Number(t) < win); if (keep.length) all[k] = keep; });
    const key = s(ip) || 'unknown';
    const mine = all[key] || [];
    if (mine.length >= lim) return { ok: false, rate: all };
    all[key] = mine.concat([now]);
    return { ok: true, rate: all };
}
// 상위업체 찾기(가입 화면) — 본사 · 파트너사의 상호만, 두 글자 이상 · 10곳까지
export function parentSearch(rows, kind, q) {
    const kw = s(q).replace(/\s+/g, '').toLowerCase();
    if (kw.length < 2 || !['hq', 'partner'].includes(kind)) return [];
    return arr(rows).filter(c => c && s(c.kind || c.custType) === kind && String(c.name || '').replace(/\s+/g, '').toLowerCase().includes(kw))
        .slice(0, 10).map(c => ({ id: s(c.id), name: s(String(c.name || '').replace(/\n/g, ' ')) }));
}

// 승인 — su: 가입 신청 · opts: { companyId(새 업체 번호 또는 연결할 기존 업체), existing(기존 업체 줄 또는 null), by, nowMs, firstOfCompany }
// 돌려주는 것: { company: 저장할 업체 자료, account, menus, signup: 고친 신청 }
export function approveSignup(su, opts) {
    const o = obj(opts);
    const now = new Date(o.nowMs || Date.now()).toISOString();
    const co = obj(su.company);
    const share = !!(su.consents && su.consents.parentShare);
    let company;
    if (o.existing) {
        // 기존 업체에 연결 — 업체 정보는 그대로 두고 동의 · 가입 기록만 더합니다
        company = Object.assign({}, o.existing, { consentParentShare: share || !!o.existing.consentParentShare, consentAt: share ? now : (o.existing.consentAt || ''), signupId: su.id });
    } else {
        company = {
            id: s(o.companyId), name: co.name, kind: su.kind, custType: su.kind, parentId: su.parentId || '',
            businessNo: co.businessNo, bizNo: co.businessNo, bizType: co.bizType, ceo: co.ceo,
            address: co.address, roadAddress: co.roadAddress || co.address, addressDetail: co.addressDetail || '', zipCode: co.zipCode || '',
            contactName: co.contactName, contact: co.contactName, phone: co.phone, email: co.email,
            status: '미거래', consentParentShare: share, consentAt: share ? now : '', signupId: su.id, createdBy: '회원가입',
            contractDoc: '', items: [], fee: { small: '', sme1: '', sme2: '', sme3: '', normal: '' }, pgAlias: [], memo: '', note: ''
        };
        if (['direct', 'franchise', 'partnerShop'].includes(su.kind)) Object.assign(company, { type: '잠재고객', grade: '일반', size: '중소기업', useYn: 'YES' });
    }
    const account = {
        id: su.loginId, loginId: su.loginId, partnerId: company.id, manager: co.contactName, phone: co.phone, memo: `회원가입 ${su.id}`,
        active: true, role: o.firstOfCompany ? 'admin' : 'staff', createdAt: now.slice(0, 10), createdBy: '회원가입', approvedBy: s(o.by), approvedAt: now,
        pwHash: su.pwHash, pwSalt: su.pwSalt, pwIter: su.pwIter, mustChangePw: false
    };
    const signup = Object.assign({}, su, { status: 'approved', decidedAt: now, decidedBy: s(o.by), companyId: company.id });
    delete signup.pwHash; delete signup.pwSalt; delete signup.pwIter;     // 비밀번호는 아이디로 옮겼으니 신청서에는 남기지 않습니다
    return { company, account, menus: PRESET_MENUS[presetForKind(su.kind)].slice(), signup };
}
export function rejectSignup(su, reason, by, nowMs) {
    const signup = Object.assign({}, su, { status: 'rejected', reason: s(reason).slice(0, 300), decidedAt: new Date(nowMs || Date.now()).toISOString(), decidedBy: s(by) });
    delete signup.pwHash; delete signup.pwSalt; delete signup.pwIter;
    return signup;
}
// 화면에 내려 줄 신청서 — 비밀번호 칸은 뺍니다
export function publicSignup(su) {
    const o = Object.assign({}, su);
    delete o.pwHash; delete o.pwSalt; delete o.pwIter;
    return o;
}
// 상위업체가 승인할 수 있는가 — 전체 스위치 · 그 업체의 '소속 가맹점 가입 승인' · 업체관리자 아이디 세 가지가 모두 켜져 있어야.
// isAdminEmail 을 주면 스위치와 업체 체크를 **켠 사람이 그룹웨어 관리자인지**도 봅니다 (2026-10-05 — 관리자만 켤 수 있게)
export function parentMayApprove(policy, company, acct, isAdminEmail) {
    const pol = obj(policy);
    if (!(pol.parentApprove && company && company.allowShopApproval === true && acct && acct.role === 'admin'
          && ['hq', 'partner'].includes(s(company.kind || company.custType)))) return false;
    if (typeof isAdminEmail === 'function' && !(isAdminEmail(pol.updatedByEmail) && isAdminEmail(company.allowShopApprovalBy))) return false;
    return true;
}
// 상위업체에게 보여 줄 신청서 — 그 업체 소속으로 낸 가맹점 신청만, 연락처는 제공 동의가 있을 때만
export function parentSignupView(signups, parentId) {
    return arr(signups).filter(x => x && x.status === 'pending' && s(x.parentId) === s(parentId)).map(x => ({
        id: x.id, at: x.at, kind: x.kind, loginId: x.loginId, name: s(x.company && x.company.name), address: s(x.company && x.company.address),
        contactName: x.consents && x.consents.parentShare ? s(x.company.contactName) : '', phone: x.consents && x.consents.parentShare ? s(x.company.phone) : ''
    }));
}
