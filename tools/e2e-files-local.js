// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-files-local.js . <스크린샷 폴더>
// 맥의 크롬(/Applications/Google Chrome.app)을 헤드리스로 씁니다. npm run check 에는 넣지 않았습니다 (크롬 · 패키지가 필요해서).
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8793,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>{errs.push('dialog '+d.message());d.accept();});
 await pg.goto('http://localhost:8793/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const r=await pg.evaluate(async()=>{openArchivePost();archiveDraftFiles=[];await addArchiveFiles({files:[new File(['hi'],'a.txt',{type:'text/plain'})],value:''});
  const e=newCollabFileEntry(new File(['x'],'b.txt',{type:'text/plain'}));for(let i=0;i<20&&e.uploading;i++)await new Promise(s=>setTimeout(s,50));
  return {remote:kobFiles.remote,arc:(archiveDraftFiles[0]||{}).dataUrl?.slice(0,22),collab:e.url.slice(0,22),limit:ARCHIVE_FILE_MAX};});
 console.log(JSON.stringify(r),'errors',JSON.stringify(errs));await br.close();srv.close();});
