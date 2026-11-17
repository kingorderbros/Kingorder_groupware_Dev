// 사용법: node tools/e2e-schedule-purge-all.js   (맥 크롬 헤드리스) — 일정 완전 삭제를 모든 사용자에게: 삭제할 수 있는 일정(내가 등록 · 대리 권한)이면 일반 직원도 [완전 삭제] (2026-11-17)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8875,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
 const dialogs=[];pg.on('dialog',d=>{dialogs.push(d.message());d.type()==='prompt'?d.accept('시험'):d.accept();});
 await pg.setViewport({width:1400,height:900});await pg.goto('http://localhost:8875/',{waitUntil:'networkidle0'});
 // 일반 직원(영업본부 사원)으로 로그인
 await pg.evaluate(()=>enterApp({email:'staff1@kingorder.co.kr',dept:'sales',name:'김직원',level:'사원'}));
 const r=await pg.evaluate(async()=>{
  const out={};const vis=id=>!document.getElementById(id).classList.contains('hidden');
  out.admin=canManageAllData();
  // ① 내가 등록한 일정 → 삭제 → 완전 삭제 단추 보임 → 완전 삭제
  schedules.push({id:'pg-mine',title:'내 일정',date:'2026-11-20',startTime:'10:00',endTime:'11:00',calendar:DEFAULT_CALENDAR_ID,dept:'sales',type:'',salesperson:'김직원',createdBy:'staff1@kingorder.co.kr',attendees:[]});
  deleteSchedule('pg-mine');
  out.mineDeleted=schedules.some(x=>x.id==='pg-mine'&&x.offState==='deleted');
  openScheduleDetailModal('pg-mine');out.mineBtn=vis('btn-purge-schedule');closeScheduleDetailModal();
  purgeSchedule('pg-mine');out.minePurged=!schedules.some(x=>x.id==='pg-mine');
  // ② 남이 등록한 삭제된 일정 → 단추 안 보임 · 함수로 불러도 지워지지 않음
  schedules.push({id:'pg-other',title:'남 일정',date:'2026-11-21',startTime:'10:00',endTime:'11:00',calendar:DEFAULT_CALENDAR_ID,dept:'sales',type:'',salesperson:'박다른',createdBy:'other@kingorder.co.kr',attendees:[],offState:'deleted',offBy:'박다른',offAt:'2026-11-17 10:00'});
  openScheduleDetailModal('pg-other');out.otherBtn=vis('btn-purge-schedule');closeScheduleDetailModal();
  purgeSchedule('pg-other');out.otherKept=schedules.some(x=>x.id==='pg-other');
  // ③ 삭제 안 된 일정에는 완전 삭제 단추 없음
  schedules.push({id:'pg-live',title:'살아있는 일정',date:'2026-11-22',startTime:'10:00',endTime:'11:00',calendar:DEFAULT_CALENDAR_ID,dept:'sales',type:'',salesperson:'김직원',createdBy:'staff1@kingorder.co.kr',attendees:[]});
  openScheduleDetailModal('pg-live');out.liveBtn=vis('btn-purge-schedule');closeScheduleDetailModal();
  out.ver=(document.querySelector('.js-app-ver')||{}).textContent||'';out.want=(window.KOB_VERSION||{}).groupware||'';
  return out;});
 console.log(JSON.stringify(r));
 ok(r.admin===false,'일반 직원으로 시험 (관리자 아님)',r.admin);
 ok(r.mineDeleted&&r.mineBtn,'내가 등록한 삭제된 일정 — [완전 삭제] 보임',r);
 ok(r.minePurged,'일반 직원도 완전 삭제됨',r);
 ok(!r.otherBtn&&r.otherKept,'남이 등록한 일정은 단추 없음 · 지워지지 않음',r);
 ok(dialogs.some(m=>m.includes('완전 삭제할 권한이 없습니다')),'권한 없음 안내',dialogs);
 ok(!r.liveBtn,'삭제 안 된 일정엔 [완전 삭제] 없음',r);
 ok(!!r.want&&r.ver.includes(r.want),'화면에 현재 버전 표시 (v'+r.want+')',r.ver);   // 버전을 올려도 시험은 그대로
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
