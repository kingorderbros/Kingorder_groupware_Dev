// index.html 의 스크립트 블록이 문법적으로 맞는지 · 샘플 데이터가 남아 있지 않은지 빠르게 봅니다 (npm run check)
const fs = require('fs'); const path = require('path');
const h = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = [...h.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(t => t.trim());
let ok = true;
blocks.forEach((t, i) => { try { new Function(t); } catch (e) { ok = false; console.error(`스크립트 블록 ${i + 1} 문법 오류:`, e.message); } });
["id: 'o1',", "'W-2608-0", 'seedCardTxn(', "id: 'p1', corp", "id: 'c1', name", "id: 'S-2608-", "loginId: 'partner1', pw"].forEach(s => { if (h.includes(s)) { ok = false; console.error('샘플 데이터 흔적:', s); } });
if (!h.includes('id="kob-main"')) { ok = false; console.error('본체 스크립트 표시(kob-main)가 없습니다'); }
// 그림은 파일(image/ · assets/quote/)로 두고 주소만 씁니다 — 7단계(2026-09-29)에서 6.7MB 를 뺐습니다. 20KB 넘는 base64 그림이 다시 들어오면 막습니다.
[...h.matchAll(/data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)/g)].forEach(m => { if (m[1].length > 20000) { ok = false; console.error(`큰 base64 그림이 index.html 안에 있습니다 (${Math.round(m[1].length / 1000)}KB, ${h.slice(0, m.index).split('\n').length}번째 줄) — 파일로 빼고 주소를 쓰세요`); } });
console.log(ok ? `검사 통과 — 스크립트 ${blocks.length}블록` : '검사 실패'); process.exit(ok ? 0 : 1);
