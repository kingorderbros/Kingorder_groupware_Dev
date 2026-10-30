// 사용법: FP=<gwFranchisePrices.v1 JSON 파일> node tools/e2e-franchise-intake.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-30 프랜차이즈 본사 접수 — STEP 2 건너뜀 · 장비 칸에 그 브랜드 장비와 금액 · 설치비 자동 줄 없음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8838,async()=>{const pc=await import(path.resolve(ROOT,'functions/api/_partner.js'));
 const raw=JSON.parse(fs.readFileSync(process.env.FP)); const d=Array.isArray(raw)?raw[0].value:raw;
 const items=pc.franchisePriceView(d,{id:'x',kind:'hq',custType:'hq',name:'교촌치킨'});
 const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1300,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8838/?mode=partner',{waitUntil:'networkidle0'});
 const r=await pg.evaluate((items)=>{
   const r={};
   saveJsonStore('gwPartnerPriceItems.v1',items);
   window.isPartnerMode=()=>true;
   enterPartner({loginId:'e2e-hq',partnerId:'HQ-X',partnerName:'교촌치킨 본사',manager:'김본사',custType:'hq'});
   window.partnerCanSeeDept=()=>true; window.partnerCanSeeMenu=()=>true;
   choosePartnerDept('sales','newshop');
   partnerWizardVals.custType='hq';
   refreshPartnerTypeFields(); const steps=partnerWizardVisibleSteps(Object.assign({},partnerFormValuesNow(),{custType:'hq'})).map(s=>s.n); const stepsNow=partnerWizardVisibleSteps().map(s=>s.n); r.custTypeNow=String(partnerFormValuesNow().custType);
   r.stepsNo2=steps.length>0&&steps.indexOf(2)<0;
   r.steps=steps.join(','); r.stepsNow=stepsNow.join(',');
   partnerWizardStep=3; refreshPartnerTypeFields();
   const box=document.querySelector('[data-hw-table]');
   const inp=box.querySelector('[data-hw="item"]'); inp.focus(); partnerHwPickShow(inp);
   const pick=box.querySelector('[data-hw-pick]').innerText;
   r.pickerBrand=pick.includes('POSSET')&&pick.includes('850,000');
   inp.value='POSSET (hit-plus 4g)'; box.querySelector('[data-hw="qty"]').value='1'; onPartnerHwInput(box);
   const rows=JSON.parse(document.getElementById(document.querySelector('[data-hw-table]').getAttribute('data-hw-table')).value);
   r.price=rows[0].price===850000;
   r.noAutoInstall=!rows.some(x=>x.auto==='install');
   return r;
 },items);
 r.brandItems=items.length;
 const expect=['stepsNo2','pickerBrand','price','noAutoInstall'];
 const bad=expect.filter(k=>r[k]!==true);
 console.log(JSON.stringify(r));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
