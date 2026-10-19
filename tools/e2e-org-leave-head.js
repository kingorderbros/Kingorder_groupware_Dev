// 사용법: node tools/e2e-org-leave-head.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-19 — ① 구성원 '휴직중' 표시  ② 본부장이 없는 본부는 임원을 본부장 자리에 직급 이름으로 표시
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8798,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1280,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8798/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const it=itDeptId();
   const ppl=[
     {id:'e2e-a',name:'임원시험',dept:it,rank:'전무',team:'',email:'e2e-a@test.local',groupId:'sales'},
     {id:'e2e-b',name:'휴직시험',dept:it,rank:'매니저',team:'',email:'e2e-b@test.local',groupId:'sales'},
     {id:'e2e-c',name:'본부장시험',dept:'sales',rank:'본부장',team:'',email:'e2e-c@test.local',groupId:'sales'},
     {id:'e2e-d',name:'영업임원시험',dept:'sales',rank:'이사',team:'',email:'e2e-d@test.local',groupId:'sales'}];
   ppl.forEach(u=>localUsers.push(u));
   // 휴직중 — 구성원 수정 창의 선택으로 저장
   openOrgEdit('e2e-b'); r.leaveBoxUnchecked=document.getElementById('org-edit-on-leave').checked===false;
   document.getElementById('org-edit-on-leave').checked=true; submitOrgEdit({preventDefault(){}});
   const b=localUsers.find(u=>u.id==='e2e-b'); r.leaveSaved=b.onLeave===true; r.bAfter=JSON.stringify({dept:b.dept,rank:b.rank,hide:b.hideInOrg,level:b.level,groupId:b.groupId,isAdmin:b.isAdmin}); r.inChart=orgChartMembers().some(u=>u.id==='e2e-b');
   openOrgEdit('e2e-b'); r.leaveBoxChecked=document.getElementById('org-edit-on-leave').checked===true; closeOrgEdit();
   // 계층도
   setOrgView('tree'); navigate('org-chart',document.getElementById('nav-org-chart'));
   const host=document.getElementById('sec-org-chart');
   const t=host.innerText;
   const g=orgGrouped(orgChartMembers(),{});
   const ig=g.find(x=>x.dept===it), sg=g.find(x=>x.dept==='sales');
   r.itHead=ig&&ig.heads.map(u=>u.name).join(',');
   r.salesHead=sg&&sg.heads.map(u=>u.name).join(',');         // 본부장이 있으면 이사는 본부장 자리에 올리지 않음
   const box=[...host.querySelectorAll('.org-tree div')].find(d=>d.innerText.includes(orgDeptName(it))&&d.innerText.includes('임원시험')&&d.innerText.length<80);
   r.boxText=box?box.innerText.replace(/\s+/g,' '):'';
   r.boxShowsRank=/전무\s*임원시험/.test(r.boxText);
   r.boxNoHeadWord=!/본부장/.test(r.boxText);
   r.treeLeave=t.includes('휴직중');
   setOrgView('card'); const c=host.innerText;
   r.cardLeave=c.includes('휴직중'); r.cardRank=/전무\s*임원시험/.test(c);
   openOrgMember('e2e-b'); r.popupLeave=document.getElementById('org-member-name').innerText.includes('휴직중'); closeOrgMember();
   navigate('management-org',document.getElementById('nav-management-org'));
   r.manageLeave=document.getElementById('sec-management-org').innerText.includes('휴직중');
   setOrgView('tree');
   ppl.forEach(p=>localUsers.splice(localUsers.findIndex(u=>u.id===p.id),1));
   return r;
 });
 const expect={leaveBoxUnchecked:true,leaveSaved:true,leaveBoxChecked:true,itHead:'임원시험',salesHead:'본부장시험',boxShowsRank:true,boxNoHeadWord:true,treeLeave:true,cardLeave:true,cardRank:true,popupLeave:true,manageLeave:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
