// 사용법: node tools/e2e-view-mode.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-26 — 화면 보기: 손가락 기기(폴드 · 태블릿) 가로 640~960 → 모바일 화면(폭 600), 내 정보에서 자동 · 모바일 · PC 선택
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
srv.listen(8898,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 // [이름, 가로, 세로, 손가락 기기]
 const cases=[['폴드 펼침(세로)',884,1104,true],['폴드 펼침(가로)',960,700,true],['휴대폰',390,844,true],['태블릿 가로',1180,820,true],['컴퓨터',1440,900,false]];
 const results={};
 for(const [name,vw,vh,touch] of cases){
  const pg=await br.newPage();pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await pg.emulate({viewport:{width:vw,height:vh,isMobile:touch,hasTouch:touch,deviceScaleFactor:2},userAgent:touch?'Mozilla/5.0 (Linux; Android 14; SM-F946N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36':(await br.userAgent())});
  {const c=await pg.createCDPSession();await c.send('Emulation.setEmulatedMedia',{features:touch?[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]:[{name:'hover',value:'hover'},{name:'pointer',value:'fine'}]});pg._kobCdp=c;}
  // 화면 크기(screen.width)도 기기에 맞춤
  await pg.evaluateOnNewDocument((w,h)=>{Object.defineProperty(screen,'width',{get:()=>w});Object.defineProperty(screen,'height',{get:()=>h});},vw,vh);
  await pg.goto('http://localhost:8898/',{waitUntil:'networkidle0'});await sleep(150);
  results[name]=await pg.evaluate(()=>({iw:innerWidth,view:document.documentElement.getAttribute('data-kob-view'),meta:document.querySelector('meta[name=viewport]').content,st:window.kobViewState}));
  if(name==='폴드 펼침(세로)'){
   // 로그인 후 모바일 화면 확인 + 내 정보 선택
   const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const U={id:'u1',name:'대표',dept:'admin',groupId:'admin',email:'a@x',level:'manager'};localUsers.push(U);enterApp(U);await sleep(150);
    const o={};const nav=document.querySelector('aside, #sidebar');o.menuBtn=[...document.querySelectorAll('button')].some(b=>b.offsetWidth>0&&/fa-bars/.test(b.innerHTML));
    openMyProfile();await sleep(50);o.sel=document.getElementById('my-view-mode-sel').value;o.now=document.getElementById('my-view-mode-now').textContent;
    setMyViewMode('pc');await sleep(400);o.pc={iw:innerWidth,view:document.documentElement.getAttribute('data-kob-view'),now:document.getElementById('my-view-mode-now').textContent};
    setMyViewMode('auto');await sleep(400);o.back={iw:innerWidth,view:document.documentElement.getAttribute('data-kob-view')};
    return o;});
   results.fold=r;
   // 새로고침해도 기억
   await pg.evaluate(()=>window.kobViewSetMode('pc'));await pg.reload({waitUntil:'networkidle0'});await sleep(100);
   results.reload=await pg.evaluate(()=>({iw:innerWidth,mode:window.kobViewState.mode}));
   await pg.evaluate(()=>localStorage.removeItem('kobViewMode'));
  }
  if(name==='태블릿 가로'){
   await pg.evaluate(()=>window.kobViewSetMode('mobile'));await sleep(400);
   results.tabletMobile=await pg.evaluate(()=>({iw:innerWidth,view:document.documentElement.getAttribute('data-kob-view')}));
   await pg.evaluate(()=>localStorage.removeItem('kobViewMode'));
  }
  await pg.close();
 }
 const R=results;
 ok(R['폴드 펼침(세로)'].view==='fit-mobile'&&R['폴드 펼침(세로)'].iw===600,'폴드 펼침(세로 884) → 모바일 화면(폭 600)',R['폴드 펼침(세로)']);
 ok(R['폴드 펼침(가로)'].view==='fit-mobile'&&R['폴드 펼침(가로)'].iw===600,'폴드 펼침(가로 960) → 모바일 화면',R['폴드 펼침(가로)']);
 ok(R['휴대폰'].view==='normal'&&R['휴대폰'].iw===390,'휴대폰(390)은 그대로',R['휴대폰']);
 ok(R['태블릿 가로'].view==='normal'&&R['태블릿 가로'].iw===1180,'태블릿 가로(1180)는 PC 화면',R['태블릿 가로']);
 ok(R['컴퓨터'].view==='normal'&&R['컴퓨터'].iw===1440,'컴퓨터는 그대로',R['컴퓨터']);
 ok(R.fold.menuBtn,'폴드 — 로그인 후 모바일 메뉴(☰)',R.fold);
 ok(R.fold.sel==='auto'&&R.fold.now.includes('모바일 화면'),'내 정보 — 자동 · 지금 모바일 화면',R.fold);
 ok(R.fold.pc.view==='normal'&&R.fold.pc.iw===884&&R.fold.pc.now.includes('PC 화면'),'PC 화면 선택 → 바로 PC 화면',R.fold.pc);
 ok(R.fold.back.view==='fit-mobile'&&R.fold.back.iw===600,'자동으로 되돌림 → 모바일 화면',R.fold.back);
 ok(R.reload.mode==='pc'&&R.reload.iw===884,'새로고침해도 선택 기억',R.reload);
 ok(R.tabletMobile.view==='fit-mobile'&&R.tabletMobile.iw===600,'태블릿에서 모바일 화면 선택',R.tabletMobile);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
