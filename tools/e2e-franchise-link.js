// 사용법: node tools/e2e-franchise-link.js . <브랜드별 장비단가.xlsx>   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-30 — 프랜차이즈 장비단가 ↔ 업체목록 연결: 엑셀 올리면 상호로 자동 연결 · 두 브랜드에 걸리면 확인 필요 · 저장하면 업체에 브랜드 · 풀면 지움 · 손으로 연결 · 서버가 연결 업체로 브랜드 찾음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';const XLSX=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8837,async()=>{const pc=await import(path.resolve(ROOT,'functions/api/_partner.js'));
 const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1300,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8837/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const b64=fs.readFileSync(XLSX).toString('base64');
 const out=await pg.evaluate(async(b64)=>{
   const r={};
   const add=(id,name,kind,extra)=>customers.push(Object.assign({id,name,kind,status:'거래중'},extra||{}));
   add('E1','교촌치킨 강남역점','direct'); add('E2','교촌치킨 모란역점','direct');
   add('E3','60계치킨앤스텔라떡볶이 포천이동점','direct');
   add('E4','포케올데이 가산퍼블릭점','partnerShop');
   add('E5','교촌치킨 유통','dist');                      // 유통은 연결 안 함
   add('E6','계근상 일산 주엽점','direct');                 // 이름에 브랜드가 없음 → 손으로 연결
   add('E7','누나커피 홍대점','franchise');
   const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
   const file=new File([bin],'인수인계_브랜드별 장비단가_251020.xlsx');
   openFranchisePriceModal();
   const inp=document.getElementById('franchise-price-file'); const dt=new DataTransfer(); dt.items.add(file); inp.files=dt.files;
   await onFranchisePriceFile(inp);
   const d=franchisePriceDraft;
   const ids=name=>((d.brands.find(b=>b.brand===name)||{}).companyIds||[]).slice().sort().join(',');
   r.autoKyochon=ids('교촌치킨')==='E1,E2';
   r.autoPoke=ids('포케올데이')==='E4';
   r.autoArrow=ids('무무커피 > 누나커피')==='E7';
   r.comboUnsure=!d.brands.some(b=>(b.companyIds||[]).includes('E3'));
   r.distSkipped=!d.brands.some(b=>(b.companyIds||[]).includes('E5'));
   const modal=document.getElementById('franchise-price-modal').innerText;
   r.modalShowsCount=modal.includes('업체목록 연결')&&modal.includes('업체 2곳');
   // 손으로 — 60계 매장은 60계치킨에, 화락 매장은 검색해서
   const bi60=d.brands.findIndex(b=>b.brand==='60계치킨'); franchiseLinkCompany(bi60,'E3');
   const biHw=d.brands.findIndex(b=>b.brand==='화락바베큐치킨'); franchiseLinkSearch(biHw,'계근상');
   r.searchFinds=document.getElementById('fr-link-results-'+biHw).textContent.includes('계근상 일산 주엽점');
   franchiseLinkCompany(biHw,'E6');
   // 같은 업체를 다른 브랜드로 옮기면 앞 브랜드에서 빠짐
   const biSt=d.brands.findIndex(b=>b.brand==='스텔라떡볶이'); franchiseLinkCompany(biSt,'E3');
   r.moveOneBrand=!d.brands[bi60].companyIds.includes('E3')&&d.brands[biSt].companyIds.includes('E3');
   saveFranchisePrices();
   const c=id=>customers.find(x=>x.id===id);
   r.brandWritten=c('E1').brand==='교촌치킨'&&c('E7').brand==='누나커피'&&c('E6').brand==='화락바베큐치킨'&&c('E3').brand==='스텔라떡볶이'&&c('E1').brandFrom==='franchise-price';
   r.distNoBrand=!c('E5').brand;
   // 풀고 저장하면 업체의 브랜드도 지움
   franchiseUnlinkCompany(d.brands.findIndex(b=>b.brand==='교촌치킨'),'E2');
   saveFranchisePrices();
   r.unlinkClears=!c('E2').brand&&!c('E2').brandFrom&&c('E1').brand==='교촌치킨';
   // 다시 열어도 연결 그대로
   document.getElementById('franchise-price-modal').classList.add('hidden');
   openFranchisePriceModal();
   r.reopenKeeps=((franchisePriceDraft.brands.find(b=>b.brand==='교촌치킨')||{}).companyIds||[]).join(',')==='E1';
   document.getElementById('franchise-price-modal').classList.add('hidden');
   // 업체목록 — 상호 옆 브랜드 · 브랜드로 검색
   r.listChip=companyRowHtml(c('E1'),{},false).includes('교촌치킨</span>');
   r.searchByBrand=companyMatches(c('E6'),'화락바베큐치킨');
   const data=loadJsonStore('gwFranchisePrices.v1',{});
   customers=customers.filter(x=>!/^E\d$/.test(x.id)); saveCustomers();
   return {r,data};
 },b64);
 const r=out.r;
 // 서버 — 연결한 업체(가맹점)는 그 브랜드 장비를 받음
 const v=pc.franchisePriceView(out.data,{id:'E1',kind:'franchise',custType:'franchise',name:'교촌치킨 강남역점'});
 r.serverByLink=!!v&&v.length>0&&v.every(x=>x.sub==='교촌치킨');
 r.serverUnlinkedNull=pc.franchisePriceView(out.data,{id:'ZZ',kind:'franchise',custType:'franchise',name:'모르는 가게'})===null;
 const bad=Object.keys(r).filter(k=>r[k]!==true);
 console.log(JSON.stringify(r));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
