// 사용법: node tools/e2e-fee-server-mode.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-25 — 수수료 보안 1단계 화면: 서버 모드(가짜 데이터베이스 함수)에서 요청 → 승인 → 1회 받기(데이터베이스가 준 값으로 엑셀),
//              값을 못 받은 '***' 상태 보호, 본부장급 열람 · 다운로드 기록, 관리자 기록 보기
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8894,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];const pg=await br.newPage();await pg.setViewport({width:1400,height:900});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
 await pg.goto('http://localhost:8894/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const mk=(id,name,dept,level,email)=>({id,name,dept,level,groupId:'admin',email});
  const A=mk('u1','관리자','admin','admin','admin@x.kr'),H=mk('u2','박본부','sales','rk_head','head@x.kr'),L=mk('u3','김팀장','sales','rk_leader','lead@x.kr');
  localUsers.push(A,H,L);enterApp(A);await sleep(100);ensureSuppliesLoaded();await sleep(100);
  // ---- 가짜 데이터베이스 함수 (supabase/20261125_jh_merchant_fee_secure.sql 과 같은 규칙) ----
  const db={reqs:[],log:[],calls:[]};const FEES={pg:{'SP-901':{fee:2.345}},payout:{},partner:{}};
  const me=()=>localUsers.find(u=>u.name===currentUserName);
  const rpc=async(n,a)=>{db.calls.push(n);const u=me();const cls=levelClass(u.level);const sees=['head','exec','admin'].includes(cls);
   if(n==='fee_log'){db.log.push({action:a.p_action,ch:a.p_ch,name:u.name,at:new Date().toISOString(),rows_n:a.p_rows});return null;}
   if(n==='fee_dl_request'){let x=db.reqs.find(q=>q.by_email===u.email&&q.ch===a.p_ch&&q.status==='pending');if(x)return x;x={id:'DLR-'+(db.reqs.length+1),ch:a.p_ch,chname:a.p_chname,reason:a.p_reason,by_email:u.email,by_name:u.name,by_dept:u.dept,approvers:a.p_approvers,status:'pending',created_at:new Date().toISOString()};db.reqs.push(x);db.log.push({action:'request',ch:a.p_ch,name:u.name});return x;}
   if(n==='fee_dl_decide'){const x=db.reqs.find(q=>q.id===a.p_id);if(!sees)throw new Error('KOB_FEE: 본부장급 이상만 승인할 수 있습니다.');if(x.by_email===u.email)throw new Error('KOB_FEE: 본인 요청은 승인할 수 없습니다.');if(cls==='head'&&!x.approvers.includes(u.name))throw new Error('KOB_FEE: 지정된 승인자만 승인할 수 있습니다.');x.status=a.p_approve?'approved':'rejected';x.decided_by=u.name;x.decided_at=new Date().toISOString();x.note=a.p_note;db.log.push({action:a.p_approve?'approve':'reject',ch:x.ch,name:u.name});return x;}
   if(n==='fee_dl_fetch'){const x=db.reqs.find(q=>q.id===a.p_id);if(!x||x.by_email!==u.email)throw new Error('KOB_FEE: 본인 요청만 받을 수 있습니다.');if(x.status!=='approved')throw new Error('KOB_FEE: 승인된 요청이 아닙니다 (상태: '+x.status+').');x.status='used';x.used_at=new Date().toISOString();db.log.push({action:'download',ch:x.ch,name:u.name});return FEES[x.ch];}
   if(n==='fee_log_list'){if(cls!=='admin')throw new Error('KOB_FEE: 관리자만 볼 수 있습니다.');return db.log.slice().reverse();}
   throw new Error('없는 함수 '+n);};
  const list=async(t)=>{const u=me();const sees=['head','exec','admin'].includes(levelClass(u.level));return t==='fee_download_requests'?db.reqs.filter(q=>q.by_email===u.email||sees):[];};
  const real=window.kobDb;
  window.kobDb=new Proxy(real,{get(t,k){if(k==='mode')return 'supabase';if(k==='rpc')return rpc;if(k==='list')return list;const v=t[k];return typeof v==='function'?v.bind(t):v;}});
  let files=[];window.buildXlsxBlob=(rows)=>{files.push(rows);return new Blob(['x']);};window.downloadBlobAs=()=>{};
  window.alert=m=>{(window.__alerts=window.__alerts||[]).push(String(m));};let promptAns='월말 보고';window.prompt=()=>promptAns;
  const as=u=>{currentUserName=u.name;currentUserLevel=u.level;currentUserDept=u.dept;currentUserRole=u.dept;currentUserEmail=u.email;currentUserIsAdmin=u.level==='admin';currentUserGroupId=u.level==='admin'?'admin':u.dept;};
  const feeIdx=rows=>rows[1].indexOf('가맹점 수수료(%)');const rowOf=rows=>rows.find(x=>x.includes('시험병원'));
  const o={};
  // 팀장 화면 — 서버가 '***' 만 줌
  supplyRecords.push({id:'SP-901',channel:'pg',owner:'김팀장',name:'시험병원',pg:'헥토',fee:'***',cycle:'D+1'});saveSupplies();
  as(L);navigate('sales-supply',document.getElementById('nav-sales-supply'));await sleep(60);setSupplyChannel('pg');await sleep(60);
  o.leaderCellMasked=document.getElementById('sec-sales-supply').innerHTML.includes('***')&&!document.getElementById('sec-sales-supply').innerHTML.includes('2.345');
  o.leaderViewLogged=db.log.filter(x=>x.action==='view').length;
  files=[];downloadSupplyXlsx();await sleep(60);
  o.req=db.reqs[0]&&{ch:db.reqs[0].ch,ap:db.reqs[0].approvers,st:db.reqs[0].status};o.leaderNoFile=files.length===0;
  o.notiHead=collabNotifications.some(n=>n.type==='download-request'&&n.toUser==='박본부');
  // 본부장 — 승인 창에서 승인
  as(H);openDlReqModal();await sleep(60);
  const ap=[...document.querySelectorAll('#dl-req-body button')].find(b=>b.textContent.trim()==='승인');o.headSeesApprove=!!ap;
  ap.click();await sleep(60);o.afterDecide=db.reqs[0].status;o.notiLead=collabNotifications.some(n=>n.type==='download-request-result'&&n.toUser==='김팀장');closeDlReqModal();
  // 팀장 — 승인 창에서 다운로드 → 데이터베이스가 준 값으로
  as(L);openDlReqModal();await sleep(60);
  const dl=[...document.querySelectorAll('#dl-req-body button')].find(b=>b.textContent.includes('엑셀 다운로드'));o.leaderBtn=!!dl;
  files=[];dl.click();await sleep(80);
  o.file=files[0]?rowOf(files[0])[feeIdx(files[0])]:null;o.used=db.reqs[0].status;closeDlReqModal();
  // 자료가 없는 채널(약국) — 승인받았어도 목록이 비면 받기를 부르지 않아 승인이 그대로 남음
  const rp=await rpc('fee_dl_request',{p_ch:'pharmacy',p_chname:'약국',p_reason:'약국 정리',p_approvers:['박본부']});
  as(H);await rpc('fee_dl_decide',{p_id:rp.id,p_approve:true,p_note:''});as(L);await refreshDlReqs();
  window.__alerts=[];const fetchBefore=db.calls.filter(c=>c==='fee_dl_fetch').length;downloadApprovedSupply(rp.id);await sleep(80);
  o.emptyKept={st:rp.status,alert:(window.__alerts||[]).join('|'),fetched:db.calls.filter(c=>c==='fee_dl_fetch').length-fetchBefore};
  promptAns='월말 보고';setSupplyChannel('pg');await sleep(30);
  // 두 번째는 다시 요청
  files=[];promptAns=null;downloadSupplyXlsx();await sleep(60);o.secondNoFile=files.length===0;closeDlReqModal();
  // 본부장 — 값을 못 받은 '***' 상태에서 수정해도 수수료 보존
  as(H);setSupplyChannel('pg');await sleep(40);openSupplyModal('SP-901');const el=document.getElementById('sup-fee');o.headMaskInput={v:el.value,dis:el.disabled};
  document.getElementById('sup-cycle').value='D+2';submitSupply({preventDefault(){}});o.headSavedFee=supplyRecords.find(x=>x.id==='SP-901').fee;
  // 본부장 — 값이 있을 때 바로 다운로드 + 기록
  supplyRecords.find(x=>x.id==='SP-901').fee=2.345;files=[];downloadSupplyXlsx();await sleep(30);
  o.headFile=files[0]?rowOf(files[0])[feeIdx(files[0])]:null;o.headDlLog=db.log.filter(x=>x.action==='download'&&x.name==='박본부').length;
  o.headViewLog=db.log.filter(x=>x.action==='view'&&x.name==='박본부').length;
  setSupplyChannel('pharmacy');await sleep(30);setSupplyChannel('pg');await sleep(30);o.headViewLog2=db.log.filter(x=>x.action==='view'&&x.name==='박본부').length;
  // 지급명세 — '***' 행 보호 (본부장)
  ensurePayoutsLoaded();await sleep(80);const ym=payoutCurrentMonth()||'2026-11';
  payoutRecords.push(makePayoutRecord({ym,pathRaw:'시험업체(D+1)',merchantFee:'***',fee:1000,vat:100,cardCount:1,cardAmount:10000}));savePayouts();payoutMonth=ym;const pr=payoutRecords[payoutRecords.length-1];
  o.payoutMaskKept=pr.merchantFee;
  openPayoutRowModal(pr.id);o.payoutInput={v:document.getElementById('payout-row-merchantFee').value,dis:document.getElementById('payout-row-merchantFee').disabled};
  submitPayoutRow({preventDefault(){}});o.payoutAfter=payoutRecords.find(x=>x.id===pr.id).merchantFee;
  // 관리자 — 기록 보기
  as(A);openDlReqModal();await sleep(60);const lb=[...document.querySelectorAll('#dl-req-body button')].find(b=>b.textContent.includes('최근 100건'));o.adminLogBtn=!!lb;
  lb.click();await sleep(60);o.adminLog=document.getElementById('fee-log-body').textContent;closeDlReqModal();
  as(L);openDlReqModal();await sleep(40);o.leaderNoLogBtn=![...document.querySelectorAll('#dl-req-body button')].some(b=>b.textContent.includes('최근 100건'));closeDlReqModal();
  return o;});
 ok(r.leaderCellMasked,'팀장 표 *** (값 없음)');
 ok(r.leaderViewLogged===0,'팀장은 열람 기록 대상 아님');
 ok(r.req&&r.req.ch==='pg'&&JSON.stringify(r.req.ap)==='["박본부"]'&&r.req.st==='pending'&&r.leaderNoFile,'팀장 다운로드 → 데이터베이스에 승인 요청, 파일 없음',r);
 ok(r.notiHead,'본부장에게 알림');
 ok(r.headSeesApprove&&r.afterDecide==='approved'&&r.notiLead,'본부장 승인 → 데이터베이스 승인 · 팀장 알림',r);
 ok(r.leaderBtn&&r.file===2.345,'팀장 승인 다운로드 — 화면 값(***)이 아닌 데이터베이스가 준 값',r);
 ok(r.used==='used','받으면 사용 처리');
 ok(r.emptyKept.st==='approved'&&r.emptyKept.fetched===0&&/승인은 그대로/.test(r.emptyKept.alert),'목록이 비면 받기를 부르지 않음 — 승인 그대로',r.emptyKept);
 ok(r.secondNoFile,'두 번째는 다시 승인 요청');
 ok(r.headMaskInput.v==='***'&&r.headMaskInput.dis&&r.headSavedFee==='***','본부장도 값을 못 받은 상태면 칸 막고 *** 그대로 저장 (서버 값 보존)',r);
 ok(r.headFile===2.345&&r.headDlLog===1,'본부장 바로 다운로드 + 다운로드 기록',r);
 ok(r.headViewLog===1&&r.headViewLog2===2,'본부장 열람 기록 (채널마다 한 번)',r);
 ok(r.payoutMaskKept==='***'&&r.payoutInput.v==='***'&&r.payoutInput.dis&&r.payoutAfter==='***','지급명세 *** 행 — 수정해도 *** 유지 (0으로 덮지 않음)',r);
 ok(r.adminLogBtn&&/다운로드/.test(r.adminLog)&&/승인/.test(r.adminLog)&&/열람/.test(r.adminLog),'관리자 기록 보기',r.adminLog.slice(0,200));
 ok(r.leaderNoLogBtn,'팀장은 기록 보기 없음');
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
