// 사용법: node tools/e2e-perm-group.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-07 — 참석자 트리([+] 로 본부 펼침 · 관리자 제외), 권한 그룹 · 본부 추가 / 삭제, 다시 열어도 유지.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');const SHOT=process.env.SHOT_DIR||'';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
const wait=ms=>new Promise(r=>setTimeout(r,ms));let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8866,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];const alerts=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>{alerts.push(d.message());d.accept();});await pg.setViewport({width:1500,height:950});
 const boot=async()=>{await pg.goto('http://localhost:8866/',{waitUntil:'networkidle0'});await pg.evaluate(()=>{const list=[['a0','관리자','admin','admin','admin'],['a1','정장훈','it','management','head'],['a2','영업하나','sales','sales','manager'],['a3','운영하나','ops','ops','manager'],['a4','외주','vendor','vendor','manager']].map(([id,name,dept,groupId,level])=>({id,name,dept,groupId,level,team:dept==='ops'?'운영팀':'',email:id+'@x.kr',rank:'매니저',isAdmin:name==='정장훈'}));if(!localUsers.some(u=>u.id==='a1')){localUsers.length=0;localUsers.push(...list);}enterApp(localUsers.find(u=>u.name==='정장훈'));});await wait(300);};
 await boot();
 console.log('■ 참석자 트리');
 let r=await pg.evaluate(()=>{navigate('calendar-center',document.getElementById('nav-calendar-center'));openScheduleModal('2026-11-10');const b=document.getElementById('schedule-attendee-picker');const t=b.innerText;return{closed:t.includes('영업본부')&&!t.includes('영업하나'),noAdmin:!/관리자|소속 없음|외주/.test(t),plus:[...b.querySelectorAll('button')].some(x=>x.textContent==='+'),candidates:inviteCandidates().map(u=>u.name)};});
 ok(r.closed,'처음에는 본부만 보임',r);ok(r.noAdmin&&!r.candidates.includes('관리자'),'관리자 · 외주 제외',r);ok(r.plus,'[+] 단추',r);
 r=await pg.evaluate(()=>{const b=document.getElementById('schedule-attendee-picker');const key=encodeURIComponent('d:ops');toggleAttendeeTreeOpen(key);const t=b.innerText;const minus=[...b.querySelectorAll('button')].some(x=>x.textContent==='−');toggleAttendeeTreeOpen(key);return{shown:t.includes('운영팀')&&t.includes('운영하나'),minus,closed:!b.innerText.includes('운영하나')};});
 ok(r.shown&&r.minus,'[+] 누르면 팀원까지 펼침',r);ok(r.closed,'다시 누르면 접힘',r);
 r=await pg.evaluate(()=>{const html=ptreeRowsHtml(localUsers,u=>`<i>${u.name}</i>`);closeScheduleModal();return{noAdmin:!/관리자|소속 없음|>외주/.test(html),has:html.includes('영업하나')};});
 ok(r.noAdmin&&r.has,'조직원 고르기 트리에서도 관리자 제외',r);
 console.log('■ 권한 그룹');
 r=await pg.evaluate(()=>{navigate('admin-center',document.getElementById('nav-admin-center'));if(typeof setAdminTab==='function')setAdminTab('permissions');renderPermissions();openPermGroupModal();const sel=[...document.getElementById('perm-group-copy').options].map(o=>o.value);const name=document.getElementById('perm-group-name');name.value='JSJ 그룹';document.getElementById('perm-group-copy').value='kop';document.getElementById('perm-group-dept').checked=true;document.getElementById('perm-group-dept-name').value='JSJ';submitPermGroup({preventDefault(){}});const g=permissionGroups.find(x=>x.name==='JSJ 그룹');const kop=permissionGroups.find(x=>x.id==='kop');const d=orgDepts.find(x=>x.name==='JSJ');return{sel:sel.includes('kop')&&!sel.includes('admin'),same:g&&g.permissions.join()===kop.permissions.join(),custom:g&&g.custom,id:g&&g.id,dept:d&&{hide:!!d.hideInOrg,id:d.id},head:document.getElementById('permissions-table-header').innerText.includes('JSJ 그룹'),panel:document.getElementById('perm-org-panel').innerText.includes('JSJ')};});
 ok(r.sel&&r.same&&r.custom,'JSJ 그룹: KOP 권한 그대로',r);ok(r.dept&&r.dept.hide,'JSJ 본부: 조직도 미표시(KOP와 같게)',r);ok(r.head&&r.panel,'화면 표에 표시',r);
 if(SHOT){await pg.evaluate(()=>{document.querySelectorAll('.admin-tab-panel').forEach(x=>x.classList.add('hidden'));document.getElementById('sec-permissions').classList.remove('hidden');});await pg.screenshot({path:path.join(SHOT,'perm.png')});}
 r=await pg.evaluate(()=>{const before=alerts0=permissionGroups.length;const dup=createPermGroup('JSJ 그룹','',null);return{err:dup.error};});ok(/이미 있습니다/.test(r.err),'같은 이름 막음',r);
 // 다시 열어도 유지 · 직원 지정 · 메뉴
 await boot();
 r=await pg.evaluate(()=>{const g=permissionGroups.find(x=>x.name==='JSJ 그룹');const u=localUsers.find(x=>x.name==='영업하나');return{kept:!!g&&g.custom===true&&g.permissions.length>0,id:g&&g.id,dept:orgDepts.some(d=>d.name==='JSJ'),perms:groupsPermissionsOf([g.id]).length};});
 ok(r.kept&&r.dept&&r.perms>0,'새로 열어도 유지',r);const id=r.id;
 r=await pg.evaluate(id=>{const a0=alerts=[];const u=localUsers.find(x=>x.name==='영업하나');u.groupIds=[id];const blocked0=permissionGroups.length;deletePermGroup(id);const blocked=permissionGroups.some(x=>x.id===id);u.groupIds=[];deletePermGroup(id);return{blocked,gone:!permissionGroups.some(x=>x.id===id),base:(deletePermGroup('sales'),permissionGroups.some(x=>x.id==='sales'))};},id);
 ok(r.blocked,'쓰는 직원이 있으면 삭제 막음',r);ok(r.gone,'없으면 삭제',r);ok(r.base,'기본 그룹은 삭제 불가',r);
 await boot();
 r=await pg.evaluate(id=>({gone:!permissionGroups.some(x=>x.id===id)}),id);ok(r.gone,'삭제가 유지됨',r);
 r=await pg.evaluate(()=>{deletePermGroup('kop');const a=!permissionGroups.some(x=>x.id==='kop');return{a};});ok(r.a,'KOP 그룹도 삭제 가능',r);
 await boot();r=await pg.evaluate(()=>!permissionGroups.some(x=>x.id==='kop'));ok(r,'지운 KOP 는 되살아나지 않음');
 ok(alerts.some(a=>a.includes('쓰는 직원이')),'삭제 막힘 안내');ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
