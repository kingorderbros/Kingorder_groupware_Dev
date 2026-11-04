// 사용법: node tools/e2e-wbs-replan.js . [사진 저장 경로]   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-04 — 보류 취소로 후속 작업과 겹쳐도 일정은 자동으로 옮기지 않음. 담당자 · PM 에게 확인 요청, 담당자가 확정해야 바뀜. 다음 작업도 같은 방식.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';const SHOT=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8860,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];const dialogs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 await pg.goto('http://localhost:8860/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const D=n=>wbsAddDays(ymd(new Date()),n);
   const notiBefore=collabNotifications.length;
   const P={id:'E2E-R',name:'재수립시험',dept:'it',owner:'PM담당',status:'active',startPlan:D(-30),endPlan:D(90),wbs:[
     {id:'A',code:'1',name:'앞작업',parentId:'',dept:'it',assignee:'담당A',status:'todo',startPlan:D(-10),endPlan:D(-5),works:[],predecessors:[]},
     {id:'C',code:'2',name:'후속',parentId:'',dept:'it',assignee:'담당C',status:'todo',startPlan:D(-3),endPlan:D(7),works:[],predecessors:['A']},
     {id:'E',code:'3',name:'그다음',parentId:'',dept:'it',assignee:'담당E',status:'todo',startPlan:D(9),endPlan:D(20),works:[],predecessors:['C']},
     {id:'F',code:'4',name:'안겹침',parentId:'',dept:'it',assignee:'담당F',status:'todo',startPlan:D(40),endPlan:D(50),works:[],predecessors:['A']},
     {id:'G',code:'5',name:'끝난후속',parentId:'',dept:'it',assignee:'담당G',status:'done',startPlan:D(-3),endPlan:D(-1),endActual:D(-1),works:[],predecessors:['A']}
   ],issues:[]};
   projects.push(P); currentProjectId='E2E-R'; navigate('project-center',document.getElementById('nav-project-center')||null);
   const w=id=>P.wbs.find(x=>x.id===id);
   const sub=()=>new Event('submit',{cancelable:true});
   openWbsHoldModal('E2E-R','A');document.getElementById('wbshold-from').value=D(-4);document.getElementById('wbshold-reason').value='고객 사정';submitWbsHold(sub());
   openWbsResumeModal('E2E-R','A');document.getElementById('wbsresume-date').value=D(0);onWbsResumeDateChange();
   r.previewAsks=document.getElementById('wbsresume-preview').innerText.includes('담당자에게 일정 재수립을 요청합니다')&&document.getElementById('wbsresume-preview').innerText.includes('후속');
   submitWbsResume(sub());
   // 자동으로 옮기지 않음
   r.heldTaskCalc=w('A').startPlan===D(0)&&w('A').endPlan===D(5);
   r.noAutoMove=w('C').startPlan===D(-3)&&w('C').endPlan===D(7);
   r.flagged=!!w('C').replan&&w('C').replan.fromEnd===D(5);
   r.notFlaggedNoOverlap=!w('F').replan;
   r.notFlaggedDone=!w('G').replan;
   r.notNextYet=!w('E').replan;
   let ns=collabNotifications.slice(notiBefore);
   r.notiOwner=ns.some(n=>n.type==='project-wbs-replan'&&n.toUser==='담당C')&&ns.some(n=>n.type==='project-wbs-replan'&&n.toUser==='PM담당');
   r.notiNoOthers=!ns.some(n=>n.type==='project-wbs-replan'&&['담당F','담당G','담당E'].includes(n.toUser));
   r.notiText=notiText(ns.find(n=>n.type==='project-wbs-replan')).includes('일정을 확인해 다시 정해 주세요');
   // 표 · 머리 · 상세 표시
   renderProjectCenter();
   const tbl=document.getElementById('prj-view-wbs');
   r.tableChip=tbl.innerText.includes('일정 재수립 필요');
   r.headChip=document.getElementById('prj-d-delay').innerText.includes('일정 재수립 1건');
   openWbsDetailModal('E2E-R','C');
   const det=document.getElementById('wbsdetail-body').innerText;
   r.detail=det.includes('앞작업')&&det.includes('자동으로 바뀌지 않았습니다');
   closeWbsDetailModal();
   // 권한 — 다른 사람은 단추도 없고 창도 안 열림
   const save={n:currentUserName,d:currentUserDept,l:currentUserLevel};
   return Object.assign(r,{_save:save});
 });
 const out2=await pg.evaluate(async()=>{
   const r={};
   const D=n=>wbsAddDays(ymd(new Date()),n);
   const P=projects.find(x=>x.id==='E2E-R');const w=id=>P.wbs.find(x=>x.id===id);const sub=()=>new Event('submit',{cancelable:true});
   const orig={n:currentUserName,cm:canManageAllData};
   const notiBefore=collabNotifications.length;
   // 표의 단추를 실제로 눌러 엽니다
   const btn=[...document.querySelectorAll('#prj-view-wbs button')].find(b=>b.textContent.includes('일정 재수립'));
   r.tableBtn=!!btn;btn&&btn.click();
   const m=document.getElementById('wbs-replan-modal');
   r.modalOpen=!m.classList.contains('hidden');
   r.modalReason=document.getElementById('wbsreplan-reason').innerText.includes(D(5));
   r.modalDefaults=document.getElementById('wbsreplan-start').value===D(-3)&&document.getElementById('wbsreplan-end').value===D(7);
   r.overlapNote=!document.getElementById('wbsreplan-note').classList.contains('hidden');
   // 종료가 시작보다 빠르면 막음
   document.getElementById('wbsreplan-start').value=D(6);document.getElementById('wbsreplan-end').value=D(1);submitWbsReplan(sub());
   r.endChecked=!!w('C').replan;
   // 다음 작업과 겹치게 정하면 그 담당자에게도 요청 (미리 안내)
   document.getElementById('wbsreplan-end').value=D(16);onWbsReplanDateChange();
   r.nextNote=document.getElementById('wbsreplan-note').innerText.includes('그다음');
   return r;
 });
 if(SHOT){await pg.screenshot({path:SHOT});}
 const out3=await pg.evaluate(async()=>{
   const r={};
   const D=n=>wbsAddDays(ymd(new Date()),n);
   const P=projects.find(x=>x.id==='E2E-R');const w=id=>P.wbs.find(x=>x.id===id);const sub=()=>new Event('submit',{cancelable:true});
   const notiBefore=collabNotifications.length;
   submitWbsReplan(sub());
   r.applied=w('C').startPlan===D(6)&&w('C').endPlan===D(16)&&!w('C').replan;
   r.history=w('C').replanHistory.length===1&&w('C').replanHistory[0].before.startPlan===D(-3)&&w('C').replanHistory[0].after.endPlan===D(16);
   r.chain=!!w('E').replan&&w('E').startPlan===D(9)&&w('E').replan.fromEnd===D(16);
   let ns=collabNotifications.slice(notiBefore);
   r.notiDone=ns.some(n=>n.type==='project-wbs-replanned'&&n.toUser==='담당C');
   r.notiChain=ns.some(n=>n.type==='project-wbs-replan'&&n.toUser==='담당E');
   renderProjectCenter();
   openWbsDetailModal('E2E-R','C');r.historyShown=document.getElementById('wbsdetail-body').innerText.includes('일정 재수립 기록');closeWbsDetailModal();
   // 날짜를 안 바꾸고 확정 — 요청은 닫히고 일정은 그대로, 다음 작업 요청 없음
   w('E').successorsMark=1;
   openWbsReplanModal('E2E-R','E');submitWbsReplan(sub());
   r.keepDates=!w('E').replan&&w('E').startPlan===D(9)&&w('E').endPlan===D(20);
   // 이미 시작한 작업은 시작 예정일 칸을 막음
   w('F').replan={fromId:'A',fromName:'1. 앞작업',fromEnd:D(45),by:'x',at:D(0)};w('F').startActual=D(39);w('F').status='doing';
   openWbsReplanModal('E2E-R','F');r.startLocked=document.getElementById('wbsreplan-start').disabled;closeWbsReplanModal();
   // 수정 창에서 날짜를 바꿔도 요청이 닫힘
   openWbsModal('E2E-R','F');document.getElementById('wbs-end-plan').value=D(60);submitWbs(sub());
   r.editCloses=!w('F').replan&&w('F').replanHistory.length===1;
   // 완료된 작업엔 표시 안 함
   w('G').replan={fromId:'A',fromName:'x',fromEnd:D(1),by:'x',at:D(0)};r.doneNoChip=!wbsNeedsReplan(w('G'));delete w('G').replan;
   // 권한 — 담당자 · PM 아닌 일반 직원은 못 함
   w('C').replan={fromId:'A',fromName:'x',fromEnd:D(20),by:'x',at:D(0)};
   const cu=currentUserName,cl=currentUserLevel,oc=window.canManageAllData;
   currentUserName='관계없는사람';currentUserLevel='staff';window.canManageAllData=()=>false;
   r.noPerm=!isWbsHandler(P,w('C'))?!canReplanWbs(P,w('C')):'skip';
   currentUserName='담당C';r.ownerCan=canReplanWbs(P,w('C'));
   currentUserName=cu;currentUserLevel=cl;window.canManageAllData=oc;
   projects.splice(projects.findIndex(x=>x.id==='E2E-R'),1);saveProjects();
   return r;
 });
 delete out._save;
 const all=Object.assign({},out,out2,out3);
 const bad=Object.keys(all).filter(k=>all[k]!==true);
 console.log(JSON.stringify(all));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)),'· 안내창',JSON.stringify(dialogs));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
