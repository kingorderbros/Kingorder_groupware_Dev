// 사용법: node tools/e2e-cms-pay.js . <엑셀 파일(가맹점명 · 사업자번호 · 구분 · 회차월 · 금액 · 상태)>   — CMS 출금 · 납입 내역이 새로고침 뒤에도 남는지
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2],XLSX=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8818,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8818/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>{enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'});customers.push({id:'c-aud',name:'감사가맹',businessNo:'111-22-33333',type:'가맹점'});saveCustomers();
   if(!document.getElementById('cms-import-result')){const d=document.createElement('div');d.id='cms-import-result';document.body.appendChild(d);}
   const i=document.createElement('input');i.type='file';i.id='__cmsfile';document.body.appendChild(i);});
 const inp=await pg.$('#__cmsfile');await inp.uploadFile(XLSX);
 const res=await pg.evaluate(async()=>{await runCmsPayImport(document.getElementById('__cmsfile'));await new Promise(s=>setTimeout(s,400));
   const w=cmsFindOpsCustomer('감사가맹','111-22-33333');return {box:document.getElementById('cms-import-result').innerText.slice(0,60),mem:w&&(w.arrears||[]).length,real:(customers.find(c=>c.id==='c-aud').arrears||[]).length};});
 await pg.reload({waitUntil:'networkidle0'});
 const after=await pg.evaluate(()=>{enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'});const w=cmsFindOpsCustomer('감사가맹','111-22-33333');const c=customers.find(x=>x.id==='c-aud');
   return {wrap:w&&(w.arrears||[]).length,real:c&&(c.arrears||[]).length,amount:c&&c.arrears&&c.arrears[0]&&c.arrears[0].amount,status:c&&c.arrears&&c.arrears[0]&&c.arrears[0].status};});
 console.log('올린 직후',JSON.stringify(res));console.log('새로고침 뒤',JSON.stringify(after));
 console.log(after.real===1&&after.wrap===1&&after.amount===33000?'  ✓ CMS 출금 · 납입 내역이 새로고침 뒤에도 남는다 (가맹점 기록 · 운영업무센터 화면 모두)':'  ✗ 남지 않음');
 console.log('errors',JSON.stringify(errs.slice(0,5)));await br.close();srv.close();});
