// 사용법: node tools/e2e-allworks-detail-front.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-04 — 전체 업무이력 창에서 줄을 눌러 연 '업무이력 상세'가 전체 업무이력 앞에 떠야 합니다. 상세에서 여는 창도 그 앞에 떠야 합니다.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8859,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
 await pg.goto('http://localhost:8859/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const def=wcDef('ops');
   if(!def.works.length) def.works.push({id:'E2E-W1',type:def.types[0].id,company:'시험상호',status:'done',receivedAt:ymd(new Date()),title:'시험',customerId:''});
   openWcAllWorks('ops');
   await new Promise(r=>setTimeout(r,400));
   const all=document.getElementById('wc-allworks-modal');
   const hit=(x,y)=>document.elementFromPoint(x,y);
   const row=all.querySelector('tbody tr');
   r.hasRow=!!row;
   // 실제 사용자처럼 줄을 눌러 엽니다
   row.click();
   const h=document.getElementById('wc-history-modal');
   r.detailOpen=!h.classList.contains('hidden');
   // 상세 창 한가운데·제목을 눌렀을 때 맨 위 요소가 상세 창이어야 합니다
   const box=h.firstElementChild.getBoundingClientRect();
   const top=hit(box.left+box.width/2,box.top+box.height/2);
   r.detailInFront=h.contains(top);
   r.topAt=top&&(top.closest('[id$="-modal"]')||{}).id;
   // 상세를 닫으면 전체 업무이력으로 돌아옵니다
   closeWorkHistoryDetail();
   const t2=hit(700,450);
   r.backToAll=all.contains(t2);
   // 전체 업무이력은 메뉴·머리 줄보다는 앞이어야 합니다
   const side=hit(30,450);r.overSidebar=all.contains(side);
   // 상세에서 여는 창(사진 보기 z-70 · 설치 수정 z-60)은 상세보다 앞
   const zOf=id=>Number(getComputedStyle(document.getElementById(id)).zIndex);
   r.detailZ=zOf('wc-history-modal');r.allZ=zOf('wc-allworks-modal');
   r.innerAbove=zOf('install-edit-modal')>r.detailZ&&zOf('install-photo-modal')>r.detailZ;
   return r;
 });
 console.log(JSON.stringify(out,null,1));console.log('errs',errs);
 await br.close();srv.close();
 const fail=!(out.hasRow&&out.detailOpen&&out.detailInFront&&out.backToAll&&out.overSidebar&&out.innerAbove)||errs.length;
 console.log(fail?'실패':'통과');process.exit(fail?1:0);});
