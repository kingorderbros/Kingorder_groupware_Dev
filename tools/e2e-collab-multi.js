// 사용법: node tools/e2e-collab-multi.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-19 — 협업요청 등록 시 수신 담당자 복수 선택, 미선택이면 부서 전체 한 건
// 2026-10-23 — 여러 명을 골라도 요청은 1건(assigneeUsers) · 사람별 알림 · 받은 사람 각자 받은 요청에 보임 · 한 명이 수락하면 요청 전체 수락 + 다른 사람에게 알림 · 보낸 쪽 1건
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8802,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8802/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const ppl=[['e2e-c1','영업가'],['e2e-c2','영업나'],['e2e-c3','영업다']].map(([id,name])=>({id,name,dept:'sales',rank:'매니저',email:id+'@test.local',groupId:'sales'}));
   ppl.push({id:'e2e-c4',name:'퇴사영업',dept:'sales',rank:'매니저',email:'e2e-c4@test.local',groupId:'sales',resigned:true});
   ppl.forEach(u=>localUsers.push(u));
   const before=collabRequests.length, notiBefore=collabNotifications.length;
   const fill=(title)=>{
     openTaskModal('ops');
     document.getElementById('task-collab-target').value='sales'; onTaskTargetChange();
     document.getElementById('task-type').value='collab'; onTaskTypeChange();
     document.getElementById('task-title').value=title;
     const a=document.getElementById('task-assignee'); if(a&&!a.value) a.value='요청자시험';
   };
   // ① 두 명 선택
   fill('복수선택시험');
   const box=document.getElementById('task-assignee-users');
   r.boxVisible=!document.getElementById('task-assignee-user-wrap').classList.contains('hidden');
   r.listHasPeople=['영업가','영업나','영업다'].every(n=>box.innerText.includes(n));
   r.noResigned=!box.innerText.includes('퇴사영업');
   box.querySelectorAll('.collab-assignee').forEach(c=>{ if(['영업가','영업다'].includes(c.value)){ c.checked=true; } });
   onCollabAssigneeChange();
   r.countLabel=document.getElementById('task-assignee-count').innerText;
   submitTask({preventDefault(){}});
   const made=collabRequests.slice(before);
   r.made=made.length+':'+(made[0].assigneeUsers||[]).join(',');
   r.notis=collabNotifications.slice(notiBefore).map(n=>n.toUser).sort().join(',');
   const req=made[0];
   openCollabDetailModal(req.id); r.detailGroup=document.getElementById('collab-detail-body').innerText.includes('영업가, 영업다'); closeCollabDetailModal();
   // 받은 사람 각자 받은 요청에 보이는지 · 안 받은 사람은 아닌지
   r.receivers=[collabIsReceiver(req,'영업가'),collabIsReceiver(req,'영업다'),collabIsReceiver(req,'영업나')].join(',');
   // 영업가가 수락 → 요청 전체 수락 · 영업다에게 알림
   const sv=currentUserName; currentUserName='영업가';
   openCollabAcceptModal(req.id); const ad=document.getElementById('accept-date'); if(ad) ad.value='2099-12-31';
   const n2=collabNotifications.length;
   submitCollabAccept({preventDefault(){}});
   currentUserName=sv;
   r.accepted=req.status==='accepted'&&req.handledBy==='영업가';
   r.takenNoti=collabNotifications.slice(n2).filter(n=>n.type==='collab-taken').map(n=>n.toUser).join(',');
   r.cardChip=collabTicketCard(req,'outbox').includes('(2명)');
   // ② 아무도 고르지 않음 → 부서 전체 한 건
   const b2=collabRequests.length;
   fill('부서전체시험'); submitTask({preventDefault(){}});
   const m2=collabRequests.slice(b2);
   r.deptWide=m2.length===1&&m2[0].assigneeUser===''&&!m2[0].assigneeUsers;
   // 정리
   collabRequests.splice(before); collabNotifications.splice(notiBefore);
   ppl.forEach(p=>localUsers.splice(localUsers.findIndex(u=>u.id===p.id),1));
   return r;
 });
 const expect={boxVisible:true,listHasPeople:true,noResigned:true,made:'1:영업가,영업다',notis:'영업가,영업다',detailGroup:true,receivers:'true,true,false',accepted:true,takenNoti:'영업다',cardChip:true,deptWide:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
