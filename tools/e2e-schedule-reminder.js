// 사용법: node tools/e2e-schedule-reminder.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 — 일정 알림: 알림 설정에 1시간 전 추가 · 서버가 만든 일정 알림(schedule-reminder)이 알림함에 보이고, 누르면 그 일정이 열림
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8815,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8815/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   r.option=!!document.querySelector('#schedule-reminder option[value="1hour"]')&&!!document.querySelector('#wsch-reminder option[value="1hour"]')&&reminderMap['1hour']==='1시간 전';
   schedules.push({id:'s-e2e-rem',title:'알림시험 미팅',date:'2026-10-24',startTime:'10:00',endTime:'11:00',calendar:'team',dept:'sales',reminder:'15min',salesperson:'정장훈'});
   const n={id:'srem_s-e2e-rem_2026-10-24_15min_정장훈',type:'schedule-reminder',title:'알림시험 미팅',toUser:'정장훈',toDept:'',detail:'15분 전 알림 · 2026-10-24 10:00~11:00',scheduleId:'s-e2e-rem',date:'2026-10-24',read:false};
   collabNotifications.push(n);
   r.mine=myNotifications().some(x=>x.id===n.id);
   r.text=notiText(n).includes('곧 시작');
   const js=notiClickJs(n);
   r.click=js.includes('openScheduleFromNotice');
   eval(js.replace(/&quot;/g,'"'));
   r.opened=!document.getElementById('schedule-detail-modal').classList.contains('hidden')&&document.getElementById('detail-schedule-title').innerText.includes('알림시험 미팅');
   collabNotifications.splice(collabNotifications.indexOf(n),1);
   schedules.splice(schedules.findIndex(s=>s.id==='s-e2e-rem'),1);
   return r;
 });
 const expect={option:true,mine:true,text:true,click:true,opened:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
