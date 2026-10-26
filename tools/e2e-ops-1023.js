// 사용법: node tools/e2e-ops-1023.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 보완사항(운영업무센터 · 장비설치) — 신규 등록 · 매장 수정 · 가맹점 목록 · 등록 전 확인 · 등록 후 수정 · 사업자번호 ·
// 양도/양수/폐업 상태 · 전체 업무이력 · 설치업체(청호 · 자사 설치팀 · 공간티비) · 설치자(설치팀 + 외주) · 설치팀 내 담당자 이관
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8812,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1500,height:950});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8812/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={}; const sleep=(ms)=>new Promise(res=>setTimeout(res,ms));
   localUsers.push({id:'e2e-i1',name:'설치원가',dept:'ops',team:'설치팀',rank:'매니저',email:'e2e-i1@test.local',groupId:'ops'});
   customers.push({id:'C-E2E-1',name:'시험폐업매장',businessNo:'123-45-67890',ceo:'김시험',phone:'010-0000-0000',kind:'direct',status:'폐업',channelType:'직영'});
   navigate('ops-work-center',document.getElementById('nav-ops-work-center'));
   const sec=document.getElementById('sec-ops-work-center').innerHTML;
   r.buttons=sec.includes("createWorkCenterCustomer('ops')")&&sec.includes("openWcShopList('ops')")&&sec.includes("openWcAllWorks('ops')");
   // 가맹점 목록 → 고르기
   openWcShopList('ops');
   r.shopList=document.getElementById('wc-shop-body').innerText.includes('시험폐업매장');
   const wc=wcCustomers('ops').find(c=>c.linkCustomerId==='C-E2E-1');
   pickWcShop('ops',wc.id);
   r.picked=wcState.ops.customerId===wc.id&&document.getElementById('wc-shop-modal').classList.contains('hidden');
   const sum=wcEl('ops','customer-summary').innerText;
   r.bizNo=sum.includes('123-45-67890'); r.status=sum.includes('폐업'); r.editBtn=wcEl('ops','customer-summary').innerHTML.includes('editWorkCenterCustomer');
   editWorkCenterCustomer('ops');
   r.editOpens=!document.getElementById('customer-modal').classList.contains('hidden');
   if(typeof closeCustomerModal==='function') closeCustomerModal(); else document.getElementById('customer-modal').classList.add('hidden');
   // 등록 전 확인 — 취소하면 등록 안 됨
   const def=wcDef('ops'); const n0=def.works.length;
   const form=wcEl('ops','intake-form');
   r.formFlag=form.getAttribute('data-intake-confirm')==='ops';
   const oc=window.confirm; window.confirm=()=>false;
   form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
   window.confirm=oc;
   r.cancelNoWork=def.works.length===n0;
   // 등록 후 수정
   const w={id:'W-E2E-1',customerId:wc.id,company:'시험폐업매장',type:'as',title:'시험',status:'received',receiver:'정장훈',assignee:'',receivedAt:'2026-10-23',receivedTime:'10:00',memo:'처음 내용',extra:{},contact:'',channel:'전화',priority:'normal'};
   def.works.unshift(w);
   openWorkOwnEdit('ops','W-E2E-1');
   document.getElementById('woe-p-memo').value='고친 내용';
   submitWorkOwnEdit({preventDefault(){}});
   r.ownEdit=w.memo==='고친 내용'&&(w.fieldEdits||[]).some(x=>x.label==='상세 내용');
   // 전체 업무이력
   openWcAllWorks('ops');
   r.allWorks=document.getElementById('wc-allworks-body').innerText.includes('W-E2E-1');
   document.getElementById('wc-allworks-modal').classList.add('hidden');
   // 설치업체 · 설치자
   r.vendors=INSTALL_VENDORS.join(',')==='자사 설치팀,청호,공간티비';
   const eng=installEngineerList('');
   r.engineers=eng.includes('설치원가')&&eng.includes('청호(외주)')&&eng.includes('공간티비(외주)');
   // 설치팀 내 담당자 이관
   const iw={id:'W-E2E-2',customerId:wc.id,company:'시험폐업매장',type:'install',title:'장비 설치',status:'received',receiver:'정장훈',assignee:'',receivedAt:'2026-10-23',extra:{}};
   def.works.unshift(iw);
   const box=document.createElement('div'); box.innerHTML=buildInstallActionBody('ops',iw); document.body.appendChild(box);
   const nb=collabNotifications.length;
   document.getElementById('inst-W-E2E-2-owner').value='설치원가';
   collectInstallAction('ops','W-E2E-2');
   r.innerXfer=iw.assignee==='설치원가'&&(iw.innerTransfers||[]).length===1&&collabNotifications.slice(nb).some(n=>n.toUser==='설치원가');
   box.remove();
   // 정리
   def.works=def.works.filter(x=>!String(x.id).startsWith('W-E2E-'));
   customers.splice(customers.findIndex(c=>c.id==='C-E2E-1'),1);
   localUsers.splice(localUsers.findIndex(u=>u.id==='e2e-i1'),1);
   collabNotifications.splice(nb);
   return r;
 });
 const expect={buttons:true,shopList:true,picked:true,bizNo:true,status:true,editBtn:true,editOpens:true,formFlag:true,cancelNoWork:true,ownEdit:true,allWorks:true,vendors:true,engineers:true,innerXfer:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
