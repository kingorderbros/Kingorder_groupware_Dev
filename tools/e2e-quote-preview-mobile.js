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
srv.listen(8875,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const ORIG_UA=await br.userAgent();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
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
   const z=parseFloat(doc.dataset.fit||'1')||1;
   return {vw:innerWidth,zoom:doc.dataset.fit,docW:doc.style.width,panel:R(panel),doc:R(doc),btns,
     guardX:!!panel.querySelector('[data-guard-x]'),tag:R(tag),
     // zoom 이 걸리면 getBoundingClientRect 는 줄어든 크기 — 원래 크기로 돌려 한 줄인지 봅니다
     supH:R(sup).h/z,supHraw:R(sup).h,tagFs:getComputedStyle(tag).fontSize,
     hScroll:m.scrollWidth>m.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1||getComputedStyle(document.getElementById('quote-preview-fit')).overflowX!=='hidden',
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
  if(label==='컴퓨터')ok(/1\.1\.5/.test(r.ver),'화면 버전 v1.1.5',r.ver);
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
  const fx=doc.querySelector('.sm\\:flex-row'),fb=document.getElementById('quote-preview-fit');const out={row:fx&&getComputedStyle(fx).flexDirection,gap:Math.abs(fb.getBoundingClientRect().height-b.height),zoom:doc.dataset.fit,r:b.right,vw:innerWidth,guardX:!!document.querySelector('#quote-preview-modal [data-guard-x]'),title:doc.textContent.includes(QUOTE_TEMPLATES[0].title)};
  closeQuotePreview();quoteTplDraft=null;return out;});
 ok(t.title&&!!t.zoom&&t.r<=t.vw+1&&!t.guardX,'템플릿 미리보기도 화면 폭에 맞춰 줄임 · X 겹침 없음',t);
 ok(t.row==='row','휴대폰에서도 제품 사진 · 사양표가 컴퓨터처럼 옆으로 나란히',t.row);
 ok(t.gap<3,'줄인 문서 아래 빈 칸 없음(높이 맞춤)',t.gap);
 // 아이폰 [PDF] — 인쇄 대신 PDF 파일을 만들어 공유 창 (아이폰 크롬은 인쇄 미지원, 2026-11-17)
 const SAMPLE={id:'QT-0023',name:'시험 견적',customerManual:{name:'코리아타운',contactName:'권승택 사장님',phone:'010-1234-4656',email:''},owner:'권승택',expiry:'2026-12-12',supplier:{name:'킹오더브랜드팩토리',businessNo:'790-86-03045',ceo:'정승우'},lines:[{name:'삼포트 POS SET',qty:1,price:1200000}],terms:['설치 일정은 계약 후 협의']};
 const UA_IPHONE_CHROME='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
 const UA_ANDROID_CHROME='Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
 const UA_KAKAO_ANDROID=UA_ANDROID_CHROME.replace(')',' ; wv)')+' KAKAOTALK 10.8.0';
 const open=async(ua,mobile)=>{await pg.setUserAgent(ua);await pg.setViewport(mobile?{width:390,height:844,isMobile:true,hasTouch:true}:{width:1400,height:900});await pg.goto('http://localhost:8875/',{waitUntil:'networkidle0'});
  await pg.evaluate(()=>{window.__print=0;window.print=()=>{window.__print++;};window.__shared=[];window.__shareFail=[];
   navigator.canShare=()=>true;navigator.share=async(d)=>{const f=window.__shareFail.shift();if(f){const e=new Error(f);e.name=f;throw e;}const fl=d.files[0];const buf=await fl.arrayBuffer();const txt=new TextDecoder('latin1').decode(buf);
    window.__pdfData=null;window.__shared.push({name:fl.name,type:fl.type,size:fl.size,head:txt.slice(0,5),pages:(txt.match(/\/Type \/Page[^s]/g)||[]).length});
    const r=new FileReader();r.onload=()=>{window.__pdfData=r.result;};r.readAsDataURL(fl);};
   window.__dl=0;const oc=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__dl++;return;}return oc.call(this);};});};
 const tapPdf=async()=>{const p=await pg.evaluate(()=>{const b=document.getElementById('quote-pdf-btn').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];});await pg.touchscreen.tap(p[0],p[1]);};
 const waitFor=async(fn,ms=20000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await pg.evaluate(fn))return true;await new Promise(x=>setTimeout(x,200));}return false;};
 const btnText=()=>pg.evaluate(()=>document.getElementById('quote-pdf-btn').textContent.trim());

 await open(UA_IPHONE_CHROME,true);
 await pg.evaluate(q=>showQuotePreview(q),SAMPLE);
 ok(await pg.evaluate(()=>quotePdfUseFile()),'아이폰 크롬은 PDF 파일 방식');
 await tapPdf();let got=await waitFor(()=>window.__shared.length>0);
 let sh=await pg.evaluate(()=>({s:window.__shared,p:window.__print}));console.log(JSON.stringify(sh));
 ok(got&&sh.s[0].head==='%PDF-'&&sh.s[0].type==='application/pdf'&&sh.s[0].size>20000&&sh.s[0].pages===1,'PDF 파일(A4 한 장)을 만들어 공유 창에 넘김',sh);
 ok(got&&sh.s[0].name==='견적서_QT-0023_코리아타운.pdf','파일 이름 견적서_번호_고객사.pdf',sh.s[0]);
 ok(sh.p===0,'아이폰에서는 인쇄를 부르지 않음',sh.p);
 ok(!/만드는/.test(await btnText()),'끝나면 단추가 원래대로');
 await waitFor(()=>!!window.__pdfData);const pdfData=await pg.evaluate(()=>window.__pdfData);
 if(pdfData)fs.writeFileSync(path.join(SHOTS,'quote-preview-mobile.pdf'),Buffer.from(pdfData.split(',')[1],'base64'));
 // 만드는 사이 누른 효과가 끝나 공유 창이 막히면 → [PDF 공유] → 한 번 더 누르면 공유
 await pg.evaluate(()=>{window.__shareFail=['NotAllowedError'];window.__shared=[];});
 await tapPdf();ok(await waitFor(()=>/PDF 공유/.test(document.getElementById('quote-pdf-btn').textContent)),'공유 창이 막히면 [PDF 공유] 단추로 바뀜');
 await tapPdf();ok(await waitFor(()=>window.__shared.length>0,5000),'[PDF 공유] 를 누르면 바로 공유 창');
 // 두 번 다 막히면 내려받기
 await pg.evaluate(()=>{window.__shareFail=['NotAllowedError','NotAllowedError'];window.__shared=[];window.__dl=0;});
 await tapPdf();await waitFor(()=>/PDF 공유/.test(document.getElementById('quote-pdf-btn').textContent));await tapPdf();
 ok(await waitFor(()=>window.__dl===1,5000)&&/PDF/.test(await btnText())&&!/공유/.test(await btnText()),'두 번 다 막히면 파일 내려받기');
 // 공유를 못 하는 파일(다른 오류)이면 바로 내려받기
 await pg.evaluate(()=>{window.__shareFail=['TypeError'];window.__dl=0;});
 await tapPdf();ok(await waitFor(()=>window.__dl===1),'공유가 안 되는 브라우저는 내려받기');
 // 만드는 중에 다른 견적을 열면 이전 견적 파일은 버림
 await pg.evaluate(()=>{window.__shared=[];});
 await tapPdf();await pg.evaluate(q=>showQuotePreview({...q,id:'QT-0024'}),SAMPLE);await new Promise(x=>setTimeout(x,6000));
 sh=await pg.evaluate(()=>window.__shared);ok(sh.length===0&&/PDF/.test(await btnText())&&!/만드는/.test(await btnText()),'만드는 중 다른 견적을 열면 이전 파일은 공유 안 함',sh);
 // 긴 견적은 여러 장
 await pg.evaluate(q=>{window.__shared=[];showQuotePreview({...q,lines:Array.from({length:90},(_,i)=>({name:'품목 '+(i+1),qty:1,price:10000,note:'비고 '+(i+1)}))});},SAMPLE);
 await tapPdf();got=await waitFor(()=>window.__shared.length>0,30000);sh=await pg.evaluate(()=>window.__shared);console.log(JSON.stringify(sh));
 ok(got&&sh[0].pages>=2,'긴 견적은 여러 장으로',sh);
 await waitFor(()=>!!window.__pdfData);fs.writeFileSync(path.join(SHOTS,'quote-preview-long.pdf'),Buffer.from((await pg.evaluate(()=>window.__pdfData)).split(',')[1],'base64'));

 // 갤럭시 크롬 · 컴퓨터는 그대로 인쇄 화면, 카카오톡 안 브라우저는 파일
 for(const [label,ua,mobile,wantFile] of [['갤럭시 크롬',UA_ANDROID_CHROME,true,false],['카카오톡 안 브라우저',UA_KAKAO_ANDROID,true,true],['컴퓨터',ORIG_UA,false,false]]){
  await open(ua,mobile);
  const r=await pg.evaluate(q=>{showQuotePreview(q);const f=quotePdfUseFile();if(!f)printQuotePreview();return {f,print:window.__print};},SAMPLE);
  ok(r.f===wantFile&&(wantFile||r.print===1),`${label}: ${wantFile?'PDF 파일 방식':'지금처럼 인쇄 화면'}`,r);
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
