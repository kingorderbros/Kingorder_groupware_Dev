// 사용법: node tools/e2e-schedule-cancel.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-30 — 일정 취소 · 삭제: 지워도 '삭제됨', 취소하면 '취소됨' 으로 남고 참석자 · 담당자에게 알림 · 되살리기 · 반복의 한 날만 · 관리자 완전 삭제
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8804,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.type()==='prompt'?d.accept('고객 일정 변경'):d.accept());
 await pg.goto('http://localhost:8804/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const notiBefore=collabNotifications.length;
   const newNotis=type=>collabNotifications.slice(notiBefore).filter(n=>n.type===type);
   const vis=id=>!document.getElementById(id).classList.contains('hidden');
   schedules.push({id:'e2e-s1',title:'취소시험',date:'2026-11-03',startTime:'14:00',endTime:'15:00',calendar:DEFAULT_CALENDAR_ID,dept:'sales',type:'',salesperson:'정장훈',createdBy:'daniel@kingorder.co.kr',
     attendees:[{name:'참석자A',status:'accepted'},{name:'참석자B',status:'pending'}]});
   // 1) 취소 — 사유와 함께 · 참석자 둘에게 알림
   cancelSchedule('e2e-s1');
   const s=schedules.find(x=>x.id==='e2e-s1');
   r.cancelled=s.offState==='cancelled'&&s.offBy==='정장훈'&&s.offReason==='고객 일정 변경'&&!!s.offAt;
   r.cancelNotis=newNotis('schedule-cancelled').map(n=>n.toUser).sort().join(',');
   r.cancelNotiText=notiText(newNotis('schedule-cancelled')[0]).includes('취소')&&newNotis('schedule-cancelled')[0].detail.includes('사유: 고객 일정 변경');
   const chip=scheduleChipHtml(s);
   r.chipMarked=chip.includes('line-through')&&chip.includes('fa-ban');
   openScheduleDetailModal('e2e-s1');
   r.detailCancelled=vis('detail-schedule-off')&&document.getElementById('detail-schedule-off').innerText.includes('취소됨')
     &&!vis('btn-edit-schedule')&&!vis('btn-cancel-schedule')&&vis('btn-restore-schedule')&&vis('btn-delete-schedule');
   closeScheduleDetailModal();
   // 2) 삭제 — 일정은 남고 '삭제됨' · 알림
   deleteSchedule('e2e-s1');
   r.deletedKept=schedules.some(x=>x.id==='e2e-s1'&&x.offState==='deleted');
   r.deleteNotis=newNotis('schedule-deleted').map(n=>n.toUser).sort().join(',');
   openScheduleDetailModal('e2e-s1');
   r.detailDeleted=document.getElementById('detail-schedule-off').innerText.includes('삭제됨')&&!vis('btn-delete-schedule')&&vis('btn-purge-schedule')&&vis('btn-restore-schedule');
   closeScheduleDetailModal();
   r.noticeOpens=!!findScheduleForView(newNotis('schedule-deleted')[0].scheduleId);
   r.notJoinable=!canJoinSchedule(s);
   // 3) 되살리기
   restoreSchedule('e2e-s1');
   r.restored=!s.offState&&newNotis('schedule-restored').length===2;
   // 4) 반복 — 이 날만 취소 (첫 confirm [확인] = 이 날만)
   schedules.push({id:'e2e-r1',title:'반복시험',date:'2026-11-02',startTime:'09:00',endTime:'10:00',calendar:DEFAULT_CALENDAR_ID,dept:'sales',type:'',salesperson:'정장훈',createdBy:'daniel@kingorder.co.kr',
     recur:{freq:'daily',interval:1,end:'never'},attendees:[{name:'참석자A',status:'accepted'}]});
   cancelSchedule('e2e-r1~2026-11-04');
   const m=schedules.find(x=>x.id==='e2e-r1');
   r.oneDayMark=!!(m.recur.offDates&&m.recur.offDates['2026-11-04']&&m.recur.offDates['2026-11-04'].state==='cancelled')&&m.recur.exdates.includes('2026-11-04')&&!m.offState;
   const inst=scheduleInstances();
   r.oneDayShown=inst.some(x=>x.id==='e2e-r1~2026-11-04'&&x.offState==='cancelled')&&inst.some(x=>x.id==='e2e-r1~2026-11-05'&&!x.offState)
     &&inst.filter(x=>x.id==='e2e-r1~2026-11-04').length===1;
   r.oneDayNoti=newNotis('schedule-cancelled').some(n=>n.scheduleId==='e2e-r1~2026-11-04'&&n.toUser==='참석자A');
   r.oneDayView=(findScheduleForView('e2e-r1~2026-11-04')||{}).offState==='cancelled';
   restoreSchedule('e2e-r1~2026-11-04');
   r.oneDayRestored=!m.recur.offDates['2026-11-04']&&!m.recur.exdates.includes('2026-11-04');
   // 5) 관리자 완전 삭제
   deleteSchedule('e2e-s1');
   purgeSchedule('e2e-s1');
   r.purged=!schedules.some(x=>x.id==='e2e-s1');
   schedules=schedules.filter(x=>x.id!=='e2e-r1'); saveSchedules();
   collabNotifications.splice(notiBefore); refreshNotiBell();
   return r;
 });
 const expect={cancelled:true,cancelNotis:'참석자A,참석자B',cancelNotiText:true,chipMarked:true,detailCancelled:true,deletedKept:true,deleteNotis:'참석자A,참석자B',detailDeleted:true,noticeOpens:true,notJoinable:true,restored:true,
   oneDayMark:true,oneDayShown:true,oneDayNoti:true,oneDayView:true,oneDayRestored:true,purged:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
