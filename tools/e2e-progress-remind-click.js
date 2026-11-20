// 사용법: node tools/e2e-progress-remind-click.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-20 — 진행 내역 업데이트 요청 알림: 알림함 문구 · 누르면 그 건의 진행 내역 창 (영업 업무 · 인바운드)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8874,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1400,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<700,hasTouch:vw<700});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));const alerts=[];pg.on('dialog',d=>{alerts.push(d.message());d.accept();});
  await pg.goto('http://localhost:8874/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u2',name:'김영업',dept:'sales',groupId:'sales'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const w1={id:'S-1',center:'sales',type:'activity',title:'강남치킨 견적',status:'working',priority:'normal',receivedAt:'2026-11-10',receiver:'박배정',assignee:'김영업',workingSince:'2026-11-15 10:00'};
   WORK_CENTERS.sales.works=[w1];if(window.kobDb)await kobDb.save('works',w1);
   inboundRecords=[{id:'IN-1',inDate:'2026-11-17',company:'홍대국밥',phone:'010',kob:{dept:'영업',owner:'김영업',extras:[],contactAt:'2026-11-17'}}];
   enterApp(U[0]);await sleep(150);
   const n1={id:'prog_work_S-1_2026-11-23',type:'work-progress-remind',title:'강남치킨 견적',toUser:'김영업',detail:'5일째 진행 내역이 없습니다. 진행한 내용이나 지체 사유를 입력해 주세요.',progSrc:'sales',progId:'S-1',date:'2026-11-23',time:'09:00',read:false};
   const n2=Object.assign({},n1,{id:'prog_inbound_IN-1_2026-11-23',title:'홍대국밥 인입',progSrc:'inbound',progId:'IN-1'});
   const n3=Object.assign({},n1,{id:'prog_work_S-9_2026-11-23',progId:'S-9'});
   const run=js=>{const w=document.createElement('div');w.innerHTML=`<div onclick="${js}"></div>`;document.body.appendChild(w);w.firstChild.click();w.remove();};   // 알림함과 같이 onclick="…" 속성으로
   const out={};
   out.text=notiText(n1);
   const js=notiClickJs(n1);out.js=js;
   run(js);await sleep(150);out.found=!!salesProgFind('sales','S-1');out.n=(WORK_CENTERS.sales.works||[]).length;
   const m=()=>document.getElementById('sales-prog-modal');
   out.work=!!m()&&!m().classList.contains('hidden')&&/S-1/.test(m().innerText)&&/업무 진행 내역/.test(m().innerText)&&!!document.getElementById('sales-prog-text');
   if(m())closeSalesProgress();
   run(notiClickJs(n2));await sleep(150);
   out.inb=!!m()&&!m().classList.contains('hidden')&&/IN-1/.test(m().innerText)&&/인바운드 진행 내역/.test(m().innerText);
   if(m())closeSalesProgress();
   run(notiClickJs(n3));await sleep(100);
   return out;});
  ok(/진행 내역 업데이트가 필요합니다/.test(r.text)&&/5일째/.test(r.text),'알림함 문구',r.text);
  ok(r.work,'영업 업무 알림 클릭 → 진행 내역 창(입력 칸)',r);
  ok(r.inb,'인바운드 알림 클릭 → 인바운드 진행 내역 창',r);
  ok(alerts.some(a=>/찾을 수 없습니다/.test(a)),'없어진 건은 안내',alerts);
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
