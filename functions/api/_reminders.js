/**
 * 일정 알림 (2026-10-23) — 일정에 '15분 전' 같은 알림을 정해 두면, 그 시각에 그룹웨어 알림함과 폰 · PC 푸시로 알립니다.
 *
 * worker.js 의 scheduled(1분마다)가 runScheduleReminders(env) 를 부릅니다. 그룹웨어를 닫아 두어도 옵니다.
 *
 *   · 알림 시각: 시간이 있는 일정은 시작 시각 기준(15분 · 30분 · 1일 · 3일 · 1주 전), '당일 오전'은 그날 08:30.
 *     종일 일정은 그날 09:00 을 시작으로 봅니다. 모든 시각은 한국 시간(UTC+9, 서머타임 없음)입니다.
 *   · 받는 사람: 일정 담당자(salesperson) · 등록한 사람(createdBy 메일) · 참석자(거부한 사람 제외).
 *   · 반복 일정은 그 회차마다 알립니다 (화면 recurDates 와 같은 규칙).
 *   · 업무 접수로 저절로 만든 일정(fromWork.auto)은 사람이 알림을 고른 것이 아니라 알리지 않습니다.
 *   · 같은 알림이 두 번 가지 않게 알림 번호를 '일정 · 회차 · 종류 · 받는 사람' 으로 정해 notifications 표에 넣고,
 *     이미 있으면(ignore-duplicates) 건너뜁니다. 서버가 몇 분 늦게 돌아도 10분 안이면 따라잡습니다.
 *
 * 판단(시각 계산 · 받는 사람)은 순수 함수로 두어 tools/test-reminders.js 가 가짜 자료로 시험합니다.
 */
import * as push from './_push.js';

export const KST_OFFSET_MIN = 9 * 60;
export const CATCH_UP_MIN = 10;                 // 서버가 늦게 돌아도 이만큼 지난 알림까지는 보냄
const MAX_PUSH_PER_RUN = 20;                    // 한 번에 보낼 푸시 수 — Workers 하위 요청 한도(무료 50) 안에서, 구글 캘린더 동기화 몫을 남김

// 알림 종류 → { before: 시작 몇 분 전 } 또는 { atDay: 그날 몇 시 }
export const REMINDER_RULES = {
    '15min':  { before: 15,          label: '15분 전' },
    '30min':  { before: 30,          label: '30분 전' },
    '1hour':  { before: 60,          label: '1시간 전' },
    sameday:  { atDay: '08:30',      label: '당일 오전' },
    '1day':   { before: 24 * 60,     label: '1일 전' },
    '3day':   { before: 3 * 24 * 60, label: '3일 전' },
    '1week':  { before: 7 * 24 * 60, label: '1주일 전' }
};

