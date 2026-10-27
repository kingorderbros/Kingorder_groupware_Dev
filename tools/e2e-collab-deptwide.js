// 사용법: node tools/e2e-collab-deptwide.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 — 본부(부서) 전체로 보낸 협업요청은 1건이지만, 조회 범위가 '본인'인 팀원도 받은 요청에서 보고 처리할 수 있음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8816,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8816/',{waitUntil:'networkidle0'});
 const out=await pg.evaluate(()=>{
   localUsers.push({id:'e2e-pay1',name:'결제팀원',dept:'payment',rank:'매니저',level:'manager',email:'e2e-pay1@test.local',groupId:'payment'});
   enterApp({email:'e2e-pay1@test.local',dept:'payment',name:'결제팀원',level:'manager'});
   const r={};
   r.scope=getCollabScopeFor('결제팀원','payment',currentUserLevel);
   collabRequests.push({id:'collab-e2e-dw',type:'collab',title:'결제본부전체요청',description:'',assignee:'영업요청자',assigneeUser:'',sourceDept:'sales',targetDept:'payment',status:'pending',ageDays:0});
   collabRequests.push({id:'collab-e2e-other',type:'collab',title:'다른담당자요청',description:'',assignee:'영업요청자',assigneeUser:'결제다른사람',sourceDept:'sales',targetDept:'payment',status:'pending',ageDays:0});
   navigate('collab-center',document.getElementById('nav-collab-center'));
   const txt=document.getElementById('collab-received-list').innerText;
   r.seesDeptWide=txt.includes('결제본부전체요청');
   r.notOthers=!txt.includes('다른담당자요청');
   r.canAccept=[...document.querySelectorAll('#collab-received-list [onclick]')].some(el=>el.getAttribute('onclick')==='openCollabAcceptModal("collab-e2e-dw")');
   r.kpi=parseInt(document.getElementById('collab-kpi-inbox-pending').textContent)>=1;
   collabRequests.splice(collabRequests.findIndex(x=>x.id==='collab-e2e-dw'),1);
   collabRequests.splice(collabRequests.findIndex(x=>x.id==='collab-e2e-other'),1);
   return r;
 });
 const expect={scope:'self',seesDeptWide:true,notOthers:true,canAccept:true,kpi:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
