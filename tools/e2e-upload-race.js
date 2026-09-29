// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-upload-race.js .   — 올리는 중 여러 부서 복사 · 다시 읽기에도 경로가 저장되는지 (2026-09-29 검토)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2];
const mem=new Map();let seq=0;
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
 if(p==='/config/app-config.js'){r.writeHead(200,{'content-type':'text/javascript'});return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p==='/api/files/upload'){const ch=[];q.on('data',c=>ch.push(c));q.on('end',()=>setTimeout(()=>{const key=`staff/2026/09/00000000-0000-0000-0000-${String(++seq).padStart(12,'0')}`;r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({ok:true,file:{path:key,name:u.searchParams.get('name'),type:u.searchParams.get('type'),size:3}}));},1500));return;}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8812,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('console',m=>{if(m.type()==='warning'||m.type()==='error')errs.push(m.type()+': '+m.text().slice(0,160))});pg.on('dialog',d=>{errs.push('dialog: '+d.message().slice(0,100));d.accept()});
 await pg.goto('http://localhost:8812/',{waitUntil:'networkidle0'});
 const res=await pg.evaluate(async()=>{
   // kobFiles 를 원격처럼
   const real=kobFiles; window.kobFiles=Object.assign({},real,{remote:true,upload:async(f,o)=>{const r=await fetch('/api/files/upload?name='+encodeURIComponent((o&&o.name)||f.name)+'&type=x',{method:'POST',body:f});return (await r.json()).file;}});
   enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'});
   const out={};
   const f=new File(['abc'],'a.txt',{type:'text/plain'});
   collabRequestFiles=[newCollabFileEntry(f)];
   const copies=takeCollabRequestFiles(2);
   collabRequests.push({id:'CR-T1',title:'a',requestFiles:copies[0]},{id:'CR-T2',title:'b',requestFiles:copies[1]}); await new Promise(s=>setTimeout(s,2500)); const f1=collabRequests.find(x=>x.id==='CR-T1').requestFiles[0], f2=collabRequests.find(x=>x.id==='CR-T2').requestFiles[0]; out.copy0=f1.path||'(none)'; out.copy1=f2.path||'(none)'; out.copy1uploading=!!f2.uploading; out.copy1url=collabRequests.find(x=>x.id==='CR-T2').requestFiles[0].url.slice(0,16);
   // 실시간 다시 읽기 경쟁
   const req={id:'collab_999',title:'t',requestFiles:[]}; collabRequests.push(req);
   const e2=newCollabFileEntry(new File(['x'],'b.txt',{type:'text/plain'})); req.requestFiles.push(e2); saveCollabRequests();
   reloadCollabRequestsFromDb();   // 남의 변경이 들어온 것처럼
   await new Promise(s=>setTimeout(s,2500));
   const now=collabRequests.find(x=>x.id==='collab_999'); out.afterReload=now?JSON.stringify(now.requestFiles[0]).slice(0,200):'gone';
   // 모든 실시간 키
   const keys=Object.keys(gwLiveKeys()); keys.forEach(k=>gwLivePending.add(k)); gwLiveFlush(); out.keys=keys.length;
   return out;});
 console.log(JSON.stringify(res,null,1));console.log(JSON.stringify(errs.slice(0,10)));await br.close();srv.close();});
