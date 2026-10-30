// 사용법: node tools/e2e-franchise-prices.js . <브랜드별 장비단가.xlsx>   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-30 영업본부 보완 4차 — 프랜차이즈 장비단가 엑셀 읽기 · 브랜드별 장비만 서버가 골라 보냄 · 프랜차이즈 접수 STEP 2 건너뜀 · 설치비 자동 끔
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';const XLSX=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8836,async()=>{const pc=await import(path.resolve(ROOT,'functions/api/_partner.js'));
 const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1300,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8836/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const b64=fs.readFileSync(XLSX).toString('base64');
 const out=await pg.evaluate(async(b64)=>{
   const r={};
   partners.push({id:'HQ-E2E-1',name:'(주)교촌치킨',kind:'hq'});
   const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
   const file=new File([bin],'인수인계_브랜드별 장비단가_251020.xlsx');
   openFranchisePriceModal();
   const inp=document.getElementById('franchise-price-file'); const dt=new DataTransfer(); dt.items.add(file); inp.files=dt.files;
   await onFranchisePriceFile(inp);
   const d=franchisePriceDraft;
   r.brands=d.brands.length; r.items=d.brands.reduce((n,b)=>n+b.items.length,0);
   const kc=d.brands.find(b=>b.brand==='교촌치킨');
   r.matched=kc&&kc.hqId==='HQ-E2E-1';
   const pos=kc.items.find(i=>i.cat==='POSSET'); r.posPrice=pos&&pos.price===850000&&pos.monthly===30000;
   const kio=kc.items.find(i=>/스탠드형/.test(i.model)); r.carryCat=kio&&kio.cat==='키오스크'&&kio.price===1600000;
   const mk=d.brands.find(b=>b.brand==='밀크컨셉'); const card=mk.items.find(i=>i.cat==='유선단말기'); r.correctedPrice=card&&card.price===200000;
   saveFranchisePrices();
   r.saved=(loadJsonStore('gwFranchisePrices.v1',{}).brands||[]).length===d.brands.length;
   document.getElementById('franchise-price-modal').classList.add('hidden');
   // STEP 2 건너뜀
   const ns=PARTNER_INTAKE_DEPTS.sales.types.find(t=>t.id==='newshop');
   const s2=ns.fields.filter(f=>f.step===2);
   r.step2Hidden=s2.length>0&&s2.every(f=>!partnerFieldVisible(f,{custType:'hq',cmsTarget:'yes'}))&&s2.some(f=>partnerFieldVisible(f,{custType:'partner'}));
   return {r, data:loadJsonStore('gwFranchisePrices.v1',{})};
 },b64);
 const r=out.r;
 // 서버 — 그 브랜드 장비만, 다른 브랜드는 안 보냄
 const v=pc.franchisePriceView(out.data,{id:'HQ-E2E-1',name:'(주)교촌치킨',kind:'hq',custType:'hq'});
 r.serverOwnBrand=!!v&&v.length>0&&v.every(x=>x.sub==='교촌치킨'&&x.franchise===true);
 const shop=pc.franchisePriceView(out.data,{id:'S1',kind:'franchise',custType:'franchise',parentId:'HQ-E2E-1'});
 r.serverShopByParent=!!shop&&shop.length===v.length;
 const hidden=pc.franchisePriceView(out.data,{id:'S2',kind:'franchise',custType:'franchise',franchiseName:'교촌치킨',franchiseHq:'hidden'});
 r.serverHiddenPrice=!!hidden&&hidden.every(x=>x.price===undefined);
 r.serverNameMatch=!!pc.franchisePriceView(out.data,{id:'H9',kind:'hq',custType:'hq',name:'누나커피'});
 r.serverOthersNull=pc.franchisePriceView(out.data,{id:'P1',kind:'partner',custType:'partner'})===null;
 // 화면 — 브랜드 장비를 쓰면 설치비 자동 줄을 붙이지 않음
 const noAuto=await pg.evaluate(()=>{ saveJsonStore('gwPartnerPriceItems.v1',[{id:'fr-0',cat:'POSSET',sub:'교촌치킨',name:'POSSET (hit-plus 4g)',price:850000,franchise:true}]);
   const orig=window.isPartnerMode; window.isPartnerMode=()=>true; const rows=[{item:'POSSET (hit-plus 4g)',qty:1}]; partnerHwApplyAutoInstall(rows); window.isPartnerMode=orig; return !rows.some(x=>x.auto==='install'); });
 r.noAutoInstall=noAuto;
 const expect=['matched','posPrice','carryCat','correctedPrice','saved','step2Hidden','serverOwnBrand','serverShopByParent','serverHiddenPrice','serverNameMatch','serverOthersNull','noAutoInstall'];
 const bad=expect.filter(k=>r[k]!==true);
 console.log(JSON.stringify(r));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
