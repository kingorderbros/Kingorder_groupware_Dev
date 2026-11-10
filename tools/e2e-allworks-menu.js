// 사용법: node tools/e2e-allworks-menu.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-10 — 전체 업무이력을 운영업무센터 탭에서 왼쪽 메뉴(운영업무센터 밑)로 옮김
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8861,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
 await pg.goto('http://localhost:8861/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const res=[];const ok=(n,c,d)=>res.push([n,!!c,d]);
 const st=()=>pg.evaluate(()=>{const nav=document.getElementById('nav-ops-allworks');const wcNav=document.getElementById('nav-ops-work-center');
   const tabs=[...document.querySelectorAll('#'+wcDef('ops').section+' [id$="type-tabs"] button')].map(b=>b.textContent.trim());
   return {navShown:!nav.classList.contains('hidden'),afterWc:wcNav.nextElementSibling===nav,navOn:nav.classList.contains('bg-blue-600/25'),wcOn:wcNav.classList.contains('bg-blue-600/25'),
     active:wcState.ops.activeType,title:document.getElementById('page-title').innerText,wcTitle:(document.getElementById('wc-title-ops')||{}).textContent,tabsHidden:!!(wcEl('ops','type-tabs')&&wcEl('ops','type-tabs').classList.contains('hidden')),picked:(wcEl('ops','search-picked')||{}).className,secShown:!document.getElementById('sec-ops-work-center').classList.contains('hidden'),tabs,searchOpen:wcState.ops.searchOpen,
     last:sessionStorage.getItem('gwLastPage.v1')};});
 let s=await st();
 ok('메뉴 보임 · 운영업무센터 바로 밑',s.navShown&&s.afterWc,s);
 await pg.click('#nav-ops-allworks');await new Promise(r=>setTimeout(r,400));s=await st();
 ok('전체 업무이력 메뉴 → 전체 업무이력 화면',s.secShown&&s.active==='allworks',s.active);
 ok('전체 업무이력 메뉴 강조',s.navOn&&!s.wcOn);
 ok('탭 줄에 전체 업무이력 없음',!s.tabs.some(t=>t.includes('전체 업무이력')),s.tabs.join(','));
 ok('고객조회 접힘',s.searchOpen===false);
 ok('제목 = 전체 업무이력 · 탭 줄 숨김 · 고객 미선택 숨김',s.title==='전체 업무이력'&&s.wcTitle==='전체 업무이력'&&s.tabsHidden&&s.picked==='hidden',s);
 ok('새로고침 복원용 기록 = 전체 업무이력 메뉴',String(s.last).includes('nav-ops-allworks'));
 await pg.evaluate(()=>gwRerenderCurrent());s=await st();
 ok('실시간 다시 그리기 뒤에도 전체 업무이력 유지',s.active==='allworks'&&s.navOn,s.active);
 await pg.click('#nav-ops-work-center');await new Promise(r=>setTimeout(r,400));s=await st();
 ok('운영업무센터 메뉴 → 업무 탭(첫 탭)',s.active==='as',s.active);
 ok('운영업무센터 메뉴 강조',s.wcOn&&!s.navOn);
 ok('고객조회 다시 펼침',s.searchOpen===true);
 ok('제목 = 운영업무센터 · 탭 줄 보임',s.wcTitle==='운영업무센터'&&!s.tabsHidden&&s.title.includes('운영업무센터'),s);
 await pg.evaluate(()=>setWorkType('ops','menu'));
 await pg.click('#nav-ops-allworks');await new Promise(r=>setTimeout(r,300));
 await pg.click('#nav-ops-work-center');await new Promise(r=>setTimeout(r,300));s=await st();
 ok('업무 탭 보던 중이면 운영업무센터 다시 눌러도 첫 탭',s.active==='as',s.active);
 await pg.evaluate(()=>setWorkType('ops','menu'));await pg.click('#nav-ops-work-center');await new Promise(r=>setTimeout(r,300));s=await st();
 ok('업무 탭에서 운영업무센터 누르면 보던 탭 유지',s.active==='menu',s.active);
 const btn=await pg.evaluateHandle(()=>[...document.querySelectorAll('#sec-ops-work-center button')].find(b=>b.textContent.trim()==='전체 업무이력'));
 if(btn&&await btn.evaluate(b=>!!b)){await btn.evaluate(b=>b.click());await new Promise(r=>setTimeout(r,300));s=await st();ok('화면 안 [전체 업무이력] 단추 → 메뉴와 같게',s.active==='allworks'&&s.navOn,s.active);}
 else ok('화면 안 [전체 업무이력] 단추 찾기',false);
 // 새로고침하면 전체 업무이력 메뉴·화면으로 돌아옴
 await pg.reload({waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));await new Promise(r=>setTimeout(r,500));s=await st();
 ok('새로고침 뒤 전체 업무이력으로 복원',s.secShown&&s.active==='allworks'&&s.navOn,s);
 // 권한에서 ops-wc-allworks 를 빼면 메뉴가 숨겨짐
 const hid=await pg.evaluate(()=>{allowedPageIds=allowedPageIds.filter(x=>x!=='ops-wc-allworks');const o=canSeePage;
   try{applyMenuPermissions&&applyMenuPermissions();}catch(e){return 'err '+e.message;}return document.getElementById('nav-ops-allworks').classList.contains('hidden');});
 ok('전체 업무이력 권한 없으면 메뉴 숨김',hid===true,hid);
 res.forEach(([n,c,d])=>console.log((c?'✓ ':'✗ ')+n+(c?'':'  → '+JSON.stringify(d))));
 console.log('errors:',errs.length?errs:'없음');const fail=res.filter(r=>!r[1]).length;console.log(fail?`실패 ${fail}`:`통과 ${res.length}`);
 await br.close();srv.close();process.exit(fail?1:0);});
