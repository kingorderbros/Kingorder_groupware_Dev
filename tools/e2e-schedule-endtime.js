// 사용법: node tools/e2e-schedule-endtime.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-21 — 일정 등록 시 시작 시간을 넣으면 종료 시간이 1시간 뒤로, 직접 고친 종료는 유지
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8810,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8810/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const st=()=>document.getElementById('schedule-start-time'), en=()=>document.getElementById('schedule-end-time');
   const typeStart=v=>{ st().value=v; st().dispatchEvent(new Event('input')); };
   const typeEnd=v=>{ en().value=v; en().dispatchEvent(new Event('input')); };
   navigate('calendar-center',document.getElementById('nav-calendar-center'));
   openScheduleModal('2026-10-22');
   r.defaultPlusHour=scheduleAddMinutes(st().value,60)===en().value;
   typeStart('09:30'); r.auto1=en().value==='10:30';
   typeStart('14:05'); r.auto2=en().value==='15:05';            // 손대지 않았으면 계속 따라감
   typeEnd('16:00'); typeStart('14:30'); r.keepManual=en().value==='16:00';   // 직접 고친 종료는 유지
   typeStart('17:00'); r.fixWhenBefore=en().value==='18:00';  // 종료가 시작보다 이르면 다시 1시간 뒤
   typeStart('23:30'); r.capNight=en().value==='23:55';
   // 저장
   document.getElementById('schedule-title').value='종료시간시험';
   typeStart('11:00'); typeEnd('11:45');
   const before=schedules.length;
   document.getElementById('schedule-form').dispatchEvent(new Event('submit',{cancelable:true}));
   const s=schedules.slice(before).find(x=>x.title==='종료시간시험');
   r.savedEdited=!!s&&s.startTime==='11:00'&&s.endTime==='11:45';
   // 수정 창 — 저장된 종료는 그대로, 시작만 바꿔도 종료 유지
   if(s){ editSchedule(s.id); r.editLoaded=en().value==='11:45'; typeStart('10:30'); r.editKeepsEnd=en().value==='11:45'; closeScheduleModal(); }
   // 종일 — 시간칸 잠김 상태에서는 아무것도 안 함
   openScheduleModal('2026-10-22'); document.getElementById('schedule-allday').checked=true; onScheduleAllDayChange();
   onScheduleStartTimeChange(); r.allDayEmpty=en().value==='';
   closeScheduleModal && closeScheduleModal();
   if(s) schedules.splice(schedules.indexOf(s),1);
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
