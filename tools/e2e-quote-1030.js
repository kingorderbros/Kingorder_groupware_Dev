// 사용법: node tools/e2e-quote-1030.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-30 영업본부 보완 3차 — 견적서: 품목별 할인 %/원 · 선택사항은 합계 제외 · 견적번호 미리 기입 · 저장한 견적 불러오기 · A4 한 장 맞춤
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8835,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1300,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8835/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   const q={payTypes:['cash'],discountUse:true,discountMode:'line',lines:[
     {name:'포스',qty:1,price:1000000,discounts:{cash:10}},
     {name:'키오스크',qty:1,price:2000000,discUnit:'won',discWon:{cash:300000}},
     {name:'거치대',qty:1,price:50000,optional:true}]};
   const t=quoteColTotals(q,'cash');
   r.optionalExcluded=quoteSubtotal(q)===3000000;
   r.mixedDiscount=Math.round(t.supply)===900000+1700000;
   const doc=buildQuoteDocHtml(q);
   r.docOptional=doc.includes('선택사항 · 합계 제외');
   r.docWon=doc.includes(formatKRW(300000));
   r.docNumber=doc.includes(quoteNextId());
   // 작성 창
   openQuoteModal();
   r.modalNumber=document.getElementById('quote-modal-number').innerText.startsWith('QT-');
   document.getElementById('quote-discount-use').checked=true; document.getElementById('quote-discount-mode').value='line'; onQuoteDiscountToggle();
   quoteDraftLines=[{name:'포스',qty:1,price:100000,note:''}]; renderQuoteLines();
   updateQuoteLine(0,'discUnit','won'); updateQuoteLine(0,'discwon-cash','20000'); updateQuoteLine(0,'optional',true);
   r.editorLine=quoteDraftLines[0].discUnit==='won'&&quoteDraftLines[0].discWon.cash===20000&&quoteDraftLines[0].optional===true;
   r.editorUnitSelect=!!document.querySelector('#quote-lines-body select');
   closeQuoteModal();
   // 불러오기
   quotes.unshift({id:'QT-9001',name:'불러올 견적',status:'수락',lines:[{name:'포스',qty:2,price:500000,note:'a'}],terms:['조건1'],createdAt:'2026-10-01'});
   openQuoteModal();
   r.loadVisible=!document.getElementById('quote-load-wrap').classList.contains('hidden');
   loadQuoteIntoDraft('QT-9001');
   r.loaded=document.getElementById('edit-quote-id').value===''&&quoteDraftLines.length===1&&quoteDraftLines[0].qty===2&&document.getElementById('quote-status').value==='초안';
   quoteDraftLines[0].qty=9; r.originalKept=quotes.find(x=>x.id==='QT-9001').lines[0].qty===2;
   closeQuoteModal(); quotes.shift();
   // 인쇄 — 긴 견적은 줄여서 한 장
   const big={payTypes:['cash'],lines:Array.from({length:40},(_, i)=>({name:'품목'+i,qty:1,price:1000,note:'비고 '+i}))};
   showQuotePreview(big);
   let zoom=''; const realPrint=window.print; window.print=()=>{ zoom=document.getElementById('print-area').style.zoom; };
   printQuotePreview(); window.print=realPrint;
   r.fitOnePage=zoom!==''&&Number(zoom)<1;
   closeQuotePreview();
   return r;
 });
 const expect=['optionalExcluded','mixedDiscount','docOptional','docWon','docNumber','modalNumber','editorLine','editorUnitSelect','loadVisible','loaded','originalKept','fitOnePage'];
 const bad=expect.filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
