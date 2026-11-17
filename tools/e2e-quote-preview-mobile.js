// 사용법: node tools/e2e-quote-preview-mobile.js   (맥 크롬 헤드리스) — 견적서 미리보기 휴대폰 화면 (2026-11-17)
//   휴대폰 여러 크기·가로·태블릿·컴퓨터에서: 문서가 화면 밖으로 안 나감 · 로고 옆 문구가 창 안 · 공급자 칸 글자가 한 줄 ·
//   닫기 X 와 공통 X 가 겹치지 않음(공통 X 안 붙음) · 단추가 화면 안. 캡처는 (임시 폴더)/kob-shots/quote-preview-*.png
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
const SIZES=[['휴대폰 360',360,780,true],['아이폰 390',390,844,true],['큰 휴대폰 430',430,932,true],['휴대폰 가로',844,390,true],['태블릿 768',768,1024,true],['컴퓨터',1400,900,false]];
const SHOTS=path.join(require('os').tmpdir(),'kob-shots');fs.mkdirSync(SHOTS,{recursive:true});
srv.listen(8875,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
 await pg.setViewport({width:1400,height:900});await pg.goto('http://localhost:8875/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 for(const [label,w,h,mobile] of SIZES){
  await pg.setViewport({width:w,height:h,isMobile:mobile&&w<800,hasTouch:mobile});
  const r=await pg.evaluate(async()=>{
   const wait=ms=>new Promise(x=>setTimeout(x,ms));
   closeQuotePreview();await wait(50);
   showQuotePreview({id:'QT-0023',name:'시험 견적',customerManual:{name:'코리아타운',contactName:'권승택 사장님',phone:'010-1234-4656',email:''},owner:'권승택',ownerPhone:'010-0000-0000',expiry:'2026-12-12',
     supplier:{name:'킹오더브랜드팩토리',businessNo:'790-86-03045',ceo:'정승우',address:'서울특별시 강남구 테헤란로 000, 0층',tel:'1588-0000'},
     lines:[{name:'삼포트 POS SET',qty:1,price:1200000,note:'설치비 포함'},{name:'영수증 프린터',qty:2,price:150000,note:''}],terms:['설치 일정은 계약 후 협의']});
   await wait(400);
   const m=document.getElementById('quote-preview-modal'),panel=m.firstElementChild,doc=document.getElementById('quote-preview-doc');
   const R=el=>{const b=el.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top,b:b.bottom,w:b.width,h:b.height};};
   const btns=[...document.querySelectorAll('#quote-preview-toolbar button')].map(R);
   const tag=doc.querySelector('.quote-tagline');
   const sup=[...doc.querySelectorAll('p.flex span.font-bold')].find(s=>s.textContent.includes('킹오더브랜드팩토리'));
   const z=parseFloat(doc.style.zoom||'1')||1;
   return {vw:innerWidth,zoom:doc.style.zoom,docW:doc.style.width,panel:R(panel),doc:R(doc),btns,
     guardX:!!panel.querySelector('[data-guard-x]'),tag:R(tag),
     // zoom 이 걸리면 getBoundingClientRect 는 줄어든 크기 — 원래 크기로 돌려 한 줄인지 봅니다
     supH:R(sup).h/z,supHraw:R(sup).h,tagFs:getComputedStyle(tag).fontSize,
     hScroll:m.scrollWidth>m.clientWidth+1||document.getElementById('quote-preview-fit').scrollWidth>document.getElementById('quote-preview-fit').clientWidth+1,
     ver:(document.querySelector('.js-app-ver')||{}).textContent||''};
  });
  console.log(label,JSON.stringify({zoom:r.zoom,docW:r.docW,panel:r.panel.w,doc:r.doc.w,tagR:Math.round(r.tag.r),supHraw:r.supHraw}));
  ok(r.doc.r<=r.vw+1&&r.doc.l>=-1,`${label}: 문서가 화면 밖으로 안 나감`,r.doc);
  ok(r.tag.r<=r.vw+1,`${label}: 로고 옆 문구가 창 안`,r.tag);
  ok(!r.hScroll,`${label}: 옆으로 밀리는 스크롤 없음`);
  ok(r.supH<32,`${label}: 공급자 상호가 한 줄`,r);
  if(r.zoom)ok(r.tagFs==='18.4px',`${label}: 줄일 때 로고 옆 문구는 컴퓨터와 같은 크기로 그림`,r.tagFs);
  ok(!r.guardX,`${label}: 공통 X 가 따로 안 붙음(겹침 없음)`);
  const [a,b]=r.btns;ok(a.r<=b.l&&b.r<=r.vw&&a.l>=0,`${label}: PDF·닫기 단추가 안 겹치고 화면 안`,r.btns);
  ok(r.panel.w<768?!!r.zoom:!r.zoom,`${label}: ${r.panel.w<768?'화면 폭에 맞춰 줄임':'원래 크기'}`,r.zoom);
  await pg.screenshot({path:path.join(SHOTS,`quote-preview-${w}x${h}.png`)});
  if(label==='컴퓨터')ok(/1\.1\.3/.test(r.ver),'화면 버전 v1.1.3',r.ver);
 }
 // 닫기 단추로 닫힘 · 템플릿 미리보기도 맞춤
 await pg.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 const c=await pg.evaluate(async()=>{const wait=ms=>new Promise(x=>setTimeout(x,ms));
  document.querySelectorAll('#quote-preview-toolbar button')[1].click();await wait(100);
  return document.getElementById('quote-preview-modal').classList.contains('hidden');});
 ok(c,'닫기(X) 누르면 닫힘');
 // 견적 템플릿 미리보기도 같은 창 — 화면 폭에 맞춰 줄임
 const t=await pg.evaluate(async()=>{const wait=ms=>new Promise(x=>setTimeout(x,ms));
  quoteTplDraft=quoteTplDraftFrom(QUOTE_TEMPLATES[0]);previewQuoteTpl();await wait(300);
  const doc=document.getElementById('quote-preview-doc'),b=doc.getBoundingClientRect();
  const out={zoom:doc.style.zoom,r:b.right,vw:innerWidth,guardX:!!document.querySelector('#quote-preview-modal [data-guard-x]'),title:doc.textContent.includes(QUOTE_TEMPLATES[0].title)};
  closeQuotePreview();quoteTplDraft=null;return out;});
 ok(t.title&&!!t.zoom&&t.r<=t.vw+1&&!t.guardX,'템플릿 미리보기도 화면 폭에 맞춰 줄임 · X 겹침 없음',t);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
