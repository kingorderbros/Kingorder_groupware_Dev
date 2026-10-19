// 사용법: node tools/e2e-onleave-pick.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-19 — 휴직자는 담당자 · 수신자 · 지시 대상 · 참석자 고르기에서 빠지고, 이미 담긴 값은 유지되는지
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8803,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8803/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const ppl=[{id:'e2e-l1',name:'근무직원',dept:'sales',rank:'매니저',level:'rk_manager',email:'e2e-l1@test.local',groupId:'sales'},
              {id:'e2e-l2',name:'휴직직원',dept:'sales',rank:'매니저',level:'rk_manager',email:'e2e-l2@test.local',groupId:'sales',onLeave:true}];
   ppl.forEach(u=>localUsers.push(u));
   // 협업요청 수신 담당자
   openTaskModal('ops'); document.getElementById('task-collab-target').value='sales'; onTaskTargetChange();
   const box=document.getElementById('task-assignee-users').innerText;
   r.collabHasWorker=box.includes('근무직원'); r.collabNoLeave=!box.includes('휴직직원'); closeTaskModal();
   // 업무지시 대상
   const dt=directiveTargetCandidates('sales','정장훈','rk_ceo').map(u=>u.name);
   r.dirNoLeave=!dt.includes('휴직직원'); r.dirHasWorker=dt.includes('근무직원');
   // 일정 참석자 초대
   const inv=inviteCandidates().map(u=>u.name); r.inviteNoLeave=!inv.includes('휴직직원');
   // 한 명 고르기 · 기존 값 유지
   r.optNoLeave=!personOptionsHtml('',null).includes('휴직직원');
   r.optKeep=personOptionsHtml('휴직직원',null).includes('휴직직원 (현재 값)');
   // 여러 명 고르기 · 이미 고른 휴직자 유지
   r.checksNoLeave=!personChecksHtml('x',[],null).includes('휴직직원');
   r.checksKeep=personChecksHtml('x',['휴직직원'],null).includes('휴직직원');
   // 프로젝트 담당자 select
   const s=document.createElement('select'); fillUserSelect(s,'sales',''); r.selNoLeave=![...s.options].some(o=>o.value==='휴직직원');
   const s2=document.createElement('select'); fillUserSelect(s2,'sales','휴직직원'); r.selKeep=s2.value==='휴직직원';
   // 조직도에는 그대로 (휴직중 표시)
   r.chartKeeps=orgChartMembers().some(u=>u.id==='e2e-l2');
   ppl.forEach(p=>localUsers.splice(localUsers.findIndex(u=>u.id===p.id),1));
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
