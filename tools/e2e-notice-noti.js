// 사용법: node tools/e2e-notice-noti.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-06 — 공지 등록 시 사내 직원에게 알림, 수정 때는 안 보냄, 알림을 누르면 마이 대시보드로.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8863,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1400,height:900});await pg.goto('http://localhost:8863/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{
  localUsers.length=0;const add=(id,name,dept,extra)=>localUsers.push(Object.assign({id,name,dept,team:'',email:id+'@x.kr',groupId:dept,level:'manager'},extra||{}));
  add('a','쓴사람','management',{isAdmin:true});add('b','직원하나','sales');add('c','직원둘','ops');add('d','휴직자','ops',{leaveStatus:'휴직',onLeave:true});add('e','퇴사자','ops',{resigned:true,status:'퇴사'});add('f','외주','vendor',{groupId:'vendor'});
  enterApp(localUsers[0]);collabNotifications.length=0;const sent=[];window.kobPush={send:(n,l)=>sent.push([n.toUser,l]),};
  const fill=(t,c)=>{document.getElementById('notice-title').value=t;document.getElementById('notice-content').value=c;document.getElementById('notice-date').value='2026-11-06';};
  document.getElementById('edit-notice-id').value='';fill('창립기념일 행사','내용입니다');submitNotice({preventDefault(){}});
  const first=collabNotifications.map(n=>({to:n.toUser,type:n.type,title:n.title,detail:n.detail,noticeId:n.noticeId}));
  const id=notices[0].id;const cnt=collabNotifications.length;document.getElementById('edit-notice-id').value=id;fill('창립기념일 행사(수정)','내용');submitNotice({preventDefault(){}});const afterEdit=collabNotifications.length;
  const onLeave=isOnLeave(localUsers[3]),resigned=isResigned(localUsers[4]);
  const js=notiClickJs(collabNotifications[0]);currentUserName='직원하나';currentUserRole='sales';const mine=myNotifications().map(n=>n.title);refreshNotiBell();const html=(typeof NOTI_STYLE!=='undefined')?NOTI_STYLE['notice-new'].label:'';
  navigate('org-chart',document.getElementById('nav-org-chart'));eval(js);await new Promise(r=>setTimeout(r,300));
  return{first,cnt,afterEdit,sent,onLeave,resigned,mine,label:html,dashOpen:!document.getElementById('sec-dashboard-personal').classList.contains('hidden')};});
 const to=r.first.map(x=>x.to);console.log(JSON.stringify(to),'휴직판정',r.onLeave,'퇴사판정',r.resigned);
 ok(to.includes('직원하나')&&to.includes('직원둘'),'직원에게 알림',to);ok(!to.includes('쓴사람'),'쓴 사람 제외',to);ok(!to.includes('외주'),'사외 계정 제외',to);if(r.onLeave)ok(!to.includes('휴직자'),'휴직자 제외',to);if(r.resigned)ok(!to.includes('퇴사자'),'퇴사자 제외',to);
 ok(r.first.every(x=>x.type==='notice-new'&&x.title==='창립기념일 행사'&&x.detail==='내용입니다'&&x.noticeId),'알림 내용',r.first[0]);ok(r.afterEdit===r.cnt,'수정할 때는 안 보냄',[r.cnt,r.afterEdit]);ok(r.sent.length===r.cnt&&r.sent[0][1]==='공지사항','폰 · PC 알림도 전송',r.sent.slice(0,2));ok(r.mine.includes('창립기념일 행사'),'받는 사람 알림함에 표시',r.mine);ok(r.dashOpen,'알림을 누르면 마이 대시보드');ok(errs.length===0,'페이지 오류 없음',errs);
 console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
