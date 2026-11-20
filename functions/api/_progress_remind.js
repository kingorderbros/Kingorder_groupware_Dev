/**
 * 진행 내역 업데이트 요청 알림 (2026-11-20 다니엘님 "각 진행 업무에 업데이트가 없으면 배정받은 영업 담당자에게 업데이트를 하라고 알림")
 *
 * worker.js 의 scheduled(1분마다)가 runProgressReminders(env) 를 부르고, 평일(공휴일 제외) 한국 시간 09:00~09:09 에만 실제로 점검합니다.
 *
 *   · 대상: 영업업무센터 업무(works 표 center 'sales', 진행중) · 영업본부 인바운드(gwInboundRecords.v1, 본부 영업 · 진행중)
 *   · 기준: 화면(index.html salesProgState)과 같게 — 진행중인데 마지막 진행 내역(없으면 진행 시작 · 배정 · 접수)부터
 *           STALL_DAYS(3)일 넘게 새 내역이 없으면 '지체'. 완료 예정일이 지났는데 지연 사유가 없으면 함께 적습니다.
 *   · 받는 사람: 배정받은 담당자 한 명(업무 assignee · 인바운드 kob.owner). 퇴사 · 휴직자, '진행 내역 입력 선택' 권한
 *           (ops-progress-optional, 관리자 그룹 제외)이 있는 사람은 뺍니다.
 *   · 하루 한 번 — 알림 번호를 '구분 · 건 번호 · 날짜' 로 정해 notifications 표에 넣고, 이미 있으면 건너뜁니다.
 *     내역을 입력할 때까지 매일 아침 다시 알립니다.
 *   · 푸시 종류는 '업무 접수'(work) — 알림 설정에서 끄면 푸시는 오지 않고 알림함에만 남습니다.
 *
 * 판단은 순수 함수로 두어 tools/test-progress-remind.js 가 가짜 자료로 시험합니다.
 */
import * as push from './_push.js';

export const STALL_DAYS = 3;
export const RUN_FROM = '09:00';
export const RUN_UNTIL = '09:10';             // 이 사이에만 점검 (서버가 몇 분 늦게 돌아도 따라잡음)
const MAX_PUSH_PER_RUN = 20;
const WORK_KINDS = ['action', 'delay', 'stall', 'issue', 'resolve', 'done'];
const DONE_RESULTS = ['영업수주', '실패'];
const OPTIONAL_PERM = 'ops-progress-optional';

const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : []);
const pad = (n) => String(n).padStart(2, '0');

