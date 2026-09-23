/**
 * 구글 캘린더 연동 — 공통 부분 (2026-09-23)
 *
 * 파일 이름이 밑줄(_)로 시작합니다. Pages Functions 에서 밑줄로 시작하는 파일은 주소가 되지 않고
 * 다른 파일이 불러다 쓰는 모듈로만 쓰입니다. 실제 주소는 [[route]].js 의 /api/calendar/* 입니다.
 *
 * 구조 — 회사 구글 계정 **하나**가 캘린더를 전부 가집니다.
 *   · 공유 캘린더 4종(전사 · 영업진행 · 설치A/S · 부서별) + 직원마다 '킹오더 일정 – 홍길동'
 *   · 각 캘린더를 직원 구글 주소에 '변경 권한'으로 공유 → 직원 폰 기본 캘린더에 그대로 들어갑니다
 *   · 그래서 구글 허용(동의) 화면을 보는 사람은 관리자 한 명뿐입니다
 *
 * 환경변수 (Cloudflare › Settings › Variables and Secrets 의 Runtime)
 *   GOOGLE_CLIENT_ID       Google Cloud › 사용자 인증 정보 의 OAuth 클라이언트 ID
 *   GOOGLE_CLIENT_SECRET   같은 곳의 클라이언트 보안 비밀번호
 *
 * 표는 supabase/schema-v5.sql 의 gcal_account · gcal_calendars · gcal_links · gcal_state 입니다.
 * 넷 다 RLS 정책이 없어 브라우저에서는 못 보고, 여기(service_role)에서만 보입니다.
 */

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar';
const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

