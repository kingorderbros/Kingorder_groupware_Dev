// 사용법: node tools/e2e-calendar-team-default.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-23 — 일정 조회 권한 기본값: 매니저급도 같은 부서의 팀별 일정을 봄 (예전 기본값 '본인 일정만' → '자기 부서')
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8884,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];const pg=await br.newPage();await pg.setViewport({width:1400,height:900});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8884/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  orgDepts.push({id:'dept1',name:'KOP',order:7,hideInOrg:true},{id:'dept2',name:'기술영업본부',order:8});syncOrgAll();
  const lv=c=>(orgRanks.find(x=>x.cls===c)||{}).id;
  const U=[['u1','대표','admin','admin',lv('exec')],['u2','정지상','dept2','sales',lv('leader')],['u3','기매니저','dept2','sales',lv('manager')],['u5','케이실장','dept1','kop',lv('leader')],['u6','영팀장','sales','sales',lv('leader')],['u7','영본부장','sales','sales',lv('head')],['u8','영매니저','sales','sales',lv('manager')]].map(([id,name,dept,groupId,level])=>({id,name,dept,groupId,level,email:id+'@x.kr',rank:''}));
  localUsers.push(...U);
  const t=ymd(new Date());
  const team={id:'sx1',title:'기술영업 팀 일정',date:t,allDay:true,calendar:'team',dept:'dept2',type:'meeting',salesperson:'정지상'};
  const mine={id:'sx2',title:'영업 팀 일정',date:t,allDay:true,calendar:'team',dept:'sales',type:'meeting',salesperson:'영팀장'};
  const personal={id:'sx3',title:'개인',date:t,allDay:true,calendar:'personal',dept:'dept2',type:'meeting',salesperson:'정지상'};
  schedules.push(team,mine,personal);
  const out={};
  U.forEach(u=>{out[u.name]={team:canUserViewSchedule(team,u),mine:canUserViewSchedule(mine,u),personal:canUserViewSchedule(personal,u)};});
  out.notify=scheduleNewViewers(team).sort().join();
  // 설정에서 매니저를 '본인 일정만'으로 저장하면 그 값을 따름
  calendarLevelScope.manager='self';out.savedSelf=canUserViewSchedule(team,U[2]);calendarLevelScope.manager='dept';
  // 화면 — 기술영업 매니저로 들어가 캘린더에 팀 일정이 보이는지
  enterApp(U[2]);await sleep(150);navigate('calendar-center',document.getElementById('nav-calendar-center'));await sleep(250);
  out.screen=/기술영업 팀 일정/.test(document.getElementById('sec-calendar-center').innerText);
  return out;});
 ok(r['기매니저'].team,'기술영업본부 매니저 → 같은 본부 팀별 일정 보임 (예전엔 안 보임)',r['기매니저']);
 ok(r['정지상'].team&&r['대표'].team&&r['영본부장'].team,'등록자(팀장) · 대표 · 다른 본부 본부장은 그대로 보임');
 ok(!r['영팀장'].team&&!r['영매니저'].team&&!r['케이실장'].team,'다른 본부 팀장 · 매니저 · KOP 실장은 그대로 안 보임 (자기 부서만)',r);
 ok(r['영매니저'].mine,'영업본부 매니저 → 자기 본부 팀별 일정 보임');
 ok(!r['기매니저'].personal&&!r['대표'].personal,'개인 일정은 등록자만 (변경 없음)');
 ok(/u3/.test(r.notify)&&!/u6|u8|u5/.test(r.notify),'새 일정 알림도 같은 본부 매니저까지 (다른 본부 제외)',r.notify);
 ok(r.savedSelf===false,'설정에서 매니저를 본인 일정만으로 저장하면 그 값을 따름');
 ok(r.screen,'기술영업 매니저 캘린더 화면에 팀 일정 표시');
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
