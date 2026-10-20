// 사용법: node tools/e2e-company-colfilter.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-19 — 공통관리 › 업체 관리 목록의 칸별 거르기
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8805,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8805/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const add=o=>customers.push(Object.assign({type:'잠재고객',grade:'일반',size:'중소기업',useYn:'YES'},o));
   add({id:'e2e-cp',name:'시험파트너',kind:'partner',status:'거래중',businessNo:'111-11-11111',contactName:'김파트',phone:'010-1111-1111'});
   add({id:'e2e-s1',name:'시험가맹A',kind:'partnerShop',parentId:'e2e-cp',status:'거래중',businessNo:'222-22-22222',contactName:'이담당',phone:'010-2222-2222'});
   add({id:'e2e-s2',name:'시험가맹B',kind:'partnerShop',status:'거래중단',businessNo:'333-33-33333',contactName:'박담당',phone:'010-3333-3333'});
   add({id:'e2e-d1',name:'시험직영',kind:'direct',status:'거래중',businessNo:'444-44-44444',contactName:'최담당',phone:'02-444-4444'});
   commonActiveTab='companies'; navigate('common-partners',document.getElementById('nav-common-partners'));
   companyFilter={q:'시험',kind:'',status:'',view:'list',limit:300,cols:{}}; renderCompanies();
   const names=()=>companyFiltered().map(c=>c.name).join(',');
   r.filterRow=document.querySelectorAll('#company-rows thead tr').length===2;
   r.all=names();
   setCompanyCol('parent','시험파트너'); r.byParent=names();
   setCompanyCol('parent','__none'); r.orphan=names();
   setCompanyCol('parent','');
   setCompanyFilter('kind','direct'); r.byKind=names(); setCompanyFilter('kind','');
   setCompanyFilter('status','거래중단'); r.byStatus=names(); setCompanyFilter('status','');
   // 글자 칸 — 커서 유지
   const inp=document.querySelector('[data-ccol="businessNo"]'); inp.focus(); inp.value='22222'; inp.dispatchEvent(new Event('input'));
   r.byBizNo=names(); r.focusKept=document.activeElement&&document.activeElement.getAttribute('data-ccol')==='businessNo';
   setCompanyCol('businessNo','');
   setCompanyCol('contact','박'); r.byContact=names(); setCompanyCol('contact','');
   setCompanyCol('phone','02-444'); r.byPhone=names(); setCompanyCol('phone','');
   setCompanyCol('contract','none'); r.noContract=names();
   setCompanyCol('contract','na'); r.naContract=names(); setCompanyCol('contract','');
   setCompanyCol('ids','yes'); r.idsYes=names(); setCompanyCol('ids','');
   setCompanyCol('name','가맹'); setCompanyFilter('status','거래중'); r.combined=names();
   clearCompanyCols(); r.cleared=names()===r.all;
   setCompanyFilter('view','tree'); r.treeHasRow=document.querySelectorAll('#company-rows thead tr').length===2; setCompanyFilter('view','list');
   ['e2e-cp','e2e-s1','e2e-s2','e2e-d1'].forEach(id=>customers.splice(customers.findIndex(c=>c.id===id),1));
   resetCompanyFilter();
   return r;
 });
 const expect={filterRow:true,all:'시험가맹A,시험가맹B,시험직영,시험파트너',byParent:'시험가맹A',orphan:'시험가맹B',byKind:'시험직영',byStatus:'시험가맹B',byBizNo:'시험가맹A',focusKept:true,byContact:'시험가맹B',byPhone:'시험직영',noContract:'시험가맹A,시험가맹B,시험직영',naContract:'시험파트너',idsYes:'',combined:'시험가맹A',cleared:true,treeHasRow:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
