// 사용법: node tools/e2e-org-resigned.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-19 — 퇴사 처리: 조직도 · 담당자 선택에서 빠지고, 조직도 관리 › 퇴사자 · 사용자 목록에는 남고, 로그인은 막힘. 복직도 확인.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8799,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1280,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8799/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const u={id:'e2e-r1',name:'퇴사시험직원',dept:'sales',rank:'매니저',team:'',email:'e2e-r1@test.local',groupId:'sales',level:'rk_manager',joinedAt:'2025-01-02'};
   localUsers.push(u);
   r.beforeInChart=orgChartMembers().some(x=>x.id===u.id);
   // 퇴사 처리 — 화면의 수정 창 그대로
   openOrgEdit(u.id);
   r.dateHiddenBefore=document.getElementById('org-edit-resigned-at-wrap').classList.contains('hidden');
   document.getElementById('org-edit-resigned').checked=true; onOrgEditResignedChange();
   r.dateShown=!document.getElementById('org-edit-resigned-at-wrap').classList.contains('hidden');
   document.getElementById('org-edit-resigned-at').value='2026-10-19';
   submitOrgEdit({preventDefault(){}});
   const s=localUsers.find(x=>x.id===u.id);
   r.saved=s.resigned===true&&s.resignedAt==='2026-10-19';
   r.stillInList=!!s;                                   // 자료(직원 목록)에는 남음
   r.notInChart=!orgChartMembers().some(x=>x.id===u.id);
   r.notInOrgMembers=!orgMembers().some(x=>x.id===u.id);
   navigate('org-chart',document.getElementById('nav-org-chart'));
   r.chartText=!document.getElementById('sec-org-chart').innerText.includes('퇴사시험직원');
   // 담당자 선택 목록
   r.notInInvite=!inviteCandidates().some(x=>x.id===u.id);
   r.notInPersonOpts=!personOptionsHtml('',null).includes('퇴사시험직원');
   r.keepSelectedPerson=personOptionsHtml('퇴사시험직원',null).includes('퇴사시험직원 (현재 값)');
   const sel=document.createElement('select'); fillUserSelect(sel,'sales','');
   r.notInUserSelect=![...sel.options].some(o=>o.value==='퇴사시험직원');
   const sel2=document.createElement('select'); fillUserSelect(sel2,'sales','퇴사시험직원');
   r.keepSelectedUserSelect=sel2.value==='퇴사시험직원';
   r.notInPresence=!presencePeople().some(x=>x.id===u.id);
   // 조직도 관리 › 퇴사자
   navigate('management-org',document.getElementById('nav-management-org'));
   const m=document.getElementById('sec-management-org').innerText;
   r.manageSection=m.includes('퇴사자')&&m.includes('퇴사시험직원')&&m.includes('2026-10-19');
   // 사용자 목록 — 맨 아래 · 퇴사 표시
   renderUsers();
   const rows=[...document.querySelectorAll('#users-table-body tr')];
   r.userRowLast=rows.length&&rows[rows.length-1].innerText.includes('퇴사시험직원');
   r.userChip=rows.length&&rows[rows.length-1].innerText.includes('퇴사');
   // 로그인 막기 (로컬 모드)
   r.findLogin=findLoginAccount('e2e-r1@test.local').user&&findLoginAccount('e2e-r1@test.local').user.id===u.id;
   // 복직
   openOrgEdit(u.id); r.editShowsResigned=document.getElementById('org-edit-resigned').checked===true;
   document.getElementById('org-edit-resigned').checked=false; submitOrgEdit({preventDefault(){}});
   const b=localUsers.find(x=>x.id===u.id);
   r.restored=b.resigned===false&&b.resignedAt==='';
   r.backInChart=orgChartMembers().some(x=>x.id===u.id);
   localUsers.splice(localUsers.findIndex(x=>x.id===u.id),1);
   return r;
 });
 // 로그인 창 — 퇴사자 아이디는 거절 (따로 확인)
 const login=await pg.evaluate(async()=>{
   localUsers.push({id:'e2e-r2',name:'로그인시험',dept:'sales',rank:'매니저',email:'e2e-r2@test.local',groupId:'sales',resigned:true,resignedAt:'2026-10-19'});
   let msg='';const orig=showLoginMsg;showLoginMsg=t=>{msg=t||msg;};
   document.getElementById('login-email').value='e2e-r2@test.local';
   const pw=document.getElementById('login-password'); if(pw) pw.value='x';
   await handleLogin({preventDefault(){}});
   showLoginMsg=orig; localUsers.splice(localUsers.findIndex(x=>x.id==='e2e-r2'),1);
   return msg;
 });
 out.loginBlocked=/퇴사 처리된 계정/.test(login);
 const expect={beforeInChart:true,dateHiddenBefore:true,dateShown:true,saved:true,stillInList:true,notInChart:true,notInOrgMembers:true,chartText:true,notInInvite:true,notInPersonOpts:true,keepSelectedPerson:true,notInUserSelect:true,keepSelectedUserSelect:true,notInPresence:true,manageSection:true,userRowLast:true,userChip:true,findLogin:true,editShowsResigned:true,restored:true,backInChart:true,loginBlocked:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
