// 사용법: node tools/e2e-reminder-picked.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-28 — 일정 알림 '당일 오전' 은 사람이 고른 경우에만 reminderPicked 표시 (업무 일정 창은 기본값이 당일 오전이라 손대지 않으면 표시 없음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8823,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8823/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={}; const sel=document.getElementById('wsch-reminder');
   sel.value='sameday'; delete sel.dataset.touched; r.defaultSameday=reminderPickedFrom(sel,null)===false;
   sel.value='sameday'; sel.dispatchEvent(new Event('change')); r.touchedSameday=reminderPickedFrom(sel,null)===true;
   r.clearedAfter=sel.dataset.touched===undefined;
   sel.value='15min'; r.min15=reminderPickedFrom(sel,null)===true;
   sel.value='none'; r.none=reminderPickedFrom(sel,null)===false;
   sel.value='sameday'; r.keepsBefore=reminderPickedFrom(sel,{reminder:'sameday',reminderPicked:true})===true;
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
