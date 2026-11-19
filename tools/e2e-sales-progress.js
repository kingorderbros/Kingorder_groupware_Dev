// 사용법: node tools/e2e-sales-progress.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-19 — 영업업무센터 진행 내역: 진행중으로 변경할 때 착수 내용 · 진행 내역 순서 · 지연/지체 사유 · 문제/해결 · 완료 내용 · 완료 확인(교차 확인)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
const USERS=[{id:'u1',name:'박배정',dept:'sales',groupId:'sales'},{id:'u2',name:'김담당',dept:'sales',groupId:'sales'},{id:'u3',name:'이영업',dept:'sales',groupId:'sales'},{id:'u4',name:'최운영',dept:'ops',groupId:'ops'}];
srv.listen(8866,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1400,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<700,hasTouch:vw<700});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  const alerts=[];pg.on('dialog',d=>{alerts.push(d.message());d.accept();});
  await pg.goto('http://localhost:8866/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async(USERS)=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const list=USERS.map(u=>Object.assign({email:u.id+'@x.kr',level:'manager',team:''},u));localUsers.push(...list);
   const S=WORK_CENTERS.sales, O=WORK_CENTERS.ops;S.works=S.works.filter(x=>!/^S-T-/.test(x.id));O.works=O.works.filter(x=>!/^O-T-/.test(x.id));
   const base={center:'sales',type:'activity',category:'proposal',sub:'제안서 발송',priority:'normal',receivedAt:'2026-11-10',receivedTime:'09:00',channel:'전화',receiver:'박배정',customerId:'',memo:'',extra:{}};
   S.works.push(Object.assign({},base,{id:'S-T-1',title:'견적서 요청 - 강남치킨',company:'강남치킨',status:'received'}),
                Object.assign({},base,{id:'S-T-Q',title:'견적서 자동',quoteId:'Q-1',status:'working'}));
   O.works.push({id:'O-T-1',center:'ops',type:'as',title:'AS',status:'received',priority:'normal',receivedAt:'2026-11-10',receiver:'최운영'});
   const w=()=>S.works.find(x=>x.id==='S-T-1');
   const modal=()=>document.getElementById('sales-prog-modal');
   const shown=()=>modal()&&!modal().classList.contains('hidden');
   const fill=(o)=>{Object.entries(o).forEach(([k,v])=>{const e=document.getElementById('sales-prog-'+k);if(!e)return;if(e.type==='checkbox')e.checked=v;else e.value=v;if(k==='kind')salesProgKindChanged();});};
   const out={};
   // 배정
   enterApp(list[0]);await sleep(80);
   assignWork('sales','S-T-1','김담당');
   out.assignLog=salesProgLog(w()).map(e=>e.text).join('/');
   // 담당자 수락 → 착수 내용 받기
   enterApp(list[1]);await sleep(80);
   workAssignAction('sales','S-T-1','accept');
   out.startShown=shown()&&/진행중으로 변경/.test(modal().innerText);
   out.statusBefore=w().status;
   fill({method:'전화',text:''});submitSalesProgress();out.emptyBlocked=w().status!=='working';
   fill({method:'',text:'고객과 통화'});submitSalesProgress();out.noMethodBlocked=w().status!=='working';
   fill({method:'전화',date:'2026-11-18',time:'10:30',text:'고객 담당자와 통화, 설치 3대 확정 — 견적 작성 시작'});submitSalesProgress();
   out.started={status:w().status,assign:w().assignStatus,actions:salesProgLog(w()).filter(e=>e.kind==='action').length,at:salesProgLog(w()).find(e=>e.kind==='action').at};
   out.formAfter=!!document.getElementById('sales-prog-kind')&&document.getElementById('sales-prog-kind').tagName==='SELECT';
   // 모바일에서 창이 화면 안에
   const box=modal().firstElementChild.getBoundingClientRect();out.fits=box.left>=0&&box.right<=window.innerWidth+1;
   // 미래 시각은 막음
   fill({kind:'action',method:'방문',date:'2099-01-01',time:'10:00',text:'미래'});submitSalesProgress();out.futureBlocked=!salesProgLog(w()).some(e=>e.text==='미래');
   // 문제 발생 → 해결
   fill({kind:'issue',method:'',date:'2026-11-18',time:'15:00',text:'단가표 승인 지연'});submitSalesProgress();
   out.issueOpen=salesProgState(w()).openIssues.length;
   out.issueFlag=/문제 1건/.test(salesProgFlagsHtml(w()));
   const issueId=salesProgState(w()).openIssues[0].id;
   fill({kind:'resolve',issue:issueId,date:'2026-11-19',time:'09:00',text:'팀장 승인 받음'});submitSalesProgress();
   out.issueAfter=salesProgState(w()).openIssues.length;
   // 순서: 실제 한 때 순
   fill({kind:'action',method:'이메일',date:'2026-11-17',time:'16:00',text:'자료 요청 메일 (늦게 입력)'});submitSalesProgress();
   out.order=salesProgSorted(w()).filter(e=>e.kind!=='system').map(e=>e.at);
   out.lateInputMark=/입력 \d{4}-/.test(modal().innerText);
   // 지체: 마지막 내역이 4일 전
   const keep=JSON.parse(JSON.stringify(w().progressLog));
   const d4=new Date(Date.now()-4*86400000);const s4=`${ymd(d4)} 09:00`;
   w().progressLog.forEach(e=>{e.loggedAt=s4;});
   out.stall=salesProgState(w()).stall;out.stallFlag=/지체 4일/.test(salesProgFlagsHtml(w()));
   renderSalesProgress();out.stallDefault=(document.getElementById('sales-prog-kind')||{}).value;
   fill({kind:'stall',date:ymd(new Date()),time:'00:00',text:'고객사 휴무로 회신 대기'});submitSalesProgress();
   out.stallAfter=salesProgState(w()).stall;
   // 지연: 완료 예정일이 어제
   const y=ymd(new Date(Date.now()-86400000));
   salesProgSetDue(y);
   out.lateNeed=salesProgState(w()).lateNeed;out.lateDefault=(document.getElementById('sales-prog-kind')||{}).value;
   out.exec=(execCollectItems().find(i=>i.id==='S-T-1')||{});out.exec={due:out.exec.due,overdue:out.exec.overdue,issue:out.exec.issue};
   fill({kind:'delay',date:ymd(new Date()),time:'00:00',text:'고객 내부 결재 일정으로 1주 연기'});submitSalesProgress();
   out.lateAfter=salesProgState(w()).lateNeed;
   // 진행 업무 카드에 한 줄 · 단추
   closeSalesProgress();
   navigate('sales-work-center',document.getElementById('nav-sales-work-center'));await sleep(150);
   wcState.sales.activeType='activity';wcState.sales.category='proposal';wcState.sales.sub='';renderWorkProcess('sales');
   const pl=wcEl('sales','process-list');out.card=!!pl&&/진행 내역/.test(pl.innerText)&&/진행 내역 입력/.test(pl.innerText);
   // 완료 — 미해결 문제가 있으면 확인 체크
   openSalesProgress('sales','S-T-1','log');
   fill({kind:'issue',date:ymd(new Date()),time:'00:00',text:'설치 일정 미정'});submitSalesProgress();
   salesWorkStatusClick('sales','S-T-1','done');
   out.doneShown=/완료 처리/.test(modal().innerText);
   fill({method:'이메일',date:ymd(new Date()),time:'00:01',text:'견적서 Q-2611-014 발송, 고객 수락 회신'});submitSalesProgress();
   out.doneBlocked=w().status;
   fill({method:'이메일',date:ymd(new Date()),time:'00:01',text:'견적서 Q-2611-014 발송, 고객 수락 회신','issue-ack':true});submitSalesProgress();
   out.done={status:w().status,doneAt:w().doneAt,needCheck:salesProgState(w()).needCheck};
   out.selfNoCheck=!/완료 확인<\/button>|fa-user-check mr-1"><\/i>완료 확인/.test(modal().innerHTML)&&!document.getElementById('sales-prog-check-note');
   // 다른 영업 직원은 입력 못 함
   enterApp(list[2]);await sleep(80);
   openSalesProgress('sales','S-T-1','log');out.otherNoCheck=!document.getElementById('sales-prog-check-note');
   // 배정한 사람이 교차 확인 — 보완 요청
   enterApp(list[0]);await sleep(80);
   openSalesProgress('sales','S-T-1','log');
   out.checkerSees=!!document.getElementById('sales-prog-check-note')&&/진행 내역과 완료 내용을 대조/.test(modal().innerText);
   salesProgCheck('recheck');out.recheckEmpty=w().status;
   document.getElementById('sales-prog-check-note').value='설치 일정 확정 내용 추가 필요';salesProgCheck('recheck');
   out.rechecked={status:w().status,doneAt:w().doneAt};
   // 담당자 다시 완료 → 확인
   enterApp(list[1]);await sleep(80);
   openSalesProgress('sales','S-T-1','done');
   fill({method:'전화',date:ymd(new Date()),time:'00:02',text:'설치 11/25 확정 안내 완료','issue-ack':true});submitSalesProgress();
   enterApp(list[0]);await sleep(80);
   openSalesProgress('sales','S-T-1','log');
   document.getElementById('sales-prog-check-note').value='대조 완료';salesProgCheck('check');
   const st=salesProgState(w());out.checked={by:st.checkEntry&&st.checkEntry.by,need:st.needCheck,flag:/완료 확인됨/.test(salesProgFlagsHtml(w())),done:st.doneEntry&&st.doneEntry.text};
   closeSalesProgress();
   // 대상 밖: 견적서 자동 건 · 운영업무센터
   out.quoteOff=!salesProgOn('sales',S.works.find(x=>x.id==='S-T-Q'));
   enterApp(list[3]);await sleep(80);
   salesWorkStatusClick('ops','O-T-1','working');
   const ow=O.works.find(x=>x.id==='O-T-1');out.ops={status:ow.status,log:Array.isArray(ow.progressLog),modal:shown()};
   // 보류는 기록만
   enterApp(list[1]);await sleep(80);
   S.works.push(Object.assign({},base,{id:'S-T-2',title:'방문 요청',status:'assigned',assignee:'김담당',assignStatus:'accepted'}));
   setWorkStatus('sales','S-T-2','hold');
   const w2=S.works.find(x=>x.id==='S-T-2');out.hold={status:w2.status,log:salesProgLog(w2).map(e=>e.text).join('/')};
   return out;},USERS);
  ok(/담당자 배정 김담당/.test(r.assignLog),'배정하면 진행 내역에 배정 기록',r.assignLog);
  ok(r.startShown&&r.statusBefore==='assigned','수락하면 착수 내용 입력 창 (입력 전에는 상태 그대로)',r);
  ok(r.emptyBlocked&&r.noMethodBlocked,'내용 · 방법 없이 진행중으로 바꿀 수 없음');
  ok(r.started.status==='working'&&r.started.assign==='accepted'&&r.started.actions===1&&r.started.at==='2026-11-18 10:30','착수 내용 저장 → 진행중 · 수락됨 · 진행 일시 기록',r.started);
  ok(r.formAfter,'진행중이 된 뒤에는 구분(진행 · 지연 · 지체 · 문제)을 골라 계속 입력');
  ok(r.fits,'진행 내역 창이 화면 폭 안에 들어감');
  ok(r.futureBlocked,'미래 일시는 입력 불가');
  ok(r.issueOpen===1&&r.issueFlag&&r.issueAfter===0,'문제 발생 → 표시 → 문제 해결로 닫힘',r);
  ok(JSON.stringify(r.order)===JSON.stringify(r.order.slice().sort())&&r.order[0]==='2026-11-17 16:00','진행 내역은 실제 진행한 일시 순',r.order);
  ok(r.lateInputMark,'늦게 입력한 건 입력 시각도 함께 표시');
  ok(r.stall===4&&r.stallFlag&&r.stallDefault==='stall'&&r.stallAfter===0,'3일 넘게 내역이 없으면 지체 표시 · 지체 사유 입력으로 해소',r);
  ok(r.lateNeed===true&&r.lateDefault==='delay'&&r.lateAfter===false,'완료 예정일이 지나면 지연 사유 입력 요구 · 입력하면 해소',r);
  ok(r.exec.overdue===1&&r.exec.due&&r.exec.issue==='지연 사유 미입력','전사 업무 현황에도 예정일 · 지연 · 사유 미입력 반영',r.exec);
  ok(r.card,'진행 업무 카드에 마지막 진행 내역 · [진행 내역] · [진행 내역 입력]');
  ok(r.doneShown&&r.doneBlocked==='working','완료할 때 미해결 문제가 있으면 확인 체크 없이는 완료 불가',r.doneBlocked);
  ok(r.done.status==='done'&&r.done.doneAt&&r.done.needCheck,'완료 내용 저장 → 완료 · 완료 확인 대기',r.done);
  ok(r.selfNoCheck&&r.otherNoCheck,'처리한 담당자 · 관계없는 직원은 완료 확인 불가');
  ok(r.checkerSees&&r.recheckEmpty==='done'&&r.rechecked.status==='working'&&!r.rechecked.doneAt,'배정한 사람 보완 요청(사유 필수) → 다시 진행중',r);
  ok(r.checked.by==='박배정'&&!r.checked.need&&r.checked.flag&&/11\/25/.test(r.checked.done||''),'다시 완료 → 배정한 사람이 완료 확인',r.checked);
  ok(r.quoteOff,'견적서에서 자동 생성된 건은 대상 아님 (견적서 상태 기준)');
  ok(r.ops.status==='working'&&!r.ops.log&&!r.ops.modal,'운영업무센터는 예전 그대로',r.ops);
  ok(r.hold.status==='hold'&&/보류/.test(r.hold.log),'보류 등 다른 상태 변경도 기록',r.hold);
  ok(alerts.some(a=>/진행 내용을/.test(a))&&alerts.some(a=>/방법/.test(a))&&alerts.some(a=>/미해결|해결되지 않은/.test(a))&&alerts.some(a=>/보완할 내용/.test(a)),'빠진 항목은 안내 창',alerts);
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
