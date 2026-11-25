// 사용법: node tools/e2e-sales-dash-fn-cards.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-25 — 영업본부 현황 '기능별 현황' = 경영현황판 ③ 영업본부 칸 (합계 · 기능별 카드 숫자 같음), 카드 클릭 → 같은 상세 팝업
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8893,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1440,900],[1024,768],[844,390],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<500,hasTouch:vw<500});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8893/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'김영업',dept:'sales',groupId:'sales'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const S=WORK_CENTERS.sales;S.works=[];WORK_CENTERS.ops.works=[];collabRequests.length=0;
   const w=(id,type,st,extra)=>S.works.push(Object.assign({id,type,title:id,status:st,priority:'normal',receivedAt:'2026-11-20',receiver:'대표',assignee:'김영업'},extra||{}));
   w('S-1','activity','working');w('S-2','consult','received');w('S-3','contract','hold');w('S-4','quote','done',{doneAt:'2026-11-22'});w('S-5','consult','working',{dueDate:'2026-01-01'});
   WORK_CENTERS.ops.works.push({id:'O-1',type:'as',title:'운영',status:'working',receivedAt:'2026-11-20',assignee:'최운영'});
   inboundRecords=[{id:'IB-1',company:'가',phone:'0101',flags:[],kob:{result:'진행중',dept:'영업',owner:'김영업'}},{id:'IB-2',company:'나',phone:'01012345678',flags:[],kob:{result:'실패',dept:'영업',owner:'김영업'}}];
   collabRequests.push({id:'CR-1',title:'영업으로',status:'accepted',targetDept:'sales',assignee:'대표',date:'2026-11-30'});
   enterApp(U[0]);await sleep(120);
   const cards=sel=>[...document.querySelectorAll(sel+' .exec-fn-card')].map(c=>c.getAttribute('data-fn')+'='+[...c.querySelectorAll('span.font-bold')].map(x=>x.textContent.trim()).join('/')+(c.textContent.includes('확인 필요')?'/c'+(c.textContent.match(/확인 필요 (\d+)/)||[])[1]:'')).join('|');
   const nums=sel=>[...document.querySelectorAll(sel)].map(b=>b.querySelector('p').textContent.trim()).join('/');
   navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(120);
   const o={};
   o.execCards=cards('.exec-dept-panel[data-dept="sales"]');o.execNums=nums('.exec-dept-panel[data-dept="sales"] .exec-dept-nums button');
   o.execTotal=document.querySelector('.exec-dept-panel[data-dept="sales"] p.font-semibold span').textContent.trim();
   // 현황판에 필터를 걸어도 영업본부 현황은 전체 기준 · 클릭 후 필터 그대로
   setExecFilter('kind','협업요청');await sleep(30);
   navigate('sales',document.getElementById('nav-sales'));await sleep(120);
   o.salesCards=cards('#sdash-exec-panel');o.salesNums=nums('#sdash-exec-panel button[data-st]');
   o.salesTotal=document.getElementById('sdash-exec-total').textContent.trim();
   o.openCard=document.getElementById('sdash-open-cases').textContent.trim();
   // 카드 클릭 → 그 기능으로 거른 팝업
   const card=document.querySelector('#sdash-exec-panel .exec-fn-card[data-fn^="w:sales:consult"]');card.click();await sleep(40);
   o.popup=!document.getElementById('exec-list-modal').classList.contains('hidden');o.fn=execListFilter.fn;o.title=document.getElementById('exec-modal-title').textContent;
   o.rows=[...document.querySelectorAll('#exec-modal-rows tr[onclick]')].filter(t=>!t.classList.contains('exec-prog-row')&&t.children.length>=9).map(t=>t.children[1].textContent.trim()).sort().join(',');
   closeExecListModal();
   // 지연 숫자 클릭
   document.querySelector('#sdash-exec-panel button[data-st="late"]').click();await sleep(40);o.lateState=execListFilter.state;closeExecListModal();
   // 인바운드 확인 필요
   const ib=document.querySelector('#sdash-exec-panel .exec-fn-card[data-fn="inbound"] button.mt-1');if(ib){ib.click();await sleep(40);o.checkFn=execListFilter.fn;closeExecListModal();}
   o.filterKept=execFilter.kind;
   const sec=document.getElementById('sec-sales');o.overflow=document.documentElement.scrollWidth>window.innerWidth+1;
   o.panelW=document.getElementById('sdash-exec-panel').getBoundingClientRect().width;
   return o;});
  ok(r.salesCards&&r.salesCards===r.execCards,'기능별 카드 숫자 = 경영현황판 영업본부',[r.salesCards,r.execCards]);
  ok(r.salesNums===r.execNums,'진행중 · 지연 · 문제 · 완료 = 경영현황판 영업본부',[r.salesNums,r.execNums]);
  ok(r.salesTotal===r.execTotal,'전체 건수 같음',[r.salesTotal,r.execTotal]);
  ok(r.openCard===r.salesNums.split('/')[0]+'건','미처리 업무 카드 = 진행중',[r.openCard,r.salesNums]);
  ok(r.popup&&r.fn.startsWith('w:sales:consult')&&r.title.includes('영업본부')&&r.rows==='S-2,S-5','카드 클릭 → 그 기능 상세',r);
  ok(r.lateState==='late','지연 클릭 → 지연으로 거름',r.lateState);
  ok(r.checkFn==='inbound-check','인바운드 확인 필요 클릭',r.checkFn);
  ok(r.filterKept==='협업요청','경영현황판 필터는 그대로',r.filterKept);
  ok(!r.overflow&&r.panelW>0,'가로 넘침 없음',r);
  if(process.env.SHOT_DIR){await pg.evaluate(()=>document.getElementById('sdash-exec-panel').scrollIntoView());await pg.screenshot({path:path.join(process.env.SHOT_DIR,`sales-fn-${vw}.png`)}).catch(()=>{});}
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
