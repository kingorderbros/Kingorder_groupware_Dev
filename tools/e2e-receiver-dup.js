// 사용법: node tools/e2e-receiver-dup.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 — 수신자 중복 지정 막기: 같은 사람이 목록에 두 번 들어와도 한 번만 보이고 · 한 번만 골라짐 (협업 수신 담당자 · 업무지시 · 회의 참석자 · 이슈 보고 대상 공통)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8817,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8817/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   // 같은 이름이 두 번 (계정이 둘이거나 목록이 겹친 경우)
   const ppl=[{id:'e2e-d1',name:'중복가',dept:'sales',rank:'매니저',email:'d1@t.l',groupId:'sales'},{id:'e2e-d1b',name:'중복가',dept:'sales',rank:'매니저',email:'d1b@t.l',groupId:'sales'},{id:'e2e-d2',name:'단일나',dept:'sales',rank:'매니저',email:'d2@t.l',groupId:'sales'}];
   ppl.forEach(u=>localUsers.push(u));
   const before=collabRequests.length;
   openTaskModal('ops');
   document.getElementById('task-collab-target').value='sales'; onTaskTargetChange();
   document.getElementById('task-type').value='collab'; onTaskTypeChange();
   const boxes=[...document.querySelectorAll('#task-assignee-users .collab-assignee')].filter(c=>c.value==='중복가');
   r.shownOnce=boxes.length===1;
   boxes.forEach(c=>c.checked=true);
   [...document.querySelectorAll('#task-assignee-users .collab-assignee')].filter(c=>c.value==='단일나').forEach(c=>c.checked=true);
   r.pickedUnique=selectedCollabAssignees().join(',')==='중복가,단일나'||selectedCollabAssignees().join(',')==='단일나,중복가';
   // 회의 참석자 · 이슈 보고 대상 공용 칸
   const div=document.createElement('div'); div.innerHTML=peopleCheckTreeHtml(ppl,'e2e-pick',[]); document.body.appendChild(div);
   r.treeOnce=[...div.querySelectorAll('input.e2e-pick')].filter(c=>c.value==='중복가').length===1;
   // 억지로 같은 칸을 두 개 만들어도 읽을 때 한 번만
   div.insertAdjacentHTML('beforeend','<input type="checkbox" class="e2e-pick" value="중복가" checked><input type="checkbox" class="e2e-pick" value="중복가" checked>');
   r.readUnique=pickedPersons('e2e-pick').filter(n=>n==='중복가').length===1;
   div.remove(); closeTaskModal();
   collabRequests.splice(before);
   ppl.forEach(p=>localUsers.splice(localUsers.findIndex(u=>u.id===p.id),1));
   return r;
 });
 const expect={shownOnce:true,pickedUnique:true,treeOnce:true,readUnique:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
