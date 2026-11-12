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
vm.runInContext(html.slice(i, j) + ';globalThis.__p = parseVoiceSchedule; globalThis.__yn = parseVoiceYesNo; globalThis.__step = voiceDialogStep; globalThis.__sum = voiceSummary; globalThis.__fa = findVoiceAttendees;', ctx);
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

console.log('[날짜 · 시간을 말했는지]');
r = P('강남 고객사 미팅');
ok(!r.hasDate && !r.hasTime, `날짜 · 시간 말 없음 (${show(r)})`);
ok(P('내일 미팅').hasDate && !P('내일 미팅').hasTime, '날짜만');
ok(!P('오후 3시 미팅').hasDate && P('오후 3시 미팅').hasTime, '시간만');
ok(P('모레 종일 워크숍').hasTime, "'종일' 도 시간을 말한 것");
ok(!P('내일 오후 3시').hasTitle && P('내일 오후 3시 미팅').hasTitle, '제목을 말했는지 (hasTitle)');

console.log('[네 · 아니요]');
['네', '예', '응', '어', '그래', '좋아', '네 등록해 줘', '맞아요', '오케이', '응 그렇게 해'].forEach(t => ok(ctx.__yn(t) === 'yes', `'${t}' → 네`));
['아니요', '아니', '아뇨', '노', '없어', '괜찮아요', '됐어', '안 할래', '필요 없어'].forEach(t => ok(ctx.__yn(t) === 'no', `'${t}' → 아니요`));
['취소', '그만', '그만할래'].forEach(t => ok(ctx.__yn(t) === 'cancel', `'${t}' → 그만`));
ok(ctx.__yn('내일 오후 3시') === null && ctx.__yn('') === null, '그 밖의 말은 모름(null)');

