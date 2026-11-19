// 사용법: node tools/e2e-ops-progress-optional.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-19 — 권한 '영업 업무 · 인바운드 진행 내역 입력 선택'(ops-progress-optional): 운영 그룹 기본, 관리자가 끄면 유지,
//              이 권한이 있는 담당자는 진행 내역 없이 진행중 · 완료, 지체 · 지연 사유 · 완료 확인 요구 안 함
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
const USERS=[{id:'u1',name:'박배정',dept:'sales',groupId:'sales'},{id:'u2',name:'김담당',dept:'sales',groupId:'sales'},{id:'u3',name:'최운영',dept:'ops',groupId:'ops'},{id:'u4',name:'정관리',dept:'admin',groupId:'admin'}];
const URL='http://localhost:8868/';
srv.listen(8868,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 // ---------- 권한 기본값 · 저장된 설정 ----------
 {
  console.log('■ 권한 기본값 · 저장된 설정');
  const pg=await br.newPage();pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto(URL,{waitUntil:'networkidle0'});
  const has=()=>pg.evaluate(()=>{const f=id=>(permissionGroups.find(g=>g.id===id)||{permissions:[]}).permissions.includes('ops-progress-optional');return {ops:f('ops'),sales:f('sales'),mgmt:f('management'),admin:f('admin'),menu:!!MENU_BY_ID['ops-progress-optional']};});
  const a=await has();
  ok(a.menu&&a.ops&&!a.sales&&!a.mgmt&&a.admin,'권한 관리 메뉴에 표시 · 기본은 운영 그룹만 (영업 · 경영진 아님)',a);
  // 예전 저장 설정(seeded 없음) → 운영 그룹에 채워 줌
  await pg.evaluate(()=>{const g=permissionGroups.map(x=>({id:x.id,permissions:x.permissions.filter(p=>p!=='ops-progress-optional')}));kobStorage.setItem('gwPermissionGroups.v2',JSON.stringify({version:2,removed:[],groups:g}));});
  await pg.reload({waitUntil:'networkidle0'});
  const b=await has();ok(b.ops&&!b.sales,'예전 저장 설정에도 운영 그룹에 한 번 채워 줌',b);
  // 관리자가 끄고 저장 → 다시 켜지지 않음
  await pg.evaluate(()=>{const g=permissionGroups.find(x=>x.id==='ops');g.permissions=g.permissions.filter(p=>p!=='ops-progress-optional');savePermissionGroups();});
  await pg.reload({waitUntil:'networkidle0'});
  const c=await has();const seeded=await pg.evaluate(()=>JSON.parse(kobStorage.getItem('gwPermissionGroups.v2')).seeded);
  ok(!c.ops&&seeded.includes('ops-progress-optional'),'관리자가 끄고 저장하면 다시 켜지지 않음',{c,seeded});
  // 영업 그룹에 켜면 그대로 유지
  await pg.evaluate(()=>{const g=permissionGroups.find(x=>x.id==='sales');g.permissions.push('ops-progress-optional');savePermissionGroups();});
  await pg.reload({waitUntil:'networkidle0'});
  const d=await has();ok(d.sales&&!d.ops,'다른 그룹에 켠 것도 저장 · 유지',d);
  await pg.evaluate(()=>kobStorage.removeItem('gwPermissionGroups.v2'));
  await pg.close();
 }
 for(const [vw,vh] of [[1400,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<700,hasTouch:vw<700});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  const alerts=[];pg.on('dialog',d=>{alerts.push(d.message());d.accept();});
  await pg.goto(URL,{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async(USERS)=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const list=USERS.map(u=>Object.assign({email:u.id+'@x.kr',level:'manager',team:''},u));localUsers.push(...list);
   const S=WORK_CENTERS.sales;S.works=S.works.filter(x=>!/^S-T-/.test(x.id));
   const base={center:'sales',type:'activity',category:'proposal',sub:'제안서 발송',priority:'normal',receivedAt:'2026-11-10',receivedTime:'09:00',channel:'전화',receiver:'박배정',customerId:'',memo:'',extra:{}};
   S.works.push(Object.assign({},base,{id:'S-T-1',title:'설치 일정 협의 - 운영 담당',status:'received'}),Object.assign({},base,{id:'S-T-2',title:'영업 담당 건',status:'received'}),Object.assign({},base,{id:'S-T-3',title:'관리자 담당 건',status:'received'}));
   const w=id=>S.works.find(x=>x.id===id);
   const modal=()=>document.getElementById('sales-prog-modal');
   const shown=()=>modal()&&!modal().classList.contains('hidden');
   const out={};
   enterApp(list[0]);await sleep(80);
   assignWork('sales','S-T-1','최운영');assignWork('sales','S-T-2','김담당');assignWork('sales','S-T-3','정관리');
   out.opt={ops:salesProgOptional(w('S-T-1')),sales:salesProgOptional(w('S-T-2')),admin:salesProgOptional(w('S-T-3'))};
   // 운영 담당: 수락 → 창 없이 바로 진행중
   enterApp(list[2]);await sleep(80);
   workAssignAction('sales','S-T-1','accept');
   out.acceptDirect={status:w('S-T-1').status,modal:shown()};
   if(shown())closeSalesProgress();
   // 지체 · 지연 표시 없음
   w('S-T-1').workingSince=ymd(new Date(Date.now()-6*86400000))+' 09:00';
   w('S-T-1').dueDate=ymd(new Date(Date.now()-2*86400000));
   const st=salesProgState(w('S-T-1'));out.flags={stall:st.stall,lateNeed:st.lateNeed,late:st.late,html:salesProgFlagsHtml(w('S-T-1'))};
   const ex=execCollectItems().find(i=>i.id==='S-T-1');out.exec={issue:ex.issue,overdue:ex.overdue};
   // 원하면 진행 내역 입력 가능 · 창에 안내
   openSalesProgress('sales','S-T-1','log');
   out.note=/진행 내역 입력 선택/.test(modal().innerText)&&!!document.getElementById('sales-prog-kind');
   document.getElementById('sales-prog-method').value='방문';document.getElementById('sales-prog-text').value='현장 확인';submitSalesProgress();
   out.logged=salesProgLog(w('S-T-1')).some(e=>e.text==='현장 확인');
   closeSalesProgress();
   // 완료 → 창 없이 바로 완료 · 완료 확인 요구 없음
   salesWorkStatusClick('sales','S-T-1','done');
   const s2=salesProgState(w('S-T-1'));out.done={status:w('S-T-1').status,modal:shown(),need:s2.needCheck,html:salesProgFlagsHtml(w('S-T-1'))};
   if(shown())closeSalesProgress();
   // 영업 담당 · 관리자 담당은 예전처럼 착수 입력 창
   enterApp(list[1]);await sleep(80);
   workAssignAction('sales','S-T-2','accept');out.salesModal={modal:shown(),status:w('S-T-2').status};closeSalesProgress();
   // 인바운드 — 운영 그룹 담당자가 결과를 영업수주로 저장해도 완료 내용 창을 띄우지 않음, 완료 확인 대기 아님
   inboundRecords=inboundRecords.filter(x=>!/^IN-T-/.test(x.id));
   inboundRecords.unshift({id:'IN-T-1',inDate:'2026-11-18',inAt:'2026-11-18 10:00',company:'역삼분식',name:'홍',phone:'010',routes:[],services:[],needs:[],kob:{contactAt:'',salesStatus:'',result:'',failReason:'',owner:'최운영',extras:[],dept:'영업'}});
   enterApp(list[2]);await sleep(80);
   openInboundModal('IN-T-1');onInboundResultChange('영업수주');saveInbound();
   const v=salesProgFind('inbound','IN-T-1');out.inb={modal:shown(),status:v.status,need:salesProgState(v).needCheck,html:salesProgFlagsHtml(v)};
   if(shown())closeSalesProgress();
   return out;},USERS);
  ok(r.opt.ops&&!r.opt.sales&&!r.opt.admin,'권한 판단: 운영 그룹 담당자만 (영업 · 관리자 그룹 담당자 아님)',r.opt);
  ok(r.acceptDirect.status==='working'&&!r.acceptDirect.modal,'운영 담당자는 수락하면 착수 입력 없이 바로 진행중',r.acceptDirect);
  ok(r.flags.stall===0&&!r.flags.lateNeed&&r.flags.late===2&&!/지체|사유 미입력/.test(r.flags.html),'지체 표시 · 지연 사유 요구 없음 (예정일 지남은 표시)',r.flags);
  ok(!/지연 사유|지체/.test(r.exec.issue)&&r.exec.overdue===2,'경영현황판에도 지연 사유 · 지체 문제로 잡지 않음',r.exec);
  ok(r.note&&r.logged,'진행 내역 창에 권한 안내 · 원하면 입력 가능',r);
  ok(r.done.status==='done'&&!r.done.modal&&!r.done.need&&!/완료 확인 대기|완료 내용 미입력/.test(r.done.html),'완료도 바로 · 완료 확인 요구 없음',r.done);
  ok(r.salesModal.modal&&r.salesModal.status==='assigned','영업 담당자는 예전처럼 착수 내용 입력 창',r.salesModal);
  ok(!r.inb.modal&&r.inb.status==='done'&&!r.inb.need&&!/완료 내용 미입력/.test(r.inb.html),'인바운드도 운영 담당자는 완료 내용 창 · 완료 확인 요구 없음',r.inb);
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
