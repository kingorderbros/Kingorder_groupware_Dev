/**
 * 인바운드 수집 — 외부 소스에서 문의를 가져오는 부분 (2026-10-08)
 *
 * 외주업체가 하던 「네이버 메일로 폼 알림 확인 → 구글 시트 기록 → 단톡방 공유」를 그룹웨어 인바운드 관리로 옮깁니다.
 * 실제 주소는 [[route]].js 의 /api/inbound/* 입니다. 이 파일은 소스마다 '가져와서 인입 건 모양으로 바꾸는 일' 만 합니다.
 *
 * 소스
 *   form    홈페이지 문의 폼 (킹오더닷컴 · 큐알킹 · 브랜드팩토리) — 사이트가 POST /api/inbound/form 으로 보냅니다
 *   mail    아임웹 입력폼 알림 메일 — 메일함(IMAP: 네이버 메일 · 지메일)에서 읽어 항목을 뽑습니다
 *   naver   네이버 검색 API — 블로그 · 카페 글 중 키워드(킹오더 · 큐알킹 …)가 들어간 글
 *   blog    네이버 블로그 RSS — 우리 블로그 글 목록 (댓글은 공개 API 가 없어 바로 가기 링크만)
 *   insta   인스타그램 그래프 API — 게시물 댓글 · DM
 *   sheet   구글 시트 CSV — 외주업체가 쓰던 시트 이관 (링크 공유가 켜져 있어야 합니다)
 *
 * 설정은 두 곳에 나눕니다.
 *   · 비밀이 아닌 값(메일 서버 · 아이디 · 키워드 · 허용 사이트 …) — app_store 의 gwInboundSources.v1 (화면에서 고침)
 *   · 비밀 값(메일 비밀번호 · 네이버 Client Secret · 인스타 토큰)  — Cloudflare 환경변수가 있으면 그것,
 *     없으면 inbound_secrets 표(supabase/schema-v7.sql · RLS 정책 없음 = 서버만 읽음). 화면에는 '넣었는지' 만 보입니다.
 *
 * 메일(IMAP)은 Cloudflare 의 TCP 소켓(cloudflare:sockets)을 씁니다. Node 시험에서는 connectFn 을 바꿔 끼웁니다.
 */

export const SOURCES_KEY = 'gwInboundSources.v1';
export const RECORDS_KEY = 'gwInboundRecords.v1';
export const AUTO_STATE_KEY = 'gwInboundAutoState.v1';

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

// 비밀 값 — 이름 · 환경변수 이름
export const SECRETS = {
    mailPassword:      { env: 'INBOUND_MAIL_PASSWORD',       label: '메일 비밀번호(앱 비밀번호)' },
    naverClientSecret: { env: 'INBOUND_NAVER_CLIENT_SECRET', label: '네이버 검색 API Client Secret' },
    igAccessToken:     { env: 'INBOUND_IG_ACCESS_TOKEN',     label: '인스타그램(메타) 액세스 토큰' },
};

// 화면 기본값과 같습니다 (index.html INBOUND_SOURCE_DEFAULTS)
export const DEFAULTS = {
    form:  { enabled: true, origins: ['https://xn--9m1bt07agwh.com', 'https://www.xn--9m1bt07agwh.com', 'https://qrking.co.kr', 'https://www.qrking.co.kr', 'https://kingorderbrandfactory.com', 'https://www.kingorderbrandfactory.com', 'http://localhost:4321', 'http://localhost:4322', 'http://localhost:4324'] },
    mail:  { host: 'imap.naver.com', port: 993, user: '', folder: 'INBOX', from: '', subject: '', sinceDays: 7, limit: 20 },
    naver: { clientId: '', kinds: ['cafearticle', 'blog'], keywords: ['킹오더', '큐알킹'], exclude: ['kingorder_b'], display: 20 },
    blog:  { blogId: 'kingorder_b' },
    insta: { igUserId: '', pageId: '', username: 'k1ngorder', apiVersion: 'v21.0' },
    sheet: { url: '' },
    auto:  { mail: false, insta: false, intervalMin: 10 },
    rules: { defaultDept: '영업', opsKeywords: ['AS', 'A/S', '고장', '안 됨', '안됨', '교체', '수리', '사용법', '설정 방법', '메뉴 수정', '메뉴 가격'], dupDays: 30, slaAssignMin: 30, slaContactMin: 120 },
};
export function withDefaults(saved) {
    const s = saved && typeof saved === 'object' ? saved : {};
    const out = {};
    Object.keys(DEFAULTS).forEach(k => { out[k] = Object.assign({}, DEFAULTS[k], s[k] || {}); });
    return out;
}

