// 사용법: node tools/e2e-reload-page.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 보완사항(공통) — 새로고침해도 보던 화면(메뉴) 그대로
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8810,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 const login=()=>pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const shown=()=>pg.evaluate(()=>{const s=[...document.querySelectorAll('.content-section')].find(x=>!x.classList.contains('hidden'));return s?s.id:'';});
 await pg.goto('http://localhost:8810/',{waitUntil:'networkidle0'}); await login();
 const r={}; r.first=await shown();
 await pg.evaluate(()=>navigate('collab-center',document.getElementById('nav-collab-center')));
 await pg.reload({waitUntil:'networkidle0'}); await login();
 r.afterReload=await shown();
 await pg.evaluate(()=>navigate('payment-work-center',document.getElementById('nav-sales-doc-supplement')));
 await pg.reload({waitUntil:'networkidle0'}); await login();
 r.salesEntry=await pg.evaluate(()=>payWcViaSalesMenu===true&&!document.getElementById('sec-payment-work-center').classList.contains('hidden'));
 const ok=r.afterReload==='sec-collab-center'&&r.salesEntry===true;
 console.log(JSON.stringify(r));console.log(ok?'통과':'실패','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(ok&&!errs.length?0:1);});