console.log('[묻고 답하기 순서]');
const O = { now: NOW, names: NAMES, me: '정장훈' };
let st = ctx.__step(null, null, O);
ok(st.state.step === 'what' && /어떤 일정/.test(st.say) && st.listen, `처음: 어떤 일정을 잡을까요? (${st.say})`);
// 제목 · 시간 모두 말함 → 세부내용 물음
var a = ctx.__step(st.state, '내일 오후 3시 강남 고객사 미팅 김영업 초대', O);
ok(a.state.step === 'att?' && /참석자 김영업 님\. 참석자를 더 지정하시겠어요/.test(a.say), `다 말하면 → 참석자를 더 지정하시겠어요? (${a.say})`);
ok(a.state.draft.title === '강남 고객사 미팅' && a.state.draft.startTime === '15:00' && a.state.draft.attendees.join() === '김영업', '받은 내용 기억');
console.log('[참석자]');
let p0 = ctx.__step(ctx.__step(st.state, '내일 오후 3시 미팅', O).state, '', O);
ok(/^잘 듣지 못했습니다\. 참석자를 지정하시겠어요/.test(p0.say), '참석자를 아직 안 말했으면 → 참석자를 지정하시겠어요?');
let p1 = ctx.__step(a.state, '네', O);
ok(p1.state.step === 'att' && /참석자 이름을 말씀해/.test(p1.say), '네 → 참석자 이름을 말씀해 주세요');
let p2 = ctx.__step(p1.state, '박설치랑 홍길동', O);
ok(p2.state.draft.attendees.join() === '김영업,박설치' && /박설치 님을 참석자로 추가했습니다/.test(p2.say) && /참석자 홍길동을 그룹웨어에서 찾지 못했습니다/.test(p2.say), `찾으면 바로 추가 · 없으면 찾지 못했습니다 (${p2.say})`);
ok(p2.state.step === 'att?' && /참석자를 더 지정하시겠어요/.test(p2.say), '이어서 → 참석자를 더 지정하시겠어요?');
ok(/참석자 이수지를 그룹웨어/.test(ctx.__step(p1.state, '이수지', O).say), "받침 없는 이름은 '를' (이수지를)");
let p3 = ctx.__step(p1.state, '팀장님', O);
ok(p3.state.draft.attendees.includes('이팀장'), `성 없이 이름만 말해도 찾음 (${p3.say})`);
let p4 = ctx.__step(a.state, '최영 추가해 줘', O);
ok(p4.state.draft.attendees.includes('최영') && /최영 님을 참석자로 추가/.test(p4.say), '묻는 때 이름을 바로 말해도 추가');
ok(ctx.__step(p1.state, '정장훈', O).state.draft.attendees.join() === '김영업', '나 자신은 참석자에 넣지 않음');
a = ctx.__step(a.state, '아니요', O);
ok(a.state.step === 'detail?' && /세부내용을 등록하시겠어요/.test(a.say), `참석자 아니요 → 세부내용을 등록하시겠어요? (${a.say})`);
// 세부내용 아니요 → 바로 등록
let b = ctx.__step(a.state, '아니요', O);
ok(b.action === 'save' && /바로 이 일정으로 등록하겠습니다/.test(b.say) && !b.listen, `아니요 → 바로 이 일정으로 등록하겠습니다 (${b.say})`);
// 세부내용 네 → 받기 → 이대로 등록할까요? → 응 → 등록
let c = ctx.__step(a.state, '네', O);
ok(c.state.step === 'detail' && /세부내용을 말씀해/.test(c.say) && c.listen, '네 → 세부내용을 말씀해 주세요');
let d = ctx.__step(c.state, '견적서 두 부 챙겨 가기', O);
ok(d.state.step === 'confirm' && d.state.draft.description === '견적서 두 부 챙겨 가기' && /이대로 일정을 등록할까요/.test(d.say), `세부내용 기록 → 이대로 일정을 등록할까요? (${d.say})`);
ok(/11월 13일/.test(d.say) && /오후 3시/.test(d.say) && /강남 고객사 미팅/.test(d.say), '확인 때 날짜 · 시간 · 제목을 읽어 줌');
let e = ctx.__step(d.state, '응', O);
ok(e.action === 'save' && /등록/.test(e.say), '응 → 등록');
let f = ctx.__step(d.state, '아니', O);
ok(f.action === 'edit', '이대로 등록할까요? → 아니 → 입력창에서 고치기');
// 제목을 안 말함 → 어떤 내용으로 일정을 잡을까요?
let g = ctx.__step(st.state, '내일 오후 2시', O);
ok(g.state.step === 'title' && /어떤 내용으로 일정을 잡을까요/.test(g.say), `제목 없으면 → 어떤 내용으로 일정을 잡을까요? (${g.say})`);
let h = ctx.__step(g.state, '청주 매장 키오스크 설치', O);
ok(h.state.draft.title === '청주 매장 키오스크 설치' && h.state.draft.startTime === '14:00' && h.state.step === 'att?', `제목 기록 후 참석자 물음 (${show(h.state.draft)})`);
// 날짜 · 시간을 안 말함 → 언제로 잡을까요?
let w = ctx.__step(st.state, '강남 고객사 미팅', O);
ok(w.state.step === 'when' && /언제/.test(w.say), `날짜 · 시간 없으면 → 언제로 잡을까요? (${w.say})`);
let w2 = ctx.__step(w.state, '다음 주 화요일 오전 10시', O);
ok(w2.state.draft.date === '2026-11-17' && w2.state.draft.startTime === '10:00' && w2.state.draft.title === '강남 고객사 미팅' && w2.state.step === 'att?', '시간 받은 뒤 제목은 그대로');
// 아무것도 안 말함
let n1 = ctx.__step(st.state, '', O);
ok(n1.state.step === 'what' && n1.listen && n1.state.silent === 1, '말이 없으면 한 번 더 물음');
let n2 = ctx.__step(n1.state, '', O);
ok(!n2.listen && n2.action === 'wait', '두 번째도 없으면 듣기를 멈추고 기다림 (🎤 · 입력으로 이어 감)');
// 못 알아들은 네 · 아니요
let u = ctx.__step(a.state, '음 글쎄', O);
ok(u.state.step === 'detail?' && /네 또는 아니요/.test(u.say), '네 · 아니요가 아니면 다시 물음');
// 그만
ok(ctx.__step(a.state, '취소', O).action === 'end', '취소 → 마침');
ok(/종일/.test(ctx.__sum({ date: '2026-11-14', allDay: true, title: '워크숍', attendees: [] })), '종일 일정 읽기');

