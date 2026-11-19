/**
 * 인바운드 새 건 알림 (2026-11-19 다니엘님 "인바운드에 새로 등록되는 건들을 푸시 알림")
 *
 * 홈페이지 문의 폼(/api/inbound/form)과 자동 수집(메일 · 인스타, worker.js 1분 예약 실행)으로 새 건이 들어오면
 * 그룹웨어 알림함(notifications 표)과 폰 · PC 푸시로 알립니다. 직원이 화면에서 직접 등록한 건은 화면(index.html
 * inboundNotifyNew)이 같은 규칙으로 알립니다 — 받는 사람 규칙을 바꾸면 두 곳을 함께 고칩니다.
 *
 *   받는 사람: 배정된 본부(영업 → sales · 운영 → ops) 직원 중 인바운드 관리 화면 권한이 있는 사람.
 *             미배정이거나 그 본부에 받을 사람이 없으면 인바운드 관리 화면 권한이 있는 직원 모두.
 *             퇴사자 · 휴직자 · 외주업체(사외 계정)는 뺍니다. 알림 설정에서 '인바운드'를 끈 사람에게는 푸시를 보내지 않습니다.
 *   한 번에 여러 건(4건 이상)이 들어오면 사람마다 'N건' 알림 한 개로 묶습니다.
 *   같은 알림이 두 번 가지 않게 알림 번호를 '인입 번호 · 받는 사람' 으로 정하고 이미 있으면 건너뜁니다.
 *
 * 판단(받는 사람 · 알림 모양)은 순수 함수로 두어 tools/test-inbound-notify.js 가 가짜 자료로 시험합니다.
 */
import * as push from './_push.js';

export const USERS_KEY = 'gwUsers.v1';
export const PERM_KEY = 'gwPermissionGroups.v2';
export const DEPT_CODE = { '영업': 'sales', '운영': 'ops' };
export const BUNDLE_FROM = 4;                   // 이 건수부터 사람마다 한 개로 묶음
const PERM = 'inbound-center';
const SEED_GROUPS = ['management', 'sales', 'ops'];   // 권한 그룹을 한 번도 저장하지 않았을 때(화면 기본값) 인바운드 화면을 보는 그룹
const MAX_PUSH_PER_RUN = 20;                    // Workers 하위 요청 한도(무료 50) 안에서

const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : []);
const pad = (n) => String(n).padStart(2, '0');

function groupIdsOf(u) { return Array.from(new Set([u.groupId].concat(arr(u.groupIds)).filter(Boolean))); }

// 인바운드 관리 화면을 볼 수 있는 직원 (퇴사 · 휴직 · 사외 제외)
export function inboundViewers(users, groups) {
    const list = arr(groups);
    const byId = new Map(list.filter(g => g && g.id).map(g => [g.id, g]));
    const external = new Set(list.filter(g => g && g.external).map(g => g.id));
    return arr(users).filter(u => {
        if (!u || !s(u.name) || u.resigned === true || u.onLeave === true) return false;
        if (u.dept === 'vendor') return false;
        const ids = groupIdsOf(u);
        if (ids.some(id => external.has(id))) return false;
        if (u.dept === 'admin' || u.isAdmin === true || ids.includes('admin')) return true;
        if (!list.length) return ids.some(id => SEED_GROUPS.includes(id));
        return ids.some(id => arr((byId.get(id) || {}).permissions).includes(PERM));
    });
}

// 이 건을 받을 사람 이름 — 배정 본부 직원, 없으면 인바운드 화면을 보는 직원 모두
export function inboundRecipients(rec, users, groups, exceptName) {
    const viewers = inboundViewers(users, groups).filter(u => s(u.name) !== s(exceptName));
    const code = DEPT_CODE[s(rec && rec.kob && rec.kob.dept)];
    const inDept = code ? viewers.filter(u => u.dept === code) : [];
    return Array.from(new Set((inDept.length ? inDept : viewers).map(u => s(u.name))));
}

