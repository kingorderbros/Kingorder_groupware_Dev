// 사용법: node tools/e2e-dash-today-cal.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-19 — 마이 대시보드 '오늘의 일정' 캘린더 종류 드롭다운
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8800,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1280,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8800/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={}; const today=ymd(new Date());
   const add=(id,cal,title)=>schedules.push({id,calendar:cal,title,date:today,time:'10:00',dept:'company'===cal?'company':'sales',type:'',salesperson:currentUserName});
   add('e2e-s1','company','전사시험일정'); add('e2e-s2','sales-share','영업공유시험일정'); add('e2e-s3','install-as','설치시험일정');
   navigate('personal-dashboard',document.getElementById('nav-personal-dashboard'));
   renderTodaySchedule(currentUserName);
   const sel=document.getElementById('today-cal-filter'), list=document.getElementById('personal-today-schedule-list');
   r.options=[...sel.options].map(o=>o.text);
   r.allShows3=['전사시험일정','영업공유시험일정','설치시험일정'].every(t=>list.innerText.includes(t));
   setTodayCalFilter('company');
   r.companyOnly=list.innerText.includes('전사시험일정')&&!list.innerText.includes('영업공유시험일정')&&!list.innerText.includes('설치시험일정');
   r.selKept=document.getElementById('today-cal-filter').value==='company';
   r.remembered=kobStorage.getItem('dashTodayCal')==='company';
   setTodayCalFilter('personal');
   r.emptyMsg=list.innerText.includes('오늘 개인 일정이 없습니다');
   setTodayCalFilter('');
   r.backToAll=['전사시험일정','영업공유시험일정','설치시험일정'].every(t=>list.innerText.includes(t));
   ['e2e-s1','e2e-s2','e2e-s3'].forEach(id=>schedules.splice(schedules.findIndex(s=>s.id===id),1));
   return r;
 });
 out.optionCounts=out.options.some(t=>/^전사 \(1\)$/.test(t))&&out.options.some(t=>/^전체 캘린더 \(\d+\)$/.test(t));
 const expect={allShows3:true,companyOnly:true,selKept:true,remembered:true,emptyMsg:true,backToAll:true,optionCounts:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
