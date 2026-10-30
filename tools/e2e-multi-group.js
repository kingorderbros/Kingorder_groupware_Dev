// 사용법: node tools/e2e-multi-group.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-30 — 사용자 관리 권한 그룹 여러 개: 수정 창 체크 · 저장(groupId 대표 + groupIds) · 목록 표시 · 로그인 시 메뉴 합치기 · KOP 그룹
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8830,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8830/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   r.kopGroup=!!permissionGroups.find(g=>g.id==='kop'&&g.name==='KOP 그룹');
   localUsers.push({id:'u-e2e-mg',name:'다중그룹',dept:'ops',team:'',rank:'매니저',email:'mg@t.l',groupId:'ops',level:'manager'}); const u=localUsers.find(x=>x.id==='u-e2e-mg');
   openOrgEdit(u.id);
   const boxes=[...document.querySelectorAll('input[name="org-edit-group-cb"]')];
   r.checkboxes=boxes.length===permissionGroups.length&&boxes.filter(b=>b.checked).map(b=>b.value).join()===(u.groupId||'');
   boxes.find(b=>b.value==='kop').checked=true; boxes.find(b=>b.value==='payment').checked=true;
   document.getElementById('org-edit-form')?document.getElementById('org-edit-form').requestSubmit():submitOrgEdit({preventDefault(){}});
   const s=localUsers.find(x=>x.id===u.id);
   r.saved=s.groupId===u.groupId&&s.groupIds.join()===['ops','payment','kop'].filter(id=>[u.groupId,'payment','kop'].includes(id)).join()||JSON.stringify(s.groupIds);
   r.savedIds=JSON.stringify([s.groupId,s.groupIds]);
   const perms=groupsPermissionsOf(userGroupIds(s));
   r.union=perms.includes('ops-work-center')&&perms.includes('payment-work-center');
   r.adminNo=!isAdminAccount(s);
   // 관리자 그룹을 함께 고르면 대표 그룹이 관리자
   openOrgEdit(u.id); [...document.querySelectorAll('input[name="org-edit-group-cb"]')].find(b=>b.value==='admin').checked=true; r.adminForm=orgEditGroupIds()[0]==='admin'; closeOrgEdit();
   // 빈 선택은 막음
   openOrgEdit(u.id); [...document.querySelectorAll('input[name="org-edit-group-cb"]')].forEach(b=>b.checked=false); submitOrgEdit({preventDefault(){}}); r.emptyBlocked=localUsers.find(x=>x.id===u.id).groupIds.length===3; closeOrgEdit();
   return r;
 });
 // 그 직원으로 들어가 메뉴가 합쳐지는지
 const login=await pg.evaluate(()=>{ const s=localUsers.find(x=>x.id==='u-e2e-mg'); enterApp(s); return { pay:allowedPageIds.includes('payment-work-center'), ops:allowedPageIds.includes('ops-work-center'), ids:currentUserGroupIds.join() }; });
 out.loginUnion=login.pay&&login.ops&&login.ids.includes('kop');
 const expect=['kopGroup','checkboxes','union','adminNo','adminForm','emptyBlocked','loginUnion'];
 const bad=expect.filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
