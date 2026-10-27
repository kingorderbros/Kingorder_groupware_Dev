// 사용법: node tools/e2e-wbs-delete.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-19 — 프로젝트 WBS 삭제: WBS 표 줄 · 상세 창의 [삭제] 버튼, 하위 작업 함께 삭제, 선행 참조 정리
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8801,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8801/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={}; const t=ymd(new Date());
   const w=(id,code,name,parent,pred)=>({id,code,name,parentId:parent||'',dept:'sales',assignee:currentUserName,startPlan:t,endPlan:t,progress:0,status:'todo',predecessors:pred||[]});
   projects.push({id:'e2e-p1',name:'WBS삭제시험',dept:'sales',owner:currentUserName,status:'active',startDate:t,endDate:t,
     wbs:[w('e2e-w1','1','잘못입력'),w('e2e-w2','1.1','잘못입력하위','e2e-w1'),w('e2e-w3','2','남을작업','',['e2e-w1']),w('e2e-w4','3','두번째삭제')],issues:[]});
   currentProjectId='e2e-p1';
   navigate('project-center',document.getElementById('nav-project-center'));
   switchProjectTab('wbs');
   const view=document.getElementById('prj-view-wbs');
   r.rowDeleteBtns=view.querySelectorAll('button[onclick^="deleteWbs("]').length;
   // ① 표 줄의 삭제 버튼
   const b=[...view.querySelectorAll('button[onclick^="deleteWbs("]')].find(x=>x.getAttribute('onclick').includes('e2e-w1'));
   b.click();
   const p=findProject('e2e-p1');
   r.afterRow=p.wbs.map(x=>x.id).join(',');
   r.predCleared=(findWbs(p,'e2e-w3').predecessors||[]).length===0;
   // ② 상세 창의 삭제 버튼
   openWbsDetailModal('e2e-p1','e2e-w4');
   const db=[...document.querySelectorAll('#wbsdetail-body button')].find(x=>x.innerText.includes('삭제'));
   r.detailHasDelete=!!db; if(db) db.click();
   r.afterDetail=findProject('e2e-p1').wbs.map(x=>x.id).join(',');
   r.saved=projectsSaved.has('e2e-p1') && JSON.parse(projectsSaved.get('e2e-p1')).wbs.map(x=>x.id).join(',')==='e2e-w3';
   projects.splice(projects.findIndex(x=>x.id==='e2e-p1'),1); renderProjectCenter();
   return r;
 });
 const expect={rowDeleteBtns:4,afterRow:'e2e-w3,e2e-w4',predCleared:true,detailHasDelete:true,afterDetail:'e2e-w3',saved:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
