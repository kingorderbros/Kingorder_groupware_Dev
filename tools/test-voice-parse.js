// 킹오더일정 실험실 — 음성으로 일정 만들기: 말한 문장을 날짜 · 시간 · 제목 · 참석자 · 캘린더로 나누기 (2026-11-12)
// index.html 안의 실제 코드를 꺼내서 돌립니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const html = fs.readFileSync(INDEX, 'utf8');
const START = '// ---------- 음성 일정 해석 시작 (2026-11-12) ----------';
const END = '// ---------- 음성 일정 해석 끝 ----------';
const i = html.indexOf(START), j = html.indexOf(END, i);
if (i < 0 || j < 0) { console.error('index.html 에서 음성 일정 해석 부분을 찾지 못했습니다.'); process.exit(1); }
const ctx = { Date, JSON, Math, String, Number, Array, Object, RegExp, Set };
vm.createContext(ctx);
vm.runInContext(html.slice(i, j) + ';globalThis.__p = parseVoiceSchedule;', ctx);
const NOW = new Date(2026, 10, 12, 9, 0);          // 2026-11-12 (목) 09:00
const NAMES = ['김영업', '박설치', '이팀장', '정장훈', '최영'];
const P = (t) => ctx.__p(t, { now: NOW, names: NAMES, me: '정장훈' });
const show = (r) => JSON.stringify(r);

console.log('[날짜]');
ok(P('오늘 회의').date === '2026-11-12', '오늘');
ok(P('내일 회의').date === '2026-11-13', '내일');
ok(P('모레 회의').date === '2026-11-14', '모레');
ok(P('다음 주 화요일 회의').date === '2026-11-17', '다음 주 화요일');
ok(P('이번 주 금요일 회의').date === '2026-11-13', '이번 주 금요일');
ok(P('월요일 회의').date === '2026-11-16', '요일만 말하면 다가오는 그 요일');
ok(P('11월 20일 회의').date === '2026-11-20', '11월 20일');
ok(P('12월 3일 회의').date === '2026-12-03', '12월 3일');
ok(P('1월 5일 회의').date === '2027-01-05', '지난 달이면 내년');
ok(P('25일 회의').date === '2026-11-25', '일만 말하면 이번 달');
ok(P('5일 회의').date === '2026-12-05', '이번 달 지난 날이면 다음 달');
ok(P('회의').date === '2026-11-12', '날짜가 없으면 오늘');

console.log('[시간]');
let r = P('내일 오후 3시 미팅');
ok(r.startTime === '15:00' && r.endTime === '16:00' && !r.allDay, `오후 3시 → 15:00~16:00 (${show(r)})`);
ok(P('내일 오전 10시 반 미팅').startTime === '10:30', '오전 10시 반');
ok(P('내일 15시 30분 미팅').startTime === '15:30', '15시 30분');
ok(P('내일 2시 미팅').startTime === '14:00', '오전·오후 없이 1~6시는 오후로');
ok(P('내일 9시 미팅').startTime === '09:00', '오전·오후 없이 9시는 오전');
ok(P('내일 저녁 7시 회식').startTime === '19:00', '저녁 7시');
ok(P('내일 낮 12시 점심').startTime === '12:00', '낮 12시');
r = P('내일 오후 2시부터 4시까지 교육');
ok(r.startTime === '14:00' && r.endTime === '16:00', `2시부터 4시까지 (${show(r)})`);
r = P('내일 오후 1시에서 3시 30분까지 교육');
ok(r.startTime === '13:00' && r.endTime === '15:30', `1시에서 3시 30분까지 (${show(r)})`);
r = P('내일 오후 3시 2시간 회의');
ok(r.startTime === '15:00' && r.endTime === '17:00', `3시 2시간 (${show(r)})`);
r = P('모레 종일 워크숍');
ok(r.allDay && !r.startTime, '종일');
ok(P('모레 워크숍').allDay, '시간이 없으면 종일');

console.log('[참석자 · 캘린더 · 제목]');
r = P('내일 오후 3시 강남 고객사 미팅 김영업 박설치 초대');
ok(r.attendees.join() === '김영업,박설치', `참석자 (${show(r)})`);
ok(r.title === '강남 고객사 미팅', `제목에서 날짜 · 시간 · 이름 · '초대' 를 뺌 (${r.title})`);
r = P('다음 주 화요일 오전 10시 영업 캘린더에 키오스크 시연 김영업이랑');
ok(r.calendar === 'sales-share' && r.attendees.join() === '김영업' && r.title === '키오스크 시연', `영업 캘린더 · '이랑' (${show(r)})`);
ok(P('내일 설치 일정 청주 매장 키오스크 설치').calendar === 'install-as', "'설치' → 설치/AS 캘린더");
ok(P('내일 에이에스 방문').calendar === 'install-as', "'에이에스' → 설치/AS");
ok(P('11월 28일 전사 워크숍').calendar === 'company', "'전사' → 전사일정");
ok(P('내일 개인 일정 병원').calendar === 'personal', "'개인' → 개인");
ok(P('내일 오후 3시 팀 회의').calendar === 'team', '그 밖은 팀별');
ok(P('내일 오후 3시 정장훈 회의').attendees.length === 0, '나 자신은 참석자에서 뺌');
ok(P('내일 최영 김영업 회의').attendees.join() === '김영업,최영', '이름이 겹쳐도(최영) 긴 이름부터 정확히');
ok(P('내일 오후 3시 일정 등록해 줘').title === '새 일정', "제목이 남지 않으면 '새 일정'");
ok(P('내일 오후 3시에 미팅 잡아줘').title === '미팅', "'잡아줘' 같은 말은 뺌");

console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
