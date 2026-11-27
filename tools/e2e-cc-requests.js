// 사용법: node tools/e2e-cc-requests.js   (맥 크롬 헤드리스) — 참조 지정 (2026-11-27, v1.1.51)
//   협업요청 · 업무지시 · 업무이관(운영 접수) · 보완서류 요청 · 계약 승인에 참조자 지정 → 저장 · 알림(등록 · 진행 · 코멘트) · 보기 범위 · 참조함 · 상세 · 참조 코멘트
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,500));}};
srv.listen(8877,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1400,height:900});await pg.goto('http://localhost:8877/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const r=await pg.evaluate(async()=>{
  const wait=ms=>new Promise(x=>setTimeout(x,ms));const out={};
  [['cc1','영업가','sales'],['cc2','영업나','sales'],['cc3','참조인','mgmt'],['cc4','참조둘','mgmt'],['cc5','운영가','ops']].forEach(([id,name,dept])=>localUsers.push({id:'e2e-'+id,name,dept,rank:'매니저',email:id+'@test.local',groupId:dept}));
  const notesFor=(who,from)=>collabNotifications.slice(from).filter(n=>n.toUser===who);
  const pick=(boxId,names)=>{const b=document.getElementById(boxId);b.querySelectorAll('.cc-pick').forEach(c=>{c.checked=names.includes(c.value);});b.querySelectorAll('.cc-pick')[0].dispatchEvent(new Event('change',{bubbles:true}));return b.querySelector('[data-cc-count]').textContent;};

  // ① 협업요청 — 두 명에게 + 참조 2명
  openTaskModal('ops'); document.getElementById('task-collab-target').value='sales'; onTaskTargetChange();
  document.getElementById('task-type').value='collab'; onTaskTypeChange(); document.getElementById('task-title').value='참조시험 협업';
  out.ccWrapShown=!document.getElementById('task-cc-wrap').classList.contains('hidden') && !!document.getElementById('task-cc');
  document.querySelectorAll('#task-assignee-users .collab-assignee').forEach(c=>{c.checked=['영업가','영업나'].includes(c.value);});onCollabAssigneeChange();
  out.ccCount=pick('task-cc',['참조인','참조둘']);
  let n0=collabNotifications.length; submitTask({preventDefault(){}});
  const req=collabRequests[collabRequests.length-1];
  out.collabCc=(req.ccUsers||[]).join(',');
  out.collabCcNotes=[notesFor('참조인',n0).map(n=>n.type),notesFor('참조둘',n0).length];
  out.collabRecvNotes=collabNotifications.slice(n0).filter(n=>n.type==='collab-requested'&&(n.toUser==='영업가'||n.toDept==='sales')).length;
  // 참조자(보기 범위 '본인')에게 보이는지
  const sv={n:currentUserName,d:currentUserDept,l:currentUserLevel};
  currentUserName='참조인'; currentUserDept='mgmt'; currentUserLevel='staff';
  out.ccSees=getVisibleTickets().some(x=>x.id===req.id);
  currentUserName='운영가'; currentUserDept='ops';
  out.otherSees=getVisibleTickets().some(x=>x.id===req.id && x.assignee!=='운영가');
  // 받은 사람이 코멘트 → 참조자에게 참조 코멘트 알림 1번
  currentUserName='영업가'; currentUserDept='sales';
  openCollabDetailModal(req.id); out.detailCc=document.getElementById('collab-detail-body').innerText.includes('참조');
  toggleCollabCommentForm&&toggleCollabCommentForm(); const ct=document.getElementById('collab-comment-text'); if(ct){ ct.value='확인했습니다'; n0=collabNotifications.length; addCollabComment(req.id); out.commentCc=notesFor('참조인',n0).map(n=>n.type+':'+n.ccKind); }
  closeCollabDetailModal();
  // 요청자가 수정 창에서 참조 바꾸기 → 새로 들어온 사람만 cc-new
  currentUserName=sv.n; currentUserDept=sv.d; currentUserLevel=sv.l;
  req.assignee=currentUserName;
  openCollabEditModal(req.id); out.editHasCc=!!document.getElementById('collab-edit-cc');
  pick('collab-edit-cc',['참조인','운영가']); n0=collabNotifications.length; submitCollabEdit({preventDefault(){}});
  out.editCc=(req.ccUsers||[]).join(','); out.editNew=notesFor('운영가',n0).filter(n=>n.type==='cc-new').length;
  out.editLog=(req.edits||[]).slice(-1)[0].changes.map(c=>c.label).join(',');

  // ② 업무지시 + 참조
  openTaskModal('ops'); document.getElementById('task-collab-target').value='ops'; onTaskTargetChange();
  document.getElementById('task-type').value='directive'; onTaskTypeChange();
  document.getElementById('task-title').value='참조시험 지시'; document.getElementById('task-directive-due').value='2099-12-31';
  const dt=document.querySelectorAll('#task-directive-targets .directive-target'); if(dt[0]) dt[0].checked=true; onDirectiveTargetChange&&onDirectiveTargetChange();
  pick('task-cc',['참조둘']); n0=collabNotifications.length; const c0=collabRequests.length; submitTask({preventDefault(){}});
  out.dirMade=collabRequests.length-c0; out.dirCc=collabRequests.slice(c0).every(x=>(x.ccUsers||[]).join()==='참조둘'); out.dirNote=notesFor('참조둘',n0).map(n=>n.type);

  // ③ 업무이관 — 운영 AS 접수에서 영업본부로 이관 + 참조
  customers.push({id:'cCC',name:'참조식당',businessNo:'444-44-44444',contact:'010-4444-5555',contactName:'김참조',ceo:'김참조',status:'거래중'});
  navigate('ops-work-center',document.getElementById('nav-ops-work-center'));await wait(300);
  setWorkType('ops','as');await wait(150);wcEl('ops','search-name').value='참조식당';searchWorkCenterCustomer('ops');await wait(200);
  out.workPicker=!!document.getElementById(wcId('ops','intake-cc'));
  [...wcEl('ops','intake-fields').querySelectorAll('select')].forEach(x=>{const o=[...x.options].find(y=>y.value&&y.value!=='택배'&&y.value!=='기타');if(o)x.value=o.value;x.dispatchEvent(new Event('change'));});
  const tr=wcEl('ops','intake-transfer'); const so=[...tr.options].find(o=>/^sales/.test(o.value)); if(so) tr.value=so.value;
  wcEl('ops','intake-memo').value='참조 이관 시험';
  pick(wcId('ops','intake-cc'),['참조인']); n0=collabNotifications.length;
  submitWorkIntake({preventDefault(){}},'ops');await wait(200);
  const w=wcDef('ops').works.find(x=>x.memo==='참조 이관 시험');
  out.workCc=w&&(w.ccUsers||[]).join(','); out.workNote=notesFor('참조인',n0).map(n=>n.type+':'+n.ccKind+':'+(/이관/.test(n.detail)?'이관':''));
  out.pickerCleared=document.getElementById(wcId('ops','intake-cc')).querySelectorAll('.cc-pick:checked').length;
  n0=collabNotifications.length; setWorkStatus('ops',w.id,'hold'); out.workStatusNote=notesFor('참조인',n0).map(n=>n.type);
  openWorkOwnEdit('ops',w.id); out.woeCc=!!document.getElementById('woe-cc'); document.getElementById('work-own-edit-modal').classList.add('hidden');

  // ④ 보완서류 요청 + 참조
  openPayDocRequestModal(); out.payPicker=!!document.getElementById('paydoc-cc');
  document.getElementById('paydoc-merchant').value='참조가맹점'; document.getElementById('paydoc-due').value='2099-12-31';
  const firstDoc=document.querySelector('#paydoc-catalog input[type=checkbox]'); if(firstDoc){firstDoc.checked=true;}
  pick('paydoc-cc',['참조둘']); n0=collabNotifications.length; submitPayDocRequest({preventDefault(){}});
  const pd=payDocRequests[0]; out.payCc=(pd.ccUsers||[]).join(','); out.payNote=notesFor('참조둘',n0).map(n=>n.type+':'+n.ccKind);
  n0=collabNotifications.length; payDocLog(pd,'시험 처리 이력'); out.payLogNote=notesFor('참조둘',n0).map(n=>n.type);

  // ⑤ 계약 승인 + 참조
  const cid='CT-CC-1'; contracts.unshift({id:cid,customerId:'cCC',owner:'영업가',status:'초안',approvalStatus:'미승인',currentStep:0,approvalSteps:buildApprovalSteps(),noAttachment:true,noAttachmentReason:'시험',items:[]});
  let host=document.getElementById('contract-approval-actions'); 
  if(host){ renderContractApproval(cid); out.ctPicker=!!document.getElementById('contract-cc'); pick('contract-cc',['참조인']);
    const ra=window.readContractAttachment; window.readContractAttachment=()=>({noAttach:true,reason:'시험',hasNewFile:false});
    n0=collabNotifications.length; submitContractForApproval(cid); window.readContractAttachment=ra;
    const c=contracts.find(x=>x.id===cid); out.ctCc=(c.ccUsers||[]).join(','); out.ctNote=notesFor('참조인',n0).map(n=>n.type+':'+n.ccKind);
    n0=collabNotifications.length; approveContractStep(cid); out.ctApproveNote=notesFor('참조인',n0).map(n=>n.type);
  } else out.ctPicker='no-host';

  // ⑥ 참조함 · 상세 · 참조 코멘트 (참조인 시점)
  currentUserName='참조인'; currentUserDept='mgmt'; currentUserLevel='staff';
  const mine=ccMyList(); out.boxKinds=[...new Set(mine.map(x=>x.kind))].sort().join(',');
  openCcBox(''); out.boxRows=document.querySelectorAll('#cc-box-modal [data-cc-row]').length;
  openCcDetail('work',w.id); out.detailWork=document.getElementById('cc-detail-modal').innerText.includes('참조 이관 시험');
  document.getElementById('cc-comment-text').value='참조자 의견입니다'; n0=collabNotifications.length; addCcComment('work',w.id);
  out.ccCommentSaved=(w.ccComments||[]).length; out.ccCommentTo=collabNotifications.slice(n0).map(n=>n.toUser).sort().join(',');
  const cn=collabNotifications.slice(n0)[0]; out.clickJs=cn?notiClickJs(cn):'';
  // 관계없는 사람은 상세를 못 봄
  currentUserName='운영가'; currentUserDept='ops'; document.getElementById('cc-detail-modal').classList.add('hidden');
  const cma=window.canManageAllData; window.canManageAllData=()=>false; openCcDetail('paydoc',pd.id); window.canManageAllData=cma; out.strangerBlocked=document.getElementById('cc-detail-modal').classList.contains('hidden');
  currentUserName=sv.n; currentUserDept=sv.d; currentUserLevel=sv.l;
  out.ver=(window.KOB_VERSION||{}).groupware;
  return out;});
 console.log(JSON.stringify(r).slice(0,1500));
 ok(r.ccWrapShown && /2명/.test(r.ccCount),'협업요청 창에 참조 선택칸 · 2명 선택 표시',[r.ccWrapShown,r.ccCount]);
 ok(r.collabCc.split(',').sort().join()===['참조인','참조둘'].sort().join(),'협업요청에 참조 저장',r.collabCc);
 ok(r.collabCcNotes[0].length===1 && r.collabCcNotes[0][0]==='cc-new' && r.collabCcNotes[1]===1,'받는 사람이 2명이어도 참조자에게 등록 알림 1번',r.collabCcNotes);
 ok(r.collabRecvNotes>=1,'받는 사람(부서) 알림은 그대로',r.collabRecvNotes);
 ok(r.ccSees===true && r.otherSees===false,'참조자(본인 범위)는 요청을 보고, 관계없는 사람은 못 봄',[r.ccSees,r.otherSees]);
 ok(r.detailCc,'요청 상세에 참조 표시');
 ok(Array.isArray(r.commentCc) && r.commentCc.length===1 && r.commentCc[0]==='cc-comment:collab','받은 사람 코멘트 → 참조자에게 참조 코멘트 알림',r.commentCc);
 ok(r.editHasCc && r.editCc.split(',').sort().join()===['참조인','운영가'].sort().join() && r.editNew===1 && /참조/.test(r.editLog),'수정 창에서 참조 변경 · 새로 들어온 사람만 알림 · 수정 이력',[r.editHasCc,r.editCc,r.editNew,r.editLog]);
 ok(r.dirMade>=1 && r.dirCc && r.dirNote.length===1 && r.dirNote[0]==='cc-new','업무지시에도 참조 · 알림 1번',[r.dirMade,r.dirCc,r.dirNote]);
 ok(r.workPicker && r.workCc==='참조인','업무 접수(이관) 참조 저장',[r.workPicker,r.workCc]);
 ok(r.workNote.length===1 && r.workNote[0]==='cc-new:work:이관','업무 접수 · 이관 알림',r.workNote);
 ok(r.pickerCleared===0,'접수 뒤 참조 선택이 비워짐',r.pickerCleared);
 ok(r.workStatusNote.join()==='cc-update','업무 상태 변경 → 참조자 알림',r.workStatusNote);
 ok(r.woeCc,'업무 수정 창에 참조');
 ok(r.payPicker && r.payCc==='참조둘' && r.payNote.join()==='cc-new:paydoc','보완서류 요청 참조 저장 · 알림',[r.payPicker,r.payCc,r.payNote]);
 ok(r.payLogNote.join()==='cc-update','보완서류 처리 이력 → 참조자 알림',r.payLogNote);
 ok(r.ctPicker===true && r.ctCc==='참조인' && r.ctNote.join()==='cc-new:contract' && r.ctApproveNote.join()==='cc-update','계약 승인 상신 · 승인 → 참조자 알림',[r.ctPicker,r.ctCc,r.ctNote,r.ctApproveNote]);
 ok(['collab','contract','work'].every(k=>r.boxKinds.split(',').includes(k)) && r.boxRows>=3,'참조함에 협업 · 업무 · 계약이 모임',[r.boxKinds,r.boxRows]);
 ok(r.detailWork,'참조 상세 — 업무 접수 내용 보임');
 ok(r.ccCommentSaved===1 && r.ccCommentTo.includes('정장훈') && !r.ccCommentTo.includes('참조인'),'참조 코멘트 저장 · 접수자에게 알림 · 본인 제외',[r.ccCommentSaved,r.ccCommentTo]);
 ok(/^openCcDetail\((&quot;|')work/.test(r.clickJs),'참조 알림 클릭 → 참조 상세',r.clickJs);
 ok(r.strangerBlocked,'관계없는 사람은 참조 상세를 못 봄');
 ok(r.ver==='1.1.51','버전 1.1.51',r.ver);
 ok(errs.length===0,'페이지 오류 없음',errs);
 console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
