// 사용법: node tools/e2e-collab-kpi-click.js . [스크린샷경로]   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-22 — 협업업무센터 위 카드(내가 처리할 대기 · 내가 보낸 대기 · 지연 요청 · 진행중)를 누르면 아래에 같은 기준의 목록, 다시 누르거나 [닫기]·탭을 누르면 닫힘
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.',SHOT=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8806,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:1000});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8806/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const before=collabRequests.length;
   const mk=(id,o)=>collabRequests.push(Object.assign({id,type:'collab',title:id,description:'',sourceDept:'ops',targetDept:'sales',assignee:'남',assigneeUser:'정장훈',status:'pending',ageDays:0},o));
   mk('KPI-받은대기',{});
   mk('KPI-보낸대기',{assignee:'정장훈',assigneeUser:'남'});
   mk('KPI-지연',{ageDays:5});
   mk('KPI-진행',{status:'accepted',date:'2099-12-31'});
   navigate('collab-center',document.getElementById('nav-collab-center'));
   const shown=()=>!document.getElementById('collab-view-kpi').classList.contains('hidden');
   const titles=()=>[...document.querySelectorAll('#collab-kpi-list p.font-bold')].map(p=>p.innerText);
   const num=(id)=>parseInt(document.getElementById(id).textContent);
   const res={};
   for(const [key,kid,must] of [['inbox','collab-kpi-inbox-pending','KPI-받은대기'],['sent','collab-kpi-sent-pending','KPI-보낸대기'],['aged','collab-kpi-aged','KPI-지연'],['active','collab-kpi-active','KPI-진행']]){
     document.querySelector(`[data-collab-kpi="${key}"]`).click();
     const t=titles();
     res[key]=shown()&&t.includes(must)&&t.length===num(kid)&&document.querySelector(`[data-collab-kpi="${key}"]`).classList.contains('collab-kpi-on');
   }
   r.lists=Object.values(res).every(Boolean); r.detail=JSON.stringify(res);
   r.receivedHidden=document.getElementById('collab-view-received').classList.contains('hidden');
   document.querySelector('[data-collab-kpi="active"]').click();   // 같은 카드 다시 → 닫힘
   r.toggleClose=!shown()&&!document.getElementById('collab-view-received').classList.contains('hidden');
   document.querySelector('[data-collab-kpi="inbox"]').click(); switchCollabTab('sent');
   r.tabCloses=!shown()&&!document.querySelector('[data-collab-kpi="inbox"]').classList.contains('collab-kpi-on');
   document.querySelector('[data-collab-kpi="inbox"]').click(); renderCollabCenter();
   r.staysAfterRender=shown();
   window.__cleanup=()=>collabRequests.splice(before);
   return r;
 });
 if(SHOT) await pg.screenshot({path:SHOT});
 await pg.evaluate(()=>window.__cleanup());
 const expect={lists:true,receivedHidden:true,toggleClose:true,tabCloses:true,staysAfterRender:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
