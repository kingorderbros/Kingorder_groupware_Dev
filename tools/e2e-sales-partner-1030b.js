// 사용법: node tools/e2e-sales-partner-1030b.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-30 영업본부 보완 2차 — 파트너사별 담당자 자동 배정 · 지원금 상계처리 · 영업본부 담당자 접수 삭제 · 렌탈 구매 방식과 렌탈 내역
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8834,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1300,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8834/',{waitUntil:'networkidle0'});
 const out=await pg.evaluate(()=>{
   const r={};
   localUsers.push({id:'u-e2e-s1',name:'김영업e',dept:'sales',team:'',rank:'매니저',email:'s1@t.l',groupId:'sales',level:'manager'});
   partners.push({id:'PA-E2E',name:'시험파트너',kind:'partner',owner:'김영업e',status:'거래중'});
   enterApp(localUsers.find(u=>u.id==='u-e2e-s1'));
   const hw=JSON.stringify([{item:'포스 세트',qty:1,method:'rental',months:36,resale:30000,price:0},{item:'주방프린터',qty:1,method:'cash'}]);
   const x={id:'PI-E2E-S',partnerId:'PA-E2E',dept:'sales',type:'newshop',title:'신규 가맹점 개설 — 시험',at:'2026-10-30 09:00',status:'received',history:[],files:[],docs:[],extra:{hwList:hw}};
   partnerIntakes.push(x);
   renderPartnerCenter('sales');
   r.autoAssign=x.assignee==='김영업e'&&x.autoAssigned==='김영업e';
   x.assignee=''; renderPartnerCenter('sales'); r.noReassign=x.assignee==='';
   r.rental=PARTNER_HW_METHODS.some(m=>m.id==='rental')&&partnerRentalRows(x).length===1;
   openPartnerIntakeModal('PI-E2E-S');
   const html=document.body.innerHTML;
   r.rentalShown=html.includes('렌탈 내역');
   r.offsetBtn=html.includes('setPartnerSubsidyOffset');
   setPartnerSubsidyOffset('PI-E2E-S','yes'); r.offsetSaved=x.subsidyOffset==='yes'&&x.history.some(h=>h.text.includes('지원금 상계처리'));
   r.delBtn=html.includes('deletePartnerIntake');
   deletePartnerIntake('PI-E2E-S'); r.deleted=!partnerIntakes.some(y=>y.id==='PI-E2E-S');
   return r;
 });
 const expect=['autoAssign','noReassign','rental','rentalShown','offsetBtn','offsetSaved','delBtn','deleted'];
 const bad=expect.filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
