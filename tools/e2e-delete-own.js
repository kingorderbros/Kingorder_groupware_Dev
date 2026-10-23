// 사용법: node tools/e2e-delete-own.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 보완사항(공통) — 본인이 등록한 자료는 관리자 승인 없이 바로 삭제 · 남의 자료는 삭제 요청 · 삭제 이력 창
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8809,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
 pg.on('dialog',d=>{ if(d.type()==='prompt') d.accept('시험 사유'); else d.accept(); });
 await pg.goto('http://localhost:8809/',{waitUntil:'networkidle0'});
 // 관리자가 아닌 영업 직원으로 들어갑니다
 await pg.evaluate(()=>{ localUsers.push({id:'e2e-s1',name:'영업시험',dept:'sales',rank:'매니저',email:'e2e-s1@test.local',groupId:'sales',level:'manager'}); enterApp({email:'e2e-s1@test.local',dept:'sales',name:'영업시험'}); });
 const out=await pg.evaluate(async()=>{
   const r={};
   r.notAdmin=!canManageAllData();
   const sleep=(ms)=>new Promise(res=>setTimeout(res,ms));
   // 본인 이슈보고서 → 바로 삭제
   salesIssues.push({id:'ISS-E2E-1',title:'내이슈',reporter:'영업시험',reportTo:[],comments:[]});
   salesIssues.push({id:'ISS-E2E-2',title:'남의이슈',reporter:'다른사람',reportTo:[],comments:[]});
   const reqBefore=deleteRequestList().length, logBefore=deleteLogList().length;
   deleteIssue('ISS-E2E-1'); await sleep(30);
   r.ownDeleted=!findIssue('ISS-E2E-1');
   r.ownLogged=deleteLogList().length===logBefore+1&&deleteLogList().slice(-1)[0].label.includes('내이슈');
   deleteIssue('ISS-E2E-2'); await sleep(30);
   r.othersKept=!!findIssue('ISS-E2E-2');
   r.othersRequested=deleteRequestList().length===reqBefore+1;
   // 확인 창에서 취소하면 이력 없음
   salesIssues.push({id:'ISS-E2E-3',title:'취소이슈',reporter:'영업시험',reportTo:[],comments:[]});
   const oc=window.confirm; window.confirm=()=>false;
   const l2=deleteLogList().length; deleteIssue('ISS-E2E-3'); await sleep(30); window.confirm=oc;
   r.cancelNoLog=deleteLogList().length===l2&&!!findIssue('ISS-E2E-3');
   r.confirmRestored=window.confirm===oc;
   // 협업 요청(관리자 수정 창 자료): 본인 요청이면 [삭제] 단추 → 바로 삭제
   collabRequests.push({id:'collab-e2e-del',type:'collab',title:'내요청',assignee:'영업시험',assigneeUser:'',sourceDept:'sales',targetDept:'ops',status:'pending'});
   const btn=adminEditButtonHtml(`openCollabAdminEdit('collab-e2e-del')`);
   r.ownBtn=btn.includes('ownDeleteFromBtn')&&!btn.includes('삭제 요청');
   const div=document.createElement('div'); div.innerHTML=btn; document.body.appendChild(div);
   div.querySelector('button').click(); await sleep(30);
   r.ownCollabDeleted=!collabRequests.some(x=>x.id==='collab-e2e-del');
   // 삭제 이력 창
   openDeleteLog();
   const t=document.getElementById('dellog-body').innerText;
   r.logWindow=t.includes('내이슈')&&t.includes('내요청');
   closeDeleteLog();
   salesIssues.splice(salesIssues.findIndex(x=>x.id==='ISS-E2E-2'),1); salesIssues.splice(salesIssues.findIndex(x=>x.id==='ISS-E2E-3'),1);
   return r;
 });
 const expect={notAdmin:true,ownDeleted:true,ownLogged:true,othersKept:true,othersRequested:true,cancelNoLog:true,confirmRestored:true,ownBtn:true,ownCollabDeleted:true,logWindow:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
