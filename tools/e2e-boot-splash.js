// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-boot-splash.js . <폴더>   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2],OUT=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 const send=()=>fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});
 if(p==='/js/kob-store.js') return setTimeout(send,2000); send();});
srv.listen(8801,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const vis=()=>({login:getComputedStyle(document.getElementById('login-view')).display,splash:getComputedStyle(document.getElementById('boot-splash')).display});
 for(const withSess of [true,false]){
  const pg=await br.newPage();await pg.goto('http://localhost:8801/sw.js');
  await pg.evaluate(w=>{localStorage.clear();if(w)localStorage.setItem('sb-abc-auth-token','{"x":1}');},withSess);
  pg.goto('http://localhost:8801/').catch(()=>{});await new Promise(s=>setTimeout(s,900));
  const early=await pg.evaluate(vis);if(withSess)await pg.screenshot({path:OUT+'/splash.png'});
  await new Promise(s=>setTimeout(s,4000));const late=await pg.evaluate(vis);
  console.log(withSess?'로그인 기록 있음':'로그인 기록 없음','· 준비 중:',JSON.stringify(early),'· 준비 끝(로컬 모드라 로그인 화면):',JSON.stringify(late));
  await pg.close();}
 await br.close();srv.close();});
