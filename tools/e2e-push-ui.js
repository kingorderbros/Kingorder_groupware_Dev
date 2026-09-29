// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-push-ui.js . <스크린샷 폴더>   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2],OUT=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
const out=[];const ok=(c,m)=>out.push((c?'  ✓ ':'  ✗ ')+m);
srv.listen(8800,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1280,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8800/?noti=N9',{waitUntil:'networkidle0'});
 // 서버가 있는 것처럼 kobPush 를 바꿔 끼웁니다
 await pg.evaluate(()=>{window.__sent=[];window.__st={supported:true,ready:true,ios:false,standalone:false,permission:'default',subscribed:false};window.__prefs={work:true,collab:true,directive:true,project:true,meeting:false,issue:true,dev:true,etc:true};
   window.kobPush={remote:true,state:async()=>Object.assign({},__st),status:async()=>({devices:[{device:'맥 · 크롬'}],prefs:__prefs,categories:[{id:'work',label:'업무 접수'},{id:'collab',label:'협업티켓'},{id:'meeting',label:'영업 회의'},{id:'etc',label:'그 밖의 알림'}]}),
     enable:async()=>{__st.subscribed=true;__st.permission='granted';return true;},disable:async()=>{__st.subscribed=false;return true;},setPrefs:async p=>{Object.assign(__prefs,p);__sent.push(['prefs',p]);},send:(n,l)=>__sent.push(['send',n.type,l,n.toUser||n.toDept])};
   enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'});});
 await new Promise(s=>setTimeout(s,3200));
 let r=await pg.evaluate(()=>({ask:!!document.getElementById('gw-push-ask'),panel:!document.getElementById('noti-panel').classList.contains('hidden'),url:location.search}));
 ok(r.ask,'들어온 뒤 "폰 · PC 알림을 켤까요?" 안내가 뜬다');
 ok(r.panel&&r.url==='','폰 알림을 눌러 들어오면(?noti=) 알림함이 펼쳐지고 주소는 깨끗해진다 '+JSON.stringify(r));
 await pg.screenshot({path:OUT+'/push_ask.png'});
 r=await pg.evaluate(async()=>{await myPushEnable();await new Promise(s=>setTimeout(s,200));return {ask:!!document.getElementById('gw-push-ask'),sub:__st.subscribed};});
 ok(r.sub&&!r.ask,'[켜기] → 이 기기 구독 · 안내 닫힘');
 r=await pg.evaluate(async()=>{openMyProfile();await new Promise(s=>setTimeout(s,400));const box=document.getElementById('my-push-box');const cbs=[...box.querySelectorAll('input[type=checkbox]')];
   const meeting=cbs[2];meeting.checked=true;meeting.dispatchEvent(new Event('change'));await new Promise(s=>setTimeout(s,100));return {txt:box.innerText.replace(/\s+/g,' '),n:cbs.length,checked:cbs.map(c=>c.checked),sent:JSON.stringify(__sent.filter(x=>x[0]==='prefs'))};});
 ok(/이 기기에서 받는 중/.test(r.txt)&&r.n===4&&r.sent.includes('"meeting":true'),'내 정보 › 폰 · PC 알림: 받는 중 · 종류별 체크 · 바꾸면 저장 '+JSON.stringify({checked:r.checked}));
 await pg.screenshot({path:OUT+'/push_profile.png'});
 r=await pg.evaluate(()=>{__sent.length=0;pushNotification({id:'NX',type:'work-received',title:'킹오더 강남점',toDept:'sales',date:'2026-09-29'});return JSON.stringify(__sent);});
 ok(r.includes('"send","work-received","업무접수","sales"'),'그룹웨어 알림이 쌓이면 같은 알림을 폰 · PC 로도 보낸다 (종류 이름 함께) '+r);
 r=await pg.evaluate(async()=>{__st.subscribed=false;__st.supported=false;__st.ios=true;__st.standalone=false;await renderMyPushBox();return document.getElementById('my-push-box').innerText.replace(/\s+/g,' ');});
 ok(/홈 화면에 추가/.test(r),'아이폰 사파리(홈 화면 아님)면 "홈 화면에 추가" 안내');
 console.log(out.join('\n'));console.log('errors',JSON.stringify(errs.slice(0,6)));await br.close();srv.close();});
