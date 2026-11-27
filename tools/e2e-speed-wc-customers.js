// 사용법: node tools/e2e-speed-wc-customers.js   (맥 크롬 헤드리스) — 업무센터 업체 목록 재사용 (2026-11-27, v1.1.52)
//   같은 처리 안에서는 같은 목록을 다시 쓰고(빠름), 다음 처리 · 업체 저장 · 업체 추가 뒤에는 새로 만들어 고친 값이 바로 보임
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8881,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.goto('http://localhost:8881/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const r=await pg.evaluate(async()=>{const wait=ms=>new Promise(x=>setTimeout(x,ms));const out={};
  for(let i=0;i<3000;i++) customers.push({id:'SP'+i,name:'속도업체'+i,businessNo:'9'+String(i).padStart(9,'0'),status:'거래중'});
  for(let i=0;i<300;i++) WORK_CENTERS.ops.works.push({id:'SPW'+i,customerId:'ox-SP'+i,type:'as',title:'t',status:'received',receivedAt:'2026-11-01',extra:{}});
  await wait(10);
  const a=wcDef('ops').customers, b=wcDef('ops').customers; out.same=a===b;
  out.find=!!wcCustomer('ops','ox-SP2999') && wcCustomer('ops','ox-SP2999').name==='속도업체2999';
  await wait(10); out.newTick=wcDef('ops').customers!==a;
  // 경영현황판 집계 시간 (업무 300건 × 업체 3천 곳)
  const t=performance.now(); execCollectItems(); out.execMs=Math.round(performance.now()-t);
  // 같은 처리 안에서 고치고 저장 → 바로 새 값
  wcDef('ops').customers; customers[customers.length-1].name='고친업체'; saveCustomers(); out.afterSave=wcCustomer('ops','ox-SP2999').name;
  // 같은 처리 안에서 업체 추가 → 목록에 바로 보임
  wcDef('ops').customers; customers.push({id:'SPNEW',name:'새업체',businessNo:'8000000001',status:'거래중'}); out.afterAdd=!!wcCustomer('ops','ox-SPNEW');
  // 고치기만 하고 저장 전이어도 다음 처리에서는 새 값
  customers[0].name=customers[0].name+'X'; await wait(10); out.nextTick=wcDef('ops').customers.some(c=>c.linkCustomerId===customers[0].id&&c.name===customers[0].name);
  out.ver=(window.KOB_VERSION||{}).groupware; return out;});
 console.log(JSON.stringify(r));
 ok(r.same && r.find,'같은 처리 안에서는 같은 목록 · 번호로 찾기',r);
 ok(r.newTick,'다음 처리에서는 새로 만듦');
 ok(r.execMs<1500,'경영현황판 집계 (업무 300 × 업체 3천) 1.5초 안 — '+r.execMs+'ms',r.execMs);
 ok(r.afterSave==='고친업체','업체 저장 직후 고친 이름이 바로 보임',r.afterSave);
 ok(r.afterAdd,'업체 추가 직후 목록에 바로 보임');
 ok(r.nextTick,'저장 전이라도 다음 처리에서는 고친 값');
 ok(true,'-');
 ok(errs.length===0,'페이지 오류 없음',errs);
 console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
