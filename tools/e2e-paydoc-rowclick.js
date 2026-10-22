// 사용법: node tools/e2e-paydoc-rowclick.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-22 — 보완서류 목록(결제본부 › 결제업무센터 · 영업본부 › 보완서류 제출함) 줄을 누르면 상세 창이 열림, 관리 칸 버튼은 줄 클릭과 겹치지 않음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8805,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8805/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const before=payDocRequests.length;
   payDocRequests.push({id:'PD-E2E-1',regType:'pg',priority:'normal',merchant:'시험가맹점',bizNo:'123-45-67890',targetType:'team',targetName:'',requester:'결제시험',requestedAt:'2026-10-22',dueDate:'2026-10-30',status:'requested',items:[{id:'i1',name:'사업자등록증',status:'pending'}]});
   const modal=()=>document.getElementById('paydoc-detail-modal');
   const check=(menuId,key)=>{
     const nav=document.getElementById(menuId); nav.classList.remove('hidden');
     navigate('payment-work-center',nav);
     if(typeof switchPayWcTab==='function') switchPayWcTab('docs');
     renderPayDocPanel();
     const row=document.querySelector('#paywc-panel-docs tbody tr[onclick]');
     r[key+'Row']=!!row;
     if(!row) return;
     const id=row.querySelector('td p').innerText.trim();
     row.querySelectorAll('td')[1].click();   // 가맹점 칸 클릭
     r[key+'Open']=!modal().classList.contains('hidden')&&document.getElementById('paydoc-detail-body').innerText.includes(id);
     closePayDocDetail();
     // 관리 칸 빈 곳을 눌러도 줄 클릭으로 열리지 않음
     const row2=document.querySelector('#paywc-panel-docs tbody tr[onclick]');
     row2.lastElementChild.click();
     r[key+'MgmtNoOpen']=modal().classList.contains('hidden');
   };
   check('nav-payment-work-center','pay');
   check('nav-sales-doc-supplement','sales');
   payDocRequests.splice(before);
   return r;
 });
 const expect={payRow:true,payOpen:true,payMgmtNoOpen:true,salesRow:true,salesOpen:true,salesMgmtNoOpen:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
