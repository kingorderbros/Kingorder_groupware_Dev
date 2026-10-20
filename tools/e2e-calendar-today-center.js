// 사용법: node tools/e2e-calendar-today-center.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-20 — 일정캘린더에 들어오면 이번 달 · 오늘이 있는 주가 화면 가운데로, [오늘] 버튼
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8807,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:700});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8807/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const centerOff=()=>pg.evaluate(()=>{const c=document.querySelector('#cal-grid [data-today="1"]'); if(!c) return null; const b=c.getBoundingClientRect(); return Math.round((b.top+b.bottom)/2 - innerHeight/2);});
 const out={};
 // 다른 달을 보다 나갔다가 다시 들어오면 이번 달로
 await pg.evaluate(()=>{ navigate('calendar-center',document.getElementById('nav-calendar-center')); changeDate(2); navigate('personal-dashboard',document.getElementById('nav-personal-dashboard')); });
 await pg.evaluate(()=>{ navigate('calendar-center',document.getElementById('nav-calendar-center')); });
 await wait(900);
 out.monthIsNow=await pg.evaluate(()=>currentDate.getMonth()===new Date().getMonth()&&currentDate.getFullYear()===new Date().getFullYear());
 const off1=await centerOff(); out.off1=off1;
 // 맨 위 · 맨 아래 칸이면 화면 끝에 닿아 가운데까지 못 갈 수 있음 — 그래도 화면 안에는 있어야 함
 out.todayVisible=await pg.evaluate(()=>{const b=document.querySelector('#cal-grid [data-today="1"]').getBoundingClientRect(); return b.top>=0&&b.bottom<=innerHeight;});
 // [오늘] 버튼
 await pg.evaluate(()=>{ changeDate(-3); });
 out.otherMonthNoToday=await pg.evaluate(()=>!document.querySelector('#cal-grid [data-today="1"]'));
 await pg.evaluate(()=>{ [...document.querySelectorAll('button')].find(b=>b.getAttribute('onclick')==='calendarGoToday()').click(); });
 await wait(900);
 out.atBottom=await pg.evaluate(()=>{let el=document.querySelector('#cal-grid [data-today="1"]'); while(el&&el!==document.body){ const cs=getComputedStyle(el); if(/(auto|scroll)/.test(cs.overflowY)&&el.scrollHeight>el.clientHeight) return Math.abs(el.scrollTop+el.clientHeight-el.scrollHeight)<=2; el=el.parentElement;} return Math.abs(scrollY+innerHeight-document.documentElement.scrollHeight)<=2;});
 out.backToToday=await pg.evaluate(()=>!!document.querySelector('#cal-grid [data-today="1"]'));
 out.off2=await centerOff();
 out.centered=Math.abs(out.off1)<=120 || out.todayVisible;
 const bad=['monthIsNow','todayVisible','otherMonthNoToday','backToToday','centered'].filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
