// 사용법: node tools/e2e-persist-b.js .   — 보완서류 상세 처리 · 팀 삭제가 새로고침 뒤에도 남는지
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8819,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8819/',{waitUntil:'networkidle0'});
 await pg.evaluate(async()=>{enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'});
   payDocRequests.push({id:'PD-2608-0031',customerName:'감사',status:'submitted',items:[{docId:'bizreg',name:'사업자등록증',status:'uploaded',textCache:'x'.repeat(5000)}],log:[]});savePayDocs();
   // 상세 창에서 처리한 것처럼 — 상태를 바꾸고 상세를 다시 그림 (창은 닫지 않음)
   payDocDetailId='PD-2608-0031';const r=payDocReq('PD-2608-0031');r.status='completed';if(!document.getElementById('paydoc-detail-body')){const d=document.createElement('div');d.id='paydoc-detail-body';document.body.appendChild(d);}renderPayDocDetail();
   // 팀 삭제
   orgTeams.push({id:'team99',deptId:'sales',name:'감사팀',order:9});saveOrgTeams();localUsers.push({id:'u-aud',name:'감사직원',dept:'sales',team:'감사팀',email:'aud@k.co'});saveLocalUsers();
   deleteOrgTeam('team99');
   await new Promise(s=>setTimeout(s,400));});
 await pg.reload({waitUntil:'networkidle0'});
 const a=await pg.evaluate(()=>{const r=payDocRequests.find(x=>x.id==='PD-2608-0031');const raw=localStorage.getItem('kobdb:pay_doc_requests')||'';const u=localUsers.find(x=>x.id==='u-aud');
   return {status:r&&r.status,textSaved:/xxxxxxxxxx/.test(raw),team:u&&u.team};});
 console.log(a.status==='completed'?'  ✓':'  ✗','보완서류 상세에서 처리한 것(창을 닫지 않고 새로고침)이 남는다',JSON.stringify(a.status));
 console.log(!a.textSaved?'  ✓':'  ✗','읽어 둔 글 내용(수 KB)은 저장하지 않는다');
 console.log(a.team===''?'  ✓':'  ✗','팀을 지우면 구성원의 팀도 비워진 채 남는다',JSON.stringify(a.team));
 console.log('errors',JSON.stringify(errs.slice(0,5)));await br.close();srv.close();});
