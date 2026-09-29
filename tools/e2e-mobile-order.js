// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-mobile-order.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2],OUT=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 const send=()=>fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});
 if(p==='/js/kob-store.js') return setTimeout(send,2500); send();});
srv.listen(8794,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:390,height:760});
 pg.goto('http://localhost:8794/?mode=mobile').catch(()=>{});await new Promise(s=>setTimeout(s,1200));
 const early=await pg.evaluate(()=>({auth:getComputedStyle(document.getElementById('m-auth')).display,picker:getComputedStyle(document.getElementById('m-picker')).display,btn:getComputedStyle(document.getElementById('m-auth-btn')).pointerEvents,login:getComputedStyle(document.getElementById('login-view')).display}));
 await pg.screenshot({path:OUT+'/mobile_early.png'});
 await new Promise(s=>setTimeout(s,5000));
 const late=await pg.evaluate(()=>({auth:getComputedStyle(document.getElementById('m-auth')).display,picker:getComputedStyle(document.getElementById('m-picker')).display}));
 console.log('본체 뜨기 전',JSON.stringify(early),'\n본체 뜬 뒤(로컬 모드)',JSON.stringify(late));await br.close();srv.close();});
