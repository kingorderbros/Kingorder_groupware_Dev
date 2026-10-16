// 사용법: node tools/e2e-admin-delete.js .   — 삭제는 관리자만 · 관리자에게 삭제 요청 (2026-10-16)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};
srv.listen(8819,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>d.type()==='prompt'?d.accept('시험 사유'):d.accept());
 await pg.goto('http://localhost:8819/',{waitUntil:'networkidle0'});
 const seed=()=>{
   collabNotifications.push({id:'N-T1',type:'collab-completed',toUser:currentUserName,date:'2026-10-16',read:false,title:'시험1'},{id:'N-T2',type:'collab-completed',toUser:currentUserName,date:'2026-10-16',read:false,title:'시험2'});
   saveJsonStore('gwPartnerSignups.v1',[{id:'SU-T1',status:'rejected',at:Date.now(),loginId:'t1',company:{name:'시험업체'}},{id:'SU-T2',status:'pending',at:Date.now(),loginId:'t2',company:{name:'대기업체'}}]);
   localTasks.push({id:'LT-T1',title:'시험업무',status:'todo',followUps:[{author:'가',date:'1',text:'첫째'},{author:'나',date:'2',text:'둘째'}]});
   salesIssues.push({id:'ISS-T1',title:'시험이슈',reporter:'다른사람',reportTo:[],comments:[{id:'c1',by:'가',at:'2026-10-16',text:'코멘트1'},{id:'c2',by:'나',at:'2026-10-16',text:'코멘트2'}]});
   devRequests.push({id:'DEV-T1',title:'시험의뢰',status:'requested',thread:[{id:'m1',by:'가',side:'kob',at:'2026-10-16',text:'대화1'},{id:'m2',by:'나',side:'partner',at:'2026-10-16',text:'대화2'}]});
 };
 // 1) 일반 직원 — 삭제 단추가 보이지 않고, 함수를 불러도 지워지지 않는다
 const staff=await pg.evaluate(`(()=>{enterApp({email:'s@k.co',dept:'sales',name:'직원'});(${seed})();
   renderNotiPanel();const nb=document.querySelector('#noti-panel-list [onclick*="deleteNoti"]');
   deleteNoti('N-T1');deleteCompanySignup('SU-T1');deleteFollowUp('LT-T1',0);deleteIssueComment('ISS-T1','c1');deleteDevMessage('DEV-T1','m1');
   return {nb:!!nb,clr:!document.getElementById('noti-clear-btn').classList.contains('hidden'),
     n:collabNotifications.filter(x=>x.id.startsWith('N-T')).length,su:loadJsonStore('gwPartnerSignups.v1',[]).length,
     fu:localTasks.find(t=>t.id==='LT-T1').followUps.length,cm:salesIssues.find(x=>x.id==='ISS-T1').comments.length,th:devRequests.find(x=>x.id==='DEV-T1').thread.length,
     thHtml:devThreadHtml(devRequests.find(x=>x.id==='DEV-T1'),'kob').includes('deleteDevMessage')};})()`);
 console.log('\n[1] 일반 직원');
 ok(!staff.nb&&!staff.clr,'알림 삭제 단추가 보이지 않는다');ok(!staff.thHtml,'개발의뢰 대화 삭제 단추가 보이지 않는다');
 ok(staff.n===2&&staff.su===2&&staff.fu===2&&staff.cm===2&&staff.th===2,'함수를 직접 불러도 지워지지 않는다');
 // 2) 관리자
 await pg.reload({waitUntil:'networkidle0'});
 const adm=await pg.evaluate(`(()=>{enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'});(${seed})();
   renderNotiPanel();const r={};r.nb=document.querySelectorAll('#noti-panel-list [onclick*="deleteNoti"]').length;r.clr=!document.getElementById('noti-clear-btn').classList.contains('hidden');
   r.suHtml=(companySignupsHtml().match(/deleteCompanySignup/g)||[]).length;
   const dv=devRequests.find(x=>x.id==='DEV-T1');r.thKob=(devThreadHtml(dv,'kob').match(/deleteDevMessage/g)||[]).length;r.thPartner=devThreadHtml(dv,'partner').includes('deleteDevMessage');
   deleteNoti('N-T1');r.n1=collabNotifications.filter(x=>x.id.startsWith('N-T')).map(x=>x.id).join();
   deleteAllMyNoti();r.n2=myNotifications().length;
   deleteCompanySignup('SU-T1');r.su=loadJsonStore('gwPartnerSignups.v1',[]).map(x=>x.id).join();
   const box=document.getElementById('detail-followups');
   renderFollowUps(localTasks.find(t=>t.id==='LT-T1'));r.fuBtn=box.querySelectorAll('[onclick*="deleteFollowUp"]').length;
   deleteFollowUp('LT-T1',0);r.fu=localTasks.find(t=>t.id==='LT-T1').followUps.map(f=>f.text).join();
   issueViewId='ISS-T1';deleteIssueComment('ISS-T1','c1');r.cm=salesIssues.find(x=>x.id==='ISS-T1').comments.map(c=>c.id).join();
   r.cmSaved=(loadJsonStore(ISSUE_KEY,[]).find(x=>x.id==='ISS-T1')||{comments:[]}).comments.length;
   devViewId='DEV-T1';deleteDevMessage('DEV-T1','m1');r.th=devRequests.find(x=>x.id==='DEV-T1').thread.map(m=>m.id).join();
   r.thSaved=(loadJsonStore(DEVREQ_KEY,[]).find(x=>x.id==='DEV-T1')||{thread:[]}).thread.length;
   return r;})()`);
 console.log('\n[2] 관리자');
 ok(adm.nb===2&&adm.clr,'알림마다 삭제 단추 · 모두 삭제 단추가 보인다');
 ok(adm.n1==='N-T2','알림 한 건 삭제');ok(adm.n2===0,'알림 모두 삭제');
