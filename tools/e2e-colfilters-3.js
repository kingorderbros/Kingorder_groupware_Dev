// 사용법: node tools/e2e-colfilters-3.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-20 — 계약관리 · 공급단가표 · CMS·렌탈 현황 칸별 거르기
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8808,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1500,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8808/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   // ---------- 계약관리 ----------
   customers.push({id:'e2e-cu1',name:'계약고객가',kind:'direct'},{id:'e2e-cu2',name:'계약고객나',kind:'partnerShop'});
   partners.push({id:'e2e-pt1',name:'계약시험파트너'});
   const cbefore=contracts.length;
   contracts.push({id:'E2E-C1',name:'시험계약1',customerId:'e2e-cu1',value:500000,owner:'담당갑',start:'2026-10-01',end:'2027-09-30',status:'활성',approvalStatus:'승인완료'});
   contracts.push({id:'E2E-C2',name:'시험계약2',customerId:'e2e-cu2',partnerId:'e2e-pt1',value:20000000,owner:'담당을',start:'2026-05-01',end:'2026-11-30',status:'초안',approvalStatus:'미승인'});
   navigate('common',document.getElementById('nav-common')); setCommonTab('contract');
   const crows=()=>[...document.querySelectorAll('#contracts-table-body tr')].map(t=>t.cells[0]&&t.cells[0].innerText.trim()).filter(x=>/^E2E/.test(x)).join(',');
   r.cRow=!!document.querySelector('#contracts-colf-row [data-colf="contracts:name"]');
   r.cAll=crows();
   setColFilter('contracts','partner','계약시험파트너'); r.cPartner=crows(); setColFilter('contracts','partner','__none'); r.cNoPartner=crows(); setColFilter('contracts','partner','');
   setColFilter('contracts','value','10m'); r.cValue=crows(); setColFilter('contracts','value','');
   setColFilter('contracts','owner','담당갑'); r.cOwner=crows(); setColFilter('contracts','owner','');
   setColFilter('contracts','status','초안'); r.cStatus=crows(); setColFilter('contracts','status','');
   const ci=document.querySelector('[data-colf="contracts:period"]'); ci.focus(); ci.value='2026-05'; ci.dispatchEvent(new Event('input'));
   r.cPeriod=crows(); r.cFocus=document.activeElement&&document.activeElement.getAttribute('data-colf')==='contracts:period';
   clearColFilters('contracts'); r.cCleared=crows()===r.cAll;
   contracts.splice(cbefore); customers.splice(customers.findIndex(c=>c.id==='e2e-cu1'),2); partners.splice(partners.findIndex(p=>p.id==='e2e-pt1'),1);
   // ---------- 공급단가표 ----------
   const pb=priceBook.length;
   priceBook.push({id:'E2E-P1',cat:'시험분류',name:'시험포스',kind:'매입가',cost:100000,price:150000,tiers:{},from:'2026-09-01',memo:'메모가'});
   priceBook.push({id:'E2E-P2',cat:'시험분류',name:'시험월정액',kind:'월정액',cost:'',price:33000,tiers:{[PARTNER_PRICE_TIERS[0].id]:30000},from:'2026-10-01',memo:''});
   setCommonTab('price');
   const pnames=()=>priceFiltered().filter(x=>/^E2E/.test(x.id)).map(x=>x.name).join(',');
   r.pRow=!!document.querySelector('[data-colf="price:name"]');
   setColFilter('price','name','시험'); r.pAll=pnames();
   setColFilter('price','margin','plus'); r.pMargin=pnames(); setColFilter('price','margin','');
   setColFilter('price','tier_'+PARTNER_PRICE_TIERS[0].id,'yes'); r.pTier=pnames(); setColFilter('price','tier_'+PARTNER_PRICE_TIERS[0].id,'');
   setColFilter('price','from','2026-09'); r.pFrom=pnames(); setColFilter('price','from','');
   setColFilter('price','price','33,000'); r.pPrice=pnames();
   clearColFilters('price'); priceBook.splice(pb);
   // ---------- CMS·렌탈 현황 ----------
   // CMS 현황은 업체 목록(customers)에서 만들어지는 자료라 업체로 넣습니다
   const cb2=customers.length;
   customers.push({id:'e2e-o1',name:'시험씨엠에스가',businessNo:'555-55-55555',kind:'direct',channelType:'직영',manager:'관리갑',cmsRentUse:true,rentFee:33000,cmsFeeUse:false,monthlyFee:0,cmsUse:true,rentArrears:[{month:'2026-10',amount:33000,status:'미납'}]});
   customers.push({id:'e2e-o2',name:'시험씨엠에스나',businessNo:'666-66-66666',kind:'direct',channelType:'파트너사',manager:'관리을',cmsRentUse:false,cmsFeeUse:true,monthlyFee:11000,cmsUse:true});
   setCommonTab('cms');
   const cms=()=>cmsStatusRows().filter(x=>/^시험씨엠에스/.test(x.c.name)).map(x=>x.c.name).join(',');
   r.mRow=!!document.querySelector('[data-colf="cms:name"]');
   r.mAll=cms();
   setColFilter('cms','channel','직영'); r.mChannel=cms(); setColFilter('cms','channel','');
   setColFilter('cms','kind','fee'); r.mKind=cms(); setColFilter('cms','kind','');
   setColFilter('cms','rentOwed','yes'); r.mOwed=cms(); setColFilter('cms','rentOwed','');
   setColFilter('cms','monthlyFee','no'); r.mNoFee=cms(); setColFilter('cms','monthlyFee','');
   const mi=document.querySelector('[data-colf="cms:bizNo"]'); mi.focus(); mi.value='66666'; mi.dispatchEvent(new Event('input'));
   r.mBiz=cms(); r.mFocus=document.activeElement&&document.activeElement.getAttribute('data-colf')==='cms:bizNo';
   clearColFilters('cms'); customers.splice(cb2);
   return r;
 });
 const expect={cRow:true,cAll:'E2E-C1,E2E-C2',cPartner:'E2E-C2',cNoPartner:'E2E-C1',cValue:'E2E-C2',cOwner:'E2E-C1',cStatus:'E2E-C2',cPeriod:'E2E-C2',cFocus:true,cCleared:true,
   pRow:true,pAll:'시험포스,시험월정액',pMargin:'시험포스',pTier:'시험월정액',pFrom:'시험포스',pPrice:'시험월정액',
   mRow:true,mAll:'시험씨엠에스가,시험씨엠에스나',mChannel:'시험씨엠에스가',mKind:'시험씨엠에스나',mOwed:'시험씨엠에스가',mNoFee:'시험씨엠에스가',mBiz:'시험씨엠에스나',mFocus:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
