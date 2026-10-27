// 사용법: node tools/e2e-review-fixes-1028.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-28 구조 점검 후속 — 팀 바꾸면 예전 파트 안 따라옴 · 막혀서 안 지워진 삭제는 이력에 안 남음 · 로그아웃 취소하면 보던 화면 기억 유지 · '렌탈' 글자
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8825,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
 let confirmAnswer=true; pg.on('dialog',d=>{ if(d.type()==='confirm') { confirmAnswer?d.accept():d.dismiss(); } else d.accept(); });
 await pg.goto('http://localhost:8825/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={}; const sleep=ms=>new Promise(res=>setTimeout(res,ms));
   // ① 파트
   const t=orgTeams.find(x=>x.deptId==='ops'&&x.name==='운영팀'); const t2=orgTeams.find(x=>x.deptId==='ops'&&x.name==='설치팀');
   t.parts=[{id:'pt-e2e',name:'시험1파트',order:1}];
   localUsers.push({id:'e2e-pm',name:'파트원시험',dept:'ops',team:'운영팀',part:'시험1파트',rank:'매니저',email:'pm@t.l',groupId:'ops'});
   openOrgEdit('e2e-pm');
   r.partShownFirst=document.getElementById('org-edit-part').value==='시험1파트';
   document.getElementById('org-edit-team').value='설치팀'; onOrgEditTeamChange();
   r.partClearedOnTeamChange=document.getElementById('org-edit-part').value==='';
   closeOrgEdit(); delete t.parts; localUsers.splice(localUsers.findIndex(u=>u.id==='e2e-pm'),1);
   // ② 막혀서 안 지워진 본부 삭제 — 이력 없음
   const n0=deleteLogList().length;
   localUsers.push({id:'e2e-dm',name:'본부원시험',dept:'ops',team:'',rank:'매니저',email:'dm@t.l',groupId:'ops'});
   deleteOrgDept('ops'); await sleep(3500);
   r.blockedNotLogged=deleteLogList().length===n0&&!!orgFindDept('ops');
   localUsers.splice(localUsers.findIndex(u=>u.id==='e2e-dm'),1);
   // ③ 렌탈 글자
   r.rentalWord=cmsSummaryText({cmsRentUse:true,rentFee:1000}).startsWith('렌탈');
   // ④ 로그아웃 취소 — 마지막 화면 유지
   navigate('collab-center',document.getElementById('nav-collab-center'));
   return r;
 });
 confirmAnswer=false;
 out.logoutCancelKeeps=await pg.evaluate(async()=>{ await handleLogout(); return !!sessionStorage.getItem('gwLastPage.v1'); });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