// ============================================================================
// 값 다듬기 — 화면(index.html)의 같은 이름 함수와 규칙이 같습니다
// ============================================================================
export function normPhone(v) {
    const d = str(v).replace(/\D/g, '');
    if (/^01\d{8,9}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    if (/^02\d{7,8}$/.test(d)) return d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : `02-${d.slice(2, 5)}-${d.slice(5)}`;
    if (/^0\d{9,10}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return str(v);
}
export function phoneLooksWrong(v) {
    const d = str(v).replace(/\D/g, '');
    if (!d) return false;
    if (/^01/.test(d)) return !/^01\d{8,9}$/.test(d);          // 휴대폰은 10 · 11자리
    return !/^0\d{8,10}$/.test(d);
}
// 사이트마다 다르게 쓴 서비스 이름 → 인바운드 서비스 유형 (INBOUND_SERVICES)
const SERVICE_ALIASES = [
    [/키오스크/, '키오스크'], [/qr\s*오더|큐알/i, 'QR오더'], [/테이블\s*오더/, '테이블오더'],
    [/포스|pos/i, '포스연동'], [/무인\s*결제/, '무인 결제 시스템'], [/냉장고|내장고/, '무인 냉장고'], [/패키지/, '전체 패키지 견적'],
];
export function normServices(list) {
    const out = [];
    (Array.isArray(list) ? list : str(list).split(/[,，·\/]/)).forEach(v => {
        const t = str(v); if (!t) return;
        const hit = SERVICE_ALIASES.find(([re]) => re.test(t));
        const name = hit ? hit[1] : '';
        if (name && !out.includes(name)) out.push(name);
    });
    return out;
}
const ROUTE_NAMES = ['검색광고', '블로그', 'SNS', '카페', '주변소개', '기타'];
export function normRoutes(list) {
    const out = [];
    (Array.isArray(list) ? list : str(list).split(/[,，]/)).forEach(v => {
        let t = str(v); if (!t) return;
        if (/sns|인스타|페이스북|메타/i.test(t)) t = 'SNS';
        if (!ROUTE_NAMES.includes(t)) t = '기타';
        if (!out.includes(t)) out.push(t);
    });
    return out;
}
// 실제 유입(UTM)으로 경로를 정합니다 — 고객이 고른 「알게 된 경로」는 참고(selfRoutes)로만 둡니다
export function routeFromSource(src, selfRoutes) {
    const s = str(src && src.utm_source).toLowerCase(), m = str(src && src.utm_medium).toLowerCase();
    if (/naver|google|daum|kakao/.test(s) && /cpc|ad|paid|sa/.test(m)) return '검색광고';
    if (s === 'blog' || /blog/.test(s)) return '블로그';
    if (s === 'cafe' || /cafe/.test(s)) return '카페';
    if (/instagram|facebook|meta|insta|sns|youtube/.test(s)) return 'SNS';
    if (str(src && src.keyword)) return '검색광고';
    const self = normRoutes(selfRoutes || []);
    return self[0] || '기타';
}
export function deptByRules(rec, rules) {
    const r = Object.assign({}, DEFAULTS.rules, rules || {});
    const text = [rec.requestNote, rec.company].join(' ');
    if ((r.opsKeywords || []).some(k => k && text.includes(k))) return '운영';
    return r.defaultDept === '운영' ? '운영' : (r.defaultDept === '영업' ? '영업' : '');
}
const pad2 = (n) => String(n).padStart(2, '0');
export function kstStamp(d) {
    const t = new Date((d instanceof Date ? d : new Date(d || Date.now())).getTime() + 9 * 3600 * 1000);
    if (isNaN(t)) return kstStamp(new Date());
    return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())} ${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}

// 인입 건 한 줄 — 기존 인바운드 자료 모양(외주업체 항목 + kob) 에 수집 항목을 덧붙입니다
export function makeRecord(f, rules) {
    const at = f.inAt || kstStamp(new Date());
    const rec = {
        id: '', inDate: at.slice(0, 10), inAt: at,
        routes: f.routes && f.routes.length ? f.routes : [f.route || '기타'],
        services: normServices(f.services || []), company: str(f.company), name: str(f.name), bizNo: str(f.bizNo),
        phone: normPhone(f.phone), email: str(f.email), firstContactAt: '', requestNote: str(f.message).slice(0, 4000),
        needs: [], vendor: '',
        channel: f.channel || 'etc', source: f.source || {}, selfRoutes: f.selfRoutes || [],
        raw: str(f.raw).slice(0, 6000), extKey: str(f.extKey), flags: [],
        createdAt: at.slice(0, 10), createdBy: f.createdBy || ('auto:' + (f.channel || '')),
        kob: { contactAt: '', salesStatus: '', result: '', failReason: '', owner: '', extras: [], dept: '' },
    };
    if (phoneLooksWrong(rec.phone)) rec.flags.push('연락처 확인 필요');
    if (!rec.requestNote) rec.flags.push('문의내용 없음');
    if (f.autoAssign !== false) rec.kob.dept = deptByRules(rec, rules);
    return rec;
}

// ============================================================================
// 홈페이지 폼 — 세 사이트의 항목 이름을 한데 모읍니다
//   킹오더닷컴 문의하기: company · name · email · phone · referral[] · business_types[] · interests[] · message
//   상담 팝업(ConsultPopup): name · phone · (types) · 상담 띠는 phone 만
//   큐알킹: name · phone · company · email · store_type · interests[] · message
//   브랜드팩토리: name · email · phone · inquiry_type · message
// ============================================================================
const FORM_LABELS = { kod_contact: '킹오더닷컴 · 문의하기', kod_popup: '킹오더닷컴 · 상담 팝업', kod_qr: '킹오더닷컴 · QR킹 폼', qrk_contact: '큐알킹 · 문의하기', bf_contact: '브랜드팩토리 · 문의하기' };
export function formChannel(site, form) {
    const s = str(site).toLowerCase(), f = str(form).toLowerCase();
    if (/qrking|큐알/.test(s)) return 'qrk_contact';
    if (/brand|팩토리/.test(s)) return 'bf_contact';
    if (/popup|bar|띠/.test(f)) return 'kod_popup';
    if (/qr/.test(f)) return 'kod_qr';
    return 'kod_contact';
}
export function formToRecord(body, rules) {
    const b = body && typeof body === 'object' ? body : {};
    const f = Object.assign({}, b, b.fields || {});
    const arr = (v) => (Array.isArray(v) ? v : (str(v) ? str(v).split(',') : []));
    const channel = formChannel(b.site, b.form);
    const src = {
        site: str(b.site), form: str(b.form), page: str(b.page), landing: str(b.landing), referrer: str(b.referrer),
        utm_source: str(b.utm_source), utm_medium: str(b.utm_medium), utm_campaign: str(b.utm_campaign), utm_term: str(b.utm_term),
        keyword: str(b.keyword || b.n_keyword || b.utm_term), device: str(b.device), label: FORM_LABELS[channel],
    };
    Object.keys(src).forEach(k => { if (!src[k]) delete src[k]; });
    const self = arr(f.referral || f['referral[]']);
    const services = arr(f.interests || f['interests[]']).concat(arr(f.types), arr(f.inquiry_type));
    const biz = arr(f.business_types || f['business_types[]']).concat(arr(f.store_type)).join(', ');
    const message = [str(f.message), biz ? `(업종: ${biz})` : ''].filter(Boolean).join('\n');
    const raw = Object.entries(f).filter(([k]) => !/^_|^fields$|privacy/.test(k) && !['site', 'form', 'page', 'landing', 'referrer'].includes(k) && !/^utm_|keyword/.test(k))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : str(v)}`).join('\n');
    return makeRecord({
        channel, inAt: kstStamp(new Date()), company: f.company, name: f.name, phone: f.phone, email: f.email,
        services, message, source: src, selfRoutes: normRoutes(self), route: routeFromSource(src, self),
        raw, extKey: str(b.submissionId) ? 'form:' + str(b.submissionId) : '', createdBy: 'form:' + channel,
    }, rules);
}

// ============================================================================
// 아임웹 입력폼 알림 메일 — 「항목 이름」 다음 줄에 「값」 이 오는 모양 (인입관리 분석/image.png)
//   등록자 비회원 / 등록위치 입력폼 / 등록시각 2026-09-30 14:35 / 응답 / 개인정보 수집동의 / 동의 / 작성자 / 신○○ / …
//   화면(index.html parseInboundNotifyText)과 같은 규칙입니다.
// ============================================================================
const NOTIFY_FIELDS = [
    ['at', ['등록시각', '작성일시', '접수일시']],
    ['name', ['작성자', '이름', '성함', '담당자명', '고객명']],
    ['company', ['업체명', '매장명', '상호', '상호명', '회사명', '기관명']],
    ['phone', ['연락처', '휴대폰', '휴대전화', '전화번호', '핸드폰', '휴대폰번호']],
    ['email', ['이메일', '이메일 주소', 'E-mail', 'email']],
    ['services', ['문의유형', '문의 유형', '관심 서비스', '관심서비스', '관심 제품', '상담 희망 제품', '관심 있는 서비스']],
    ['self', ['알게 된 경로', '어떻게 알게 되셨나요', '유입경로', '유입 경로', '방문 경로']],
    ['biz', ['업종', '매장형태', '매장 형태', '업태']],
    ['message', ['문의내용', '문의 내용', '문의사항', '내용', '요청사항', '메시지']],
    ['_skip', ['등록자', '등록위치', '응답', '개인정보 수집동의', '개인정보 수집 및 이용 동의', '개인정보 수집 및 이용에 동의합니다']],
];
const NOTIFY_LABELS = new Map();
NOTIFY_FIELDS.forEach(([k, list]) => list.forEach(l => NOTIFY_LABELS.set(l.replace(/\s/g, '').toLowerCase(), k)));
const labelKey = (line) => NOTIFY_LABELS.get(str(line).replace(/[\s:：]/g, '').toLowerCase());
export function parseNotifyText(text) {
    const lines = str(text).replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
    const out = { at: '', name: '', company: '', phone: '', email: '', services: '', self: '', biz: '', message: '' };
    let cur = null;
    for (const line of lines) {
        const k = labelKey(line);
        if (k) { cur = k === '_skip' ? null : k; continue; }
        // 「등록시각 2026-09-30 14:35」 처럼 한 줄에 같이 있는 경우
        const words = line.split(/\s+/);
        let hit = null;
        // 문의내용을 읽는 중에는 「내용 확인 부탁…」 같은 줄을 항목으로 오해하지 않도록 한 줄 짜리 항목은 보지 않습니다
        for (let n = Math.min(3, words.length - 1); cur !== 'message' && n >= 1 && !hit; n--) {
            const k2 = labelKey(words.slice(0, n).join(' '));
            if (k2) hit = { k: k2, v: words.slice(n).join(' ').replace(/^[:：]\s*/, '') };
        }
        if (hit) {
            cur = null;
            if (hit.k !== '_skip' && !out[hit.k]) out[hit.k] = hit.v;
            continue;
        }
        if (cur) out[cur] = out[cur] ? (cur === 'message' ? out[cur] + '\n' + line : out[cur]) : line;
        if (cur && cur !== 'message') cur = null;
    }
    const at = (out.at.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})\D+(\d{1,2}):(\d{2})/) || []);
    return {
        at: at.length ? `${at[1]}-${pad2(at[2])}-${pad2(at[3])} ${pad2(at[4])}:${at[5]}` : '',
        name: out.name, company: out.company, phone: out.phone, email: out.email,
        services: out.services, self: out.self, biz: out.biz, message: out.message,
    };
}
export function notifyToRecord(text, meta, rules) {
    const p = parseNotifyText(text);
    const site = /큐알|qrking/i.test(str(meta && meta.subject) + str(meta && meta.from)) ? '큐알킹'
        : /팩토리|brand/i.test(str(meta && meta.subject) + str(meta && meta.from)) ? '브랜드팩토리' : '킹오더닷컴';
    const message = [p.message, p.biz ? `(업종: ${p.biz})` : ''].filter(Boolean).join('\n');
    return makeRecord({
        channel: 'mail', inAt: p.at || (meta && meta.date ? kstStamp(meta.date) : ''), name: p.name, company: p.company,
        phone: p.phone, email: p.email, services: normServices(p.services), message,
        selfRoutes: normRoutes(p.self), route: normRoutes(p.self)[0] || '기타',
        source: { label: '아임웹 입력폼 알림 메일', site, mailSubject: str(meta && meta.subject), mailFrom: str(meta && meta.from) },
        raw: text, extKey: meta && meta.messageId ? 'mail:' + meta.messageId : '', createdBy: 'mail',
    }, rules);
}

// ============================================================================
// 메일 꺼내기 (MIME) — 머리 · 본문 · 여러 조각 · base64 · quoted-printable · 문자셋
// ============================================================================
const latin1 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; };
const fromLatin1 = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
function decodeBytes(bytes, charset) {
    const cs = str(charset).toLowerCase().replace(/^"|"$/g, '') || 'utf-8';
    try { return new TextDecoder(cs === 'ks_c_5601-1987' ? 'euc-kr' : cs).decode(bytes); }
    catch (e) { return new TextDecoder('utf-8').decode(bytes); }
}
function b64ToBytes(s) { const bin = atob(str(s).replace(/[^A-Za-z0-9+/=]/g, '')); return fromLatin1(bin); }
function qpToBytes(s) {
    const t = s.replace(/=\r?\n/g, '');
    const out = [];
    for (let i = 0; i < t.length; i++) {
        if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.substr(i + 1, 2))) { out.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; }
        else out.push(t.charCodeAt(i) & 255);
    }
    return new Uint8Array(out);
}
export function decodeHeader(v) {
    const s = str(v);
    if (!/=\?[^?]+\?[bqBQ]\?/.test(s)) return decodeBytes(fromLatin1(s), 'utf-8');     // 날 UTF-8 이 latin1 로 읽힌 경우
    return s.replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, cs, enc, txt) =>
        decodeBytes(enc.toUpperCase() === 'B' ? b64ToBytes(txt) : qpToBytes(txt.replace(/_/g, ' ')), cs));
}
function splitHead(s) {
    const i = s.search(/\r?\n\r?\n/);
    const head = i < 0 ? s : s.slice(0, i), body = i < 0 ? '' : s.slice(i).replace(/^\r?\n\r?\n/, '');
    const h = {};
    head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(line => {
        const j = line.indexOf(':'); if (j < 1) return;
        const k = line.slice(0, j).trim().toLowerCase(); if (!(k in h)) h[k] = line.slice(j + 1).trim();
    });
    return { h, body };
}
const param = (v, name) => { const m = str(v).match(new RegExp(name + '\\s*=\\s*("([^"]*)"|[^;\\s]+)', 'i')); return m ? (m[2] !== undefined ? m[2] : m[1]) : ''; };
export function htmlToText(html) {
    return str(html)
        .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d|table|section)>/gi, '\n').replace(/<\/t[dh]>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&')
        .split('\n').map(s => s.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}
// 원문(latin1 문자열) → { text, html }
function walkPart(s, acc) {
    const { h, body } = splitHead(s);
    const ct = str(h['content-type'] || 'text/plain').toLowerCase();
    if (ct.startsWith('multipart/')) {
        const bd = param(h['content-type'], 'boundary');
        if (!bd) return;
        body.split('--' + bd).slice(1).forEach(p => { if (!p.startsWith('--')) walkPart(p.replace(/^\r?\n/, ''), acc); });
        return;
    }
    if (!ct.startsWith('text/')) return;
    const te = str(h['content-transfer-encoding']).toLowerCase();
    const bytes = te === 'base64' ? b64ToBytes(body) : te === 'quoted-printable' ? qpToBytes(body) : fromLatin1(body);
    const txt = decodeBytes(bytes, param(h['content-type'], 'charset'));
    if (ct.startsWith('text/html')) { if (!acc.html) acc.html = txt; } else if (!acc.text) acc.text = txt;
}
export function parseMime(bytesOrString) {
    const s = typeof bytesOrString === 'string' ? bytesOrString : latin1(bytesOrString);
    const { h } = splitHead(s);
    const acc = { text: '', html: '' };
    walkPart(s, acc);
    let date = '';
    try { const d = new Date(h.date); if (!isNaN(d)) date = d.toISOString(); } catch (e) { /* 날짜 없음 */ }
    return {
        subject: decodeHeader(h.subject), from: decodeHeader(h.from), date,
        messageId: str(h['message-id']).replace(/[<>]/g, ''),
        // 아임웹 알림은 표로 된 HTML 이라 HTML 을 먼저 풀어 봅니다
        text: acc.html ? htmlToText(acc.html) : str(acc.text),
    };
}

// ============================================================================
// IMAP — 로그인 → 폴더 고르기 → 최근 메일 검색 → 원문 받기 (읽음 표시는 하지 않습니다: BODY.PEEK)
// ============================================================================
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const imapQuote = (s) => '"' + String(s).replace(/[\\"]/g, '\\$&') + '"';
export async function imapFetch(opt, connectFn, log) {
    const say = (m) => { if (log) log.push(m); };
    const sock = connectFn({ hostname: opt.host, port: Number(opt.port) || 993 }, { secureTransport: 'on', allowHalfOpen: false });
    const writer = sock.writable.getWriter(), reader = sock.readable.getReader();
    const enc = new TextEncoder();
    let buf = new Uint8Array(0);
    const more = async () => {
        const { value, done } = await reader.read();
        if (done) throw new Error('메일 서버가 연결을 끊었습니다.');
        const n = new Uint8Array(buf.length + value.length); n.set(buf); n.set(value, buf.length); buf = n;
    };
    const readLine = async () => {
        for (;;) {
            for (let i = 0; i + 1 < buf.length; i++) if (buf[i] === 13 && buf[i + 1] === 10) { const line = latin1(buf.subarray(0, i)); buf = buf.slice(i + 2); return line; }
            await more();
        }
    };
    const readBytes = async (n) => { while (buf.length < n) await more(); const out = buf.slice(0, n); buf = buf.slice(n); return out; };
    let tagN = 0;
    const cmd = async (text, shown) => {
        const tag = 'K' + (++tagN);
        say('> ' + tag + ' ' + (shown || text));
        await writer.write(enc.encode(`${tag} ${text}\r\n`));
        const lines = [];
        for (;;) {
            const line = await readLine();
            const m = line.match(/\{(\d+)\}$/);
            if (m) { lines.push({ line, lit: await readBytes(Number(m[1])) }); continue; }
            if (line.startsWith(tag + ' ')) {
                say('< ' + line.slice(0, 160));
                if (!/^\S+ OK/i.test(line)) throw new Error('메일 서버 응답: ' + line.replace(/^\S+\s+/, '').slice(0, 200));
                return lines;
            }
            lines.push({ line });
        }
    };
    const run = (async () => {
        const hello = await readLine();
        say('< ' + hello.slice(0, 120));
        await cmd(`LOGIN ${imapQuote(opt.user)} ${imapQuote(opt.password)}`, `LOGIN ${imapQuote(opt.user)} "********"`);
        await cmd(`SELECT ${imapQuote(opt.folder || 'INBOX')}`);
        const since = new Date(Date.now() - (Number(opt.sinceDays) || 7) * 86400000);
        const crit = `SINCE ${since.getUTCDate()}-${MONTHS[since.getUTCMonth()]}-${since.getUTCFullYear()}` + (str(opt.from) && /^[\x20-\x7e]+$/.test(opt.from) ? ` FROM ${imapQuote(opt.from)}` : '');
        const found = await cmd(`UID SEARCH ${crit}`);
        const uids = [];
        found.forEach(x => { const m = x.line.match(/^\* SEARCH\s*(.*)$/i); if (m) m[1].split(/\s+/).filter(Boolean).forEach(u => uids.push(u)); });
        const pick = uids.slice(-(Number(opt.limit) || 20));
        say(`검색 ${uids.length}통 · 가져올 것 ${pick.length}통`);
        const out = [];
        if (pick.length) {
            const got = await cmd(`UID FETCH ${pick.join(',')} (UID BODY.PEEK[])`);
            got.forEach(x => {
                if (!x.lit) return;
                const uid = (x.line.match(/UID (\d+)/i) || [])[1] || '';
                out.push(Object.assign({ uid }, parseMime(x.lit)));
            });
        }
        try { await writer.write(enc.encode('Z LOGOUT\r\n')); } catch (e) { /* 끝 */ }
        return out;
    })();
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('메일 서버 응답이 20초 넘게 없습니다.')), 20000));
    try { return await Promise.race([run, timeout]); }
    finally { try { sock.close(); } catch (e) { /* 이미 닫힘 */ } }
}
export async function cfConnect() {
    const m = await import('cloudflare:sockets');
    return m.connect;
}

// ============================================================================
// 네이버 검색 API · 블로그 RSS · 인스타그램 · 구글 시트
// ============================================================================
const stripTags = (s) => htmlToText(str(s).replace(/<\/?b>/g, ''));
export async function naverSearch(cfg, secret, fetchFn) {
    if (!str(cfg.clientId) || !secret) throw new Error('네이버 검색 API 의 Client ID · Client Secret 을 먼저 넣어 주세요.');
    const kinds = (cfg.kinds || []).filter(k => k === 'blog' || k === 'cafearticle');
    const words = (cfg.keywords || []).map(str).filter(Boolean);
    if (!kinds.length || !words.length) throw new Error('검색할 종류(블로그 · 카페)와 키워드를 하나 이상 골라 주세요.');
    const exclude = (cfg.exclude || []).map(s => str(s).toLowerCase()).filter(Boolean);
    const items = [], seen = new Set();
    for (const kind of kinds) for (const q of words) {
        const url = `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(q)}&display=${Math.min(100, Number(cfg.display) || 20)}&sort=date`;
        const res = await fetchFn(url, { headers: { 'X-Naver-Client-Id': str(cfg.clientId), 'X-Naver-Client-Secret': secret } });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`네이버 검색 API (${kind}) ${res.status}: ${j.errorMessage || j.message || ''}`);
        (j.items || []).forEach(it => {
            const link = str(it.link);
            if (!link || seen.has(link)) return;
            const who = str(it.bloggerlink || it.cafeurl || it.bloggername || it.cafename).toLowerCase();
            if (exclude.some(x => who.includes(x) || link.toLowerCase().includes(x))) return;
            seen.add(link);
            const pd = str(it.postdate);
            items.push({
                kind, keyword: q, link, title: stripTags(it.title), text: stripTags(it.description),
                writer: str(it.bloggername || it.cafename), date: /^\d{8}$/.test(pd) ? `${pd.slice(0, 4)}-${pd.slice(4, 6)}-${pd.slice(6)}` : '',
            });
        });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date));
}
export function mentionToRecord(it, rules) {
    const isCafe = it.kind === 'cafearticle';
    return makeRecord({
        channel: isCafe ? 'cafe' : 'blog', inAt: it.date ? it.date + ' 00:00' : '', name: it.writer,
        message: `[${isCafe ? '카페 글' : '블로그 글'}] ${it.title}\n${it.text}\n${it.link}`,
        route: isCafe ? '카페' : '블로그', source: { label: isCafe ? '네이버 카페 (검색 API)' : '네이버 블로그 (검색 API)', post: it.title, url: it.link, keyword: '', searchWord: it.keyword },
        raw: `${it.title}\n${it.text}\n${it.link}`, extKey: 'naver:' + it.link, createdBy: 'naver', autoAssign: false,
    }, rules);
}
export function parseRss(xml) {
    const items = [];
    (str(xml).match(/<item>[\s\S]*?<\/item>/g) || []).forEach(x => {
        const tag = (t) => { const m = x.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`)); return m ? m[1].trim() : ''; };
        const d = new Date(tag('pubDate'));
        items.push({ title: htmlToText(tag('title')), link: tag('link').replace(/\?fromRss.*$/, ''), date: isNaN(d) ? '' : kstStamp(d).slice(0, 10), text: htmlToText(tag('description')).slice(0, 200) });
    });
    return items;
}
export async function blogRss(blogId, fetchFn) {
    const id = str(blogId).replace(/[^A-Za-z0-9_-]/g, '');
    if (!id) throw new Error('블로그 아이디를 넣어 주세요 (blog.naver.com/ 다음 글자).');
    const res = await fetchFn(`https://rss.blog.naver.com/${id}.xml`, { headers: { 'User-Agent': 'kingorder-groupware' } });
    if (!res.ok) throw new Error('블로그 RSS ' + res.status);
    return parseRss(await res.text());
}
export async function instagramPull(cfg, token, fetchFn) {
    if (!token) throw new Error('인스타그램(메타) 액세스 토큰을 먼저 넣어 주세요.');
    const v = str(cfg.apiVersion) || 'v21.0', base = `https://graph.facebook.com/${v}`;
    const call = async (path) => {
        const res = await fetchFn(`${base}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error('메타 그래프 API: ' + ((j.error && j.error.message) || res.status));
        return j;
    };
    const me = str(cfg.username).toLowerCase();
    const items = [], notes = [];
    if (str(cfg.igUserId)) {
        const j = await call(`${encodeURIComponent(cfg.igUserId)}/media?fields=id,caption,permalink,timestamp,comments_count,comments.limit(20){id,text,username,timestamp}&limit=10`);
        (j.data || []).forEach(m => ((m.comments && m.comments.data) || []).forEach(c => {
            if (me && str(c.username).toLowerCase() === me) return;          // 우리가 단 답글은 뺍니다
            items.push({ kind: 'comment', id: c.id, who: c.username, text: c.text, at: c.timestamp, post: str(m.caption).slice(0, 40), link: m.permalink });
        }));
    } else notes.push('인스타그램 비즈니스 계정 ID 가 없어 댓글은 건너뛰었습니다.');
    if (str(cfg.pageId)) {
        try {
            const j = await call(`${encodeURIComponent(cfg.pageId)}/conversations?platform=instagram&fields=participants,messages.limit(5){id,message,from,created_time}&limit=10`);
            (j.data || []).forEach(cv => ((cv.messages && cv.messages.data) || []).forEach(msg => {
                const who = str((msg.from || {}).username || (msg.from || {}).name);
                if (me && who.toLowerCase() === me) return;
                if (!str(msg.message)) return;
                items.push({ kind: 'dm', id: msg.id, who, text: msg.message, at: msg.created_time, post: 'DM', link: '' });
            }));
        } catch (e) { notes.push('DM: ' + e.message + ' (instagram_manage_messages 권한이 필요합니다)'); }
    } else notes.push('페이스북 페이지 ID 가 없어 DM 은 건너뛰었습니다.');
    return { items: items.sort((a, b) => str(b.at).localeCompare(str(a.at))), notes };
}
export function instaToRecord(it, rules) {
    return makeRecord({
        channel: 'insta', inAt: it.at ? kstStamp(it.at) : '', name: it.who,
        message: `[${it.kind === 'dm' ? 'DM' : '댓글'}] ${str(it.text)}`, route: 'SNS',
        source: { label: it.kind === 'dm' ? '인스타그램 DM' : '인스타그램 댓글', post: it.post, url: it.link },
        raw: str(it.text), extKey: 'ig:' + it.kind + ':' + it.id, createdBy: 'insta', autoAssign: false,
    }, rules);
}
export function sheetCsvUrl(url) {
    const u = str(url);
    const id = (u.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/) || [])[1];
    if (!id) throw new Error('구글 시트 주소가 아닙니다. 주소창의 https://docs.google.com/spreadsheets/d/… 를 그대로 붙여 넣어 주세요.');
    const gid = (u.match(/[#&?]gid=(\d+)/) || [])[1] || '0';
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}
export function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    const t = str(text).replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
        if (c === '"') q = true;
        else if (c === ',') { row.push(cell); cell = ''; }
        else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(x => x.trim()));
}
export async function sheetPull(url, fetchFn) {
    const res = await fetchFn(sheetCsvUrl(url), { redirect: 'follow' });
    const text = await res.text();
    if (!res.ok || /^\s*<!DOCTYPE html/i.test(text)) throw new Error('시트를 읽지 못했습니다. 시트 [공유] 에서 「링크가 있는 모든 사용자 · 뷰어」 로 바꾼 뒤 다시 시도해 주세요.');
    return parseCsv(text);
}

// ============================================================================
// 인바운드 목록에 덧붙이기 (app_store 의 gwInboundRecords.v1)
//   화면의 kobStorage 는 목록을 저장할 때 서버의 최신 값 위에 자기 변경만 얹으므로(kob-store.js mergeLists)
//   여기서 넣은 건이 화면 저장에 지워지지 않습니다. 번호는 화면 번호(IN-0001)와 겹치지 않게 날짜를 붙입니다.
// ============================================================================
const digits = (v) => str(v).replace(/\D/g, '');
export function newId(at) {
    const a = new Uint32Array(1); crypto.getRandomValues(a);
    return 'IN-' + str(at).slice(2, 10).replace(/-/g, '') + '-' + (a[0] % 46656).toString(36).toUpperCase().padStart(3, '0');
}
export async function appendRecords(store, recs, rules) {
    const cur = (await store.storeValue(RECORDS_KEY)) || {};
    const records = Array.isArray(cur.records) ? cur.records : [];
    const keys = new Set(records.map(r => str(r.extKey)).filter(Boolean));
    const r = Object.assign({}, DEFAULTS.rules, rules || {});
    const added = [], skipped = [];
    recs.forEach(rec => {
        if (rec.extKey && keys.has(rec.extKey)) { skipped.push(rec.extKey); return; }
        // 같은 연락처로 최근 들어온 건 — 이전 담당 본부로 보내고 표시만 합니다 (합칠지는 사람이 정함)
        const d = digits(rec.phone);
        if (d.length >= 9) {
            const since = new Date(Date.now() - (Number(r.dupDays) || 30) * 86400000).toISOString().slice(0, 10);
            const prev = records.find(x => digits(x.phone) === d && str(x.inDate) >= since);
            if (prev) { rec.flags.push('재문의: ' + prev.id); rec.dupOf = prev.id; if (prev.kob && prev.kob.dept) rec.kob.dept = prev.kob.dept; }
        }
        rec.id = newId(rec.inAt);
        records.unshift(rec); added.push(rec);
        if (rec.extKey) keys.add(rec.extKey);
    });
    if (added.length) await store.setStore(RECORDS_KEY, Object.assign({}, cur, { records, seq: Number(cur.seq) || records.length + 1 }));
    return { added, skipped };
}

// ============================================================================
// 비밀 값 — 환경변수가 먼저, 없으면 inbound_secrets 표
// ============================================================================
export function secretStore(env) {
    const base = str(env.SUPABASE_URL).replace(/\/+$/, ''), key = str(env.SUPABASE_SERVICE_ROLE_KEY);
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const call = async (method, path, body, extra) => {
        const res = await fetch(`${base}/rest/v1/${path}`, { method, headers: Object.assign({}, headers, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) });
        if (!res.ok) {
            const t = await res.text();
            if (/inbound_secrets/.test(t) && /does not exist|not find|schema cache/i.test(t)) throw new Error('inbound_secrets 표가 없습니다. Supabase SQL Editor 에서 supabase/schema-v7.sql 을 먼저 실행해 주세요.');
            throw new Error(`Supabase ${method} ${path} → ${res.status} ${t}`);
        }
        const t = await res.text(); return t ? JSON.parse(t) : null;
    };
    return {
        all: async () => { const out = {}; ((await call('GET', 'inbound_secrets?select=name,value,updated_at,updated_by')) || []).forEach(r => { out[r.name] = r; }); return out; },
        put: (name, value, by) => call('POST', 'inbound_secrets', [{ name, value, updated_by: by || null, updated_at: new Date().toISOString() }], { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        drop: (name) => call('DELETE', `inbound_secrets?name=eq.${encodeURIComponent(name)}`, undefined, { Prefer: 'return=minimal' }),
    };
}
export async function readSecrets(env) {
    const out = {}, from = {};
    let table = {}, tableError = '';
    try { table = await secretStore(env).all(); } catch (e) { tableError = e.message; }
    Object.keys(SECRETS).forEach(n => {
        const ev = str(env[SECRETS[n].env]);
        if (ev) { out[n] = ev; from[n] = 'env'; }
        else if (table[n] && str(table[n].value)) { out[n] = str(table[n].value); from[n] = 'table'; }
        else from[n] = '';
    });
    return { values: out, from, table, tableError };
}

// ============================================================================
// 소스 하나 실행 — 미리보기(저장 안 함)와 자동 수집이 함께 씁니다
// ============================================================================
export async function runSource(source, cfg, secrets, deps) {
    const log = [];
    const fetchFn = deps.fetch || fetch;
    if (source === 'mail') {
        const m = cfg.mail;
        if (!str(m.host) || !str(m.user)) throw new Error('메일 서버와 아이디를 먼저 넣어 주세요.');
        if (!secrets.mailPassword) throw new Error('메일 비밀번호(앱 비밀번호)를 먼저 넣어 주세요.');
        const connectFn = deps.connect || await cfConnect();
        const mails = await imapFetch({ host: m.host, port: m.port, user: m.user, password: secrets.mailPassword, folder: m.folder, from: m.from, sinceDays: m.sinceDays, limit: m.limit }, connectFn, log);
        const subj = str(m.subject);
        const fromNonAscii = str(m.from) && !/^[\x20-\x7e]+$/.test(m.from) ? str(m.from) : '';
        const picked = mails.filter(x => (!subj || x.subject.includes(subj)) && (!fromNonAscii || x.from.includes(fromNonAscii)));
        if (picked.length !== mails.length) log.push(`제목 · 보낸 사람 조건으로 ${mails.length}통 중 ${picked.length}통`);
        return { log, items: picked.reverse().map(x => ({ title: x.subject, sub: `${x.from} · ${x.date ? kstStamp(x.date) : ''}`, text: x.text, record: notifyToRecord(x.text, x, cfg.rules) })) };
    }
    if (source === 'naver') {
        const list = await naverSearch(cfg.naver, secrets.naverClientSecret, fetchFn);
        log.push(`검색 결과 ${list.length}건 (제외 목록 적용 후)`);
        return { log, items: list.map(it => ({ title: it.title, sub: `${it.kind === 'cafearticle' ? '카페' : '블로그'} · ${it.writer} · ${it.date} · 키워드 「${it.keyword}」`, text: it.text, link: it.link, record: mentionToRecord(it, cfg.rules) })) };
    }
    if (source === 'blog') {
        const posts = await blogRss(cfg.blog.blogId, fetchFn);
        log.push(`글 ${posts.length}개`);
        return { log, posts };
    }
    if (source === 'insta') {
        const r = await instagramPull(cfg.insta, secrets.igAccessToken, fetchFn);
        r.notes.forEach(n => log.push(n));
        return { log, items: r.items.map(it => ({ title: `${it.kind === 'dm' ? 'DM' : '댓글'} · @${it.who}`, sub: `${it.post} · ${it.at ? kstStamp(it.at) : ''}`, text: it.text, link: it.link, record: instaToRecord(it, cfg.rules) })) };
    }
    if (source === 'sheet') {
        const rows = await sheetPull(cfg.sheet.url, fetchFn);
        log.push(`시트 ${rows.length}줄`);
        return { log, rows };
    }
    throw new Error('알 수 없는 소스입니다: ' + source);
}

// app_store 읽고 쓰기 — 예약 실행(worker.js)처럼 [[route]].js 의 db() 가 없는 곳에서 씁니다
export function appStore(env) {
    const base = str(env.SUPABASE_URL).replace(/\/+$/, ''), key = str(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!base || !key) throw new Error('SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    return {
        storeValue: async (k) => {
            const res = await fetch(`${base}/rest/v1/app_store?select=value&key=eq.${encodeURIComponent(k)}`, { headers });
            if (!res.ok) throw new Error('app_store 읽기 ' + res.status);
            const r = await res.json(); return r && r[0] ? r[0].value : null;
        },
        setStore: async (k, value) => {
            const res = await fetch(`${base}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, headers), body: JSON.stringify([{ key: k, value, updated_at: new Date().toISOString() }]) });
            if (!res.ok) throw new Error('app_store 쓰기 ' + res.status + ' ' + await res.text());
        },
    };
}