ok(adm.suHtml===1&&adm.su==='SU-T2','가입 신청 카드에 삭제 단추(승인대기 탭 1건) · 처리 완료 건 삭제');
 ok(adm.fuBtn===2&&adm.fu==='둘째','Follow-up 삭제');
 ok(adm.cm==='c2'&&adm.cmSaved===1,'이슈 코멘트 삭제 · 저장');
 ok(adm.thKob===2&&!adm.thPartner,'개발의뢰 대화 — 그룹웨어 화면에만 삭제 단추');ok(adm.th==='m2'&&adm.thSaved===1,'개발의뢰 대화 삭제 · 저장');
 // 3) 삭제 요청 — 직원이 요청 → 관리자에게 알림 → 관리자가 삭제 실행 · 반려
 await pg.reload({waitUntil:'networkidle0'});
 const rq=await pg.evaluate(()=>{
   localUsers.push({id:'u-adm',name:'관리자시험',dept:'admin',groupId:'admin',email:'a@k.co'},{id:'u-st',name:'직원',dept:'sales',groupId:'sales',email:'s@k.co'});
   enterApp({email:'s@k.co',dept:'sales',name:'직원'});
   contracts.push({id:'K-T1',title:'시험계약'});quotes.push({id:'Q-T1',title:'시험견적'});
   localTasks.push({id:'LT-T2',title:'요청업무',status:'todo',followUps:[]});
   orgRanks.push({id:'rk-t',name:'시험직급',cls:'staff'});
   const r={};
   deleteContract('K-T1');r.kept=contracts.some(x=>x.id==='K-T1');
   const reqs=deleteRequestList();r.req=reqs.length===1&&reqs[0].fn==='deleteContract'&&reqs[0].args[0]==='K-T1'&&reqs[0].reason==='시험 사유'&&reqs[0].by==='직원';
   r.noti=collabNotifications.some(n=>n.type==='delete-request'&&n.toUser==='관리자시험');
   deleteContract('K-T1');r.dup=deleteRequestList().length===1;
   deleteQuote('Q-T1');
   const rank=orgRanks.findIndex(x=>x.name==='시험직급');deleteOrgRank(rank);r.rankReq=deleteRequestList().some(x=>x.fn==='deleteOrgRank'&&x.args[0]==='시험직급');
   const html=adminEditButtonHtml(`openLocalTaskAdminEdit('LT-T2')`,'관리자 수정');r.btn=html.includes('삭제 요청')&&html.includes('data-fn="openLocalTaskAdminEdit"');
   const holder=document.createElement('div');holder.innerHTML=html;document.body.appendChild(holder);requestAdminDeleteFromBtn(holder.querySelector('button'));
   r.popReq=deleteRequestList().some(x=>x.fn==='openLocalTaskAdminEdit'&&x.args[0]==='LT-T2'&&x.kind==='자부서 업무');
   openDeleteRequests();r.mine=document.querySelectorAll('#delreq-body [onclick^="withdrawDeleteRequest"]').length;r.noApprove=!document.querySelector('#delreq-body [onclick^="approveDeleteRequest"]');
   approveDeleteRequest(deleteRequestList()[0].id);r.staffCant=contracts.some(x=>x.id==='K-T1');
   return r;});
 console.log('\n[3] 직원 — 삭제 요청');
 ok(rq.kept,'직원이 계약 삭제를 누르면 지워지지 않는다');ok(rq.req,'사유와 함께 삭제 요청이 남는다');ok(rq.noti,'관리자에게 알림이 간다');
 ok(rq.dup,'같은 자료를 다시 요청하면 막는다');ok(rq.rankReq,'직급은 이름으로 요청한다(순서가 바뀌어도 맞게)');
 ok(rq.btn&&rq.popReq,'관리자 수정 창만 있던 자료에 \'삭제 요청\' 단추');ok(rq.mine===4&&rq.noApprove,'직원은 본인 요청만 보고 [요청 취소]만 할 수 있다');
 ok(rq.staffCant,'직원은 삭제 실행을 못 한다');
 const ad=await pg.evaluate(async()=>{
   enterApp({email:'a@k.co',dept:'admin',name:'관리자시험'});const r={};
   const L=()=>deleteRequestList();const by=fn=>L().find(x=>x.fn===fn);
   openDeleteRequests('pending');r.rows=document.querySelectorAll('#delreq-body [onclick^="approveDeleteRequest"]').length;
   await approveDeleteRequest(by('deleteContract').id);r.gone=!contracts.some(x=>x.id==='K-T1');r.done=by('deleteContract').status==='done';
   r.result=collabNotifications.some(n=>n.type==='delete-request-result'&&n.toUser==='직원');
   rejectDeleteRequest(by('deleteQuote').id);r.rej=by('deleteQuote').status==='rejected'&&quotes.some(x=>x.id==='Q-T1');
   await approveDeleteRequest(by('deleteOrgRank').id);r.rank=!orgRanks.some(x=>x.name==='시험직급')&&by('deleteOrgRank').status==='done';
   await approveDeleteRequest(by('openLocalTaskAdminEdit').id);r.pop=!document.getElementById('admin-edit-modal').classList.contains('hidden')&&by('openLocalTaskAdminEdit').status==='pending';
   adminRecordDelete();r.popDone=!localTasks.some(t=>t.id==='LT-T2')&&by('openLocalTaskAdminEdit').status==='done';
   r.adminDirect=(()=>{contracts.push({id:'K-T2',title:'바로삭제'});deleteContract('K-T2');return !contracts.some(x=>x.id==='K-T2');})();
   return r;});
 console.log('\n[4] 관리자 — 삭제 실행 · 반려');
 ok(ad.rows===4,'관리자는 대기 중인 요청을 모두 본다');ok(ad.gone&&ad.done,'[삭제 실행] — 자료가 지워지고 완료로 바뀐다');ok(ad.result,'요청자에게 결과 알림');
 ok(ad.rej,'[반려] — 자료는 남고 반려로 바뀐다');ok(ad.rank,'직급 삭제 요청 실행');ok(ad.pop&&ad.popDone,'관리자 수정 창 자료 — 창에서 삭제하면 요청이 완료된다');
 ok(ad.adminDirect,'관리자는 요청 없이 바로 삭제한다');
 ok(!errs.length,'화면 오류 없음 '+JSON.stringify(errs.slice(0,3)));
 console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);await br.close();srv.close();process.exit(fail?1:0);});