// ============================================================================
// 표 다루기 — Supabase REST
// ============================================================================
export function gcalStore(env) {
    const base = str(env.SUPABASE_URL).replace(/\/+$/, '');
    const key = str(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!base || !key) throw new Error('SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    const call = async (method, path, bodyObj, extra) => {
        const res = await fetch(`${base}/rest/v1/${path}`, {
            method, headers: Object.assign({}, headers, extra || {}),
            body: bodyObj === undefined ? undefined : JSON.stringify(bodyObj)
        });
        if (!res.ok) throw new Error(`Supabase ${method} ${path} → ${res.status} ${await res.text()}`);
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    };
    const one = async (path) => { const r = await call('GET', path); return r && r[0] ? r[0] : null; };
    const put = (table, row) => call('POST', table, [row], { Prefer: 'resolution=merge-duplicates,return=minimal' });

    return {
        call, one, put,

        // ---- 연결 증서 (한 줄) ----
        account: () => one('gcal_account?select=*&id=eq.main'),
        saveAccount: (row) => put('gcal_account', Object.assign({ id: 'main', updated_at: new Date().toISOString() }, row)),
        clearAccount: () => call('DELETE', 'gcal_account?id=eq.main', undefined, { Prefer: 'return=minimal' }),

        // ---- 연결 도중에 쓰는 임시 표식 (10분짜리) ----
        saveState: (state, who) => put('gcal_account', { id: 'oauth_state', refresh_token: state, connected_by: who, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
        takeState: async () => {
            const row = await one('gcal_account?select=*&id=eq.oauth_state');
            if (row) await call('DELETE', 'gcal_account?id=eq.oauth_state', undefined, { Prefer: 'return=minimal' });
            return row;
        },

        // ---- 캘린더 짝 ----
        calendars: () => call('GET', 'gcal_calendars?select=*&order=key.asc'),
        calendar: (k) => one(`gcal_calendars?select=*&key=eq.${encodeURIComponent(k)}`),
        saveCalendar: (row) => put('gcal_calendars', Object.assign({ updated_at: new Date().toISOString() }, row)),
        dropCalendar: (k) => call('DELETE', `gcal_calendars?key=eq.${encodeURIComponent(k)}`, undefined, { Prefer: 'return=minimal' }),

        // ---- 일정 짝 ----
        link: (kobId) => one(`gcal_links?select=*&kob_id=eq.${encodeURIComponent(kobId)}`),
        linkByEvent: (calId, evId) => one(`gcal_links?select=*&google_calendar_id=eq.${encodeURIComponent(calId)}&google_event_id=eq.${encodeURIComponent(evId)}`),
        saveLink: (row) => put('gcal_links', Object.assign({ updated_at: new Date().toISOString() }, row)),
        dropLink: (kobId) => call('DELETE', `gcal_links?kob_id=eq.${encodeURIComponent(kobId)}`, undefined, { Prefer: 'return=minimal' }),

        // ---- 받아오기 표식 ----
        syncState: (calId) => one(`gcal_state?select=*&google_calendar_id=eq.${encodeURIComponent(calId)}`),
        saveSyncState: (row) => put('gcal_state', Object.assign({ updated_at: new Date().toISOString() }, row)),

        // ---- 일정 본체 (schedules 표) ----
        schedule: async (id) => {
            const r = await one(`schedules?select=id,data,rev&id=eq.${encodeURIComponent(id)}`);
            return r ? Object.assign({ id: r.id }, r.data, { __rev: r.rev }) : null;
        },
        saveSchedule: (id, data, who) => put('schedules', { id, data, updated_by: str(who) || '구글 캘린더' }),
        dropSchedule: (id) => call('DELETE', `schedules?id=eq.${encodeURIComponent(id)}`, undefined, { Prefer: 'return=minimal' }),

        // ---- 설정값 (사용자 목록 · 부서 등) ----
        storeValue: async (k) => {
            const r = await one(`app_store?select=value&key=eq.${encodeURIComponent(k)}`);
            return r ? r.value : null;
        }
    };
}

// ============================================================================
// 구글 허용(OAuth)
// ============================================================================
export function redirectUriOf(request) {
    return new URL(request.url).origin + '/api/calendar/callback';
}

export function oauthUrl(env, redirectUri, state) {
    const id = str(env.GOOGLE_CLIENT_ID);
    if (!id) throw new Error('GOOGLE_CLIENT_ID 환경변수가 없습니다.');
    const q = new URLSearchParams({
        client_id: id,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPE,
        access_type: 'offline',      // 다시 들어갈 때 쓸 증서(refresh token)를 받습니다
        prompt: 'consent',           // 이미 허용했어도 증서를 다시 줍니다
        include_granted_scopes: 'true',
        state
    });
    return `${OAUTH_AUTH}?${q.toString()}`;
}

async function tokenCall(env, params) {
    const id = str(env.GOOGLE_CLIENT_ID), secret = str(env.GOOGLE_CLIENT_SECRET);
    if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET 환경변수가 없습니다.');
    const res = await fetch(OAUTH_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(Object.assign({ client_id: id, client_secret: secret }, params)).toString()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`구글 인증 실패 (${res.status}) ${data.error_description || data.error || ''}`);
    return data;
}

// 허용 직후 돌려받은 code 를 증서로 바꿉니다.
export async function exchangeCode(env, redirectUri, code) {
    return tokenCall(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

// 증서로 한 시간짜리 출입증(access token)을 받습니다. 같은 Worker 안에서는 잠시 기억해 둡니다.
let tokenCache = { value: '', until: 0 };
export async function accessToken(env, store) {
    if (tokenCache.value && Date.now() < tokenCache.until) return tokenCache.value;
    const acc = await store.account();
    if (!acc || !acc.refresh_token) { const e = new Error('구글 계정이 아직 연결되지 않았습니다.'); e.code = 'not-connected'; throw e; }
    const data = await tokenCall(env, { grant_type: 'refresh_token', refresh_token: acc.refresh_token });
    tokenCache = { value: data.access_token, until: Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1000 };
    return tokenCache.value;
}
export function forgetToken() { tokenCache = { value: '', until: 0 }; }

// ============================================================================
// 구글 캘린더 API 부르기
// ============================================================================
export async function gapi(env, store, method, path, bodyObj) {
    const token = await accessToken(env, store);
    const res = await fetch(`${CAL_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: bodyObj === undefined ? undefined : JSON.stringify(bodyObj)
    });
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
    if (!res.ok) {
        const e = new Error((data && data.error && (data.error.message || data.error.status)) || `구글 캘린더 ${method} ${path} → ${res.status}`);
        e.status = res.status;
        e.googleReason = data && data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason;
        throw e;
    }
    return data;
}

const enc = encodeURIComponent;

// 캘린더 만들기
export const createCalendar = (env, store, summary, description) =>
    gapi(env, store, 'POST', '/calendars', { summary, description: description || '', timeZone: 'Asia/Seoul' });

// 캘린더 이름 고치기
export const renameCalendar = (env, store, calId, summary) =>
    gapi(env, store, 'PATCH', `/calendars/${enc(calId)}`, { summary });

// 사람에게 공유 (role: reader 보기만 / writer 변경 가능)
export const shareCalendar = (env, store, calId, email, role) =>
    gapi(env, store, 'POST', `/calendars/${enc(calId)}/acl?sendNotifications=true`,
        { role: role || 'writer', scope: { type: 'user', value: email } });

export const unshareCalendar = (env, store, calId, email) =>
    gapi(env, store, 'DELETE', `/calendars/${enc(calId)}/acl/${enc('user:' + email)}`);

export const listAcl = (env, store, calId) => gapi(env, store, 'GET', `/calendars/${enc(calId)}/acl`);

// 일정
export const insertEvent = (env, store, calId, ev) =>
    gapi(env, store, 'POST', `/calendars/${enc(calId)}/events?sendUpdates=all`, ev);
export const patchEvent = (env, store, calId, evId, ev) =>
    gapi(env, store, 'PATCH', `/calendars/${enc(calId)}/events/${enc(evId)}?sendUpdates=all`, ev);
export const deleteEvent = (env, store, calId, evId) =>
    gapi(env, store, 'DELETE', `/calendars/${enc(calId)}/events/${enc(evId)}?sendUpdates=all`);
export const getEvent = (env, store, calId, evId) =>
    gapi(env, store, 'GET', `/calendars/${enc(calId)}/events/${enc(evId)}`);

// 바뀐 것만 받아오기. 표식(syncToken)이 없으면 오늘 기준 앞뒤로 훑습니다.
export async function listChanges(env, store, calId, syncToken) {
    const q = new URLSearchParams({ maxResults: '250', showDeleted: 'true', singleEvents: 'true' });
    if (syncToken) q.set('syncToken', syncToken);
    else {
        const from = new Date(); from.setMonth(from.getMonth() - 3);
        q.set('timeMin', from.toISOString());
    }
    let page = '', items = [], next = null, guard = 0;
    do {
        if (page) q.set('pageToken', page); else q.delete('pageToken');
        const r = await gapi(env, store, 'GET', `/calendars/${enc(calId)}/events?${q.toString()}`);
        items = items.concat(r.items || []);
        page = r.nextPageToken || '';
        next = r.nextSyncToken || next;
    } while (page && ++guard < 20);
    return { items, syncToken: next };
}

// ============================================================================
// 그룹웨어 일정 ↔ 구글 일정 옮기기 (2026-09-23)
// ============================================================================

// 화면의 참석 응답과 구글의 응답을 맞춥니다
const TO_GOOGLE_RSVP = { pending: 'needsAction', accepted: 'accepted', declined: 'declined', tentative: 'tentative' };
const FROM_GOOGLE_RSVP = { needsAction: 'pending', accepted: 'accepted', declined: 'declined', tentative: 'tentative' };

// 서울 시각으로 날짜·시각을 뽑습니다. 폰이 다른 시간대에서 만들어도 우리 쪽은 늘 한국 시각입니다.
const seoulFmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
});
function seoulParts(iso) {
    const t = seoulFmt.format(new Date(iso));       // 'YYYY-MM-DD HH:MM'
    return { date: t.slice(0, 10), time: t.slice(11, 16) };
}
const addDay = (ymd, n) => {
    const d = new Date(ymd + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const addHour = (hm, n) => {
    const [h, m] = str(hm).split(':').map(v => parseInt(v, 10) || 0);
    return String(Math.min(23, h + n)).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};

// 내용이 바뀌었는지만 가리면 되므로 짧은 셈으로 충분합니다
function hashOf(obj) {
    const s = JSON.stringify(obj);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36) + '-' + s.length;
}

// 사람 찾기 — 이름 ↔ 구글 주소
export async function buildContext(env, store) {
    const users = (await store.storeValue('gwUsers.v1')) || [];
    const list = Array.isArray(users) ? users : [];
    const byName = new Map(), byGoogle = new Map(), byEmail = new Map();
    list.forEach(u => {
        const g = str(u.googleEmail).toLowerCase();
        if (str(u.name)) byName.set(str(u.name), u);
        if (str(u.email)) byEmail.set(str(u.email).toLowerCase(), u);
        if (g) byGoogle.set(g, u);
    });
    const cals = (await store.calendars()) || [];
    return {
        users: list, byName, byGoogle, byEmail,
        calByKey: new Map(cals.map(c => [c.key, c])),
        calById: new Map(cals.filter(c => c.google_calendar_id).map(c => [c.google_calendar_id, c])),
        googleOf: (name) => str((byName.get(str(name)) || {}).googleEmail).toLowerCase(),
        nameOfGoogle: (email) => str((byGoogle.get(str(email).toLowerCase()) || {}).name)
    };
}

// 이 일정이 어느 구글 캘린더로 가야 하는지
export function calendarKeyOf(s, ctx) {
    const kind = str(s.calendar) || 'team';
    if (kind === 'personal') {
        const u = ctx.byName.get(str(s.salesperson));
        return u ? 'cal:personal:' + str(u.email).toLowerCase() : '';
    }
    if (kind === 'team') return 'cal:team:' + (str(s.dept) || 'sales');
    return 'cal:' + kind;                       // company · sales-share · install-as
}

// 그룹웨어 일정 → 구글 일정
export function toGoogleEvent(s, ctx) {
    const date = str(s.date);
    const allDay = !!s.allDay || !str(s.startTime);
    const ev = {
        summary: str(s.title) || '(제목 없음)',
        description: str(s.description),
        start: allDay ? { date } : { dateTime: `${date}T${str(s.startTime)}:00`, timeZone: 'Asia/Seoul' },
        end: allDay ? { date: addDay(date, 1) }
                    : { dateTime: `${date}T${str(s.endTime) || addHour(s.startTime, 1)}:00`, timeZone: 'Asia/Seoul' },
        extendedProperties: { private: { kobId: str(s.id), kobCal: str(s.calendar), kobDept: str(s.dept), kobType: str(s.type), kobProgress: str(s.progress) } }
    };
    const atts = (Array.isArray(s.attendees) ? s.attendees : [])
        .map(a => ({ email: ctx.googleOf(a.name), responseStatus: TO_GOOGLE_RSVP[str(a.status)] || 'needsAction' }))
        .filter(a => a.email);
    if (atts.length) ev.attendees = atts;
    return ev;
}

// 구글 일정 → 그룹웨어 일정 (있던 값은 지키고 바뀐 것만 덮습니다)
export function fromGoogleEvent(ev, calRow, before, ctx) {
    const s = Object.assign({}, before || {});
    s.title = str(ev.summary) || '(제목 없음)';
    s.description = str(ev.description);

    if (ev.start && ev.start.date) {                     // 종일
        s.allDay = true; s.date = str(ev.start.date); s.startTime = ''; s.endTime = '';
    } else if (ev.start && ev.start.dateTime) {
        const a = seoulParts(ev.start.dateTime);
        const b = ev.end && ev.end.dateTime ? seoulParts(ev.end.dateTime) : null;
        s.allDay = false; s.date = a.date; s.startTime = a.time;
        s.endTime = b && b.date === a.date ? b.time : '';
    }

    // 어느 캘린더에서 왔는지로 소속을 정합니다
    const kind = str(calRow.kind);
    if (!before) {
        s.calendar = kind === 'team' ? 'team' : (kind === 'personal' ? 'personal' : kind);
        s.dept = kind === 'team' ? str(calRow.dept) : (str(calRow.dept) || 'company');
        s.type = s.type || 'other';
        s.progress = s.progress || '';
        if (kind === 'personal') {
            const owner = ctx.byEmail.get(str(calRow.member_email).toLowerCase());
            s.salesperson = owner ? str(owner.name) : '';
        } else {
            s.salesperson = str(ctx.nameOfGoogle((ev.creator && ev.creator.email) || '')) || '';
        }
        s.fromGoogle = true;                              // 폰에서 만든 일정이라는 표시
    }

    // 참석 응답 — 구글에서 누른 것을 가져옵니다
    if (Array.isArray(ev.attendees) && ev.attendees.length) {
        const known = Array.isArray(s.attendees) ? s.attendees : [];
        s.attendees = ev.attendees.map(a => {
            const name = ctx.nameOfGoogle(a.email);
            const old = known.find(k => k.name === name) || {};
            return Object.assign({}, old, { name: name || str(a.email), status: FROM_GOOGLE_RSVP[str(a.responseStatus)] || 'pending' });
        }).filter(a => a.name);
    }
    return s;
}

const newScheduleId = () => 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

// ---------------------------------------------------------------------------
// 그룹웨어 → 구글
//   지난번 이후 바뀐 일정만 보냅니다. 표식은 gcal_state 의 '__push' 줄에 둡니다.
// ---------------------------------------------------------------------------
export async function syncPush(env, store, ctx) {
    const mark = await store.syncState('__push');
    const since = (mark && mark.sync_token) || '1970-01-01T00:00:00Z';
    const startedAt = new Date().toISOString();
    const out = { sent: 0, created: 0, deleted: 0, skipped: 0, errors: [] };

    const rows = await store.call('GET', `schedules?select=id,data,updated_at&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc&limit=300`);
    for (const r of (rows || [])) {
        const s = Object.assign({ id: r.id }, r.data);
        try {
            const key = calendarKeyOf(s, ctx);
            const cal = key && ctx.calByKey.get(key);
            if (!cal || !cal.google_calendar_id) { out.skipped++; continue; }     // 아직 안 만든 캘린더

            const ev = toGoogleEvent(s, ctx);
            const hash = hashOf(ev);
            const link = await store.link(s.id);
            if (link && link.content_hash === hash) { out.skipped++; continue; }  // 안 바뀜 (되돌이 방지)

            if (link && link.google_calendar_id === cal.google_calendar_id) {
                await patchEvent(env, store, cal.google_calendar_id, link.google_event_id, ev);
                out.sent++;
            } else {
                if (link) await deleteEvent(env, store, link.google_calendar_id, link.google_event_id).catch(() => {});  // 캘린더가 바뀐 일정
                const made = await insertEvent(env, store, cal.google_calendar_id, ev);
                await store.saveLink({ kob_id: s.id, google_calendar_id: cal.google_calendar_id, google_event_id: made.id, content_hash: hash, gcal_updated: made.updated, last_dir: 'push' });
                out.created++;
                continue;
            }
            await store.saveLink({ kob_id: s.id, google_calendar_id: cal.google_calendar_id, google_event_id: link.google_event_id, content_hash: hash, last_dir: 'push' });
        } catch (e) {
            out.errors.push({ id: s.id, error: e.message });
        }
    }

    // 그룹웨어에서 지운 일정 → 구글에서도 지웁니다
    try {
        const ids = new Set(((await store.call('GET', 'schedules?select=id&limit=5000')) || []).map(x => x.id));
        const links = (await store.call('GET', 'gcal_links?select=kob_id,google_calendar_id,google_event_id&limit=5000')) || [];
        for (const l of links) {
            if (ids.has(l.kob_id)) continue;
            await deleteEvent(env, store, l.google_calendar_id, l.google_event_id).catch(() => {});
            await store.dropLink(l.kob_id);
            out.deleted++;
        }
    } catch (e) { out.errors.push({ id: '(삭제 확인)', error: e.message }); }

    await store.saveSyncState({ google_calendar_id: '__push', sync_token: startedAt, last_sync_at: startedAt, last_error: out.errors.length ? out.errors[0].error : null });
    return out;
}

// ---------------------------------------------------------------------------
// 구글 → 그룹웨어
//   캘린더마다 "지난번 이후 바뀐 것만" 받아 옵니다.
// ---------------------------------------------------------------------------
export async function syncPull(env, store, ctx) {
    const out = { added: 0, updated: 0, deleted: 0, skipped: 0, errors: [] };
    const cals = (await store.calendars() || []).filter(c => c.google_calendar_id);

    for (const cal of cals) {
        const calId = cal.google_calendar_id;
        try {
            const st = await store.syncState(calId);
            let res;
            try { res = await listChanges(env, store, calId, st && st.sync_token); }
            catch (e) {
                if (e.status !== 410) throw e;
                res = await listChanges(env, store, calId, null);      // 표식이 낡으면 처음부터 다시
            }

            for (const ev of res.items) {
                const link = await store.linkByEvent(calId, ev.id);

                if (str(ev.status) === 'cancelled') {                  // 폰에서 지웠습니다
                    if (link) { await store.dropSchedule(link.kob_id); await store.dropLink(link.kob_id); out.deleted++; }
                    else out.skipped++;
                    continue;
                }

                const before = link ? await store.schedule(link.kob_id) : null;
                const kobId = link ? link.kob_id : ((ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.kobId) || newScheduleId());
                const s = fromGoogleEvent(ev, cal, before, ctx);
                s.id = kobId;

                const hash = hashOf(toGoogleEvent(s, ctx));
                if (link && link.content_hash === hash) { out.skipped++; continue; }   // 방금 우리가 보낸 것

                const data = Object.assign({}, s); delete data.id; delete data.__rev;
                await store.saveSchedule(kobId, data, '구글 캘린더');
                await store.saveLink({ kob_id: kobId, google_calendar_id: calId, google_event_id: ev.id, content_hash: hash, gcal_updated: ev.updated, last_dir: 'pull' });
                if (before) out.updated++; else out.added++;
            }

            await store.saveSyncState({ google_calendar_id: calId, sync_token: res.syncToken || (st && st.sync_token) || null, last_sync_at: new Date().toISOString(), last_error: null });
        } catch (e) {
            out.errors.push({ calendar: cal.key, error: e.message });
            await store.saveSyncState({ google_calendar_id: calId, last_error: e.message, last_sync_at: new Date().toISOString() }).catch(() => {});
        }
    }
    return out;
}

// 둘 다 — 보내고 나서 받아옵니다 (1분마다 도는 예약 실행이 이것을 부릅니다)
export async function syncBoth(env) {
    const store = gcalStore(env);
    const acc = await store.account();
    if (!acc || !acc.refresh_token) return { ok: false, error: '구글 계정이 연결되지 않았습니다.' };
    const ctx = await buildContext(env, store);
    const push = await syncPush(env, store, ctx);
    const pull = await syncPull(env, store, ctx);
    return { ok: true, push, pull };
}

// 연결된 구글 계정 주소 — userinfo 는 범위가 달라 못 읽으므로 캘린더 쪽에서 가져옵니다
export async function connectedEmail(env, store) {
    const r = await gapi(env, store, 'GET', '/calendars/primary');
    return str(r && r.id);
}
