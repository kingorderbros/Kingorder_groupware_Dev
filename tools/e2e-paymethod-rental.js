// 사용법: node tools/e2e-paymethod-rental.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 보완사항 — 계약방식 '임대' → '렌탈/할부' · CMS 종류 '임대' → '렌탈' (CMS(렌탈) · CMS(관리비)) (예전 '임대' · '렌탈' 자료도 렌탈/할부로, '렌탈/할부' 글자는 쪼개지지 않음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8813,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8813/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   r.oldRent=custPayMethods({payMethods:['임대']}).join(',');
   r.oldRental=custPayMethods({payMethod:'렌탈, 현금'}).join(',');
   r.newText=custPayMethods({payMethod:'렌탈/할부 · 현금'}).join(',');
   r.box=!!document.querySelector('input[name="customer-pay-method"][value="렌탈/할부"]')&&!document.querySelector('input[name="customer-pay-method"][value="임대"]');
   r.cmsOld=custPayMethods({payMethods:['CMS(임대)'],cmsRentUse:true}).join(',');
   r.cmsBox=!!document.querySelector('input[name="customer-pay-method"][value="CMS(렌탈)"]')&&!document.querySelector('input[name="customer-pay-method"][value="CMS(임대)"]');
   r.noOldWord=!/CMS\(임대\)|임대 CMS|임대CMS/.test(document.documentElement.innerHTML.replace(/'CMS\(임대\)': 'CMS\(렌탈\)'/,''));
   r.arrearsKind=CMS_PAY_KINDS.find(k=>k.id==='rent').label==='렌탈CMS'&&CMS_PAY_KINDS.find(k=>k.id==='rent').aliases.includes('임대cms');
   customers.push({id:'C-E2E-PM',name:'시험계약방식',kind:'direct',payMethods:['임대']});
   openCustomerModal('C-E2E-PM');
   r.checked=document.querySelector('input[name="customer-pay-method"][value="렌탈/할부"]').checked;
   if(typeof closeCustomerModal==='function') closeCustomerModal();
   customers.splice(customers.findIndex(c=>c.id==='C-E2E-PM'),1);
   return r;
 });
 const expect={cmsOld:'CMS(렌탈)',cmsBox:true,noOldWord:true,arrearsKind:true,oldRent:'렌탈/할부',oldRental:'렌탈/할부,현금',newText:'렌탈/할부,현금',box:true,checked:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
