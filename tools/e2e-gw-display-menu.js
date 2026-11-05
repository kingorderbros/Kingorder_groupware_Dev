// 사용법: node tools/e2e-gw-display-menu.js [폴더] [env]   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-05 — 머리 줄 화면 디자인 드롭다운 + 자료실 · 킹오더챗 바로 가기. env=prod 이면 킹오더챗 단추가 없어야 합니다.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';const ENV=process.argv[3]||'dev';const SHOT=process.env.SHOT_DIR||'';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'${ENV}',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8861,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
 const check=async(w,h,name)=>{await pg.setViewport({width:w,height:h});await pg.goto('http://localhost:8861/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));await new Promise(r=>setTimeout(r,500));
  await pg.click('#gw-display-btn');await new Promise(r=>setTimeout(r,200));
  const r=await pg.evaluate(()=>{const o={};const m=document.getElementById('gw-display-menu');const b=m.getBoundingClientRect();o.open=!m.classList.contains('hidden');o.inScreen=b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;
   o.noPageScroll=document.documentElement.scrollWidth<=innerWidth;const c=document.getElementById('gw-shortcut-chat');o.chatShown=!c.classList.contains('hidden');o.chatHref=c.getAttribute('href');o.chatNewTab=c.target==='_blank';o.archiveShown=!document.getElementById('gw-shortcut-archive').classList.contains('hidden');
   o.topIsMenu=m.contains(document.elementFromPoint(b.left+b.width/2,b.top+40));const h=document.querySelector('header').getBoundingClientRect();o.headerOneLine=h.height<=64;return o;});
  if(SHOT)await pg.screenshot({path:path.join(SHOT,name+'.png')});
  await pg.click('#gw-theme-switch [data-gw-theme="green"]');
  Object.assign(r,await pg.evaluate(()=>({theme:document.documentElement.getAttribute('data-theme'),faceName:document.getElementById('gw-display-name').textContent,stayOpen:!document.getElementById('gw-display-menu').classList.contains('hidden'),checked:document.querySelector('#gw-theme-switch [aria-checked="true"]').dataset.gwTheme})));
  await pg.evaluate(()=>setGwTheme('kingorder'));
  // 바깥 누르면 닫힘, Esc 도 닫힘
  await pg.mouse.click(w/2,h-20);r.outsideCloses=await pg.evaluate(()=>document.getElementById('gw-display-menu').classList.contains('hidden'));
  await pg.click('#gw-display-btn');await pg.keyboard.press('Escape');r.escCloses=await pg.evaluate(()=>document.getElementById('gw-display-menu').classList.contains('hidden'));
  // 자료실 단추 → 자료실 화면, 창 닫힘
  await pg.click('#gw-display-btn');await pg.click('#gw-shortcut-archive');await new Promise(r=>setTimeout(r,300));
  Object.assign(r,await pg.evaluate(()=>({archiveOpen:!document.getElementById('sec-archive').classList.contains('hidden'),closedAfter:document.getElementById('gw-display-menu').classList.contains('hidden')})));
  // 권한 없으면 자료실 단추 없음
  r.noPermHidden=await pg.evaluate(()=>{document.getElementById('nav-archive').classList.add('hidden');toggleGwDisplayMenu(true);const x=document.getElementById('gw-shortcut-archive').classList.contains('hidden');toggleGwDisplayMenu(false);document.getElementById('nav-archive').classList.remove('hidden');return x;});
  return r;};
 const out={pc:await check(1400,900,'pc-'+ENV),phone:await check(375,700,'phone-'+ENV),narrow:await check(320,600,'narrow-'+ENV)};
 console.log(JSON.stringify(out,null,0));console.log('페이지 오류',errs.length,errs.slice(0,3));
 let bad=errs.length;for(const k in out){const r=out[k];for(const x of ['open','inScreen','noPageScroll','archiveShown','topIsMenu','headerOneLine','stayOpen','outsideCloses','escCloses','archiveOpen','closedAfter','noPermHidden'])if(!r[x]){bad++;console.log('실패',k,x);}
  if(r.theme!=='green'||r.faceName!=='그린'||r.checked!=='green'){bad++;console.log('실패',k,'디자인 변경');}
  if(ENV==='dev'&&!(r.chatShown&&r.chatNewTab&&/kingorder-chat-dev/.test(r.chatHref||''))){bad++;console.log('실패',k,'챗 단추');}
  if(ENV==='prod'&&(r.chatShown||r.chatHref)){bad++;console.log('실패',k,'운영에 챗 단추');}}
 console.log(bad?'실패 '+bad:'통과');await br.close();srv.close();process.exit(bad?1:0);});