const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' + 'HH:MM'(한국 시간) → UTC 밀리초
export function kstMillis(date, time) {
    const [y, m, d] = s(date).split('-').map(Number);
    const [hh, mm] = (s(time) || '00:00').split(':').map(Number);
    if (!y || !m || !d) return NaN;
    return Date.UTC(y, m - 1, d, hh || 0, mm || 0) - KST_OFFSET_MIN * 60000;
}
// UTC 밀리초 → 한국 날짜 'YYYY-MM-DD'
export function kstDate(ms) {
    const t = new Date(ms + KST_OFFSET_MIN * 60000);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
const addDays = (date, n) => kstDate(kstMillis(date, '12:00') + n * 86400000);

// 이 회차(date)의 시작 시각과 알림 시각
export function reminderTimes(sch, date) {
    const rule = REMINDER_RULES[s(sch && sch.reminder)];
    if (!rule) return null;
    const timed = !sch.allDay && /^\d{1,2}:\d{2}$/.test(s(sch.startTime));
    const start = kstMillis(date, timed ? sch.startTime : '09:00');
    if (!isFinite(start)) return null;
    const at = rule.atDay ? kstMillis(date, rule.atDay) : start - rule.before * 60000;
    return { start, at, rule };
}

// 반복 일정의 회차 날짜 (화면 recurDates 와 같은 규칙) — from ~ to 사이, 지운 날 제외
export function recurDates(sch, from, to) {
    const r = sch && sch.recur;
    const FREQS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
    if (!r || FREQS.indexOf(r.freq) < 0 || !sch.date) return [];
    const out = [];
    const [y0, m0, d0] = sch.date.split('-').map(Number);
    const dayOf = (k) => new Date(kstMillis(k, '12:00') + KST_OFFSET_MIN * 60000).getUTCDay();
    const n = r.freq === 'weekdays' ? 1 : Math.max(1, Number(r.interval) || 1);
    const until = r.end === 'until' && r.until ? r.until : '';
    const maxCount = r.end === 'count' ? Math.max(1, Number(r.count) || 1) : Infinity;
    const ex = new Set(r.exdates || []);
    let count = 0, guard = 0;
    const take = (k) => {
        if (k < sch.date) return true;
        if (until && k > until) return false;
        if (count >= maxCount) return false;
        count++;
        if (k > to) return false;
        if (k >= from && !ex.has(k)) out.push(k);
        return true;
    };
    if (r.freq === 'daily' || r.freq === 'weekdays') {
        for (let k = sch.date; guard++ < 20000; k = addDays(k, n)) {
            const wd = dayOf(k);
            if (r.freq === 'weekdays' && (wd === 0 || wd === 6)) continue;
            if (!take(k)) break;
        }
    } else if (r.freq === 'weekly') {
        const days = (r.days || []).length ? r.days.map(Number).sort((a, b) => a - b) : [dayOf(sch.date)];
        const week0 = addDays(sch.date, -dayOf(sch.date));
        outer: for (let w = 0; guard++ < 5000; w += n) {
            for (const wd of days) { if (!take(addDays(week0, w * 7 + wd))) break outer; }
        }
    } else {
        const step = r.freq === 'monthly' ? n : n * 12;
        for (let i = 0; guard++ < 3000; i += step) {
            const t = new Date(Date.UTC(y0, m0 - 1 + i, d0));
            if (t.getUTCDate() !== d0) continue;          // 그 달에 없는 날은 건너뜀
            if (!take(`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`)) break;
        }
    }
    return out;
}

// 지금(now) 보내야 할 알림 — [{ sch, date, start, at, rule }]
export function dueReminders(list, now) {
    const lo = now - CATCH_UP_MIN * 60000;
    const out = [];
    // 알림이 가장 이른 것은 1주 전이므로, 오늘부터 8일 뒤까지의 회차만 봅니다
    const from = kstDate(now - 86400000), to = kstDate(now + 8 * 86400000);
    (list || []).forEach(sch => {
        if (!sch || !REMINDER_RULES[s(sch.reminder)]) return;
        if (sch.fromWork && sch.fromWork.auto) return;
        if (s(sch.reminder) === 'sameday' && sch.reminderPicked !== true) return;   // '당일 오전' 은 사람이 직접 고른 것만 (기본값으로 들어간 것 제외 · 2026-10-28)   // 업무 접수로 저절로 만든 일정은 기본값('당일 오전')이 걸려 있어 알리지 않음 — 사람이 정한 알림만
        const dates = (sch.recur && sch.recur.freq) ? recurDates(sch, from, to) : [s(sch.date)];
        dates.forEach(date => {
            const t = reminderTimes(sch, date);
            if (!t) return;
            if (t.at > lo && t.at <= now && t.start >= t.at) out.push(Object.assign({ sch, date }, t));
        });
    });
    return out;
}

// 받는 사람 이름 — 담당자 · 등록한 사람 · 참석자(거부 제외). 퇴사자는 뺍니다.
export function reminderRecipients(sch, users) {
    const all = Array.isArray(users) ? users : [];
    const live = (n) => { const u = all.find(x => x && x.name === n); return !u || u.resigned !== true; };
    const names = new Set();
    if (s(sch.salesperson)) names.add(s(sch.salesperson));
    const by = s(sch.createdBy).toLowerCase();
    if (by) { const u = all.find(x => x && s(x.email).toLowerCase() === by); if (u && u.name) names.add(u.name); }
    (sch.attendees || []).forEach(a => { if (a && s(a.name) && a.status !== 'declined') names.add(s(a.name)); });
    return Array.from(names).filter(live);
}

// 알림 한 건 (notifications 표의 data)
export function reminderNotification(item, toUser) {
    const sch = item.sch;
    const hm = (ms) => { const t = new Date(ms + KST_OFFSET_MIN * 60000); return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`; };
    const timed = !sch.allDay && s(sch.startTime);
    const when = timed ? `${item.date} ${s(sch.startTime)}${s(sch.endTime) ? '~' + s(sch.endTime) : ''}` : `${item.date} 종일`;
    const id = ['srem', s(sch.id), item.date, s(sch.reminder), toUser].join('_').replace(/[^0-9A-Za-z가-힣_\-]/g, '').slice(0, 180);
    return {
        id,
        type: 'schedule-reminder',
        title: s(sch.title) || '일정',
        toUser, toDept: '', toTeam: '',
        detail: `${item.rule.label} 알림 · ${when}`,
        scheduleId: item.date === s(sch.date) ? s(sch.id) : `${s(sch.id)}~${item.date}`,
        date: kstDate(item.at),
        time: hm(item.at),
        read: false
    };
}

// ---------- 실행 (서버) ----------
export async function runScheduleReminders(env, nowArg) {
    const base = s(env.SUPABASE_URL).replace(/\/+$/, '');
    const key = s(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!base || !key) return { ok: false, skipped: 'Supabase 설정 없음' };
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const call = async (method, path, body, extra) => {
        const res = await fetch(`${base}/rest/v1/${path}`, { method, headers: Object.assign({}, headers, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) });
        if (!res.ok) throw new Error(`Supabase ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
        const t = await res.text();
        return t ? JSON.parse(t) : null;
    };
    const now = nowArg || Date.now();
    // 알림을 정한 일정만 (한 번에 읽기 — 하위 요청 1번)
    const rows = (await call('GET', `schedules?select=id,data&data->>reminder=not.is.null&data->>reminder=neq.none`)) || [];
    const list = rows.map(r => Object.assign({}, r.data || {}, { id: r.id }));
    const due = dueReminders(list, now);
    if (!due.length) return { ok: true, due: 0 };

    const storeRows = (await call('GET', `app_store?select=value&key=eq.gwUsers.v1`)) || [];
    const users = (storeRows[0] && storeRows[0].value) || [];
    const notis = [];
    due.forEach(item => reminderRecipients(item.sch, users).forEach(name => notis.push(reminderNotification(item, name))));
    if (!notis.length) return { ok: true, due: due.length, made: 0 };

    // 넣기 — 이미 있는 번호(보낸 알림)는 건너뛰고, 새로 들어간 것만 돌려받습니다
    const nowIso = new Date(now).toISOString();
    const inserted = (await call('POST', 'notifications?on_conflict=id',
        notis.map(n => ({ id: n.id, data: n, rev: 1, updated_at: nowIso, updated_by: '일정 알림' })),
        { Prefer: 'resolution=ignore-duplicates,return=representation' })) || [];
    if (!inserted.length || !push.keysReady(env)) return { ok: true, due: due.length, made: inserted.length, pushed: 0 };

    // 푸시 — 받는 사람의 기기로 (일정 알림을 끈 사람 제외)
    const fresh = inserted.map(r => Object.assign({}, r.data || {}, { id: r.id }));
    const byName = new Map(users.filter(u => u && u.id && u.name).map(u => [u.name, u]));
    const people = Array.from(new Set(fresh.map(n => n.toUser))).map(n => byName.get(n)).filter(Boolean);
    if (!people.length) return { ok: true, due: due.length, made: inserted.length, pushed: 0 };
    const keys = people.map(u => push.keyOf(u.id));
    const list2 = '(' + keys.map(k => '"' + k.replace(/"/g, '') + '"').join(',') + ')';
    const recRows = (await call('GET', `app_store?select=key,value&key=in.${encodeURIComponent(list2)}`)) || [];
    const recs = {}; recRows.forEach(x => { recs[x.key] = push.normRec(x.value); });
    const cat = push.categoryOf('schedule-reminder');
    const targets = [];
    fresh.forEach(n => {
        const u = byName.get(n.toUser); if (!u) return;
        const rec = recs[push.keyOf(u.id)];
        if (!rec || !push.wants(rec, cat)) return;
        rec.subs.forEach(sub => targets.push({ n, sub }));
    });
    let pushed = 0;
    await Promise.all(targets.slice(0, MAX_PUSH_PER_RUN).map(async ({ n, sub }) => {
        try {
            const q = await push.buildRequest(sub, push.payloadOf(n, { 'schedule-reminder': '일정 알림' }), env);
            const res = await fetch(q.url, q.init);
            if (res.ok) pushed++;
        } catch (e) { console.warn('[일정 알림] 푸시 오류', e && e.message); }
    }));
    return { ok: true, due: due.length, made: inserted.length, pushed, skippedPush: Math.max(0, targets.length - MAX_PUSH_PER_RUN) };
}
