// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-presence.js . <스크린샷 폴더>   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2],OUT=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
const out=[];const ok=(c,m)=>out.push((c?'  ✓ ':'  ✗ ')+m);
srv.listen(8798,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('http://localhost:8798/',{waitUntil:'networkidle0'});
 // 구성원 3명을 넣고 들어갑니다
 await pg.evaluate(()=>{localUsers=[
   {id:'u1',name:'관리자',dept:'admin',email:'daniel@kingorder.co.kr',groupId:'admin',level:'admin'},
   {id:'u2',name:'김영업',dept:'sales',team:'1팀',rank:'대리',email:'kim@k.co',groupId:'sales',level:'manager'},
   {id:'u3',name:'박운영',dept:'ops',rank:'과장',email:'park@k.co',groupId:'sales',level:'manager'}]; saveLocalUsers();
   const two=new Date(Date.now()-2*3600e3).toISOString(); kobStorage.setItem('gwUserPresence.v1',JSON.stringify([{id:'u3',lastLogin:new Date(Date.now()-3*86400e3).toISOString(),lastSeen:two}]));
   enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'관리자'});});
 await new Promise(s=>setTimeout(s,500));
 let r=await pg.evaluate(()=>({enabled:kobPresence.enabled(),me:kobPresence.info('u2'),cnt:document.getElementById('presence-count').textContent,rec:JSON.parse(kobStorage.getItem('gwUserPresence.v1')).find(x=>x.id==='u2')}));
 ok(r.enabled&&r.me.online&&r.cnt==='1'&&r.rec&&r.rec.lastSeen&&r.rec.lastLogin,'들어오면 나는 접속 중 · 머리글 1명 · 마지막 로그인 · 접속이 기록된다 '+JSON.stringify({cnt:r.cnt}));
 // 조직도 — 점
 r=await pg.evaluate(()=>{navigate('org-chart',document.getElementById('nav-org-chart'));const d=id=>{const e=document.querySelector(`#sec-org-chart [data-presence-dot="${id}"]`);return e?{c:e.className.includes('bg-green-500')?'green':'gray',t:e.title}:null;};return {me:d('u2'),park:d('u3')};});
 ok(r.me&&r.me.c==='green'&&r.park&&r.park.c==='gray'&&/마지막 접속 2시간 전/.test(r.park.t),'조직도: 나는 초록 점 · 박운영은 회색 점 + "마지막 접속 2시간 전" '+JSON.stringify(r));
 // 다른 사람이 접속한 것으로 — 채널 신호 대신 목록을 바꿔 알림
 r=await pg.evaluate(()=>{const real=kobPresence.onlineIds;kobPresence.onlineIds=()=>['u2','u3'];const ri=kobPresence.info;kobPresence.info=id=>Object.assign(ri(id),{online:['u2','u3'].includes(String(id))});
   window.dispatchEvent(new CustomEvent('kob-presence'));const e=document.querySelector('#sec-org-chart [data-presence-dot="u3"]');return {park:e.className.includes('bg-green-500'),cnt:document.getElementById('presence-count').textContent};});
 ok(r.park&&r.cnt==='2','다른 사람이 접속하면 화면을 다시 그리지 않고 점 · 숫자만 바뀐다 '+JSON.stringify(r));
 // 머리글 목록
 r=await pg.evaluate(()=>{togglePresencePanel(true);return {txt:document.getElementById('presence-panel-list').innerText.replace(/\s+/g,' '),cnt:document.getElementById('presence-panel-count').textContent};});
 ok(/김영업.*접속 중/.test(r.txt)&&/박운영.*접속 중/.test(r.txt)&&!/관리자/.test(r.txt)&&r.cnt==='2명 접속 · 전체 2명','머리글 목록: 접속 중 먼저 · 관리자 계정은 빼고 '+JSON.stringify(r));
 await pg.screenshot({path:OUT+'/presence_panel.png'});
 // 사용자 관리
 r=await pg.evaluate(()=>{togglePresencePanel(false);kobPresence.onlineIds=()=>['u2'];const ri2=kobPresence.info;kobPresence.info=id=>Object.assign(ri2(id),{online:String(id)==='u2'});
   renderUsers();const row=id=>{const td=document.querySelector(`[data-presence-state="${id}"]`);return td?[td.innerText.trim(),td.nextElementSibling.innerText.trim(),td.nextElementSibling.nextElementSibling.innerText.trim()]:null;};
   const heads=[...document.querySelectorAll('#users-table-body')][0].closest('table').querySelectorAll('th');return {u2:row('u2'),u3:row('u3'),heads:[...heads].map(h=>h.innerText.trim())};});
 ok(r.u2&&r.u2[0]==='접속 중'&&r.u2[2]==='지금'&&r.u3[0]==='오프라인'&&/3일 전/.test(r.u3[1])&&r.u3[2]==='2시간 전'&&r.heads.includes('로그인 상태')&&r.heads.includes('마지막 로그인'),'사용자 관리: 로그인 상태 · 마지막 로그인 · 마지막 접속 칸 '+JSON.stringify({u2:r.u2,u3:r.u3}));
 await pg.evaluate(()=>{navigate('admin-center',document.getElementById('nav-admin-center'));});await new Promise(s=>setTimeout(s,300));
 await pg.screenshot({path:OUT+'/presence_users.png'});
 console.log(out.join('\n'));console.log('errors',JSON.stringify(errs.slice(0,6)));await br.close();srv.close();});
