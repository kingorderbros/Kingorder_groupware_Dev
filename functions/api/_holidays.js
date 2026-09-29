/**
 * 대한민국 공휴일 (2026-09-29) — 캘린더 · 설치 희망일 영업일 계산이 함께 씁니다.
 *
 * 출처: 구글의 공개 '대한민국 공휴일' 캘린더(ICS). 설 · 추석 · 부처님오신날(음력)과 대체공휴일 · 선거일 · 임시공휴일까지
 *       구글이 고쳐 두므로 해마다 손으로 적지 않아도 됩니다. 로그인 없이 받을 수 있는 공개 주소입니다.
 * 기념일(어버이날 · 스승의날 · 국군의날 · 크리스마스 이브 등)은 쉬는 날이 아니라 뺍니다 — DESCRIPTION 이 '공휴일' 인 것만.
 * 저장: app_store 'gwHolidays.v1' = { updatedAt, source, days: { 'YYYY-MM-DD': '이름' } } — 하루 한 번 새로 받습니다.
 */
export const KEY = 'gwHolidays.v1';
export const ICS_URL = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
export const MAX_AGE_MS = 24 * 3600 * 1000;

// '쉬는 날 개천절' → '개천절 대체공휴일'
export function holidayLabel(summary) {
    const s = String(summary || '').trim();
    const m = /^쉬는\s*날\s*(.+)$/.exec(s);
    return m ? `${m[1]} 대체공휴일` : s;
}
export function parseIcs(text) {
    const t = String(text || '').replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n');   // 접힌 줄 펴기
    const days = {};
    const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
    let ev;
    while ((ev = re.exec(t))) {
        const body = ev[1];
        const d = /\nDTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/.exec(body);
        const e = /\nDTEND;VALUE=DATE:(\d{4})(\d{2})(\d{2})/.exec(body);
        const sm = /\nSUMMARY:(.*)/.exec(body);
        const desc = /\nDESCRIPTION:(.*)/.exec(body);
        if (!d || !sm) continue;
        if (!desc || !/^공휴일/.test(desc[1].trim())) continue;                     // 기념일은 뺌
        const name = holidayLabel(sm[1].replace(/\\,/g, ',').replace(/\\;/g, ';'));
        // 여러 날짜에 걸친 행사도 하루씩 (보통은 하루짜리)
        const start = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
        const end = e ? new Date(Date.UTC(+e[1], +e[2] - 1, +e[3])) : new Date(start.getTime() + 86400000);
        for (let x = start; x < end; x = new Date(x.getTime() + 86400000)) {
            const k = x.toISOString().slice(0, 10);
            days[k] = days[k] && days[k] !== name ? `${days[k]} · ${name}` : name;
        }
    }
    return days;
}
export function isStale(value, nowMs) {
    if (!value || !value.days || !value.updatedAt) return true;
    const t = new Date(value.updatedAt).getTime();
    if (isNaN(t)) return true;                                                  // 날짜가 깨졌으면 새로 (2026-09-29 검토)
    return (nowMs || Date.now()) - t > MAX_AGE_MS;
}
// 구글 받기가 1시간 안에 실패했으면 다시 가지 않습니다 (요청마다 구글로 가지 않게)
export function recentlyFailed(value, nowMs) {
    const t = new Date((value && value.failedAt) || 0).getTime();
    return !isNaN(t) && t > 0 && (nowMs || Date.now()) - t < 3600 * 1000;
}
