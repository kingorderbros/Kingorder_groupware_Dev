// 사용법: node tools/e2e-calendar-no-sideways.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — 킹오더일정(휴대폰): 페이지가 옆으로 밀리지 않음 · 캘린더 줄은 줄 안에서만 옆으로 넘김 · 위쪽 고정은 그대로
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.png')?'image/png':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8890,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for (const [w,h] of [[390,844],[375,667],[430,932]]) {
  console.log(`■ ${w}x${h}`);
  const pg=await br.newPage();await pg.setViewport({width:w,height:h,isMobile:true,hasTouch:true});pg.on('pageerror',e=>errs.push(String(e).slice(0,150)));
  await pg.goto('http://localhost:8890/?mode=calendar',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U={id:'u1',name:'정장훈',dept:'admin',groupId:'admin',level:'admin',email:'a@x.kr'};localUsers.push(U);
   const t=ymd(new Date());for(let i=0;i<20;i++)schedules.push({id:'z'+i,title:'일정 '+i+' 강남치킨 역삼점 방문 상담',date:t,allDay:false,startTime:'10:00',endTime:'11:00',calendar:['team','sales-share','install-as','company'][i%4],dept:'sales',type:'meeting',salesperson:'정장훈'});
   enterApp(U);await sleep(500);
   const ms=document.getElementById('main-scroll'), lg=document.getElementById('calendar-legend');
   const out={};
   for (const v of ['today','sched','callist']) {
    const b=document.querySelector(`#calm-bar [data-view="${v}"]`); if(b) b.click(); await sleep(400);
    ms.scrollLeft=400; const left=ms.scrollLeft;
    out[v]={pageWider:document.documentElement.scrollWidth>innerWidth, mainSide:ms.scrollWidth-ms.clientWidth, left};
   }
   // 오늘 화면에서 아래로 넘겨도 캘린더 줄이 위에 붙어 있는지
   document.querySelector('#calm-bar [data-view="today"]').click();await sleep(400);
   const top0=lg.getBoundingClientRect().top; ms.scrollTop=700; await sleep(150); const top1=lg.getBoundingClientRect().top;
   lg.scrollLeft=200; out.stick={top0:Math.round(top0),top1:Math.round(top1),legendScroll:lg.scrollLeft,legendOx:getComputedStyle(lg).overflowX};
   return out;});
  for (const v of ['today','sched','callist']) ok(!r[v].pageWider&&r[v].mainSide===0&&r[v].left===0,`${v} 화면 — 페이지 옆으로 밀리지 않음`,r[v]);
  ok(r.stick.legendOx==='auto'&&r.stick.legendScroll>0,'캘린더 줄은 줄 안에서 옆으로 넘김',r.stick);
  ok(Math.abs(r.stick.top1-r.stick.top0)<2,'아래로 넘겨도 캘린더 줄은 위쪽에 고정',r.stick);
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
