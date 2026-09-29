// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-allpages.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8796,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1280,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8796/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const ids=await pg.evaluate(()=>[...document.querySelectorAll('[id^="nav-"]')].map(a=>a.id.slice(4)).filter(Boolean));
 for(const id of ids){ await pg.evaluate(i=>{try{navigate(i,document.getElementById('nav-'+i));}catch(e){throw new Error(i+': '+e.message);}},id).catch(e=>errs.push(String(e).slice(0,160))); await new Promise(s=>setTimeout(s,120)); }
 // 모든 화면에서 실시간 다시 그리기 한 번씩
 for(const id of ids){ await pg.evaluate(i=>{navigate(i,document.getElementById('nav-'+i));gwLivePending.add('gwVehicles.v1');gwLiveFlush();},id).catch(e=>errs.push('live '+id+': '+String(e).slice(0,140))); }
 console.log('화면',ids.length,'개 · 오류',errs.length, JSON.stringify(errs.slice(0,10)));await br.close();srv.close();});
