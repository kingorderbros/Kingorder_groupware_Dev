// 사용법: node tools/e2e-wc-scroll-top.js   (맥 크롬 헤드리스) — 업무센터에서 아래로 내려 작성한 뒤 전체 업무이력·다른 탭으로 가면 맨 위부터 (2026-11-12)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8873,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1400,height:800});await pg.goto('http://localhost:8873/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const r=await pg.evaluate(async()=>{
  const wait=ms=>new Promise(x=>setTimeout(x,ms));const sc=()=>document.getElementById('wc-ops-scroll');const out={};
  navigate('ops-work-center',document.getElementById('nav-ops-work-center'));await wait(300);
  // 내용이 길어지도록 아래 칸에 높이를 줌 (실제 화면처럼 작성칸·이력이 길 때)
  const pad=document.createElement('div');pad.style.height='3000px';pad.id='__pad';sc().appendChild(pad);
  sc().scrollTop=99999;await wait(200);out.before=sc().scrollTop;
  // ① 전체 업무이력 메뉴
  navigate('ops-work-center',document.getElementById('nav-ops-allworks'));await wait(300);
  if(!document.getElementById('__pad'))sc().appendChild(pad);out.allTab=wcState.ops.activeType;out.afterAll=sc().scrollTop;out.mainAfterAll=document.getElementById('main-scroll').scrollTop;
  // ② 다시 운영업무센터 → 아래로 → 다른 탭(메뉴유지보수)
  navigate('ops-work-center',document.getElementById('nav-ops-work-center'));await wait(300);if(!document.getElementById('__pad'))sc().appendChild(pad);
  sc().scrollTop=99999;await wait(100);out.before2=sc().scrollTop;
  setWorkType('ops','menu');await wait(200);if(!document.getElementById('__pad'))sc().appendChild(pad);out.afterTab=sc().scrollTop;
  // ③ AS 작성 후 저장 → 맨 위
  customers.push({id:'cA',name:'가나다식당',businessNo:'111-11-11111',contact:'010-1111-2222',contactName:'김가나',ceo:'김가나',status:'거래중'});
  setWorkType('ops','as');wcEl('ops','search-name').value='가나다';searchWorkCenterCustomer('ops');await wait(200);
  [...wcEl('ops','intake-fields').querySelectorAll('select')].forEach(x=>{const o=[...x.options].find(y=>y.value&&y.value!=='택배'&&y.value!=='기타');if(o)x.value=o.value;x.dispatchEvent(new Event('change'));});
  wcEl('ops','intake-memo').value='단말기 오류';if(!document.getElementById('__pad'))sc().appendChild(pad);sc().scrollTop=99999;await wait(100);out.before3=sc().scrollTop;
  const n0=wcDef('ops').works.length;submitWorkIntake({preventDefault(){}},'ops');await wait(200);out.saved=wcDef('ops').works.length-n0;if(!document.getElementById('__pad'))sc().appendChild(pad);out.afterSave=sc().scrollTop;
  return out;});
 console.log(JSON.stringify(r));
 ok(r.before>500,'처음엔 아래로 내려가 있음',r.before);
 ok(r.allTab==='allworks'&&r.afterAll===0&&r.mainAfterAll===0,'전체 업무이력으로 가면 맨 위',r);
 ok(r.before2>500&&r.afterTab===0,'다른 탭으로 가면 맨 위',r);
 ok(r.saved===1&&r.before3>500&&r.afterSave===0,'AS 작성 저장 후 맨 위',r);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
