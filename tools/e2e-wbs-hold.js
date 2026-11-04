// 사용법: node tools/e2e-wbs-hold.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-04 — WBS 보류: 재시작 예정일 · 사유, 보류 중 시작 · 완료 막음 · 지연 대신 보류 표시, 보류 취소하면 일정 계산(시작 전 = 재시작일로 기간 유지, 시작 후 = 종료 예정일만 뒤로) · 기록 · 알림
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8858,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];const dialogs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 await pg.goto('http://localhost:8858/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const D=n=>wbsAddDays(ymd(new Date()),n);
   const notiBefore=collabNotifications.length;
   const P={id:'E2E-P',name:'보류시험',dept:'it',owner:'PM담당',status:'active',startPlan:D(-30),endPlan:D(60),wbs:[
     {id:'S0',code:'1',name:'요약',parentId:'',dept:'it',assignee:'',status:'todo',works:[],predecessors:[]},
     {id:'A',code:'1.1',name:'시작전지연',parentId:'S0',dept:'it',assignee:'담당A',status:'todo',startPlan:D(-10),endPlan:D(-5),works:[],predecessors:[]},
     {id:'B',code:'1.2',name:'진행중',parentId:'S0',dept:'it',assignee:'담당B',status:'doing',startPlan:D(-20),endPlan:D(3),startActual:D(-20),works:[],predecessors:[]},
     {id:'C',code:'2',name:'후속',parentId:'',dept:'it',assignee:'담당C',status:'todo',startPlan:D(-3),endPlan:D(20),works:[],predecessors:['A']}
   ],issues:[]};
   projects.push(P); currentProjectId='E2E-P'; navigate('project-center',document.getElementById('nav-project-center')||null);
   const w=id=>P.wbs.find(x=>x.id===id);
   const hold=(id,from,restart,reason)=>{openWbsHoldModal('E2E-P',id);document.getElementById('wbshold-from').value=from;document.getElementById('wbshold-restart').value=restart;document.getElementById('wbshold-reason').value=reason;submitWbsHold(new Event('submit',{cancelable:true}));};
   r.delayBefore=(wbsDelay(w('A'))||{}).kind==='end';
   // 요약 작업은 보류 못 함
   r.noSummaryHold=!canHoldWbs(P,w('S0'));
   // 사유 없으면 안 됨 · 재시작일이 보류일보다 앞서면 안 됨
   hold('A',D(-4),'','');r.reasonRequired=!w('A').hold;
   hold('A',D(-4),D(-6),'고객 사정');r.restartChecked=!w('A').hold;
   hold('A',D(-4),D(-1),'고객 사정');
   r.held=isWbsHeld(w('A'))&&w('A').hold.restartPlan===D(-1)&&w('A').hold.delayAtHold.includes('종료 지연');
   r.noDelayWhenHeld=wbsDelay(w('A'))===null&&!projectDelays(P).some(x=>x.w.id==='A');
   r.noStartWhenHeld=!canStartWbs(P,w('A'));
   hold('B',D(-5),D(10),'자재 대기');
   r.noDoneWhenHeld=!canCompleteWbs(P,w('B'));
   r.holdCount=projectHolds(P).length===2;
   // 표 · 상세 · 간트 표시
   renderProjectCenter();
   const tbl=document.getElementById('prj-view-wbs').innerHTML;
   r.tableChip=tbl.includes('보류 4일')&&tbl.includes('보류사유: 고객 사정')&&tbl.includes('보류 취소')&&tbl.includes('하위 보류 2건');
   r.overdueShown=tbl.includes('1일 지남');
   r.headChip=document.getElementById('prj-d-delay').innerText.includes('보류 2건');
   r.overviewChip=document.getElementById('prj-view-overview')?document.getElementById('prj-view-overview').innerText.includes('보류 2건'):false;
   r.ganttYellow=document.getElementById('prj-view-gantt').innerHTML.includes('bg-yellow-500');
   openWbsDetailModal('E2E-P','A');
   const det=document.getElementById('wbsdetail-body').innerText;
   r.detail=det.includes('보류 중')&&det.includes('고객 사정')&&det.includes('보류 전 상태');
   closeWbsDetailModal();
   // 수정 — 재시작 예정일 변경
   hold('B',D(-5),D(12),'자재 대기');r.editKeeps=w('B').hold.restartPlan===D(12)&&w('B').hold.by==='정장훈';
   // 시작 전 취소 — 재시작일이 새 시작 예정일, 기간(5일) 유지
   openWbsResumeModal('E2E-P','A');
   document.getElementById('wbsresume-date').value=D(0);onWbsResumeDateChange();
   const pv=document.getElementById('wbsresume-preview').innerText;
   r.previewCalc=pv.includes(D(0))&&pv.includes(D(5))&&pv.includes('4일')&&pv.includes('후속');
   submitWbsResume(new Event('submit',{cancelable:true}));
   r.notStartedCalc=w('A').startPlan===D(0)&&w('A').endPlan===D(5)&&!w('A').hold;
   r.history=w('A').holdHistory.length===1&&w('A').holdHistory[0].before.startPlan===D(-10)&&w('A').holdHistory[0].after.endPlan===D(5)&&w('A').holdHistory[0].days===4;
   r.canStartAgain=wbsDelay(w('A'))===null;
   r.successorKept=w('C').startPlan===D(-3);
   // 시작 후 취소 — 시작일 그대로, 종료 예정일만 보류 일수(5일)만큼
   openWbsResumeModal('E2E-P','B');document.getElementById('wbsresume-date').value=D(0);submitWbsResume(new Event('submit',{cancelable:true}));
   r.startedCalc=w('B').startPlan===D(-20)&&w('B').startActual===D(-20)&&w('B').endPlan===D(8);
   // 요약 일정이 따라옴
   r.rollup=w('S0').endPlan===D(8);
   // 재시작 전 날짜 안 됨
   hold('A',D(0),'','다시');openWbsResumeModal('E2E-P','A');document.getElementById('wbsresume-date').value=D(-1);submitWbsResume(new Event('submit',{cancelable:true}));
   r.resumeDateChecked=isWbsHeld(w('A'));
   closeWbsResumeModal();
   // 알림 — 담당자와 PM
   const ns=collabNotifications.slice(notiBefore);
   r.notiHold=ns.some(n=>n.type==='project-wbs-hold'&&n.toUser==='담당A')&&ns.some(n=>n.type==='project-wbs-hold'&&n.toUser==='PM담당');
   r.notiResume=ns.some(n=>n.type==='project-wbs-resume'&&n.toUser==='담당B');
   r.notiText=notiText(ns.find(n=>n.type==='project-wbs-hold')).includes('보류');
   // 완료된 작업은 보류로 치지 않음
   w('A').status='done';r.doneNotHeld=!isWbsHeld(w('A'));
   projects.splice(projects.findIndex(x=>x.id==='E2E-P'),1);collabNotifications.splice(notiBefore);saveProjects();
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
