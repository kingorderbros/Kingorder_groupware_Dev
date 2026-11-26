// 사용법: node tools/e2e-exec-mobile-rows.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-26 — 휴대폰에서 경영현황판 · 영업본부 현황의 상세 내역을 팝업(카드 목록)으로, 옆으로 밀지 않고 한 화면에
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8894,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[390,844],[360,740],[360,640],[1440,900]]){
  const phone=vw<640;console.log(`■ 화면 ${vw}x${vh} ${phone?'(휴대폰)':'(컴퓨터)'}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:phone,hasTouch:phone});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8894/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'김영업',dept:'sales',groupId:'sales'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const S=WORK_CENTERS.sales;S.works=[];WORK_CENTERS.ops.works=[];collabRequests.length=0;
   const w=(id,type,st,extra)=>S.works.push(Object.assign({id,type,title:id+' 아주 긴 업무 제목이 들어가도 줄이 바뀌어 화면 안에 표시되어야 합니다',status:st,priority:'normal',receivedAt:'2026-11-20',receiver:'대표',assignee:'김영업'},extra||{}));
   for(let k=1;k<=12;k++)w('S-'+k,k%3?'consult':'activity',k%4?'working':'done',k%4?{}:{doneAt:'2026-11-22'});
   w('S-L','consult','working',{dueDate:'2026-01-01'});w('S-C','contract','working');w('S-Q','quote','working');
   collabRequests.push({id:'CR-1',title:'협업',status:'accepted',targetDept:'sales',assignee:'대표',date:'2026-11-30'});
   inboundRecords=[{id:'IB-1',company:'가',phone:'0101',flags:[],kob:{result:'진행중',dept:'영업',owner:'김영업'}}];
   enterApp(U[0]);await sleep(120);
   const vis=id=>{const e=document.getElementById(id);return !!e&&!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;};
   const o={};
   const tableBox=()=>document.querySelector('#exec-list-modal table').closest('.sm\\:flex');
   // ① 경영현황판 본부 상세 → 카드만, 상세 내역 단추
   navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(120);
   openExecListModal('d:sales');await sleep(40);
   o.listOpen=vis('exec-list-modal');o.rowsOpen0=vis('exec-rows-modal');
   o.tableShown=getComputedStyle(tableBox()).display!=='none';
   o.btnShown=getComputedStyle(document.getElementById('exec-rows-open')).display!=='none';
   o.btnText=document.getElementById('exec-rows-open').textContent.replace(/\s+/g,' ').trim();
   {const b=document.getElementById('exec-rows-open').getBoundingClientRect();o.btnInView=b.height>0&&b.top>=0&&b.bottom<=window.innerHeight;o.nCards=document.querySelectorAll('#exec-modal-extra .exec-fn-card').length;}
   const lm=document.querySelector('#exec-list-modal > div');o.listOverflowX=lm.scrollWidth>lm.clientWidth+1;
   // ② 기능 카드 클릭 → 팝업
   const card=document.querySelector('#exec-modal-extra .exec-fn-card[data-fn^="w:sales:consult"]');card.click();await sleep(40);
   o.rowsOpen1=vis('exec-rows-modal');o.rowsTitle=document.getElementById('exec-rows-title').textContent;
   o.rowsCards=document.querySelectorAll('#exec-rows-list .exec-rows-card').length;o.expected=execListFiltered().length;
   const host=document.getElementById('exec-rows-list');o.rowsOverflowX=host.scrollWidth>host.clientWidth+1;
   o.cardsInside=[...host.querySelectorAll('.exec-rows-card')].every(c=>{const b=c.getBoundingClientRect();return b.left>=0&&b.right<=window.innerWidth+0.5;});
   const mb=document.querySelector('#exec-rows-modal > div').getBoundingClientRect();o.fullScreen=Math.abs(mb.width-window.innerWidth)<1&&Math.abs(mb.height-window.innerHeight)<1;
   // ③ 카드 탭 → 건별 상세가 팝업 위에
   if(o.rowsOpen1){host.querySelector('.exec-rows-card').click();await sleep(40);
    o.itemOpen=vis('exec-item-modal');const el=document.elementFromPoint(window.innerWidth/2,window.innerHeight/2);o.itemOnTop=!!el.closest('#exec-item-modal');
    closeExecItemModal();o.backLabel1=document.getElementById('exec-rows-back-label').textContent;document.querySelector('#exec-rows-modal button[onclick="backExecRowsModal()"].w-full').click();await sleep(20);o.backToList=vis('exec-list-modal')&&!vis('exec-rows-modal');}
   // 지연 숫자(카드 안) → 팝업 · 지연만
   const lateBtn=[...document.querySelectorAll('#exec-modal-extra .exec-fn-card button')].find(b=>b.textContent.includes('지연'));lateBtn.click();await sleep(30);
   o.lateRows=vis('exec-rows-modal')&&document.getElementById('exec-rows-title').textContent.includes('지연');
   closeExecListModal();await sleep(20);o.allClosed=!vis('exec-list-modal')&&!vis('exec-rows-modal');
   // ④ 한눈에 보기 '진행 중' — 카드가 없는 창은 바로 상세 내역
   openExecListModal('open');await sleep(40);o.openView=vis('exec-rows-modal');
   // 카드 없는 창에서 돌아가기 → 빈 목록 창이 남지 않고 현황판으로 (2026-11-26)
   o.backLabel2=document.getElementById('exec-rows-back-label').textContent;document.querySelector('#exec-rows-modal button[onclick="backExecRowsModal()"].w-full').click();await sleep(20);o.directBack=!vis('exec-rows-modal')&&!vis('exec-list-modal');
   openExecListModal('g:unassigned');await sleep(40);o.gView=vis('exec-rows-modal');document.querySelector('#exec-rows-modal button[aria-label="닫기"]').click();await sleep(20);o.gBack=!vis('exec-list-modal');closeExecListModal();
   // ⑤ 영업본부 현황 기능 카드 → 바로 팝업
   navigate('sales',document.getElementById('nav-sales'));await sleep(120);
   document.querySelector('#sdash-exec-panel .exec-fn-card[data-fn^="w:sales:consult"]').click();await sleep(40);
   o.salesRows=vis('exec-rows-modal');o.salesCount=document.querySelectorAll('#exec-rows-list .exec-rows-card').length;o.salesExpected=execListFiltered().length;
   closeExecListModal();
   return o;});
  if(phone){
   ok(r.listOpen&&!r.rowsOpen0,'본부 상세 — 카드 화면',r);
   ok(!r.tableShown&&r.btnShown,'표 숨김 · [상세 내역 보기] 단추',r);
   ok(/상세 내역 \d+건 보기/.test(r.btnText),'단추에 건수',r.btnText);
   ok(r.btnInView&&r.nCards>=5,'기능 카드가 많아도 [상세 내역 보기] 단추가 화면 안',[r.btnInView,r.nCards]);
   ok(!r.listOverflowX,'본부 상세 옆으로 넘침 없음');
   ok(r.rowsOpen1&&r.rowsTitle.includes('상담'),'기능 카드 클릭 → 상세 내역 팝업',r);
   ok(r.rowsCards===r.expected&&r.expected>0,'팝업 건수 = 거른 건수',[r.rowsCards,r.expected]);
   ok(!r.rowsOverflowX&&r.cardsInside,'팝업 옆으로 넘침 없음 · 카드가 화면 안',r);
   ok(r.fullScreen,'팝업 한 화면 전체',r);
   ok(r.itemOpen&&r.itemOnTop,'카드 탭 → 건별 상세가 위에',r);
   ok(r.backToList,'돌아가기 → 본부 상세 그대로',r);
   ok(r.lateRows,'지연 숫자 → 지연 팝업',r);
   ok(r.allClosed,'닫기 → 모두 닫힘',r);
   ok(r.openView,'한눈에 보기(카드 없는 창) → 바로 상세 내역',r);
   ok(r.backLabel1==='현황으로 돌아가기','카드 창에서 연 팝업 — [현황으로 돌아가기]',r.backLabel1);
   ok(r.directBack&&r.backLabel2==='현황판으로 돌아가기','카드 없는 창 — [현황판으로 돌아가기] → 빈 창 없이 현황판',r);
   ok(r.gView&&r.gBack,'조치 필요(담당자 미배정) — 닫기(×) → 현황판',r);
   ok(r.salesRows&&r.salesCount===r.salesExpected,'영업본부 현황 기능 카드 → 바로 팝업',r);
  } else {
   ok(r.listOpen&&r.tableShown&&!r.btnShown,'컴퓨터 — 표 그대로 · 단추 없음',r);
   ok(!r.rowsOpen1&&!r.openView&&!r.salesRows,'컴퓨터 — 팝업 안 열림',r);
  }
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
