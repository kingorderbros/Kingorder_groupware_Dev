// 사용법: node tools/e2e-sales-partner-1030.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-30 영업본부 보완 1차 — 파트너센터 신규 가맹점: CMS 이용 요금 자동(포스·키오스크 2대 10,000 + 대당 5,000) · 배달연동 부가세 ·
//   출금일 10일 고정 · 설치비 자동(포스 10만 · 키오스크 20만, 고친 값 유지) · 사업자등록증 주소 · 오픈 예정일/설치 희망일 · 서류 끌어다 놓기 · 일괄 다운로드
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8833,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1300,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8833/?mode=partner',{waitUntil:'networkidle0'});
 const out=await pg.evaluate(async()=>{
   const r={};
   const rows=[{item:'포스 세트 (킹오더 포스)',qty:2,price:0},{item:'21.5인치 KIOSK (안드로이드)',cat:'키오스크',qty:1,price:0},{item:'주방프린터',qty:1,price:0}];
   partnerHwApplyAutoInstall(rows);
   const ins=rows.find(x=>x.auto==='install');
   r.installFee=!!ins&&ins.price===400000&&ins.item==='설치비';
   ins.autoEdited=true; ins.price=0; rows[0].qty=3; partnerHwApplyAutoInstall(rows);
   r.installKeepsEdit=rows.find(x=>x.auto==='install').price===0;
   r.cms3=partnerCmsAutoFee({hwList:JSON.stringify([{item:'포스 세트',qty:2},{item:'21.5인치 KIOSK',cat:'키오스크',qty:1}])})===15000;
   r.cms1=partnerCmsAutoFee({hwList:JSON.stringify([{item:'포스 세트',qty:1}])})===10000;
   const tot=PARTNER_CMS_FIELDS.find(f=>f.key==='cmsFeeTotal').calc({cmsFee:'10000',cmsDelivery:'yes'});
   r.deliveryVat=tot.value===21000;
   const day=PARTNER_CMS_FIELDS.find(f=>f.key==='cmsDay'); r.day10=day.options.length===1&&day.options[0].id==='10';
   r.addrLabel=PARTNER_SHOP_FIELDS.find(f=>f.key==='shopAddr').label.includes('사업자등록증');
   const ns=PARTNER_INTAKE_DEPTS.sales.types.find(t=>t.id==='newshop');
   const s4=ns.fields.filter(f=>f.step===4).map(f=>f.key);
   r.step4Order=s4.slice(0,3).join()==='siteOpenDate,installDate,installTime';
   r.dropAttr=partnerDocRowHtml({id:'ns-bizreg',name:'사업자 등록증',required:true}).includes('data-drop-handler="partnerDocDropFiles"');
   // 화면: 장비 단계에서 포스 2대 · 키오스크 1대를 고르면 설치비 줄이 붙고 CMS 이용 요금이 15,000
   enterPartner({loginId:'e2e',partnerId:'PA-E2E',partnerName:'시험파트너',manager:'김파트너',custType:'partner'});
   window.partnerCanSeeDept=()=>true; window.partnerCanSeeMenu=()=>true;
   choosePartnerDept('sales','newshop');
   partnerWizardVals.cmsTarget='yes';
   partnerWizardStep=3; refreshPartnerTypeFields();
   const box=document.querySelector('[data-hw-table]');
   r.hwBox=!!box;
   if(box){
     const row=box.querySelector('[data-hw-row]');
     row.querySelector('[data-hw="item"]').value='포스 세트 (킹오더 포스)'; row.querySelector('[data-hw="qty"]').value='2';
     onPartnerHwInput(box);
     const b2=document.querySelector('[data-hw-table]'); partnerHwAddRow(b2.getAttribute('data-hw-table'));
     const b3=document.querySelector('[data-hw-table]'); const rs=b3.querySelectorAll('[data-hw-row]'); const last=[...rs].find(x=>!x.querySelector('[data-hw="item"]').value);
     if(last){ last.querySelector('[data-hw="item"]').value='21.5인치 KIOSK (안드로이드)'; last.querySelector('[data-hw="cat"]').value=''; last.querySelector('[data-hw="qty"]').value='1'; onPartnerHwInput(b3); }
     const saved=JSON.parse(document.getElementById(document.querySelector('[data-hw-table]').getAttribute('data-hw-table')).value);
     const fee=saved.find(x=>x.auto==='install');
     r.screenInstall=!!fee&&fee.price===400000;
     r.screenCms=String(partnerWizardVals.cmsFee)==='15000';
   }
   // 일괄 다운로드 대상 모으기
   const x={id:'PI-E2E-D',title:'신규 가맹점 개설 — 시험',docs:[{id:'a',name:'사업자 등록증',file:{name:'a.png',type:'image/png',size:3,dataUrl:'data:image/png;base64,AAAA'}}],files:[{name:'b.txt',type:'text/plain',size:1,dataUrl:'data:text/plain;base64,QQ=='}]};
   r.bulkList=partnerIntakeAllFiles(x).length>=1;
   return r;
 });
 const expect=['installFee','installKeepsEdit','cms3','cms1','deliveryVat','day10','addrLabel','step4Order','dropAttr','hwBox','screenInstall','screenCms','bulkList'];
 const bad=expect.filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
