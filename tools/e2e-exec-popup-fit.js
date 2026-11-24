// 사용법: node tools/e2e-exec-popup-fit.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — 경영현황판 목록 팝업 · 건별 상세 팝업이 창 높이 안에 들어가는지(바깥 넘김 없음, 닫기 단추 보임), 넓은 화면은 상세가 두 칸
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8882,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1920,1080],[1440,900],[1280,720],[1024,768],[768,1024],[390,844],[844,390]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<900&&vh<900&&Math.min(vw,vh)<500,hasTouch:Math.min(vw,vh)<500});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8882/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'김영업',dept:'sales',groupId:'sales'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const S=WORK_CENTERS.sales;S.works=[];const y=ymd(new Date(Date.now()-3*86400000));
   for(let n=1;n<=14;n++)S.works.push({id:'S-'+n,center:'sales',type:'activity',title:'시험 업무 '+n,status:'working',priority:'normal',receivedAt:'2026-11-18',receiver:'대표',assignee:'김영업',dueDate:y,progressLog:[{id:'a',kind:'action',at:'2026-11-18 10:00',loggedAt:'2026-11-18 10:00',by:'김영업',text:'통화'},{id:'b',kind:'action',at:'2026-11-19 10:00',loggedAt:'2026-11-19 10:00',by:'김영업',text:'견적 전달'}]});
   enterApp(U[0]);await sleep(120);navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(200);
   const fit=(id,btnSel)=>{const ov=document.getElementById(id),box=ov.firstElementChild.getBoundingClientRect(),b=document.querySelector(btnSel).getBoundingClientRect();
     return {noOuterScroll:ov.scrollHeight<=ov.clientHeight+1,inView:box.top>=-1&&box.bottom<=innerHeight+1&&box.left>=-1&&box.right<=innerWidth+1,btn:b.height>0&&b.bottom<=innerHeight+1&&b.top>=0};};
   openExecListModal('s:김영업');await sleep(40);
   const list=fit('exec-list-modal','#exec-list-modal button[onclick="closeExecListModal()"]:last-of-type');
   const tbl=document.querySelector('#exec-modal-rows').closest('.overflow-auto');list.tableScrolls=tbl.scrollHeight>tbl.clientHeight;list.tableH=tbl.clientHeight;
   document.querySelector('#exec-modal-rows tr[onclick]').click();await sleep(60);
   const item=fit('exec-item-modal','#exec-item-foot button:last-child');
   const cols=[...document.querySelectorAll('#exec-item-body > .grid:not(.exec-issue-guide) > *')].map(e=>Math.round(e.getBoundingClientRect().left));item.twoCols=cols.length===2&&cols[0]!==cols[1];
   const body=document.getElementById('exec-item-body');item.bodyScroll=body.scrollHeight>body.clientHeight;
   item.goBtn=!!document.querySelector('#exec-item-foot button.bg-amber-500');
   return {list,item};});
  ok(r.list.noOuterScroll&&r.list.inView,'목록 팝업 창 안에 들어감 (바깥 넘김 없음)',r.list);
  ok(r.list.btn,'목록 팝업 [닫기] 보임',r.list);
  ok(r.list.tableH>=(vh>=600?150:200),'목록 표 높이 확보',r.list.tableH);
  ok(r.item.noOuterScroll&&r.item.inView,'상세 팝업 창 안에 들어감',r.item);
  ok(r.item.btn,'상세 팝업 [닫기] 보임',r.item);
  ok(r.item.goBtn,'상세 팝업 [원본 화면에서 열기] 보임');
  if(vw>=1024){ok(r.item.twoCols,'넓은 화면 상세 두 칸',r.item);}
  if(vw>=1280&&vh>=720){ok(!r.item.bodyScroll,'넓은 화면 상세 내용이 넘기지 않고 한 화면',r.item);}
  await pg.close();}
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
