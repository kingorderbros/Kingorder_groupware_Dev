// 사용법: node tools/e2e-presence-chat.js   (맥 크롬 헤드리스) — 접속 상태 목록에서 사람을 누르면 [대화하기] → 킹오더챗 ?dm=직원번호 (2026-11-11)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8869,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1400,height:900});await pg.goto('http://localhost:8869/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(()=>{localUsers.length=0;[['u1','김능영','sales'],['u2','신민성','sales'],['u3','정장훈','it']].forEach(([id,name,dept])=>localUsers.push({id,name,dept,email:id+'@x.kr',groupId:dept==='it'?'management':dept,level:'manager'}));enterApp(localUsers[2]);
  const opened=[];window.open=(u,t)=>{opened.push([u,t]);return null;};
  togglePresencePanel(true);const out={};
  out.rows=[...document.querySelectorAll('[data-presence-person]')].map(e=>e.getAttribute('data-presence-person')).sort().join();
  out.btnBefore=document.querySelectorAll('[data-presence-talk]').length;
  document.querySelector('[data-presence-person="u1"]').click();
  out.panelOpen=!document.getElementById('presence-panel').classList.contains('hidden');
  const b=document.querySelector('[data-presence-talk]');out.btn=b&&b.getAttribute('data-presence-talk');out.btnText=b&&b.textContent.trim();
  document.querySelector('[data-presence-person="u2"]').click();out.btn2=[...document.querySelectorAll('[data-presence-talk]')].map(e=>e.getAttribute('data-presence-talk')).join();
  document.querySelector('[data-presence-person="u2"]').click();out.btn3=document.querySelectorAll('[data-presence-talk]').length;
  document.querySelector('[data-presence-person="u1"]').click();document.querySelector('[data-presence-talk]').click();
  out.opened=opened;out.closed=document.getElementById('presence-panel').classList.contains('hidden');
  // 챗 주소가 없는 환경은 단추 없음
  window.KOB_CONFIG.env='local';togglePresencePanel(true);out.noChat=document.querySelectorAll('[data-presence-person]').length;window.KOB_CONFIG.env='dev';
  return out;});
 console.log(JSON.stringify(r));
 ok(r.rows==='u1,u2','다른 사람만 누를 수 있음 (나는 제외)',r.rows);
 ok(r.btnBefore===0,'처음엔 단추 없음');
 ok(r.btn==='u1'&&r.btnText==='대화하기'&&r.panelOpen,'사람 누르면 [대화하기] 단추 · 목록은 열린 채',r);
 ok(r.btn2==='u2','다른 사람 누르면 그 사람 단추로 바뀜',r.btn2);
 ok(r.btn3===0,'같은 사람 다시 누르면 단추 닫힘',r.btn3);
 ok(r.opened.length===1&&r.opened[0][0]==='https://kingorder-chat-dev.kingorderbros.workers.dev/?dm=u1'&&r.opened[0][1]==='kingorder-chat','대화하기 → 킹오더챗 ?dm=직원번호 새 창',r.opened);
 ok(r.closed,'대화하기 누르면 목록 닫힘');
 ok(r.noChat===0,'챗 주소 없는 환경은 누를 수 없음',r.noChat);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
