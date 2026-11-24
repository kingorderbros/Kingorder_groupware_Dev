// 사용법: node tools/e2e-sales-dash-open.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — 영업본부 현황 '미처리 업무' = 경영현황판 ③ 영업본부 진행중 (상담만이 아니라 영업본부 전체), 클릭하면 같은 목록
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8892,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1440,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<500,hasTouch:vw<500});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8892/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'김영업',dept:'sales',groupId:'sales'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const S=WORK_CENTERS.sales;S.works=[];WORK_CENTERS.ops.works=[];collabRequests.length=0;
   const w=(id,type,st,extra)=>S.works.push(Object.assign({id,type,title:id,status:st,priority:'normal',receivedAt:'2026-11-20',receiver:'대표',assignee:'김영업'},extra||{}));
   w('S-1','activity','working');w('S-2','consult','received');w('S-3','contract','hold');w('S-4','quote','done',{doneAt:'2026-11-22'});
   WORK_CENTERS.ops.works.push({id:'O-1',type:'as',title:'운영',status:'working',receivedAt:'2026-11-20',assignee:'최운영'});
   inboundRecords=[{id:'IB-1',company:'가',phone:'01012345678',flags:[],kob:{result:'진행중',dept:'영업',owner:'김영업'}},{id:'IB-2',company:'나',phone:'01012345678',flags:[],kob:{result:'실패',dept:'영업',owner:'김영업'}}];
   collabRequests.push({id:'CR-1',title:'영업으로',status:'accepted',targetDept:'sales',assignee:'대표',date:'2026-11-30'});
   enterApp(U[0]);await sleep(120);
   // 경영현황판에 필터를 걸어 둬도 영업본부 카드는 전체 기준
   navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(120);
   setExecFilter('kind','협업요청');await sleep(30);
   navigate('sales',document.getElementById('nav-sales'));await sleep(120);
   const o={};
   o.card=document.getElementById('sdash-open-cases').textContent.trim();o.sub=document.getElementById('sdash-open-sub').textContent.trim();
   o.label=[...document.querySelectorAll('#sec-sales p')].some(p=>p.textContent.includes('미처리 업무'));
   o.expected=execCollectItems().filter(i=>i.dept==='sales'&&!i.done).map(i=>i.id).sort().join(',');
   document.getElementById('sdash-open-cases').closest('[onclick]').click();await sleep(30);
   o.popupOpen=!document.getElementById('exec-list-modal').classList.contains('hidden');
   o.rows=[...document.querySelectorAll('#exec-modal-rows tr[onclick]')].filter(t=>!t.classList.contains('exec-prog-row')&&t.children.length>=9).map(t=>t.children[1].textContent.trim()).sort().join(',');
   o.title=document.getElementById('exec-modal-title').textContent;o.state=execListFilter.state;o.filterKept=execFilter.kind;
   closeExecListModal();
   // 경영현황판 ③ 영업본부 진행중과 같음
   resetExecFilter();navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(120);
   o.execOpen=+document.querySelector('.exec-dept-panel[data-dept="sales"] .exec-dept-nums button p').textContent;
   return o;});
  ok(r.label,'카드 이름 미처리 업무');
  ok(r.card==='5건','영업본부 미처리 5건 (업무 3 · 인바운드 1 · 협업 1, 완료 · 실패 · 운영 제외)',r);
  ok(r.expected==='CR-1,IB-1,S-1,S-2,S-3','기준 목록',r.expected);
  ok(r.execOpen===5,'경영현황판 ③ 영업본부 진행중과 같음',r.execOpen);
  ok(r.popupOpen&&r.rows===r.expected&&r.state==='open'&&r.title.includes('영업본부'),'클릭 → 영업본부 진행중 목록',r);
  ok(r.filterKept==='협업요청','경영현황판 필터는 그대로 둠',r.filterKept);
  ok(r.sub.includes('경영현황판 기준'),'설명 줄',r.sub);
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
