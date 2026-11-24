// 사용법: node tools/e2e-exec-dept-fn.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — 경영현황판 ③ 본부별 현황: 본부 → 기능(메뉴)별 카드, 숫자가 ① 한눈에 보기 · 본부 합계 · 팝업 목록과 서로 맞는지(크로스 체크),
//              인바운드 '확인 필요' 는 인바운드 화면 기준(영업수주 · 실패 제외)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8887,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1440,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<500,hasTouch:vw<500});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8887/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'김영업',dept:'sales',groupId:'sales'},{id:'u3',name:'최운영',dept:'ops',groupId:'ops'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const y=ymd(new Date(Date.now()-3*86400000)),old=ymd(new Date(Date.now()-30*86400000));
   const S=WORK_CENTERS.sales,O=WORK_CENTERS.ops;S.works=[];O.works=[];
   const w=(c,id,type,st,as,extra)=>c.works.push(Object.assign({id,center:'',type,title:id,status:st,priority:'normal',receivedAt:'2026-11-20',receiver:'대표',assignee:as},extra||{}));
   w(S,'S-1','activity','working','김영업');w(S,'S-2','activity','done','김영업',{doneAt:'2026-11-21'});w(S,'S-3','consult','working','',{});w(S,'S-4','contract','hold','김영업');
   w(O,'O-1','as','working','최운영');w(O,'O-2','as','received','');w(O,'O-3','menu','working','최운영',{receivedAt:old});w(O,'O-4','install','done','최운영',{doneAt:'2026-11-22'});
   inboundRecords=[
    {id:'IB-1',company:'가',phone:'010',flags:['연락처 확인 필요'],kob:{result:'실패',dept:'영업',owner:'김영업'}},
    {id:'IB-2',company:'나',phone:'010',flags:['재문의'],kob:{result:'진행중',dept:'영업',owner:'김영업'}},
    {id:'IB-3',company:'다',phone:'010',flags:[],dupOf:'IB-1',kob:{dept:'운영',owner:'최운영'}},
    {id:'IB-4',company:'라',phone:'010',flags:[],kob:{result:'영업수주',dept:'영업',owner:'김영업'}},
    {id:'IB-5',company:'마',phone:'010',flags:['문의내용 없음'],spam:true,kob:{}}];
   collabRequests.length=0;collabRequests.push({id:'CR-1',title:'협업',status:'accepted',targetDept:'ops',assignee:'김영업',date:y},{id:'CR-2',title:'본부 없음',status:'pending',targetDept:'',assignee:'대표'},{id:'CR-3',title:'경영진 앞',status:'accepted',targetDept:'management',assignee:'대표'});
   enterApp(U[0]);await sleep(120);navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(200);
   const o={};
   const tileOf=v=>parseInt([...document.querySelectorAll('#sec-exec-center button')].find(b=>new RegExp(`^openExecListModal\\(["']${v}["']\\)$`).test(b.getAttribute('onclick')||'')).querySelector('.text-2xl').textContent);const tiles=['open','late','issue'].map(tileOf);
   o.tiles=tiles;
   const panels=[...document.querySelectorAll('.exec-dept-panel')];
   o.panelDepts=panels.map(p=>p.dataset.dept);
   const pn=p=>[...p.querySelectorAll('.exec-dept-nums button')].map(b=>+b.querySelector('p').textContent);
   o.sum=[0,1,2].map(k=>panels.reduce((n,p)=>n+pn(p)[k],0));
   o.check=document.getElementById('exec-dept-check').textContent.trim();
   // 본부마다 기능 카드 합 = 본부 전체
   o.fnSums=panels.map(p=>{const tot=+p.querySelector('button span.text-xs').textContent.replace(/\D/g,'');const cards=[...p.querySelectorAll('.exec-fn-card')];return {dp:p.dataset.dept,tot,sum:cards.reduce((n,c)=>n+ +c.querySelector('.text-base').textContent,0),names:cards.map(c=>c.querySelector('p').textContent.trim())};});
   const rows=()=>[...document.querySelectorAll('#exec-modal-rows tr[onclick]')].filter(t=>!t.classList.contains('exec-prog-row')&&t.children.length>=9).map(t=>t.children[1].textContent.trim()).sort().join(',');
   // 기능 카드 클릭 → 목록 = 카드 숫자
   const clicks=[];
   for(const p of panels){for(const c of p.querySelectorAll('.exec-fn-card')){c.click();await sleep(10);const n=rows().split(',').filter(Boolean).length;clicks.push({dp:p.dataset.dept,fn:c.dataset.fn,card:+c.querySelector('.text-base').textContent,rows:n});closeExecListModal();}}
   o.clicks=clicks;
   // 상태 숫자 클릭 (운영본부 AS유지보수 진행)
   const asCard=document.querySelector('.exec-dept-panel[data-dept="ops"] .exec-fn-card[data-fn="w:ops:as"]');
   asCard.querySelectorAll('button')[0].click();await sleep(10);o.asOpen={rows:rows(),state:execListFilter.state,fn:execListFilter.fn};closeExecListModal();
   // 인바운드 확인 필요
   const ibS=document.querySelector('.exec-dept-panel[data-dept="sales"] .exec-fn-card[data-fn="inbound"]');
   o.ibSalesCheckText=[...ibS.querySelectorAll('button')].find(b=>b.textContent.includes('확인 필요')).textContent.trim();
   [...ibS.querySelectorAll('button')].find(b=>b.textContent.includes('확인 필요')).click();await sleep(10);o.ibSalesCheckRows=rows();closeExecListModal();
   const ibO=document.querySelector('.exec-dept-panel[data-dept="ops"] .exec-fn-card[data-fn="inbound"]');
   o.ibOpsCheckText=[...ibO.querySelectorAll('button')].find(b=>b.textContent.includes('확인 필요')).textContent.trim();
   // 인바운드 화면 기준과 같음
   o.ibScreen=inboundRecords.filter(inboundNeedsCheck).map(r=>r.id).sort().join(',');
   // 본부 팝업 안 기능 카드
   openExecListModal('d:ops');await sleep(10);
   const mc=[...document.querySelectorAll('#exec-fn-cards .exec-fn-card')];o.modalCards=mc.map(c=>c.dataset.fn);
   const all=rows();mc.find(c=>c.dataset.fn==='w:ops:as').click();await sleep(10);o.modalPick={rows:rows(),ring:document.querySelector('#exec-fn-cards .exec-fn-card[data-fn="w:ops:as"]').classList.contains('ring-2')};
   resetExecListFilter();o.modalReset=rows()===all;closeExecListModal();
   // 메뉴 열기
   const go=[...asCard.querySelectorAll('button')].find(b=>b.textContent.includes('메뉴 열기'));go.click();await sleep(80);
   o.menuOpen=!document.getElementById('sec-ops-work-center').classList.contains('hidden');
   navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(100);
   // 필터를 걸어도 맞음
   setExecFilter('state','open');await sleep(50);
   const t2=tileOf('open');
   o.filtered={tile:t2,check:document.getElementById('exec-dept-check').textContent.includes('일치')};
   resetExecFilter();
   const host=document.getElementById('sec-exec-center');o.noOverflow=host.scrollWidth<=host.clientWidth+1;
   return o;});
  ok(r.tiles.length===3,'① 타일 읽음',r.tiles);
  ok(JSON.stringify(r.sum)===JSON.stringify(r.tiles),'본부 합계(진행·지연·문제) = ① 한눈에 보기',{sum:r.sum,tiles:r.tiles});
  ok(r.check.includes('일치'),'크로스 체크 문구 일치',r.check);
  ok(r.panelDepts.includes('_none'),'본부 없는 건은 본부 미지정으로',r.panelDepts);
  ok(!r.panelDepts.includes('management'),'경영진 칸 없음 (2026-11-24)',r.panelDepts);
  ok(r.fnSums.find(x=>x.dp==='_none').tot===2,'경영진 앞 건은 본부 미지정에 포함 (합계 유지)',r.fnSums.find(x=>x.dp==='_none'));
  r.fnSums.forEach(x=>ok(x.tot===x.sum,`${x.dp} 기능 카드 합 = 본부 전체 ${x.tot}`,x));
  ok(r.fnSums.find(x=>x.dp==='ops').names.join(',')==='AS유지보수,메뉴유지보수,장비설치,인바운드,협업요청','운영본부 기능 순서(메뉴 순)',r.fnSums.find(x=>x.dp==='ops').names);
  ok(r.clicks.length>0&&r.clicks.every(c=>c.card===c.rows),'기능 카드 클릭 → 목록 건수 = 카드 숫자',r.clicks.filter(c=>c.card!==c.rows));
  ok(r.asOpen.rows==='O-1,O-2'&&r.asOpen.state==='open'&&r.asOpen.fn==='w:ops:as','상태 숫자 클릭 → 그 기능 · 상태로 거름',r.asOpen);
  ok(r.ibSalesCheckText==='확인 필요 1건'&&r.ibSalesCheckRows==='IB-2','영업 인바운드 확인 필요 1 (실패 · 수주 건 제외)',r);
  ok(r.ibOpsCheckText==='확인 필요 1건','운영 인바운드 확인 필요 1 (중복)',r.ibOpsCheckText);
  ok(r.ibScreen==='IB-2,IB-3','인바운드 화면 기준과 같음',r.ibScreen);
  ok(r.modalCards.includes('w:ops:as')&&r.modalCards.includes('inbound'),'본부 팝업 안 기능 카드',r.modalCards);
  ok(r.modalPick.rows==='O-1,O-2'&&r.modalPick.ring,'팝업 기능 카드 클릭 → 목록 거름 · 선택 표시',r.modalPick);
  ok(r.modalReset,'초기화하면 전체로');
  ok(r.menuOpen,'[메뉴 열기] → 운영업무센터');
  ok(r.filtered.check,'공통 필터를 걸어도 본부 합계 일치',r.filtered);
  ok(r.noOverflow,'화면 옆으로 넘치지 않음');
  
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
