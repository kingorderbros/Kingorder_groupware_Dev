// 사용법: node tools/e2e-team-overview-scope.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-23 — 팀 통합현황 조회 범위: 팀장 = 자기 팀, 본부장 = 자기 본부, 대표 · 관리자 = 전사, 매니저 = 본인
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8878,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];const pg=await br.newPage();await pg.setViewport({width:1400,height:900});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8878/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const lv=c=>(orgRanks.find(x=>x.cls===c)||{}).id||c;
  const U=[['u1','대표','admin','',lv('exec'),'admin'],['u2','영본','sales','',lv('head'),'sales'],['u3','영1장','sales','영업1팀',lv('leader'),'sales'],['u4','영1원','sales','영업1팀',lv('manager'),'sales'],
    ['u5','영2장','sales','영업2팀',lv('leader'),'sales'],['u6','영2원','sales','영업2팀',lv('manager'),'sales'],['u7','운본','ops','',lv('head'),'ops'],['u8','운원','ops','설치팀',lv('manager'),'ops'],
    ['u9','영1퇴','sales','영업1팀',lv('manager'),'sales']].map(([id,name,dept,team,level,groupId])=>({id,name,dept,team,level,groupId,rank:'',email:id+'@x.kr'}));
  U[8].resigned=true;localUsers.push(...U);
  const vis=n=>{const u=U.find(x=>x.name===n);return getVisibleMembers(u.name,u.dept,u.level).map(x=>x.name).filter(x=>U.some(y=>y.name===x)).sort();};
  const out={ceo:vis('대표'),head:vis('영본'),lead1:vis('영1장'),lead2:vis('영2장'),mgr:vis('영1원'),ops:vis('운본')};
  enterApp(U[2]);await sleep(150);navigate('team-overview',document.getElementById('nav-team-overview'));await sleep(250);
  out.cards=[...document.querySelectorAll('#team-overview-grid p.font-semibold.truncate')].map(p=>p.textContent.trim()).sort();
  out.sub=(document.getElementById('team-overview-sub')||{}).innerText||'';
  out.filterHidden=document.getElementById('team-overview-dept-filter').classList.contains('hidden');
  // 설정 화면 — 관리자로 바꿔 들어가서 범위 변경
  enterApp(U[0]);await sleep(150);
  navigate('settings',document.getElementById('nav-settings'));await sleep(150);
  if(typeof setSettingsTab==='function')setSettingsTab('team-perm');await sleep(150);
  out.tabShown=!document.getElementById('sec-settings-team-perm').classList.contains('hidden');
  out.levelRows=[...document.querySelectorAll('#team-perm-level-body select')].map(x=>x.getAttribute('data-team-level')+':'+x.value);
  // 팀장급을 '자기 본부'로
  const leadSel=document.querySelector(`[data-team-level="${U[2].level}"]`);leadSel.value='dept';leadSel.dispatchEvent(new Event('change'));
  // 영본에게 예외: 자기 본부 + 운영본부
  const add=document.getElementById('team-perm-user-add');add.value='u2';add.onchange.call(add);
  const ovSel=document.querySelector('[data-team-override="u2"]');ovSel.value='custom';ovSel.dispatchEvent(new Event('change'));
  const cb=document.querySelector('[data-team-override-dept="u2"][value="ops"]');cb.checked=true;
  saveTeamViewPermissions();await sleep(50);
  out.saved=JSON.parse(kobStorage.getItem('gwTeamViewPerm.v1')||'null');
  out.after={lead1:vis('영1장'),head:vis('영본'),ops:vis('운본')};
  // 예외 끄기 → 기본값으로
  document.querySelector('[data-team-override-en="u2"]').checked=false;saveTeamViewPermissions();
  out.offHead=vis('영본');
  return out;});
 ok(r.ceo.length===8&&!r.ceo.includes('영1퇴'),'대표: 전사 (퇴사자 제외)',r.ceo);
 ok(r.head.join()===['영1원','영1장','영2원','영2장','영본'].sort().join(),'본부장: 자기 본부 직원만 (운영본부 안 보임)',r.head);
 ok(r.lead1.join()===['영1원','영1장'].sort().join(),'팀장: 자기 팀(영업1팀)만',r.lead1);
 ok(r.lead2.join()===['영2원','영2장'].sort().join(),'다른 팀장: 영업2팀만',r.lead2);
 ok(r.mgr.join()==='영1원','매니저: 본인만',r.mgr);
 ok(r.ops.join()===['운본','운원'].sort().join(),'운영본부장: 운영본부만',r.ops);
 ok(r.cards.length===2&&r.cards.every(c=>/영1/.test(c)),'팀장 화면 카드 2명',r.cards);
 ok(/영업1팀/.test(r.sub)&&!/크로스체크/.test(r.sub)&&r.filterHidden,'안내에 팀 이름, 부서 선택 숨김',r.sub);
 ok(r.tabShown&&r.levelRows.length>=2&&r.levelRows.some(x=>/:team$/.test(x))&&r.levelRows.some(x=>/:dept$/.test(x)),'설정 › 팀 통합현황 조회 범위 탭 (팀장급 기본 자기 팀, 본부장급 기본 자기 본부)',r.levelRows);
 ok(r.saved&&r.saved.userOverrides&&r.saved.userOverrides.u2&&r.saved.userOverrides.u2.depts.includes('ops'),'저장 — 직급 값 · 예외 저장됨',r.saved);
 ok(r.after.lead1.length===5&&r.after.lead1.includes('영2원'),'팀장급을 자기 본부로 바꾸면 영업본부 전체',r.after.lead1);
 ok(r.after.head.includes('운원')&&r.after.head.includes('영1원')&&r.after.head.length===7,'본부장 예외 — 자기 본부 + 운영본부',r.after.head);
 ok(r.after.ops.join()===['운본','운원'].sort().join(),'예외 없는 운영본부장은 그대로',r.after.ops);
 ok(r.offHead.length===5&&!r.offHead.includes('운원'),'예외 사용 끄면 기본값(자기 본부)',r.offHead);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
