// index.html 의 스크립트 블록이 문법적으로 맞는지 · 샘플 데이터가 남아 있지 않은지 빠르게 봅니다 (npm run check)
const fs = require('fs'); const path = require('path');
const h = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = [...h.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(t => t.trim());
let ok = true;
blocks.forEach((t, i) => { try { new Function(t); } catch (e) { ok = false; console.error(`스크립트 블록 ${i + 1} 문법 오류:`, e.message); } });
["id: 'o1',", "'W-2608-0", 'seedCardTxn(', "id: 'p1', corp", "id: 'c1', name", "id: 'S-2608-", "loginId: 'partner1', pw"].forEach(s => { if (h.includes(s)) { ok = false; console.error('샘플 데이터 흔적:', s); } });
if (!h.includes('id="kob-main"')) { ok = false; console.error('본체 스크립트 표시(kob-main)가 없습니다'); }
console.log(ok ? `검사 통과 — 스크립트 ${blocks.length}블록` : '검사 실패'); process.exit(ok ? 0 : 1);