console.log('[참석자 — 이름만 말하기 · 덧붙인 말 (11/12 아이폰 시험 반영)]');
const N2 = ['김영업', '이수지', '박수지', '박민수', '최지원', '정장훈'];
const FA = (t) => ctx.__fa(t, N2, '정장훈');
['김영업 추가해 줘', '김영업 초대해줘', '참석자로 김영업', '김영업 등록해 주세요', '네 김영업 님이요', '김영업 넣어 주세요',
 '김영업 참석자로 추가해 주세요', '김영업도 넣어줘', '김영업 씨 불러 줘', '김영업이랑 같이 가요', '김영업 님 참석이요', '김영업 한 명이요', '김영업 추가할게요'
].forEach(t => { const r = FA(t); ok(r.found.join() === '김영업' && !r.missing.length && !(r.ambiguous || []).length, `'${t}' → 김영업 추가만, 찾지 못했다는 말 없음 (${show(r)})`); });
['민수', '민수야', '민수는', '민수 씨랑', '민수한테', '민수에게', '민수 님이요', '민수도', '민수 추가해 줘'].forEach(t => { const r = FA(t); ok(r.found.join() === '박민수' && !r.missing.length, `이름만 '${t}' → 박민수 (${show(r)})`); });
var r2 = FA('수지');
ok(!r2.found.length && !r2.missing.length && (r2.ambiguous || []).length === 1 && r2.ambiguous[0].names.join() === '이수지,박수지', `같은 이름 두 명 → 찾지 못함이 아니라 '여러 명' (${show(r2)})`);
ok(FA('홍길동').missing.join() === '홍길동', '명단에 없는 이름은 찾지 못함');
ok(FA('민수하고 홍길동').found.join() === '박민수' && FA('민수하고 홍길동').missing.join() === '홍길동', '있는 이름 + 없는 이름은 둘 다 알려 줌');
const O2 = { now: NOW, names: N2, me: '정장훈' };
let q1 = ctx.__step(ctx.__step(ctx.__step(null, null, O2).state, '내일 오후 3시 미팅', O2).state, '네', O2);
let q2 = ctx.__step(q1.state, '수지', O2);
ok(/수지 님이 여러 명입니다/.test(q2.say) && /이수지, 박수지/.test(q2.say) && !/찾지 못했습니다/.test(q2.say) && q2.state.step === 'att', `여러 명이면 성까지 다시 물음 (${q2.say})`);
let q3 = ctx.__step(q2.state, '이수지', O2);
ok(q3.state.draft.attendees.join() === '이수지' && /이수지 님을 참석자로 추가했습니다/.test(q3.say), '성까지 말하면 추가');
let q4 = ctx.__step(q1.state, '김영업 추가해 줘', O2);
ok(/김영업 님을 참석자로 추가했습니다/.test(q4.say) && !/찾지 못했습니다/.test(q4.say), `추가와 찾지 못함이 함께 나오지 않음 (${q4.say})`);
const P2 = (t) => ctx.__p(t, O2);
var v1 = P2('내일 오후 3시 미팅 민수 초대');
ok(v1.attendees.join() === '박민수' && v1.title === '미팅', `처음 말에서도 이름만으로 참석자 (${show(v1)})`);
var v2 = P2('내일 3시 민수랑 미팅');
ok(v2.attendees.join() === '박민수' && v2.title === '미팅', `'민수랑' → 참석자 (${show(v2)})`);
var v3 = P2('내일 3시 설치 지원');
ok(!v3.attendees.length && v3.title === '설치 지원', `보통 낱말(지원)은 '초대 · 랑' 없이는 사람으로 보지 않음 (${show(v3)})`);

console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