// 자동 수집 (worker.js 의 1분 예약 실행에서 부릅니다) — 설정에서 켠 소스만, 정한 간격마다
export async function autoPull(env, store, deps) {
    store = store || appStore(env);
    const cfg = withDefaults(await store.storeValue(SOURCES_KEY));
    const on = ['mail', 'insta'].filter(s => cfg.auto[s]);
    if (!on.length) return { ok: true, skipped: 'off' };
    const state = (await store.storeValue(AUTO_STATE_KEY)) || {};
    const gap = Math.max(5, Number(cfg.auto.intervalMin) || 10) * 60000;
    const due = on.filter(s => !state[s] || Date.now() - new Date(state[s].at).getTime() >= gap);
    if (!due.length) return { ok: true, skipped: 'not-due' };
    const { values } = await readSecrets(env);
    const out = {};
    for (const s of due) {
        try {
            const r = await runSource(s, cfg, values, deps || {});
            const recs = (r.items || []).map(x => x.record).filter(rec => rec.extKey);
            const { added, skipped } = await appendRecords(store, recs, cfg.rules);
            state[s] = { at: new Date().toISOString(), ok: true, added: added.length, skipped: skipped.length };
        } catch (e) {
            state[s] = { at: new Date().toISOString(), ok: false, error: String(e.message || e).slice(0, 300) };
        }
        out[s] = state[s];
    }
    await store.setStore(AUTO_STATE_KEY, state);
    return { ok: true, ran: out };
}
