// 사용법: node tools/e2e-calendar-title.js [캡처폴더]  (맥 크롬 헤드리스) — 일정 칸은 제목 먼저 · 휴대폰 폭에서는 제목만 (2026-11-16)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');const SHOT=process.argv[2]||'';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
const seed=()=>{const t=ymd(new Date());schedules.length=0;schedules.push(
  {id:'s1',title:'고객사 방문 미팅',date:t,startTime:'14:00',endTime:'15:00',allDay:false,dept:'sales',type:schedTypesFor?undefined:undefined,calendar:DEFAULT_CALENDAR_ID,salesperson:'정장훈',attendees:[]},
  {id:'s2',title:'전체 회의',date:t,startTime:'',endTime:'',allDay:true,dept:'ops',calendar:DEFAULT_CALENDAR_ID,salesperson:'김능영',attendees:[]});
  navigate('calendar-center',document.getElementById('nav-calendar-center'));renderCalendar();};
srv.listen(8874,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const errs=[];
 const run=async(w,h,mode)=>{const pg=await br.newPage();pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:w,height:h,isMobile:w<600,hasTouch:w<600});
  await pg.goto('http://localhost:8874/'+(mode?'?mode='+mode:''),{waitUntil:'networkidle0'});
  await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
  await pg.evaluate(`window.schedTypesFor=null;(${seed.toString()})()`);if(mode)await pg.evaluate(()=>calmSetView('month'));await new Promise(r=>setTimeout(r,500));
  const r=await pg.evaluate(()=>{const chips=[...document.querySelectorAll('#cal-grid [onclick^="event.stopPropagation(); openScheduleDetailModal"]')];
    const vis=el=>[...el.childNodes].filter(n=>n.nodeType===3?n.textContent.trim():getComputedStyle(n).display!=='none').map(n=>n.textContent.trim()).filter(Boolean).join(' ');
    return chips.map(c=>({text:vis(c),first:(c.querySelector('b')||{}).textContent,timeShown:!![...c.querySelectorAll('span.tabular-nums')].find(x=>getComputedStyle(x).display!=='none')}));});
  if(SHOT){await pg.evaluate(()=>{const c=document.querySelector('#cal-grid [onclick^="event.stopPropagation(); openScheduleDetailModal"]');c&&c.scrollIntoView({block:'center'});});await pg.screenshot({path:path.join(SHOT,`cal-${w}${mode?'-'+mode:''}.png`)});}
  await pg.close();return r;};
 const desk=await run(1400,900,'');const phone=await run(390,844,'');const calm=await run(390,844,'calendar');
 console.log(JSON.stringify({desk,phone,calm}));
 const d1=desk.find(x=>x.first==='고객사 방문 미팅');
 ok(d1&&/^고객사 방문 미팅 14:00/.test(d1.text)&&d1.timeShown,'컴퓨터: 제목 먼저 → 시간',d1);
 const d2=desk.find(x=>x.first==='전체 회의');ok(d2&&/^전체 회의/.test(d2.text),'컴퓨터: 종일 일정 제목',d2);
 const p1=phone.find(x=>x.first==='고객사 방문 미팅');ok(p1&&p1.text==='고객사 방문 미팅'&&!p1.timeShown,'휴대폰 그룹웨어: 제목만 (시간 · 담당자 숨김)',p1);
 const c1=calm.find(x=>x.first==='고객사 방문 미팅');ok(c1&&c1.text==='고객사 방문 미팅','킹오더일정: 제목만 (전과 같음)',c1);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
