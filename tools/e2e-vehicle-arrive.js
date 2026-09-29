// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-vehicle-arrive.js . <스크린샷 폴더>   — 폰 · PC 에서 진행중 운행에 도착 입력 (2026-09-29)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2],OUT=process.argv[3];
const LOG={id:'VL-0001',date:'2026-09-29',vehicle:'1호차',driver:'김운전',from:'본사',to:'강남',startKm:12000,departTime:'09:00',status:'진행중'};
const DONE={id:'VL-0000',date:'2026-09-28',vehicle:'1호차',driver:'김운전',from:'본사',to:'판교',startKm:11900,endKm:12000,status:'완료'};
let completed=null;
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 const J=(o)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify(o));};
 if(p==='/api/vehicle-logs/complete'){const ch=[];q.on('data',c=>ch.push(c));q.on('end',()=>{completed=JSON.parse(Buffer.concat(ch));LOG.endKm=completed.endKm;LOG.status='완료';J({ok:true,log:LOG});});return;}
 if(p==='/api/vehicle-logs')return J({logs:(q.url.includes('status=')?(LOG.status==='진행중'?[LOG]:[]):[LOG,DONE])});
 if(p==='/api/drivers')return J({drivers:['김운전']});
 if(p==='/api/vehicles')return J({vehicles:[{id:'CAR-1',plate:'1가1',model:'1호차',status:'운행가능'}]});
 if(p.startsWith('/api/'))return J({reservations:[],logs:[]});
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
const out=[];const ok=(c,m)=>out.push((c?'  ✓ ':'  ✗ ')+m);
srv.listen(8815,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 // 폰
 let pg=await br.newPage();await pg.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('http://localhost:8815/?mode=mobile',{waitUntil:'networkidle0'});await new Promise(s=>setTimeout(s,700));
 await pg.select('#m-driver-select','김운전').catch(()=>{});await pg.evaluate(()=>mobileEnterForm());await new Promise(s=>setTimeout(s,1200));
 let r=await pg.evaluate(()=>{const b=document.getElementById('m-pending-banner');return {shown:!b.classList.contains('hidden'),text:b.innerText.trim()};});
 ok(r.shown&&/1건/.test(r.text),'폰: 맨 위에 "도착 입력이 필요한 운행 1건" 알림 '+JSON.stringify(r));
 await pg.screenshot({path:OUT+'/m_banner.png'});
 await pg.tap('#m-pending-banner');await new Promise(s=>setTimeout(s,900));
 r=await pg.evaluate(()=>({focused:document.activeElement&&document.activeElement.id}));
 ok(r.focused==='mp-end-VL-0001','폰: 알림을 누르면 도착 주행거리 칸으로 가서 바로 입력 '+JSON.stringify(r));
 await pg.close();
 // PC — 관리업무센터 운행내역
 pg=await br.newPage();await pg.setViewport({width:1400,height:900});pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>d.accept());
 LOG.status='진행중';delete LOG.endKm;
 await pg.goto('http://localhost:8815/',{waitUntil:'networkidle0'});
 await pg.evaluate(async()=>{enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'});vehicleLogs=(await (await fetch('/api/vehicle-logs')).json()).logs;navigate('management-work-center',document.getElementById('nav-management-work-center'));
   if(typeof switchMgmtTab==='function')try{switchMgmtTab('vehicle-logs');}catch(e){}renderVehicleLogs();});
 await new Promise(s=>setTimeout(s,500));
 r=await pg.evaluate(()=>{const b=[...document.querySelectorAll('#vehicle-logs-table-body button')].find(x=>/도착 입력/.test(x.innerText));return {btn:!!b,rows:document.querySelectorAll('#vehicle-logs-table-body tr').length};});
 ok(r.btn,'PC: 진행중 건에 [진행중 · 도착 입력] 버튼 '+JSON.stringify(r));
 await pg.evaluate(()=>toggleVlProgressOnly());
 r=await pg.evaluate(()=>({rows:document.querySelectorAll('#vehicle-logs-table-body tr').length,hint:document.getElementById('vl-progress-only-hint').innerText}));
 ok(r.rows===1&&/이것만/.test(r.hint),'PC: "진행중 (도착 미입력)" 칸을 누르면 진행중만 '+JSON.stringify(r));
 await pg.evaluate(()=>openVlArrive('VL-0001'));await pg.type('#vla-end','12085');await pg.type('#vla-fuel','18000');
 await pg.screenshot({path:OUT+'/pc_arrive.png'});
 await pg.click('#vla-submit');await new Promise(s=>setTimeout(s,800));
 ok(completed&&completed.endKm===12085&&completed.fuel===18000&&!(await pg.$('#vl-arrive-modal')),'PC: 도착 입력 창에서 완료 → 서버에 도착 12085km · 유류비 18000 · 창 닫힘 '+JSON.stringify(completed));
 console.log(out.join('\n'));console.log('errors',JSON.stringify(errs.slice(0,5)));await br.close();srv.close();});
