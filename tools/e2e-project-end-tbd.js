// 사용법: node tools/e2e-project-end-tbd.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-20 — 프로젝트 종료 예정일 '미정'
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8806,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8806/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={}; const t=ymd(new Date());
   navigate('project-center',document.getElementById('nav-project-center'));
   const before=projects.length;
   openProjectModal();
   const end=document.getElementById('prj-end-plan');
   r.tbdUncheckedByDefault=document.getElementById('prj-end-tbd').checked===false && end.required===true;
   document.getElementById('prj-name').value='미정시험프로젝트';
   document.getElementById('prj-start-plan').value=t;
   document.getElementById('prj-end-tbd').checked=true; onProjectEndTbdChange();
   r.dateLocked=end.disabled===true && end.required===false;
   submitProject({preventDefault(){}});
   const p=projects[projects.length-1];
   r.created=projects.length===before+1 && p.name==='미정시험프로젝트' && p.endTbd===true && p.endPlan==='';
   r.label=projectEndLabel(p)==='미정';
   currentProjectId=p.id; renderProjectCenter();
   const txt=document.getElementById('sec-project-center') ? document.getElementById('sec-project-center').innerText : document.body.innerText;
   r.headerShowsTbd=txt.includes('~ 미정');
   switchProjectTab('overview');
   r.overviewNote=document.body.innerText.includes('종료 예정일이 미정이라');
   // 수정 창 — 미정이 체크된 채로 열리고, 날짜를 넣으면 미정 해제
   openProjectModal(p.id);
   r.editKeepsTbd=document.getElementById('prj-end-tbd').checked===true && end.disabled===true;
   document.getElementById('prj-end-tbd').checked=false; onProjectEndTbdChange();
   end.value=t; submitProject({preventDefault(){}});
   r.dateSet=p.endTbd===false && p.endPlan===t && projectEndLabel(p)===t;
   // 날짜도 미정도 없으면 저장 안 됨
   let msg=''; const oa=window.alert; window.alert=m=>{msg=m;};
   openProjectModal(); document.getElementById('prj-name').value='빈종료시험'; document.getElementById('prj-start-plan').value=t;
   const n2=projects.length; submitProject({preventDefault(){}}); window.alert=oa;
   r.blankBlocked=projects.length===n2 && /미정/.test(msg); closeProjectModal();
   projects.splice(projects.findIndex(x=>x.id===p.id),1); renderProjectCenter();
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
