// 사용법: node tools/e2e-exec-all-staff.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — ① 경영 현황판: 권한을 켠 그룹은 직급과 관계없이 조회 ② 인바운드 문제 건을 인바운드 화면과 같은 기준으로
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8886,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];const pg=await br.newPage();await pg.setViewport({width:1400,height:900});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8886/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const lv=c=>(orgRanks.find(x=>x.cls===c)||{}).id;
  const mgr={id:'u2',name:'영매니저',dept:'sales',groupId:'sales',level:lv('manager'),email:'u2@x.kr',rank:''};
  const opsM={id:'u3',name:'운매니저',dept:'ops',groupId:'ops',level:lv('manager'),email:'u3@x.kr',rank:''};
  localUsers.push(mgr,opsM);
  // 영업 그룹에만 경영 현황판 권한
  const g=permissionGroups.find(x=>x.id==='sales'); if(g.permissions.indexOf('exec-center')<0) g.permissions.push('exec-center');
  const og=permissionGroups.find(x=>x.id==='ops'); og.permissions=og.permissions.filter(p=>p!=='exec-center');
  const out={};
  enterApp(mgr);await sleep(150);
  out.navMgr=!document.getElementById('nav-exec-center').classList.contains('hidden');
  navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(200);
  out.openMgr=!document.getElementById('sec-exec-center').classList.contains('hidden');
  enterApp(opsM);await sleep(150);
  out.navOps=!document.getElementById('nav-exec-center').classList.contains('hidden');
  navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(150);
  out.openOps=!document.getElementById('sec-exec-center').classList.contains('hidden');
  // 인바운드 기준
  const now=new Date(), ago=m=>{const d=new Date(now-m*60000);return ymd(d)+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
  const rec=(id,o)=>Object.assign({id,inDate:ymd(now),company:id,phone:'010',kob:{extras:[]}},o);
  inboundRecords=[
   rec('SPAM',{spam:true,inAt:ago(500),kob:{extras:[]}}),                                   // 스팸 — 제외
   rec('EXTRA',{inAt:ago(500),kob:{dept:'영업',owner:'영매니저',extras:[{at:'x'}]}}),       // 추가 컨택만 있음 — 컨택한 것
   rec('RESULT',{inAt:ago(500),kob:{dept:'영업',owner:'영매니저',result:'보류',extras:[]}}), // 결과 입력 — 처리 중
   rec('FRESH',{inAt:ago(10),kob:{extras:[]}}),                                             // 10분 전 미배정 — 기준 전
   rec('OLDUN',{inAt:ago(90),kob:{extras:[]}}),                                             // 90분 미배정 — 배정 지연
   rec('NOCON',{inAt:ago(300),kob:{dept:'영업',owner:'영매니저',extras:[]}}),               // 300분 미컨택 — 미컨택
   rec('STOP',{inAt:ago(900),kob:{dept:'영업',owner:'영매니저',contactAt:ymd(now),extras:[{at:1},{at:2},{at:3}]}}), // 추가 컨택 3회
   rec('WON',{inAt:ago(900),kob:{dept:'영업',owner:'영매니저',result:'영업수주',extras:[]}})  // 수주 — 완료
  ];
  const items=execCollectItems().filter(i=>i.kind==='inbound');
  out.ids=items.map(i=>i.id).sort().join();
  out.issues=items.filter(i=>i.issue).map(i=>i.id+':'+i.issue).sort();
  // 인바운드 화면 기준 숫자: 기준 시간 초과 + 추가 컨택 도달(결과 없음)
  const live=inboundLive(); const inbLate=live.filter(x=>inboundLate(x)).length; const inbStop=live.filter(x=>!(x.kob||{}).result&&inboundStopped(x)).length;
  out.inb={late:inbLate,stop:inbStop}; out.execIssue=items.filter(i=>i.issue).length;
  return out;});
 ok(r.navMgr&&r.openMgr,'권한 켠 그룹의 매니저 → 메뉴 보이고 경영 현황판 열림 (예전엔 대표급만)',r);
 ok(!r.navOps&&!r.openOps,'권한 없는 그룹 → 메뉴 숨김 · 열리지 않음',r);
 ok(!/SPAM/.test(r.ids),'스팸 건은 경영 현황판에서 제외',r.ids);
 ok(!r.issues.some(x=>/^(EXTRA|RESULT|FRESH|WON):/.test(x)),'추가 컨택만 있는 건 · 결과 입력 건 · 기준 시간 전 건 · 수주 건은 문제 아님',r.issues);
 ok(r.issues.some(x=>/^OLDUN:배정 지연/.test(x))&&r.issues.some(x=>/^NOCON:미컨택/.test(x))&&r.issues.some(x=>/^STOP:추가컨택 3회/.test(x)),'배정 지연 · 미컨택 · 추가 컨택 도달은 문제',r.issues);
 ok(r.execIssue===r.inb.late+r.inb.stop,`경영 현황판 인바운드 문제 ${r.execIssue}건 = 인바운드 화면 기준 초과 ${r.inb.late} + 추가 컨택 도달 ${r.inb.stop}`,r);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
