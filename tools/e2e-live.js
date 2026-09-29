// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-live.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
const out=[];const ok=(c,m)=>out.push((c?'  ✓ ':'  ✗ ')+m);
srv.listen(8795,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1280,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('http://localhost:8795/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const E=(f,...a)=>pg.evaluate(f,...a); const wait=ms=>new Promise(s=>setTimeout(s,ms));
 // 다른 사람이 구성원을 더했다고 치고 — 조직도 화면
 await E(()=>navigate('org-chart',document.getElementById('nav-org-chart')));
 const before=await E(()=>document.getElementById('sec-org-chart').innerText.includes('실시간홍길동'));
 await E(()=>{const k='gwUsers.v1';const v=JSON.parse(localStorage.getItem(k)||kobStorage.getItem(k)||'[]');v.push({id:'u-live',name:'실시간홍길동',dept:'sales',team:'',rank:'사원',email:'live@k.co',groupId:'sales',level:'manager'});
   const s=JSON.stringify(v);kobStorage.setItem(k,s);localUsers=localUsers.filter(u=>u.id!=='u-live'); window.dispatchEvent(new StorageEvent('storage',{key:k,newValue:s}));});
 await wait(900);
 const after=await E(()=>({inVar:localUsers.some(u=>u.name==='실시간홍길동'),onScreen:document.getElementById('sec-org-chart').innerText.includes('실시간홍길동')}));
 ok(!before&&after.inVar&&after.onScreen,'다른 사람이 구성원을 더하면 조직도에 바로 나타난다 '+JSON.stringify(after));
 // 창이 열려 있으면 기다린다
 await E(()=>{const m=document.querySelector('[id$="-modal"]');m.classList.remove('hidden');window.__m=m;
   const k='gwVehicles.v1';const v=[{id:'CAR-LIVE',plate:'99가9999',model:'시험차',status:'운행가능'}];const s=JSON.stringify(v);kobStorage.setItem(k,s);window.dispatchEvent(new StorageEvent('storage',{key:k,newValue:s}));});
 await wait(900);
 const mid=await E(()=>({veh:vehicles.some(v=>v.id==='CAR-LIVE'),pending:gwLivePending.size}));
 await E(()=>{window.__m.classList.add('hidden');document.body.click();}); await wait(1000);
 const end=await E(()=>({veh:vehicles.some(v=>v.id==='CAR-LIVE'),pending:gwLivePending.size}));
 ok(!mid.veh&&mid.pending===1&&end.veh&&end.pending===0,'창이 열려 있는 동안은 미루고 닫은 뒤 반영한다 '+JSON.stringify({mid,end}));
 // 모르는 키는 건드리지 않는다
 const nav=await E(()=>{let n=0;const o=navigate;window.navigate=(...a)=>{n++;return o(...a);};window.dispatchEvent(new StorageEvent('storage',{key:'savedLoginId',newValue:'x'}));return new Promise(r=>setTimeout(()=>{window.navigate=o;r(n);},900));});
 ok(nav===0,'반영 대상이 아닌 값(아이디 기억 등)은 화면을 다시 그리지 않는다');
 // 동시 수정 알림 — 알림이 없던 표
 const toast=await E(()=>{window.dispatchEvent(new CustomEvent('kob-db-conflict',{detail:{table:'todos',id:'T1',mine:{title:'보고서 쓰기'},theirs:{title:'보고서 쓰기'}}}));
   return [...document.querySelectorAll('div')].some(d=>/할 일 '보고서 쓰기' 은\(는\) 다른 사람이 먼저 고쳤습니다/.test(d.textContent));});
 ok(toast,'할 일 · 프로젝트 등 알림이 없던 표도 "다른 사람이 먼저 고쳤습니다" 를 띄운다');
 const dup=await E(()=>{const before=document.querySelectorAll('div.bg-orange-600').length;window.dispatchEvent(new CustomEvent('kob-db-conflict',{detail:{table:'schedules',id:'S1',mine:{title:'회의'},theirs:{title:'회의'}}}));return document.querySelectorAll('div.bg-orange-600').length-before;});
 ok(dup===1,'원래 알림이 있던 표(일정)는 두 번 뜨지 않는다 (추가 '+dup+')');
 console.log(out.join('\n'));console.log('errors',JSON.stringify(errs.slice(0,8)));await br.close();srv.close();});
