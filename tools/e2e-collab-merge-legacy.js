// 사용법: node tools/e2e-collab-merge-legacy.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-28 — 예전에 사람마다 만든 협업요청 묶음(collabGroupId)을 1건으로: 본부 전원이면 본부 전체 · 일부면 받는 사람 여러 명, 상태는 가장 진행된 건, 코멘트 · 알림 모음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8826,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8826/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   const saved=localUsers.slice();
   const ppl=[['m1','결제가'],['m2','결제나'],['m3','결제다']].map(([id,name])=>({id,name,dept:'payment',rank:'매니저',email:id+'@t.l',groupId:'payment'}));
   localUsers.splice(0,localUsers.length,...localUsers.filter(u=>u.dept!=='payment'),...ppl);
   const base={type:'collab',title:'',sourceDept:'sales',targetDept:'payment',assignee:'영업요청자',description:'d',ageDays:0};
   const mk=(id,o)=>Object.assign({id},base,o);
   const before=collabRequests.length;
   // 묶음 A: 결제본부 3명 전원 — 한 명은 완료
   collabRequests.push(mk('L-A1',{title:'본부전체묶음',collabGroupId:'g-A',assigneeUser:'결제가',status:'pending'}),
     mk('L-A2',{title:'본부전체묶음',collabGroupId:'g-A',assigneeUser:'결제나',status:'completed',completedAt:'2026-10-21',completeDetail:'처리함',comments:[{id:'c1',by:'결제나',at:'2026-10-21',text:'완료했어요'}]}),
     mk('L-A3',{title:'본부전체묶음',collabGroupId:'g-A',assigneeUser:'결제다',status:'accepted',comments:[{id:'c2',by:'결제다',at:'2026-10-20',text:'확인'}]}));
   // 묶음 B: 2명만
   collabRequests.push(mk('L-B1',{title:'일부묶음',collabGroupId:'g-B',assigneeUser:'결제가',status:'pending'}),mk('L-B2',{title:'일부묶음',collabGroupId:'g-B',assigneeUser:'결제다',status:'pending'}));
   collabNotifications.push({id:'nL1',type:'collab-requested',ticketId:'L-A3',title:'본부전체묶음',toUser:'결제다',toDept:'payment',date:'2026-10-20',read:false});
   navigate('collab-center',document.getElementById('nav-collab-center'));
   r.btnShown=!document.getElementById('collab-merge-legacy-btn').classList.contains('hidden')&&document.getElementById('collab-merge-legacy-cnt').textContent==='2묶음';
   openCollabMergeLegacy();
   const a=collabRequests.filter(x=>x.title==='본부전체묶음'), b=collabRequests.filter(x=>x.title==='일부묶음');
   r.oneEach=a.length===1&&b.length===1;
   r.deptWide=a[0].assigneeUser===''&&!a[0].assigneeUsers&&!a[0].collabGroupId;
   r.status=a[0].status==='completed'&&a[0].id==='L-A2'&&a[0].handledBy==='결제나'&&a[0].completeDetail==='처리함';
   r.comments=(a[0].comments||[]).map(c=>c.id).join()==='c2,c1';
   r.multi=b[0].assigneeUsers&&b[0].assigneeUsers.join()==='결제가,결제다';
   r.notiMoved=collabNotifications.find(n=>n.id==='nL1').ticketId==='L-A2';
   r.history=(a[0].edits||[]).some(e=>(e.changes||[]).some(c=>c.label==='예전 묶음 정리'));
   r.btnHidden=document.getElementById('collab-merge-legacy-btn').classList.contains('hidden');
   // 본부 사람 모두에게 보이는지 (조회 범위 '본인' 직원 결제나 기준)
   r.visibleToMember=collabIsDeptWideFor(a[0],'payment');
   collabRequests.splice(before); collabNotifications.splice(collabNotifications.findIndex(n=>n.id==='nL1'),1);
   localUsers.splice(0,localUsers.length,...saved);
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