export function kstParts(ms) {
    const t = new Date(ms + 9 * 3600000);
    return { date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`, dow: t.getUTCDay() };
}
export function daysBetween(fromDate, toDate) {
    const a = s(fromDate).slice(0, 10), b = s(toDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0;
    const d = Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
    return d > 0 ? d : 0;
}
// 오늘 점검하는 날 · 시각인지 — 평일, 공휴일 아님, 09:00~09:09
export function shouldRun(nowMs, holidays) {
    const k = kstParts(nowMs);
    if (k.dow === 0 || k.dow === 6) return false;
    if (holidays && holidays[k.date]) return false;
    return k.time >= RUN_FROM && k.time < RUN_UNTIL;
}

// 진행 상태 (화면 salesProgState 와 같은 계산) — item: { status, progressLog, dueDate, workingSince, assignedAt, receivedAt }
export function progressState(item, today) {
    const log = arr(item.progressLog);
    const open = ['received', 'assigned', 'working', 'hold'].includes(item.status);
    const late = open && item.dueDate && today > item.dueDate ? daysBetween(item.dueDate, today) : 0;
    const lateReason = late ? log.some(e => e && e.kind === 'delay' && s(e.loggedAt).slice(0, 10) > item.dueDate) : false;
    const lastWork = log.filter(e => e && WORK_KINDS.includes(e.kind)).reduce((m, e) => (s(e.loggedAt) > m ? s(e.loggedAt) : m), '');
    const base = lastWork || s(item.workingSince) || s(item.assignedAt) || s(item.receivedAt);
    const stall = item.status === 'working' ? daysBetween(base, today) : 0;
    return { stall: stall >= STALL_DAYS ? stall : 0, lateNeed: late > 0 && !lateReason, late, lastAt: lastWork };
}

// 영업업무센터 업무 → 공통 모양 (견적서 · 상담 · 계약 자동 건은 저장되지 않지만 혹시 있으면 뺍니다)
export function workItem(w) {
    if (!w || s(w.center) !== 'sales' || w.quoteId || w.caseId || w.contractId) return null;
    return { src: 'work', key: 'sales', id: s(w.id), title: s(w.title) || s(w.id), company: s(w.company), assignee: s(w.assignee),
        status: s(w.status), progressLog: arr(w.progressLog), dueDate: s(w.dueDate), workingSince: s(w.workingSince), assignedAt: s(w.assignedAt), receivedAt: s(w.receivedAt) };
}
// 영업본부 인바운드 → 공통 모양 (상태는 화면 inboundProgStatus 와 같게)
export function inboundItem(r) {
    const k = (r && r.kob) || {};
    if (!r || r.spam || k.dept !== '영업') return null;
    const hasContact = !!(k.contactAt || arr(k.extras).length);
    const status = DONE_RESULTS.includes(k.result) ? 'done' : k.result === '보류' ? 'hold'
        : (k.result === '진행중' || hasContact) ? 'working' : (k.owner ? 'assigned' : 'received');
    return { src: 'inbound', key: 'inbound', id: s(r.id), title: `${s(r.company) || s(r.name) || '(업체명 없음)'} 인입`, company: '', assignee: s(k.owner),
        status, progressLog: arr(k.progressLog), dueDate: s(k.dueDate), workingSince: s(k.workingSince) || s(k.contactAt), assignedAt: s(k.ownerAt), receivedAt: s(r.inAt) || s(r.inDate) };
}

// 담당자가 알림을 받을 사람인지 — 계정이 있고, 퇴사 · 휴직 아님, 진행 내역 입력 선택 권한 없음
export function remindable(name, users, groups) {
    const u = arr(users).find(x => x && s(x.name) === s(name));
    if (!u || u.resigned === true || u.onLeave === true) return false;
    const ids = Array.from(new Set([u.groupId].concat(arr(u.groupIds)).filter(Boolean))).filter(id => id !== 'admin');
    const perms = new Set();
    arr(groups).forEach(g => { if (g && ids.includes(g.id)) arr(g.permissions).forEach(p => perms.add(p)); });
    // 권한 그룹을 저장한 적이 없으면 화면 기본값 — 운영 그룹에 이 권한이 있습니다
    if (!arr(groups).length && ids.includes('ops')) return false;
    return !perms.has(OPTIONAL_PERM);
}

// 알림 한 건
export function remindNotification(it, st, today, time) {
    const parts = [`${st.stall}일째 진행 내역이 없습니다`];
    if (st.lateNeed) parts.push(`완료 예정일(${it.dueDate})이 ${st.late}일 지났고 지연 사유가 없습니다`);
    return {
        id: ['prog', it.src, it.id, today].join('_').replace(/[^0-9A-Za-z가-힣_\-]/g, '').slice(0, 180),
        type: 'work-progress-remind',
        title: it.title,
        toUser: it.assignee, toDept: '', toTeam: '',
        detail: `${parts.join(' · ')}. 진행한 내용이나 지체 사유를 입력해 주세요.${it.lastAt ? ` (마지막 입력 ${it.lastAt})` : ''}`,
        progSrc: it.key, progId: it.id,
        date: today, time, read: false
    };
}

// 모든 건 → 오늘 보낼 알림
export function progressReminders(items, users, groups, nowMs) {
    const k = kstParts(nowMs);
    const out = [];
    arr(items).forEach(it => {
        if (!it || it.status !== 'working' || !it.assignee) return;
        const st = progressState(it, k.date);
        if (!st.stall) return;
        if (!remindable(it.assignee, users, groups)) return;
        out.push(remindNotification(Object.assign({}, it, { lastAt: st.lastAt }), st, k.date, k.time));
    });
    return out;
}

// ---------- 실행 (서버) ----------
export async function runProgressReminders(env, nowArg, opts) {
    const now = nowArg || Date.now();
    const base = s(env.SUPABASE_URL).replace(/\/+$/, '');
    const key = s(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!base || !key) return { ok: false, skipped: 'Supabase 설정 없음' };
    // 시각이 아니면 아무것도 읽지 않습니다 (1분마다 불리므로)
    const t0 = kstParts(now).time;
    if (!(opts && opts.force) && !(t0 >= RUN_FROM && t0 < RUN_UNTIL)) return { ok: true, skipped: '점검 시각 아님' };
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const call = async (method, path, body, extra) => {
        const res = await fetch(`${base}/rest/v1/${path}`, { method, headers: Object.assign({}, headers, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) });
        if (!res.ok) throw new Error(`Supabase ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
        const t = await res.text();
        return t ? JSON.parse(t) : null;
    };
    const parse = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; };
    const store = (await call('GET', `app_store?select=key,value&key=in.${encodeURIComponent('("gwUsers.v1","gwPermissionGroups.v2","gwInboundRecords.v1","gwHolidays.v1")')}`)) || [];
    const val = (k) => { const r = store.find(x => x.key === k); return r ? parse(r.value) : null; };
    const holidays = (val('gwHolidays.v1') || {}).days || {};
    if (!(opts && opts.force) && !shouldRun(now, holidays)) return { ok: true, skipped: '평일 · 공휴일 · 시각 조건 아님' };
    const users = arr(val('gwUsers.v1'));
    const pg = val('gwPermissionGroups.v2');
    const groups = arr(pg && pg.groups ? pg.groups : pg);
    const inbound = val('gwInboundRecords.v1');
    const workRows = [];
    for (let off = 0; off < 20000; off += 1000) {
        const page = (await call('GET', `works?select=id,data&data->>center=eq.sales&data->>status=eq.working&order=id.asc&limit=1000&offset=${off}`)) || [];
        workRows.push(...page);
        if (page.length < 1000) break;
    }
    const items = workRows.map(r => workItem(Object.assign({}, r.data || {}, { id: r.id })))
        .concat(arr(inbound && inbound.records).map(inboundItem)).filter(Boolean);
    const notis = progressReminders(items, users, groups, now);
    if (!notis.length) return { ok: true, checked: items.length, made: 0 };

    const nowIso = new Date(now).toISOString();
    const inserted = (await call('POST', 'notifications?on_conflict=id',
        notis.map(n => ({ id: n.id, data: n, rev: 1, updated_at: nowIso, updated_by: '진행 내역 알림' })),
        { Prefer: 'resolution=ignore-duplicates,return=representation' })) || [];
    if (!inserted.length || !push.keysReady(env)) return { ok: true, checked: items.length, made: inserted.length, pushed: 0 };

    const fresh = inserted.map(r => Object.assign({}, r.data || {}, { id: r.id }));
    const byName = new Map(users.filter(u => u && u.id && u.name).map(u => [u.name, u]));
    const people = Array.from(new Set(fresh.map(n => n.toUser))).map(n => byName.get(n)).filter(Boolean);
    if (!people.length) return { ok: true, checked: items.length, made: inserted.length, pushed: 0 };
    const list2 = '(' + people.map(u => '"' + push.keyOf(u.id).replace(/"/g, '') + '"').join(',') + ')';
    const recRows = (await call('GET', `app_store?select=key,value&key=in.${encodeURIComponent(list2)}`)) || [];
    const recs = {}; recRows.forEach(x => { recs[x.key] = push.normRec(x.value); });
    const cat = push.categoryOf('work-progress-remind');
    const targets = [];
    fresh.forEach(n => {
        const u = byName.get(n.toUser); if (!u) return;
        const rec = recs[push.keyOf(u.id)];
        if (!rec || !push.wants(rec, cat)) return;
        push.pickSubsFor(rec, cat).filter(push.validSubscription).forEach(sub => targets.push({ n, sub }));
    });
    let pushed = 0;
    await Promise.all(targets.slice(0, MAX_PUSH_PER_RUN).map(async ({ n, sub }) => {
        try {
            const q = await push.buildRequest(sub, push.forSub(push.payloadOf(n, { 'work-progress-remind': '진행 내역 업데이트 요청' }), sub), env);
            const res = await fetch(q.url, q.init);
            if (res.ok) pushed++;
        } catch (e) { console.warn('[진행 내역 알림] 푸시 오류', e && e.message); }
    }));
    return { ok: true, checked: items.length, made: inserted.length, pushed, skippedPush: Math.max(0, targets.length - MAX_PUSH_PER_RUN) };
}
