// 사용법: node tools/e2e-fee-mask-partner-payout.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — 파트너사 '제공 PG 수수료' · 지급명세 '가맹점수수료'도 본부장급 이상만 표시(그 외 ***), 저장 시 원래 값 유지, 엑셀은 본부장 승인 후 1회
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8888,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];const pg=await br.newPage();await pg.setViewport({width:1400,height:900});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
 await pg.goto('http://localhost:8888/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const mk=(id,name,dept,level)=>({id,name,dept,level,groupId:'admin',email:id+'@x.kr'});
  const A=mk('u1','관리자','admin','admin'),H=mk('u2','박본부','sales','rk_head'),L=mk('u3','김팀장','sales','rk_leader');
  localUsers.push(A,H,L);enterApp(A);await sleep(100);
  const as=u=>{currentUserName=u.name;currentUserLevel=u.level;currentUserDept=u.dept;currentUserRole=u.dept;};
  let files=[];window.buildXlsxBlob=(rows)=>{files.push(rows);return new Blob(['x']);};window.downloadBlobAs=()=>{};
  window.alert=()=>{};let promptAns='보고';window.prompt=()=>promptAns;window.confirm=()=>true;
  navigate('sales-supply',document.getElementById('nav-sales-supply'));await sleep(80);
  // 파트너사 자료
  const P=partners.find(p=>tradePartners().includes(p))||null;
  let pid;
  if(P){pid=P.id;}else{partners.push({id:'ptx1',name:'시험파트너',kind:'partner',custType:'partner',status:'거래중',fee:{}});pid='ptx1';}
  const pp=partners.find(x=>x.id===pid);const g0=PARTNER_FEE_GRADES[0].key;pp.fee=Object.assign({},pp.fee||{},{[g0]:1.234});
  // 지급명세 자료
  ensurePayoutsLoaded();await sleep(100);
  const ym=payoutCurrentMonth()||'2026-11';
  payoutRecords.push(makePayoutRecord({ym,pathRaw:'시험파트너(D+1)',merchantFee:55555,fee:1000,vat:100,cardCount:1,cardAmount:100000}));savePayouts();payoutMonth=ym;
  const pr=payoutRecords[payoutRecords.length-1];
  const o={};
  for(const u of [H,L]){
   as(u);const x={};
   setSupplyChannel('partner');await sleep(60);
   const tr=[...document.querySelectorAll('#trade-rows tr')].find(t=>t.getAttribute('onclick')&&t.getAttribute('onclick').includes(pid));
   x.partnerCell=tr?tr.innerHTML.includes('1.234%'):null;x.partnerMask=tr?tr.innerHTML.includes('***'):null;
   openPartnerTradeModal(pid);const el=document.getElementById('trade-fee-'+g0);x.partnerInput={v:el.value,dis:el.disabled,na:document.getElementById('trade-fee-na').disabled};
   submitPartnerTrade({preventDefault(){}});x.partnerAfter=partnerFee(partners.find(p=>p.id===pid),g0);
   files=[];promptAns=null;downloadPartnersXlsx();x.partnerXls=files.length;closeDlReqModal();
   setSupplyChannel('payout');await sleep(60);
   const host=document.getElementById('sec-sales-supply');x.payoutCell=host.innerHTML.includes('55,555')||host.innerHTML.includes('55555');x.payoutMask=host.innerHTML.includes('***');
   openPayoutDetail(pr.id);x.detailMask=document.getElementById('payout-detail-body').innerHTML.includes('***');x.detailVal=document.getElementById('payout-detail-body').innerHTML.includes('55,555');closePayoutDetail();
   openPayoutRowModal(pr.id);const mf=document.getElementById('payout-row-merchantFee');x.payoutInput={v:mf.value,dis:mf.disabled};
   submitPayoutRow({preventDefault(){}});x.payoutAfter=payoutRecords.find(r=>r.id===pr.id).merchantFee;
   files=[];downloadPayoutXlsx();x.payoutXls=files.length;closeDlReqModal();
   x.btns=[...host.querySelectorAll('button')].map(b=>b.textContent.replace(/\s+/g,' ').trim()).filter(t=>/엑셀 다운로드|다운로드 승인/.test(t));
   o[u.name]=x;}
  // 팀장 승인 흐름 (지급명세)
  as(L);promptAns='월 정산 확인';files=[];downloadPayoutXlsx();const req=dlReqList().find(q=>q.by==='김팀장'&&q.ch==='payout');o.req=req&&{st:req.status,ap:req.approvers,name:req.chName};
  as(H);decideDlReq(req.id,true);
  as(L);setSupplyChannel('payout');await sleep(40);openDlReqModal();const btn=[...document.querySelectorAll('#dl-req-body li')].find(li=>li.dataset.id===req.id).querySelector('button');
  files=[];btn.click();await sleep(20);const f=files[0];const ci=f?f[1].indexOf('가맹점수수료'):-1;o.approvedPayout=f?(f.find(row=>row.includes(payoutRecords.find(q=>q.id===pr.id).pathRaw))||[])[ci]:null;o.used=dlReqList().find(q=>q.id===req.id).status;closeDlReqModal();
  // 팀장 승인 흐름 (파트너사)
  promptAns='파트너 정리';downloadPartnersXlsx();const req2=dlReqList().find(q=>q.by==='김팀장'&&q.ch==='partner');as(H);decideDlReq(req2.id,true);as(L);
  files=[];downloadApprovedSupply(req2.id);o.approvedPartner=files.length===1&&JSON.stringify(files[0]).includes('1.234');
  return o;});
 const h=r['박본부'],l=r['김팀장'];
 ok(h.partnerCell&&!h.partnerMask,'본부장 파트너사 수수료 보임',h);
 ok(h.partnerInput.v==='1.234'&&!h.partnerInput.dis&&!h.partnerInput.na,'본부장 파트너 창 수수료 입력 가능',h.partnerInput);
 ok(h.partnerXls===1,'본부장 파트너사 엑셀 바로');
 ok(h.payoutCell&&h.detailVal&&!h.detailMask,'본부장 지급명세 가맹점수수료 보임',h);
 ok(h.payoutInput.v==='55555'&&!h.payoutInput.dis,'본부장 지급명세 수정 창 입력 가능',h.payoutInput);
 ok(h.payoutXls===1,'본부장 지급명세 엑셀 바로');
 ok(!l.partnerCell&&l.partnerMask,'팀장 파트너사 수수료 ***',l);
 ok(l.partnerInput.v==='***'&&l.partnerInput.dis&&l.partnerInput.na,'팀장 파트너 창 수수료 *** · 막힘',l.partnerInput);
 ok(l.partnerAfter===1.234,'팀장이 저장해도 파트너 수수료 유지',l.partnerAfter);
 ok(l.partnerXls===0,'팀장 파트너사 엑셀은 승인 필요');
 ok(!l.payoutCell&&l.payoutMask&&l.detailMask&&!l.detailVal,'팀장 지급명세 가맹점수수료 *** (표 · 합계 · 상세)',l);
 ok(l.payoutInput.v==='***'&&l.payoutInput.dis,'팀장 지급명세 수정 창 *** · 막힘',l.payoutInput);
 ok(l.payoutAfter===55555,'팀장이 저장해도 가맹점수수료 유지',l.payoutAfter);
 ok(l.payoutXls===0,'팀장 지급명세 엑셀은 승인 필요');
 ok(l.btns.some(t=>t.includes('(승인 필요)'))&&l.btns.some(t=>t.includes('다운로드 승인')),'지급명세 머리 줄 단추',l.btns);
 ok(r.req&&r.req.st==='pending'&&JSON.stringify(r.req.ap)==='["박본부"]'&&r.req.name==='지급명세','지급명세 승인 요청 → 같은 본부 본부장',r.req);
 ok(r.approvedPayout===55555&&r.used==='used','승인 후 지급명세 엑셀에 가맹점수수료 · 1회 사용',r);
 ok(r.approvedPartner,'승인 후 파트너사 엑셀에 수수료');
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
