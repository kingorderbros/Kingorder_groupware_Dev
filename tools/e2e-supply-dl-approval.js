// 사용법: node tools/e2e-supply-dl-approval.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — 가맹점별 수수료가 든 거래처 엑셀(병원·기타 PG · 약국)은 본부장 승인 후 1회 다운로드. 본부장급 이상은 바로.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8885,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];const pg=await br.newPage();await pg.setViewport({width:1400,height:900});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
 await pg.goto('http://localhost:8885/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const mk=(id,name,dept,level)=>({id,name,dept,level,groupId:'admin',email:id+'@x.kr'});
  const A=mk('u1','관리자','admin','admin'),H=mk('u2','박본부','sales','rk_head'),L=mk('u3','김팀장','sales','rk_leader'),M=mk('u4','이매니저','sales','rk_manager'),H2=mk('u5','최본부','ops','rk_head');
  localUsers.push(A,H,L,M,H2);enterApp(A);await sleep(100);ensureSuppliesLoaded();await sleep(150);
  supplyRecords.push({id:'SP-901',channel:'pg',name:'시험병원',pg:'헥토',fee:2.345},{id:'SP-911',channel:'franchise',name:'시험브랜드'});saveSupplies();
  let files=[];window.buildXlsxBlob=(rows)=>{files.push(rows);return new Blob(['x']);};window.downloadBlobAs=()=>{};
  let alerts=[];window.alert=m=>alerts.push(String(m));let promptAns='거래처 정리 보고';let prompts=[];window.prompt=(m)=>{prompts.push(String(m));return promptAns;};
  const as=u=>{currentUserName=u.name;currentUserLevel=u.level;currentUserDept=u.dept;currentUserRole=u.dept;};
  const feeOf=rows=>{const row=rows.find(x=>x.includes('시험병원'));const i=rows[1].indexOf('가맹점 수수료(%)');return row?row[i]:undefined;};
  const o={};
  supplyChannel='pg';supplyFilter={q:'',owner:'',v1:'',v2:''};
  // 본부장 · 관리자 바로
  as(H);files=[];downloadSupplyXlsx();o.headDirect=files.length===1&&feeOf(files[0])===2.345;
  as(A);files=[];downloadSupplyXlsx();o.adminDirect=files.length===1&&feeOf(files[0])===2.345;
  // 승인 없는 채널(프랜차이즈)은 팀장도 바로
  as(L);supplyChannel='franchise';files=[];downloadSupplyXlsx();o.franchiseDirect=files.length===1;supplyChannel='pg';
  // 팀장 요청
  files=[];prompts=[];downloadSupplyXlsx();o.leaderBlocked=files.length===0&&prompts.length===1;
  const req=dlReqList().find(x=>x.by==='김팀장');o.req=req&&{status:req.status,approvers:req.approvers,ch:req.ch};
  o.noti=collabNotifications.filter(n=>n.type==='download-request'&&n.dlReqId===req.id).map(n=>n.toUser);
  o.notiJs=notiClickJs(collabNotifications.find(n=>n.dlReqId===req.id));
  // 다시 누르면 대기 안내 (중복 요청 없음)
  alerts=[];downloadSupplyXlsx();o.dupBlocked=dlReqList().filter(x=>x.by==='김팀장').length===1&&alerts.some(a=>a.includes('이미'));closeDlReqModal();
  // 요청자 스스로 · 다른 본부 본부장은 승인 못함, 매니저도 못함
  o.selfCant=!canDecideDlReq(req);as(M);o.mgrCant=!canDecideDlReq(req);as(H2);o.otherHeadCant=!canDecideDlReq(req);
  // 같은 본부 본부장 화면에서 승인
  as(H);openDlReqModal();o.headBtns=[...document.querySelectorAll('#dl-req-body button')].map(b=>b.textContent.trim());
  decideDlReq(req.id,true);closeDlReqModal();
  o.resultNoti=collabNotifications.filter(n=>n.type==='download-request-result'&&n.toUser==='김팀장').length;
  // 팀장: 승인 창에서 다운로드 → 수수료 포함 1회
  as(L);openDlReqModal();const btn=[...document.querySelectorAll('#dl-req-body button')].find(b=>b.textContent.includes('엑셀 다운로드'));o.leaderBtn=!!btn;
  files=[];btn.click();await sleep(20);o.approvedFile=files.length===1&&feeOf(files[0])===2.345;
  o.used=dlReqList().find(x=>x.id===req.id).status;
  // 두 번째는 다시 승인 요청
  files=[];prompts=[];promptAns=null;downloadSupplyXlsx();o.secondBlocked=files.length===0&&prompts.length===1;closeDlReqModal();
  // 반려 흐름 (매니저)
  as(M);promptAns='월말 보고';downloadSupplyXlsx();const r2=dlReqList().find(x=>x.by==='이매니저');
  as(H);promptAns='보고 자료는 본부장이 공유';decideDlReq(r2.id,false);
  as(M);files=[];prompts=[];promptAns=null;alerts=[];downloadSupplyXlsx();o.rejected={status:dlReqList().find(x=>x.id===r2.id).status,files:files.length,prompted:prompts.length};
  // 24시간 지나면 만료
  as(M);promptAns='재요청';downloadSupplyXlsx();const r3=dlReqList().filter(x=>x.by==='이매니저').pop();as(H);decideDlReq(r3.id,true);
  const all=dlReqList();const x3=all.find(x=>x.id===r3.id);x3.decidedAt=new Date(Date.now()-25*3600000).toISOString();saveJsonStore(DL_REQ_KEY,all);
  as(M);files=[];promptAns=null;downloadSupplyXlsx();o.expired={st:dlReqStatusOf(dlReqList().find(x=>x.id===r3.id)),files:files.length};
  // 거래처 관리 단추
  as(L);navigate('sales-supply',document.getElementById('nav-sales-supply'));await sleep(80);setSupplyChannel('pg');await sleep(50);
  o.btnText=[...document.querySelectorAll('#sec-sales-supply button')].map(b=>b.textContent.replace(/\s+/g,' ').trim()).filter(t=>/엑셀|승인/.test(t));
  closeDlReqModal();
  return o;});
 ok(r.headDirect,'본부장은 승인 없이 바로 · 수수료 포함');
 ok(r.adminDirect,'관리자 바로 · 수수료 포함');
 ok(r.franchiseDirect,'수수료 없는 채널(프랜차이즈)은 팀장도 바로');
 ok(r.leaderBlocked,'팀장은 사유 입력 후 승인 요청, 파일 없음');
 ok(r.req&&r.req.status==='pending'&&JSON.stringify(r.req.approvers)==='["박본부"]','같은 본부 본부장에게 요청',r.req);
 ok(JSON.stringify(r.noti)==='["박본부"]','본부장에게 알림',r.noti);
 ok(r.notiJs==='openDlReqModal()','알림 클릭 → 승인 창',r.notiJs);
 ok(r.dupBlocked,'대기 중 다시 누르면 안내만 (중복 요청 없음)');
 ok(r.selfCant&&r.mgrCant&&r.otherHeadCant,'요청자 · 매니저 · 다른 본부 본부장은 승인 불가');
 ok(r.headBtns.includes('승인')&&r.headBtns.includes('반려'),'본부장 승인 창에 [승인] [반려]',r.headBtns);
 ok(r.resultNoti===1,'승인 결과 알림 요청자에게');
 ok(r.leaderBtn&&r.approvedFile,'승인 후 요청자 다운로드 · 수수료 포함');
 ok(r.used==='used','다운로드하면 완료 처리',r.used);
 ok(r.secondBlocked,'두 번째 다운로드는 다시 승인 요청');
 ok(r.rejected.status==='rejected'&&r.rejected.files===0&&r.rejected.prompted===1,'반려되면 다운로드 안 됨 · 새 요청으로',r.rejected);
 ok(r.expired.st==='expired'&&r.expired.files===0,'승인 후 24시간 지나면 만료',r.expired);
 ok(r.btnText.some(t=>t.includes('엑셀 다운로드 (승인 필요)'))&&r.btnText.some(t=>t.includes('다운로드 승인')),'거래처 관리 단추 표시',r.btnText);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