function kstNow(now) {
    const t = new Date((now || Date.now()) + 9 * 3600000);
    return { date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` };
}
const idPart = (v) => s(v).replace(/[^0-9A-Za-z가-힣_\-]/g, '');

// 한 건 알림 (notifications 표의 data)
export function inboundNotification(rec, toUser, now) {
    const k = rec.kob || {};
    const where = s(rec.source && rec.source.label) || s(rec.channel);
    const note = s(rec.requestNote).replace(/\s+/g, ' ').slice(0, 100);
    const t = kstNow(now);
    return {
        id: ['inb', idPart(rec.id), idPart(toUser)].join('_').slice(0, 180),
        type: 'inbound-new',
        inboundId: s(rec.id),
        title: s(rec.company) || s(rec.name) || '새 문의',
        toUser, toDept: '', toTeam: '',
        detail: [s(rec.id), where, k.dept ? k.dept + '본부' : '미배정', note].filter(Boolean).join(' · '),
        date: t.date, time: t.time, read: false
    };
}
// 여러 건을 한 개로
export function inboundBundleNotification(recs, toUser, now) {
    const t = kstNow(now);
    const first = recs[0] || {};
    return {
        id: ['inb', idPart(first.id), 'n' + recs.length, idPart(toUser)].join('_').slice(0, 180),
        type: 'inbound-new',
        inboundId: '',
        title: `새 인바운드 ${recs.length}건`,
        toUser, toDept: '', toTeam: '',
        detail: recs.slice(0, 5).map(r => s(r.company) || s(r.name) || s(r.id)).join(', ') + (recs.length > 5 ? ` 외 ${recs.length - 5}건` : ''),
        date: t.date, time: t.time, read: false
    };
}

// 새로 들어온 건들 → 알림 목록 (사람마다)
export function inboundNotifications(recs, users, groups, now, exceptName) {
    const list = arr(recs).filter(r => r && s(r.id));
    const per = new Map();
    list.forEach(r => inboundRecipients(r, users, groups, exceptName).forEach(name => {
        if (!per.has(name)) per.set(name, []);
        per.get(name).push(r);
    }));
    const out = [];
    per.forEach((rs, name) => {
        if (rs.length >= BUNDLE_FROM) out.push(inboundBundleNotification(rs, name, now));
        else rs.forEach(r => out.push(inboundNotification(r, name, now)));
    });
    return out;
}

// ---------- 실행 (서버) ----------
export async function notifyInboundAdded(env, recs, nowArg) {
    if (!arr(recs).length) return { ok: true, made: 0 };
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
    const rows = (await call('GET', `app_store?select=key,value&key=in.(${encodeURIComponent('"' + USERS_KEY + '","' + PERM_KEY + '"')})`)) || [];
    const val = (k) => { const r = rows.find(x => x.key === k); return r ? r.value : null; };
    const users = arr(val(USERS_KEY));
    const groups = arr(val(PERM_KEY));
    const notis = inboundNotifications(recs, users, groups, now);
    if (!notis.length) return { ok: true, made: 0 };

    const nowIso = new Date(now).toISOString();
    const inserted = (await call('POST', 'notifications?on_conflict=id',
        notis.map(n => ({ id: n.id, data: n, rev: 1, updated_at: nowIso, updated_by: '인바운드 알림' })),
        { Prefer: 'resolution=ignore-duplicates,return=representation' })) || [];
    if (!inserted.length || !push.keysReady(env)) return { ok: true, made: inserted.length, pushed: 0 };

    // 푸시 — 받는 사람의 기기로 (인바운드 알림을 끈 사람 제외)
    const fresh = inserted.map(r => Object.assign({}, r.data || {}, { id: r.id }));
    const byName = new Map(users.filter(u => u && u.id && u.name).map(u => [u.name, u]));
    const people = Array.from(new Set(fresh.map(n => n.toUser))).map(n => byName.get(n)).filter(Boolean);
    if (!people.length) return { ok: true, made: inserted.length, pushed: 0 };
    const list2 = '(' + people.map(u => '"' + push.keyOf(u.id).replace(/"/g, '') + '"').join(',') + ')';
    const recRows = (await call('GET', `app_store?select=key,value&key=in.${encodeURIComponent(list2)}`)) || [];
    const subRecs = {}; recRows.forEach(x => { subRecs[x.key] = push.normRec(x.value); });
    const cat = push.categoryOf('inbound-new');
    // 한도(20)를 넘으면 뒤 사람이 통째로 빠지지 않게 — 사람마다 첫 기기부터 돌아가며 채웁니다
    const perPerson = [];
    fresh.forEach(n => {
        const u = byName.get(n.toUser); if (!u) return;
        const key = push.keyOf(u.id);
        const rec = subRecs[key];
        if (!rec || !push.wants(rec, cat)) return;
        perPerson.push(push.pickSubsFor(rec, cat).filter(push.validSubscription).map(sub => ({ n, sub, key })));
    });
    const targets = [];
    for (let i = 0; perPerson.some(l => l.length > i); i++) perPerson.forEach(l => { if (l[i]) targets.push(l[i]); });
    let pushed = 0; const gone = [];
    await Promise.all(targets.slice(0, MAX_PUSH_PER_RUN).map(async ({ n, sub, key }) => {
        try {
            const q = await push.buildRequest(sub, push.forSub(push.payloadOf(n, { 'inbound-new': '인바운드' }), sub), env);
            const res = await fetch(q.url, q.init);
            if (res.ok) pushed++;
            else if (res.status === 404 || res.status === 410) gone.push({ key, ep: sub.endpoint });   // 브라우저가 구독을 버림 — /api/push/send 와 같게 지웁니다
        } catch (e) { console.warn('[인바운드 알림] 푸시 오류', e && e.message); }
    }));
    for (const g of gone) {
        subRecs[g.key] = push.removeSub(subRecs[g.key], g.ep);
        try {
            await call('POST', 'app_store?on_conflict=key', [{ key: g.key, value: subRecs[g.key], updated_at: new Date().toISOString() }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
        } catch (e) { console.warn('[인바운드 알림] 버린 구독 정리 실패', e && e.message); }
    }
    const skippedPush = Math.max(0, targets.length - MAX_PUSH_PER_RUN);
    if (skippedPush) console.warn('[인바운드 알림] 푸시 한도로 보내지 못한 기기', skippedPush);
    return { ok: true, made: inserted.length, pushed, removed: gone.length, skippedPush };
}
