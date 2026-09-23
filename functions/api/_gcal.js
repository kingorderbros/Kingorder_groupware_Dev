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
