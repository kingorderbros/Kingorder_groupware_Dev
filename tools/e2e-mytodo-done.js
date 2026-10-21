// 사용법: node tools/e2e-mytodo-done.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-21 — 마이 대시보드 '나의 할 일' 완료 버튼 · 완료 표시 · 전체/진행 중/완료 보기
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8811,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8811/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const b=myTodos.length;
   myTodos.push({id:'e2e-t1',owner:currentUserName,title:'할일하나',done:false,dueDate:'',activity:'',scheduleId:null});
   myTodos.push({id:'e2e-t2',owner:currentUserName,title:'할일둘',done:false,dueDate:'',activity:'',scheduleId:null});
   navigate('personal-dashboard',document.getElementById('nav-personal-dashboard'));
   setMyTodoFilter('');
   const list=()=>document.getElementById('personal-tasks-list'), card=name=>[...list().children].find(c=>c.innerText.includes(name));
   const btn=name=>[...card(name).querySelectorAll('button')].find(x=>x.innerText.trim()==='완료');
   r.hasDoneBtn=!!btn('할일하나') && !!btn('할일둘');
   btn('할일하나').click();
   const t1=myTodos.find(t=>t.id==='e2e-t1');
   r.marked=t1.done===true && t1.doneAt===ymd(new Date());
   r.badge=card('할일하나').innerText.includes('완료 '+ymd(new Date()).slice(5).replace('-','/'));
   r.undoBtn=[...card('할일하나').querySelectorAll('button')].some(x=>x.innerText.includes('되돌리기'));
   const tabs=document.getElementById('my-todo-filter').innerText.replace(/\s+/g,' ');
   r.tabCounts=/진행 중 \d+/.test(tabs) && /완료 \d+/.test(tabs);
   setMyTodoFilter('done'); r.doneView=!!card('할일하나') && !card('할일둘');
   setMyTodoFilter('open'); r.openView=!card('할일하나') && !!card('할일둘');
   setMyTodoFilter('done'); [...card('할일하나').querySelectorAll('button')].find(x=>x.innerText.includes('되돌리기')).click();
   r.undone=t1.done===false && t1.doneAt==='';
   r.doneEmptyMsg=list().innerText.includes('완료한 할 일이 없습니다') || myTodos.some(t=>t.owner===currentUserName&&t.done);
   r.remembered=kobStorage.getItem('dashTodoFilter')==='done';
   setMyTodoFilter(''); myTodos.splice(b);
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
