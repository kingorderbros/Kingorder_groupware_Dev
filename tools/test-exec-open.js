// 경영 현황판 [원본 화면에서 열기] 시험 (2026-09-28) — 갈 곳 함수가 모두 있는지, 화면 id 를 바르게 넘기는지.
const fs = require('fs');
const path = require('path');

const INDEX = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const html = fs.readFileSync(INDEX, 'utf8');

const i = html.indexOf('function execOpenSourceJs(i) {');
const body = html.slice(i, html.indexOf('\n        }\n', i));
console.log('\n[1] 구분마다 갈 곳 함수가 있는지');
const called = [...new Set([...body.matchAll(/`([a-zA-Z]+)\(/g)].map(m => m[1]))];
ok(called.length >= 7, `갈 곳 함수 ${called.length}개`);
called.forEach(fn => ok(html.includes(`function ${fn}(`), `${fn} 가 있다`));

console.log('\n[2] 빈 화면이 되던 원인');
ok(!/navigate\(def\.section/.test(html), "업무센터로 갈 때 'sec-' 가 붙은 id 를 navigate 에 넘기지 않는다");
ok(/case 'work':\s+return i\.srcKey \? `execOpenWork\(/.test(body), '업무 건은 그 업무의 상세 팝업까지 연다');
ok(/case 'paydoc':.*openPayDocDetail\(/.test(body), '보완서류 건은 그 건의 상세 팝업까지 연다');

console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
