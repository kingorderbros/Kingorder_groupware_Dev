// 사용법: node tools/e2e-work-action-edit.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-26 — 운영업무센터 업무처리 창(AS · 메뉴 · 유통 · 설치 · 택배 · 렌탈/할부)에 [수정] — 유형별 접수 항목을 고치고 수정이력에 남김
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8818,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8818/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={}; const def=wcDef('ops');
   navigate('ops-work-center',document.getElementById('nav-ops-work-center'));
   const base={customerId:'',company:'시험매장',status:'received',receiver:'정장훈',assignee:'',receivedAt:'2026-10-26',receivedTime:'10:00',extra:{},contact:'010',channel:'전화',priority:'normal'};
   const ws=[
     Object.assign({id:'W-E2E-AS',type:'as',title:'AS',memo:'처음'},base),
     Object.assign({id:'W-E2E-MN',type:'menu',title:'메뉴',memo:'메뉴 처음',requester:'점주'},base),
     Object.assign({id:'W-E2E-DS',type:'dist',title:'유통',intakeEntries:[{at:'2026-10-26',time:'10:00',by:'정장훈',text:'유통 처음'}],memo:'x'},base),
     Object.assign({id:'W-E2E-IN',type:'install',title:'장비 설치',installAddr:'서울',installReqDate:'2026-10-30',installVendor:'청호',memo:''},base),
     Object.assign({id:'W-E2E-DL',type:'delivery',title:'택배',dlvReqDate:'2026-10-28',contractDate:'2026-10-01',shipInfo:{}},base)
   ];
   ws.forEach(w=>def.works.unshift(w));
   const go=(open,id,x,edit)=>{ open('ops',id); const btn=[...document.querySelectorAll('#'+x+'-action-status [onclick]')].some(el=>el.getAttribute('onclick')==='openWorkOwnEdit("ops", "'+id+'", \'action\')'); openWorkOwnEdit('ops',id,'action'); edit(); submitWorkOwnEdit({preventDefault(){}}); return btn; };
   r.asBtn=go(openAsActionModal,'W-E2E-AS','as',()=>{document.getElementById('woe-contact').value='010-1111';}); closeAsActionModal();
   r.mnBtn=go(openMenuActionModal,'W-E2E-MN','menu',()=>{document.getElementById('woe-p-requester').value='매니저';}); closeMenuActionModal();
   r.dsBtn=go(openDistActionModal,'W-E2E-DS','dist',()=>{document.getElementById('woe-p-intakeEntries').value='유통 고침';}); if(typeof closeDistActionModal==='function') closeDistActionModal();
   r.inBtn=go(openInstallActionModal,'W-E2E-IN','install',()=>{document.getElementById('woe-p-installAddr').value='부산'; document.getElementById('woe-p-installVendor').value='공간티비';}); if(typeof closeInstallActionModal==='function') closeInstallActionModal();
   r.dlBtn=go(openDeliveryActionModal,'W-E2E-DL','delivery',()=>{document.getElementById('woe-p-dlvReqDate').value='2026-10-29';}); if(typeof closeDeliveryActionModal==='function') closeDeliveryActionModal();
   const g=id=>def.works.find(x=>x.id===id);
   r.asSaved=g('W-E2E-AS').contact==='010-1111';
   r.mnSaved=g('W-E2E-MN').requester==='매니저';
   r.dsSaved=g('W-E2E-DS').intakeEntries[0].text==='유통 고침'&&g('W-E2E-DS').memo.includes('유통 고침');
   r.inSaved=g('W-E2E-IN').installAddr==='부산'&&g('W-E2E-IN').installVendor==='공간티비';
   r.dlSaved=g('W-E2E-DL').dlvReqDate==='2026-10-29';
   r.history=ws.every(w=>(g(w.id).fieldEdits||[]).length>0);
   def.works=def.works.filter(x=>!String(x.id).startsWith('W-E2E-'));
   return r;
 });
 const expect={asBtn:true,mnBtn:true,dsBtn:true,inBtn:true,dlBtn:true,asSaved:true,mnSaved:true,dsSaved:true,inSaved:true,dlSaved:true,history:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
