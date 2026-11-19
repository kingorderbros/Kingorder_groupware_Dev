// 사용법: node tools/e2e-inbound-progress.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-19 — 영업본부 인바운드 진행 내역(착수 · 진행 · 문제 · 지연 · 완료 결과 · 완료 확인) + 경영현황판 상세 창에서 진행 내역 보기
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
const USERS=[{id:'u1',name:'박배정',dept:'sales',groupId:'sales'},{id:'u2',name:'김담당',dept:'sales',groupId:'sales'},{id:'u3',name:'이영업',dept:'sales',groupId:'sales'}];
srv.listen(8867,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1400,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<700,hasTouch:vw<700});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  const alerts=[];pg.on('dialog',d=>{alerts.push(d.message());d.accept();});
  await pg.goto('http://localhost:8867/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async(USERS)=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const list=USERS.map(u=>Object.assign({email:u.id+'@x.kr',level:'manager',team:''},u));localUsers.push(...list);
   inboundRecords=inboundRecords.filter(x=>!/^IN-T-/.test(x.id));
   const mk=(id,dept,extra)=>Object.assign({id,inDate:'2026-11-18',inAt:'2026-11-18 10:00',company:'강남치킨'+id.slice(-1),name:'홍길동',phone:'010-1111-2222',routes:[],services:[],needs:[],requestNote:'키오스크 문의',kob:{contactAt:'',salesStatus:'',result:'',failReason:'',owner:'',extras:[],dept}},extra||{});
   inboundRecords.unshift(mk('IN-T-1','영업'),mk('IN-T-2','운영'),mk('IN-T-3','영업',{}));
   const S=WORK_CENTERS.sales;S.works=S.works.filter(x=>!/^S-T-/.test(x.id));
   S.works.push({id:'S-T-9',center:'sales',type:'activity',category:'proposal',title:'제안서 발송',status:'working',priority:'normal',receivedAt:'2026-11-10',receiver:'박배정',assignee:'김담당',
     progressLog:[{id:'pgA',kind:'action',at:'2026-11-18 10:00',loggedAt:'2026-11-18 10:00',by:'김담당',method:'방문',text:'제안서 직접 전달'}]});
   const rec=id=>inboundRecords.find(x=>x.id===id);
   const k1=()=>rec('IN-T-1').kob;
   const modal=()=>document.getElementById('sales-prog-modal');
   const shown=el=>el&&!el.classList.contains('hidden');
   const fill=(o)=>{Object.entries(o).forEach(([k,v])=>{const e=document.getElementById('sales-prog-'+k);if(!e)return;if(e.type==='checkbox')e.checked=v;else e.value=v;if(k==='kind')salesProgKindChanged();});};
   const out={};
   enterApp(list[0]);await sleep(80);
   out.perm=canSeeInboundKob();
   // 상세 창에서 담당자 지정 → 지정한 사람 · 기록
   openInboundModal('IN-T-1');
   out.boxInModal=/진행 내역/.test(document.getElementById('inbound-kob-body').innerText);
   setInboundKobField('owner','김담당');saveInbound();
   out.owner={owner:k1().owner,by:k1().ownerBy,log:(k1().progressLog||[]).map(e=>e.text).join('/')};
   openInboundModal('IN-T-2');out.opsBox=!/진행 내역\(무엇을|진행 내역 ·/.test(document.getElementById('inbound-kob-body').innerText);closeInboundModal();
   out.opsOff=!salesProgFind('inbound','IN-T-2');
   // 담당자: 첫 진행 내역 = 착수
   enterApp(list[1]);await sleep(80);
   openSalesProgress('inbound','IN-T-1','log');
   out.startShown=/진행중으로 변경/.test(modal().innerText)&&/인바운드 진행 내역/.test(modal().innerText);
   fill({method:'',text:'통화'});submitSalesProgress();out.noMethod=!(k1().progressLog||[]).some(e=>e.kind==='action');
   fill({method:'전화',date:'2026-11-18',time:'11:00',text:'고객 통화 — 매장 방문 일정 협의'});submitSalesProgress();
   out.started={status:salesProgFind('inbound','IN-T-1').status,contact:k1().contactAt,stage:inboundStage(rec('IN-T-1')),log:k1().progressLog.map(e=>e.kind).join(',')};
   const box=modal().firstElementChild.getBoundingClientRect();out.fits=box.left>=0&&box.right<=window.innerWidth+1;
   // 문제 · 지연
   fill({kind:'issue',date:'2026-11-18',time:'15:00',text:'포스 연동 가능 여부 확인 필요'});submitSalesProgress();
   salesProgSetDue(ymd(new Date(Date.now()-86400000)));
   const ex=execCollectItems().find(i=>i.kind==='inbound'&&i.id==='IN-T-1');out.exec={due:ex.due,overdue:ex.overdue,issue:ex.issue};
   closeSalesProgress();
   // 경영현황판 상세 창 — 진행 내역 보임
   navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(150);
   openExecItemModal('inbound','IN-T-1');
   const em=document.getElementById('exec-item-modal');
   out.execModal=shown(em)&&/상세 진행 내역/.test(em.innerText)&&/매장 방문 일정 협의/.test(em.innerText)&&/포스 연동/.test(em.innerText)&&/문제 1건/.test(em.innerText);
   const eb=em.querySelector('.bg-white')||em.firstElementChild;const er=eb.getBoundingClientRect();out.execFits=er.left>=0&&er.right<=window.innerWidth+1;
   // 상세 창에서 진행 내역 창 열고 입력 → 닫으면 상세 창 새로 그림
   [...em.querySelectorAll('button')].find(b=>/진행 내역 창 열기/.test(b.innerText)).click();
   out.progOnTop=shown(modal());
   fill({kind:'delay',date:ymd(new Date()),time:'00:00',text:'고객 휴가로 1주 연기'});submitSalesProgress();
   closeSalesProgress();
   out.execRefreshed=shown(em)&&/고객 휴가로 1주 연기/.test(em.innerText);
   closeExecItemModal();
   // 영업업무센터 업무도 경영현황판 상세 창에서 진행 내역
   openExecItemModal('work','S-T-9');out.workExec=/상세 진행 내역/.test(em.innerText)&&/제안서 직접 전달/.test(em.innerText);closeExecItemModal();
   // 상세 창을 열어 둔 채(작성 중 사본) 진행 내역 입력 → 상세 창 저장해도 내역 유지
   enterApp(list[0]);await sleep(80);
   openInboundModal('IN-T-1');
   enterApp(list[1]);await sleep(80);
   openSalesProgress('inbound','IN-T-1','log');
   fill({kind:'action',method:'문자·카톡',date:ymd(new Date()),time:'00:01',text:'포스 연동 자료 문자 발송'});submitSalesProgress();closeSalesProgress();
   const nBefore=k1().progressLog.length;
   setInboundKobField('salesStatus','방문 상담 예정');saveInbound();
   out.keep={n:k1().progressLog.length,nBefore,status:k1().salesStatus,has:k1().progressLog.some(e=>/문자 발송/.test(e.text))};
   // 완료 처리 — 결과 · 실패사유 · 미해결 문제 확인
   openSalesProgress('inbound','IN-T-1','log');
   salesProgSwitchMode('done');
   out.doneForm=!!document.getElementById('sales-prog-result');
   fill({method:'전화',date:ymd(new Date()),time:'00:02',text:'계약서 서명 완료','issue-ack':true});submitSalesProgress();out.noResult=k1().result;
   fill({result:'실패',method:'전화',date:ymd(new Date()),time:'00:02',text:'타사 선택','issue-ack':true});submitSalesProgress();out.noFail=k1().result;
   fill({result:'영업수주',method:'방문',date:ymd(new Date()),time:'00:02',text:'키오스크 2대 계약서 서명 완료','issue-ack':false});submitSalesProgress();out.noAck=k1().result;
   fill({result:'영업수주',method:'방문',date:ymd(new Date()),time:'00:02',text:'키오스크 2대 계약서 서명 완료','issue-ack':true});submitSalesProgress();
   const v=()=>salesProgFind('inbound','IN-T-1');
   out.done={result:k1().result,status:v().status,need:salesProgState(v()).needCheck,selfNoCheck:!document.getElementById('sales-prog-check-note')};
   closeSalesProgress();
   enterApp(list[2]);await sleep(80);openSalesProgress('inbound','IN-T-1','log');out.otherNoCheck=!document.getElementById('sales-prog-check-note');closeSalesProgress();
   // 지정한 사람 보완 요청 → 진행중
   enterApp(list[0]);await sleep(80);
   openSalesProgress('inbound','IN-T-1','log');
   out.checker=!!document.getElementById('sales-prog-check-note');
   salesProgCheck('recheck');out.recheckEmpty=k1().result;
   document.getElementById('sales-prog-check-note').value='설치 일정 함께 기재';salesProgCheck('recheck');
   out.rechecked={result:k1().result,status:v().status};
   closeSalesProgress();
   enterApp(list[1]);await sleep(80);
   openSalesProgress('inbound','IN-T-1','log');salesProgSwitchMode('done');
   fill({result:'영업수주',method:'전화',date:ymd(new Date()),time:'00:03',text:'계약 완료, 설치 11/27 확정','issue-ack':true});submitSalesProgress();closeSalesProgress();
   enterApp(list[0]);await sleep(80);
   openSalesProgress('inbound','IN-T-1','log');document.getElementById('sales-prog-check-note').value='대조 완료';salesProgCheck('check');closeSalesProgress();
   const st=salesProgState(v());out.checked={by:st.checkEntry&&st.checkEntry.by,flag:/완료 확인됨/.test(salesProgFlagsHtml(v()))};
   const ex2=execCollectItems().find(i=>i.kind==='inbound'&&i.id==='IN-T-1');out.execDone=ex2.done&&!ex2.overdue;
   // 상세 창에서 진행 결과를 바로 실패로 저장 → 완료 내용 입력 창이 바로 열림
   openInboundModal('IN-T-3');setInboundKobField('owner','박배정');onInboundResultChange('실패');setInboundKobField('failReason','부재중');saveInbound();
   out.autoDone=shown(modal())&&/완료 처리|완료 내용 저장/.test(modal().innerText)&&!document.getElementById('sales-prog-result');
   out.t3log=(rec('IN-T-3').kob.progressLog||[]).map(e=>e.text).join('/');
   fill({method:'전화',text:'3회 부재, 문자 회신 없음'});submitSalesProgress();
   out.t3done=!!salesProgState(salesProgFind('inbound','IN-T-3')).doneEntry;
   closeSalesProgress();
   // 인바운드 목록 진행 결과 칸 표시
   navigate('inbound-center',document.getElementById('nav-inbound-center'));await sleep(200);setInboundTab('list');await sleep(100);
   const rows=document.getElementById('inbound-rows');out.listFlag=!!rows&&/완료 확인됨|완료 확인 대기/.test(rows.innerText);
   return out;},USERS);
  ok(r.perm,'영업 직원은 인바운드 킹오더 영역 권한 있음 (시험 전제)');
  ok(r.boxInModal,'인바운드 상세 창(영업본부 건)에 진행 내역 칸');
  ok(r.owner.owner==='김담당'&&r.owner.by==='박배정'&&/담당자 지정 김담당/.test(r.owner.log),'담당자 지정 → 지정한 사람 · 진행 내역 기록',r.owner);
  ok(r.opsBox&&r.opsOff,'운영본부 인바운드는 대상 아님');
  ok(r.startShown&&r.noMethod,'첫 진행 내역은 착수 입력 (방법 필수)');
  ok(r.started.status==='working'&&r.started.contact==='2026-11-18'&&r.started.stage==='진행중','착수 저장 → 진행중 · 고객 컨택일자 자동 기재',r.started);
  ok(r.fits,'진행 내역 창이 화면 폭 안');
  ok(r.exec.overdue===1&&r.exec.due&&/문제 1건/.test(r.exec.issue),'경영현황판 인바운드 항목에 예정일 · 지연 · 문제 반영',r.exec);
  ok(r.execModal,'경영현황판 항목 클릭 → 상세 창에 진행 내역 전체 표시');
  ok(r.execFits,'경영현황판 상세 창이 화면 폭 안');
  ok(r.progOnTop&&r.execRefreshed,'상세 창에서 진행 내역 창 열어 입력 → 닫으면 상세 창 새 내용');
  ok(r.workExec,'영업업무센터 업무도 경영현황판 상세 창에서 진행 내역 표시');
  ok(r.keep.n===r.keep.nBefore&&r.keep.has&&r.keep.status==='방문 상담 예정','상세 창을 열어 둔 채 진행 내역을 입력해도 상세 창 저장 때 지워지지 않음',r.keep);
  ok(r.doneForm&&r.noResult===''&&r.noFail===''&&r.noAck==='','완료 처리는 진행 결과 · 실패사유 · 미해결 문제 확인 필수',r);
  ok(r.done.result==='영업수주'&&r.done.status==='done'&&r.done.need&&r.done.selfNoCheck,'완료 → 영업수주 · 완료 확인 대기 · 본인 확인 불가',r.done);
  ok(r.otherNoCheck,'관계없는 영업 직원은 완료 확인 불가');
  ok(r.checker&&r.recheckEmpty==='영업수주'&&r.rechecked.result==='진행중'&&r.rechecked.status==='working','지정한 사람 보완 요청(사유 필수) → 진행중으로 되돌림',r);
  ok(r.checked.by==='박배정'&&r.checked.flag&&r.execDone,'다시 완료 → 완료 확인 · 경영현황판 완료',r.checked);
  ok(r.autoDone&&/진행 결과 없음 → 실패/.test(r.t3log)&&r.t3done,'상세 창에서 실패로 저장하면 완료 내용 입력 창이 바로 열림 · 결과 변경 기록',r);
  ok(r.listFlag,'인바운드 목록 진행 결과 칸에 완료 확인 표시');
  ok(alerts.some(a=>/방법/.test(a))&&alerts.some(a=>/진행 결과/.test(a))&&alerts.some(a=>/실패사유/.test(a))&&alerts.some(a=>/보완할 내용/.test(a)),'빠진 항목은 안내 창',alerts);
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
