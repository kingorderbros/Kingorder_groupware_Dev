// 사용법: node tools/e2e-org-dept-hide.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 본부 '조직도 표시' 선택 (2026-10-17) — 숨긴 본부는 조직도에서만 빠지고 조직도 관리에는 남는지 확인합니다.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8797,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1280,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8797/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   // 1) 새 본부를 '조직도에 표시' 해제로 만들기 — 화면의 모달을 그대로 씁니다
   openOrgDeptModal();
   r.showWrapVisible=!document.getElementById('org-unit-show-wrap').classList.contains('hidden');
   r.defaultChecked=document.getElementById('org-unit-show').checked;
   document.getElementById('org-unit-name').value='숨김본부';
   document.getElementById('org-unit-show').checked=false;
   submitOrgUnit({preventDefault(){}});
   const d=orgDepts.find(x=>x.name==='숨김본부'); r.created=!!d; r.hideFlag=d&&d.hideInOrg;
   // 구성원 한 명을 그 본부에 둡니다
   // 시험용 구성원 — 모의 환경에는 직원이 없어서 한 명 넣습니다
   const u={id:'e2e-hide-1',name:'숨김시험직원',dept:d.id,rank:'사원',team:'',email:'e2e-hide@test.local',groupId:'staff'};
   localUsers.push(u); r.member=u.name; const before=null;
   navigate('org-chart',document.getElementById('nav-org-chart'));
   const chart=document.getElementById('sec-org-chart').innerText;
   r.chartHasDept=chart.includes('숨김본부'); r.chartHasMember=chart.includes(u.name);
   setOrgView('card'); const card=document.getElementById('sec-org-chart').innerText;
   r.cardHasDept=card.includes('숨김본부'); r.cardHasMember=card.includes(u.name);
   navigate('management-org',document.getElementById('nav-management-org'));
   const mng=document.getElementById('sec-management-org').innerText;
   r.manageHasDept=mng.includes('숨김본부'); r.manageHasBadge=mng.includes('조직도 미표시'); r.manageHasMember=mng.includes(u.name);
   // 2) 수정 창에서 다시 표시로 바꾸면 조직도에 나타나는지
   openOrgDeptModal(d.id); r.editChecked=document.getElementById('org-unit-show').checked;
   document.getElementById('org-unit-show').checked=true; submitOrgUnit({preventDefault(){}});
   r.flagAfterShow=('hideInOrg' in d);
   setOrgView('tree'); navigate('org-chart',document.getElementById('nav-org-chart'));
   r.chartHasDeptAfterShow=document.getElementById('sec-org-chart').innerText.includes('숨김본부');
   // 팀 모달에서는 표시 선택이 보이지 않아야 합니다
   openOrgTeamModal(d.id); r.teamShowWrapHidden=document.getElementById('org-unit-show-wrap').classList.contains('hidden'); closeOrgUnitModal();
   localUsers.splice(localUsers.indexOf(u),1);
   return r;
 });
 const expect={showWrapVisible:true,defaultChecked:true,created:true,hideFlag:true,chartHasDept:false,chartHasMember:false,cardHasDept:false,cardHasMember:false,manageHasDept:true,manageHasBadge:true,manageHasMember:true,editChecked:false,flagAfterShow:false,chartHasDeptAfterShow:true,teamShowWrapHidden:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과', '· 오류', errs.length, JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
