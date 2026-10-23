// 사용법: node tools/e2e-collab-1023.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 보완사항(협업센터) — ① 보낸 사람은 처음엔 수락 못 함, 나에게 다시 이관되면 가능 ② 요청자 = 로그인한 사람 고정
// ③ 수락 시 예정일 기본 오늘 · [즉시 처리] ④ 본부 사람 모두 고르면 본부 전체 1건 · 알림 1번
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8808,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8808/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const before=collabRequests.length, notiBefore=collabNotifications.length;
   const ppl=[['e2e-d1','영업가'],['e2e-d2','영업나']].map(([id,name])=>({id,name,dept:'sales',rank:'매니저',email:id+'@test.local',groupId:'sales'}));
   const savedUsers=localUsers.slice(); localUsers.splice(0,localUsers.length,...localUsers.filter(u=>u.dept!=='sales'),...ppl);
   // ② 요청자 고정
   openTaskModal('ops');
   const who=document.getElementById('task-assignee');
   r.fixedRequester=who.value==='정장훈'&&who.readOnly===true;
   // ④ 영업본부 사람 모두 고르기
   document.getElementById('task-collab-target').value='sales'; onTaskTargetChange();
   document.getElementById('task-type').value='collab'; onTaskTypeChange();
   document.getElementById('task-title').value='본부전체시험';
   document.querySelectorAll('#task-assignee-users .collab-assignee').forEach(c=>c.checked=true); onCollabAssigneeChange();
   submitTask({preventDefault(){}});
   const made=collabRequests.slice(before);
   r.deptWide=made.length===1&&made[0].assigneeUser===''&&!made[0].assigneeUsers;
   r.oneNoti=collabNotifications.slice(notiBefore).filter(n=>n.type==='collab-requested').length===1;
   const req=made[0];
   // ① 내가 보낸 요청 — 받은 쪽 카드에 수락 단추 없음
   const card=collabTicketCard(req,'inbox');
   r.noAcceptOwn=!card.includes('openCollabAcceptModal')&&card.includes('내가 보낸 요청');
   // 나에게 다시 이관되면 수락 가능
   req.transfers=[{at:'2026-10-23',by:'영업가',kind:'team',fromDept:'sales',fromUser:'영업가',toDept:'sales',toUser:'정장훈',reason:'재요청'}];
   r.acceptAfterReturn=collabTicketCard(req,'inbox').includes('openCollabAcceptModal');
   req.transfers=[];
   // ③ 다른 사람 요청: 수락 창 예정일 기본 오늘 · 즉시 처리
   req.assignee='다른요청자';
   openCollabAcceptModal(req.id);
   r.todayDefault=document.getElementById('accept-date').value===ymd(new Date());
   closeCollabAcceptModal();
   r.quickBtn=collabTicketCard(req,'inbox').includes('collabQuickProcess');
   collabQuickProcess(req.id);
   r.quickOpensComplete=req.status==='accepted'&&req.date===ymd(new Date())&&!document.getElementById('collab-complete-modal').classList.contains('hidden');
   document.getElementById('complete-detail').value='바로 처리함';
   submitCollabComplete({preventDefault(){}});
   r.quickCompleted=req.status==='completed';
   collabRequests.splice(before); collabNotifications.splice(notiBefore);
   localUsers.splice(0,localUsers.length,...savedUsers);
   return r;
 });
 const expect={fixedRequester:true,deptWide:true,oneNoti:true,noAcceptOwn:true,acceptAfterReturn:true,todayDefault:true,quickBtn:true,quickOpensComplete:true,quickCompleted:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
