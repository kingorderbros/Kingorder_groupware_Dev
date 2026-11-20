// 사용법: node tools/e2e-paydoc-multi-assignee.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-19 — 결제본부 보완서류 요청: 담당자 여러 명 지정 · 요청 내용 수정
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
const STAFF=[['s1','김능영','sales','','','팀장'],['s2','박영업','sales','','','매니저'],['s3','이영업','sales','','','매니저'],['t2','홍예지','ops','운영팀','관리파트','파트장'],['p1','김아름','payment','','','본부장']];
srv.listen(8871,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1400,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<700,hasTouch:vw<700});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  const alerts=[];pg.on('dialog',d=>{alerts.push(d.message());d.accept();});
  await pg.goto('http://localhost:8871/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async(STAFF)=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const list=STAFF.map(([id,n,dept,team,part,rank])=>({id,name:n,dept,team,part,rank,email:id+'@x.kr',groupId:dept,level:'manager'}));localUsers.push(...list);
   const as=n=>list.find(u=>u.name===n);
   payDocRequests.length=0;
   const out={};
   enterApp(as('김아름'));await sleep(150);
   // 등록 — 담당자 2명
   openPayDocRequestModal();
   const boxes=()=>[...document.querySelectorAll('input[name="paydoc-assignee"]')];
   out.disabledFirst=boxes().every(x=>x.disabled);
   document.querySelector('input[name="paydoc-target"][value="person"]').checked=true;onPayDocTargetChange();
   out.enabled=boxes().every(x=>!x.disabled);
   document.getElementById('paydoc-merchant').value='시험가맹점';
   document.getElementById('paydoc-request-form').requestSubmit();out.noneBlocked=payDocRequests.length===0;
   boxes().filter(x=>['김능영','박영업'].includes(x.value)).forEach(x=>{x.checked=true;});updatePayDocAssigneeCount();
   out.count=document.getElementById('paydoc-assignee-count').textContent;
   const m=document.getElementById('paydoc-request-modal').firstElementChild.getBoundingClientRect();out.fits=m.left>=0&&m.right<=window.innerWidth+1;
   document.getElementById('paydoc-request-form').requestSubmit();
   const req=payDocRequests[0];out.saved={n:payDocRequests.length,names:req&&req.targetNames,tn:req&&req.targetName,type:req&&req.targetType};
   // 받은 사람 두 명 모두 · 다른 사람은 아님
   const view=async n=>{enterApp(as(n));await sleep(120);const r0=payDocReq(req.id);return {mine:payDocMyRequests().some(x=>x.id===req.id),up:payDocCanUpload(r0)};};
   out.kim=await view('김능영');out.park=await view('박영업');out.lee=await view('이영업');
   // 결제본부 — 상세 창 [요청 내용 수정]
   enterApp(as('김아름'));await sleep(120);
   openPayDocDetail(req.id);
   const det=document.getElementById('paydoc-detail-modal');
   const btn=[...det.querySelectorAll('button')].find(b=>/요청 내용 수정/.test(b.innerText));out.btn=!!btn;
   btn.click();
   const rm=document.getElementById('paydoc-request-modal');
   out.editOpen=!rm.classList.contains('hidden')&&/요청 수정/.test(document.getElementById('paydoc-request-title').innerText)&&rm.classList.contains('z-[60]');
   out.prefill={m:document.getElementById('paydoc-merchant').value,picked:payDocPickedAssignees().join(','),catalogHidden:document.getElementById('paydoc-catalog-box').classList.contains('hidden'),submit:document.getElementById('paydoc-request-submit').innerText.trim()};
   // 담당자 변경(박영업 빼고 이영업 · 홍예지 추가) · 기한 · 메모 변경
   boxes().forEach(x=>{x.checked=['김능영','이영업','홍예지'].includes(x.value);});
   document.getElementById('paydoc-due').value='2026-12-01';document.getElementById('paydoc-memo').value='통장사본 법인 명의로';
   const itemsBefore=JSON.stringify(payDocReq(req.id).items);
   document.getElementById('paydoc-request-form').requestSubmit();
   const r2=payDocReq(req.id);
   out.edited={names:r2.targetNames.join(','),tn:r2.targetName,due:r2.dueDate,memo:r2.memo,itemsSame:JSON.stringify(r2.items)===itemsBefore,n:payDocRequests.length,log:(r2.history||[]).map(h=>h.text).pop(),closed:rm.classList.contains('hidden'),detailText:/이영업/.test(det.innerText)};
   out.park2=await view('박영업');out.lee2=await view('이영업');out.hong=await view('홍예지');
   // 담당자 → 영업팀 전체로 바꾸기
   enterApp(as('김아름'));await sleep(120);
   openPayDocEditModal(req.id);document.querySelector('input[name="paydoc-target"][value="team"]').checked=true;onPayDocTargetChange();document.getElementById('paydoc-request-form').requestSubmit();
   const r3=payDocReq(req.id);out.team={type:r3.targetType,tn:r3.targetName,names:(r3.targetNames||[]).length,lee:payDocTargetNames(r3).length};
   // 다시 등록 창을 열면 등록 모드
   openPayDocRequestModal();out.resetMode=!document.getElementById('paydoc-catalog-box').classList.contains('hidden')&&/발송/.test(document.getElementById('paydoc-request-submit').innerText)&&document.getElementById('paydoc-request-modal').classList.contains('z-50');closePayDocRequestModal();
   // 완료 건은 수정 단추 없음(결제본부) · 영업은 수정 불가
   r3.status='completed';closePayDocDetail();
   const pay=list.find(u=>u.name==='김아름');
   out.completedNoEdit=!payDocCanEditRequest(r3)||canManageAllData();
   enterApp(as('김능영'));await sleep(120);r3.status='requested';out.salesNoEdit=!payDocCanEditRequest(r3);
   // 예전 요청(targetName 한 명)도 그대로
   payDocRequests.push({id:'PD-OLD',merchant:'예전',bizNo:'',regType:'pg',status:'requested',priority:'normal',requester:'김아름',requestedAt:'2026-11-01',dueDate:'2026-11-30',targetType:'person',targetName:'김능영',claimedBy:'',memo:'',items:[payDocItem('x','')],history:[]});
   out.old={names:payDocTargetNames(payDocReq('PD-OLD')).join(','),up:payDocCanUpload(payDocReq('PD-OLD'))};
   return out;},STAFF);
  ok(r.disabledFirst&&r.enabled,'담당자 칸: 담당자 지정을 고르면 체크 가능');
  ok(r.noneBlocked,'담당자 지정인데 아무도 고르지 않으면 발송 안 됨');
  ok(r.count==='2명 선택'&&r.fits,'선택 인원 표시 · 창이 화면 폭 안',r);
  ok(r.saved.n===1&&r.saved.type==='person'&&(r.saved.names||[]).join(',')==='김능영,박영업'&&r.saved.tn==='김능영, 박영업','2명 지정으로 발송 — targetNames · 표시 이름',r.saved);
  ok(r.kim.mine&&r.kim.up&&r.park.mine&&r.park.up&&!r.lee.mine&&!r.lee.up,'지정한 2명 모두 받고 올릴 수 있음 · 다른 영업 직원은 아님',r);
  ok(r.btn&&r.editOpen,'상세 창 [요청 내용 수정] → 수정 창 (상세 창 위)',r);
  ok(r.prefill.m==='시험가맹점'&&r.prefill.picked==='김능영,박영업'&&r.prefill.catalogHidden&&/수정 저장/.test(r.prefill.submit),'수정 창에 기존 값 · 서류 칸 숨김 · [수정 저장]',r.prefill);
  ok(r.edited.names==='김능영,이영업,홍예지'&&r.edited.due==='2026-12-01'&&r.edited.memo==='통장사본 법인 명의로'&&r.edited.itemsSame&&r.edited.n===1&&r.edited.closed,'수정 저장 — 담당자 · 기한 · 메모 변경, 서류 항목 · 파일 그대로, 새 요청 안 생김',r.edited);
  ok(/요청 내용 수정/.test(r.edited.log)&&/보완 기한/.test(r.edited.log)&&/수신/.test(r.edited.log)&&r.edited.detailText,'처리 이력에 바뀐 항목 기록 · 상세 창 갱신',r.edited.log);
  ok(!r.park2.mine&&r.lee2.mine&&r.lee2.up&&r.hong.mine&&r.hong.up,'뺀 사람은 목록에서 빠지고 추가한 사람(운영팀 포함)은 받음',r);
  ok(r.team.type==='team'&&r.team.tn==='영업본부 전체'&&r.team.lee===0,'수신을 영업팀 전체로 바꿀 수 있음',r.team);
  ok(r.resetMode,'다시 [요청 등록]을 열면 등록 화면');
  ok(r.salesNoEdit,'영업본부는 요청 내용 수정 불가');
  ok(r.old.names==='김능영'&&r.old.up,'예전 요청(담당자 한 명)도 그대로 동작',r.old);
  ok(alerts.some(a=>/1명 이상/.test(a)),'담당자 미선택 안내',alerts);
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
