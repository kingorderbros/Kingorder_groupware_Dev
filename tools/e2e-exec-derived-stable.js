// 사용법: node tools/e2e-exec-derived-stable.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-26 — 영업본부 현황 · 경영현황판 미처리 업무가 업무를 다시 읽어도(새로고침 · 실시간 갱신) 같은 숫자인지
//   (예전: 업무를 DB 에서 다시 읽으면 계약 진행 · 상담 · 견적에서 만든 업무가 지워져 영업업무센터를 열기 전까지 숫자가 줄었음, 견적은 두 번 셈)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8901,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];const pg=await br.newPage();await pg.setViewport({width:1440,height:900});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8901/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const U={id:'u1',name:'대표',dept:'admin',groupId:'admin',email:'a@x',level:'manager'};localUsers.push(U);
  const S=WORK_CENTERS.sales;S.works=[];collabRequests.length=0;
  // 영업 고객 2곳 — 원본 고객과 연결
  customers.push({id:'C-T1',name:'계약상호',type:'거래고객'},{id:'C-T2',name:'견적상호',type:'거래고객'});
  const saved=[{id:'S-1',type:'activity',title:'저장 업무',status:'working',priority:'normal',receivedAt:'2026-11-20',receiver:'대표',assignee:'김영업',center:'sales'}];
  S.works.push(...saved.map(w=>Object.assign({},w)));
  contracts.push({id:'CT-T1',name:'진행 계약',customerId:'C-T1',status:'활성',value:1000,closing:{stage:'proposal',hold:false,lostReason:'',history:[]}});
  quotes.push({id:'QT-T1',name:'보낸 견적',customerId:'C-T2',status:'발송',items:[],date:'2026-11-20',validUntil:'2099-12-31'});
  enterApp(U);await sleep(150);
  if(typeof syncWorkCenterCustomers==='function')syncWorkCenterCustomers();
  const cnt=()=>{const s=execCollectItems().filter(i=>execDeptKey(i)==='sales'&&execOpen(i));return {n:s.length,kinds:s.map(i=>i.kind+(i.raw&&i.raw.contractId?'(계약)':'')).sort().join(','),quoteWorks:s.filter(i=>i.kind==='work'&&i.raw&&i.raw.quoteId).length};};
  const o={};
  o.first=cnt();
  // 업무를 DB 에서 다시 읽는 상황(새로고침 · 실시간 갱신) — 저장 업무만 돌아옴
  window.kobDb={rows:t=>t==='works'?saved.map(w=>Object.assign({},w)):[]};
  loadWorksFromDb();o.afterReload=cnt();o.derivedKept=WORK_CENTERS.sales.works.some(w=>w.contractId==='CT-T1');
  loadWorksFromDb();loadWorksFromDb();o.afterMany=cnt();
  delete window.kobDb;
  // 영업업무센터를 열어도 같은 숫자
  navigate('sales-work-center',document.getElementById('nav-sales-work-center'));await sleep(150);o.afterWc=cnt();
  // 영업본부 현황 카드
  navigate('sales',document.getElementById('nav-sales'));await sleep(150);o.card=document.getElementById('sdash-open-cases').textContent.trim();
  return o;});
 ok(r.first.n===3&&r.first.kinds.includes('quote')&&r.first.kinds.includes('(계약)'),'처음 — 저장 업무 1 · 계약 진행 1 · 견적 1',r.first);
 ok(r.first.quoteWorks===0,'견적은 한 번만 (견적에서 만든 업무는 빼고 견적서로)',r.first);
 ok(r.derivedKept&&r.afterReload.n===r.first.n,'업무를 다시 읽어도 같은 숫자 (계약 진행 업무 유지)',r.afterReload);
 ok(r.afterMany.n===r.first.n,'여러 번 다시 읽어도 같은 숫자',r.afterMany);
 ok(r.afterWc.n===r.first.n,'영업업무센터를 열어도 같은 숫자',r.afterWc);
 ok(r.card===r.first.n+'건','영업본부 현황 미처리 업무 카드 = 같은 숫자',r.card);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
