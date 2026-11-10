// 사용법: node tools/e2e-resigned-hidden.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-10 — 퇴사자는 팀 통합현황 등 그룹웨어 표시에서 모두 뺍니다 (작성·담당한 자료는 그대로)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
srv.listen(8863,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
 await pg.goto('http://localhost:8863/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const r=await pg.evaluate(()=>{
   const o={};
   // 운영본부 직원 한 명을 퇴사 처리
   localUsers.push({id:'e2e-rs1',name:'퇴사시험',dept:'ops',team:'',rank:'매니저',level:'manager',email:'e2e-rs1@test.local',groupId:'ops'},{id:'e2e-rs2',name:'근무시험',dept:'ops',team:'',rank:'매니저',level:'manager',email:'e2e-rs2@test.local',groupId:'ops'});const u=localUsers.find(x=>x.id==='e2e-rs1');const N=u.name;o.who=N;
   u.birth=u.birth||'1990-'+ymd(new Date()).slice(5);
   u.resigned=true;u.resignedAt=ymd(new Date());
   // 팀 통합현황
   o.team=getVisibleMembers(currentUserName,currentUserDept,currentUserLevel).some(m=>m.name===N);
   navigate('team-overview',document.getElementById('nav-team-overview'));
   o.teamDom=(document.getElementById('team-overview-grid')||{innerText:''}).innerText.includes(N);
   // 경영 현황판 — 그 사람 담당 건이 있어도 줄에 안 나옴
   execItems.push({owner:N,dept:u.dept,done:false,title:'시험'});
   o.exec=execStaffList().some(s=>s.name===N);
   // 업무센터 담당자 목록 · 이미 지정된 값은 남김
   o.wcStaff=wcStaffOf(u.dept).includes(N);o.wcStaffKeep=wcStaffOf(u.dept,[N]).includes(N);
   // 달력 생일
   o.bday=birthdaySchedules().some(s=>String(s.title||'').includes(N)||String(s.salesperson||'').includes(N));
   // 승인권자 후보
   o.appr=APPROVAL_FEATURES.some(f=>getApproverCandidates(f.id).some(c=>c.value===N));
   // 사람 고르기 트리 — 안 골랐으면 없음, 골라져 있으면 남음
   const html1=ptreeRowsHtml(localUsers,x=>`<i data-n="${x.name}"></i>`,{multi:true,isOpen:()=>false});
   const html2=ptreeRowsHtml(localUsers,x=>`<i data-n="${x.name}"></i>`,{multi:true,isOpen:x=>x.name===N});
   o.ptree=html1.includes(`data-n="${N}"`);o.ptreeKeep=html2.includes(`data-n="${N}"`);
   // 조직도 · 통합현황 숫자에 다른 직원은 그대로
   o.othersStay=getVisibleMembers(currentUserName,currentUserDept,currentUserLevel).some(m=>m.name==='근무시험')&&wcStaffOf('ops').includes('근무시험');
   // 사용자 관리(관리자 화면)에는 퇴사자로 남음 — 복직 처리를 위해
   renderUsers();o.adminList=(document.getElementById('user-list-body')||document.body).innerHTML.includes(N);
   return o;});
 const res=[];const ok=(n,c)=>res.push([n,!!c]);
 ok('팀 통합현황 목록에서 빠짐',!r.team);ok('팀 통합현황 화면에 이름 없음',!r.teamDom);
 ok('경영 현황판 직원 줄에서 빠짐',!r.exec);
 ok('업무센터 담당자 목록에서 빠짐',!r.wcStaff);ok('이미 지정된 담당자는 남음',r.wcStaffKeep);
 ok('달력 생일 표시 안 함',!r.bday);ok('승인권자 후보에서 빠짐',!r.appr);
 ok('사람 고르기 트리에서 빠짐',!r.ptree);ok('지금 골라져 있으면 트리에 남음',r.ptreeKeep);
 ok('다른 직원은 그대로',r.othersStay);ok('사용자 관리에는 남음(복직용)',r.adminList);
 console.log('대상:',r.who);res.forEach(([n,c])=>console.log((c?'✓ ':'✗ ')+n));
 console.log('errors:',errs.length?errs:'없음');const fail=res.filter(x=>!x[1]).length+errs.length;console.log(fail?`실패 ${fail}`:`통과 ${res.length}`);
 await br.close();srv.close();process.exit(fail?1:0);});
