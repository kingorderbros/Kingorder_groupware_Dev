// 사용법: node tools/e2e-org-parts.js . [스크린샷폴더]   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 — 조직도 팀 아래 파트: 아무 팀에나 파트 추가 · 구성원 파트 지정 · 계층도/카드에 파트별 표시 · 이름 수정 시 구성원 따라감 · 삭제 시 팀 소속으로 남음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.',SHOT=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8807,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1500,height:1000});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8807/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const team=orgTeams.find(t=>t.deptId==='ops'&&t.name==='운영팀');
   r.hasTeam=!!team; if(!team) return r;
   const ppl=[['e2e-p0','운영팀장시험','팀장',''],['e2e-p1','파트원가','매니저',''],['e2e-p2','파트원나','매니저','']].map(([id,name,rank])=>({id,name,dept:'ops',team:'운영팀',rank,email:id+'@test.local',groupId:'ops'}));
   ppl.forEach(u=>localUsers.push(u));
   // 파트 2개 추가 (창 통해서)
   const addPart=(nm)=>{ openOrgPartModal('ops',team.id); document.getElementById('org-unit-name').value=nm; submitOrgUnit({preventDefault(){}}); };
   addPart('시험1파트'); addPart('시험2파트');
   r.parts=orgPartNamesOf('ops','운영팀').filter(n=>n.startsWith('시험')).join(',');
   r.dupBlocked=(()=>{ const n=orgPartsOfTeam(team).length; addPart('시험1파트'); closeOrgUnitModal(); return orgPartsOfTeam(team).length===n; })();
   // 구성원 편집 창에서 파트 고르기
   openOrgEdit('e2e-p1');
   r.partFieldShown=!document.getElementById('org-edit-part-wrap').classList.contains('hidden');
   document.getElementById('org-edit-part').value='시험1파트';
   submitOrgEdit({preventDefault(){}});
   r.saved=(localUsers.find(u=>u.id==='e2e-p1')||{}).part==='시험1파트';
   localUsers.find(u=>u.id==='e2e-p2').part='시험2파트';
   // 계층도
   navigate('org-chart',document.getElementById('nav-org-chart')); setOrgView('tree');
   const tree=document.getElementById('sec-org-chart').innerText;
   r.treeParts=tree.includes('시험1파트')&&tree.includes('시험2파트');
   r.leaderInTeamBox=[...document.querySelectorAll('#sec-org-chart .org-stem')].some(e=>e.innerText.includes('운영팀')&&e.innerText.includes('운영팀장시험'));
   window.__treeDone=1;
   return r;
 });
 if(SHOT) await pg.screenshot({path:SHOT+'/parts-tree.png',fullPage:true});
 const out2=await pg.evaluate(()=>{
   const r={};
   setOrgView('card');
   const card=document.getElementById('sec-org-chart').innerText;
   r.cardParts=card.includes('시험1파트')&&card.includes('파트원가');
   return r;
 });
 if(SHOT) await pg.screenshot({path:SHOT+'/parts-card.png',fullPage:true});
 const out3=await pg.evaluate(()=>{
   const r={};
   const team=orgTeams.find(t=>t.deptId==='ops'&&t.name==='운영팀');
   const p1=orgPartsOfTeam(team).find(p=>p.name==='시험1파트');
   openOrgPartModal('ops',team.id,p1.id); document.getElementById('org-unit-name').value='시험A파트'; submitOrgUnit({preventDefault(){}});
   r.renameFollows=(localUsers.find(u=>u.id==='e2e-p1')||{}).part==='시험A파트';
   deleteOrgPart(team.id,p1.id);
   r.deleteKeepsTeam=(()=>{const u=localUsers.find(u=>u.id==='e2e-p1');return u.part===''&&u.team==='운영팀';})();
   // 다른 본부 팀에도 파트 가능
   const other=orgTeams.find(t=>t.deptId!=='ops');
   r.otherDept=true;
   if(other){ openOrgPartModal(other.deptId,other.id); document.getElementById('org-unit-name').value='시험타파트'; submitOrgUnit({preventDefault(){}}); r.otherDept=orgPartNamesOf(other.deptId,other.name).includes('시험타파트'); other.parts=(other.parts||[]).filter(p=>p.name!=='시험타파트'); }
   // 정리
   team.parts=(team.parts||[]).filter(p=>!p.name.startsWith('시험')); if(!team.parts.length) delete team.parts; saveOrgTeams();
   ['e2e-p0','e2e-p1','e2e-p2'].forEach(id=>{const i=localUsers.findIndex(u=>u.id===id); if(i>-1) localUsers.splice(i,1);});
   return r;
 });
 Object.assign(out,out2,out3);
 const expect={hasTeam:true,parts:'시험1파트,시험2파트',dupBlocked:true,partFieldShown:true,saved:true,treeParts:true,leaderInTeamBox:true,cardParts:true,renameFollows:true,deleteKeepsTeam:true,otherDept:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
