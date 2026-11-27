// 사용법: node tools/e2e-speed-log.js   (맥 크롬 헤드리스) — 사용 중 속도 기록 (2026-11-27, v1.1.50)
//   가짜 Supabase(브라우저 안 createClient 대역)로: DB · /api 조회 시간이 쌓이고, 접속 시간 · 단계가 잡히고, 로그인 상태면 gw_speed_report 로 요약을 보냄
//   파일 받기(/storage/v1/object/) · /api/files · 기록 보내기 자체는 재지 않음, 로그인 안 하면 안 보냄
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const PORT=8876, SB=`http://localhost:${PORT}/sb`;
const STUB=`window.supabase={createClient:function(url,key){
  var rec=window.__rpc=[]; var authed=!window.__noSession;
  function q(table){ var p=new Proxy({}, {get:function(t,k){ if(k==='then'){ return function(res,rej){ return fetch(url+'/rest/v1/'+table).then(function(r){return r.json();}).then(function(d){ res({data:d,error:null}); }, rej); }; } return function(){ return p; }; }}); return p; }
  return { from:q,
    rpc:function(n,a){ rec.push({n:n,a:a}); return fetch(url+'/rest/v1/rpc/'+n,{method:'POST',body:JSON.stringify(a)}).then(function(){return {data:null,error:null};}); },
    auth:{ getSession:function(){ return Promise.resolve({data:{session: authed?{access_token:'t',user:{email:'daniel@kingorder.co.kr'}}:null}}); },
           onAuthStateChange:function(){ return {data:{subscription:{unsubscribe:function(){}}}}; }, getUser:function(){ return Promise.resolve({data:{user:null}}); } },
    channel:function(){ var c={on:function(){return c;},subscribe:function(){return c;}}; return c; }, removeChannel:function(){} };
}};`;
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'${SB}',supabaseAnonKey:'x',supabaseJs:'/__stub.js',apiBase:''};`);}
 if(p==='/__stub.js'){r.writeHead(200,{'content-type':'text/javascript'});return r.end(STUB);}
 if(p.startsWith('/sb/rest/v1/app_store')){ setTimeout(()=>{r.writeHead(200,{'content-type':'application/json'});r.end('[]');},120); return; }
 if(p.startsWith('/sb/')){r.writeHead(200,{'content-type':'application/json'});return r.end('[]');}
 if(p.startsWith('/api/')){ setTimeout(()=>{r.writeHead(404);r.end('{}');},30); return; }
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,500));}};
srv.listen(PORT,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const run=async(noSession)=>{const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  if(noSession) await pg.evaluateOnNewDocument(()=>{window.__noSession=true;});
  await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle0'});
  await pg.waitForFunction(()=>document.documentElement.getAttribute('data-kob-ready')==='1',{timeout:20000});
  const r=await pg.evaluate(async(SB)=>{const wait=ms=>new Promise(x=>setTimeout(x,ms));const out={};
    out.peek0=window.kobSpeed.peek();
    await fetch('/api/holidays'); await fetch('/api/files/abc'); await fetch(SB+'/storage/v1/object/files/a.png'); await fetch('https://example.invalid/x').catch(()=>{});
    out.peek1=window.kobSpeed.peek();
    window.kobSpeed.send(); await wait(300);
    out.rpc=(window.__rpc||[]).filter(x=>x.n==='gw_speed_report').map(x=>x.a.p);
    out.peek2=window.kobSpeed.peek();
    window.kobSpeed.send(); await wait(100); out.rpc2=(window.__rpc||[]).filter(x=>x.n==='gw_speed_report').length;
    out.ver=(window.KOB_VERSION||{}).groupware; return out;},SB);
  await pg.close(); return {r,errs};};
 const a=await run(false); console.log(JSON.stringify(a.r).slice(0,700));
 const p=a.r.rpc[0]||{};
 ok(a.r.peek0.n>=1 && a.r.peek0.boot>0,'접속 때 DB 조회가 쌓이고 접속 시간이 잡힘',a.r.peek0);
 ok(a.r.peek0.steps && a.r.peek0.steps.store>=100 && 'tables' in a.r.peek0.steps && 'main' in a.r.peek0.steps && 'start' in a.r.peek0.steps,'접속 단계(화면 파일 · 공용 자료 · 업무 표 · 화면 그리기)',a.r.peek0.steps);
 ok(a.r.peek1.n===a.r.peek0.n+1,'/api 조회 1건만 더해짐 (파일 · 외부 주소 제외)',[a.r.peek0.n,a.r.peek1.n]);
 ok(a.r.rpc.length===1 && p.n===a.r.peek1.n && p.p90>0 && p.max>=p.p90 && p.boot_ms>0 && /^1\.1\.[5-9][0-9]$/.test(p.v),'로그인 상태 — 요약을 gw_speed_report 로 보냄',p);
 ok(Array.isArray(p.slow) && p.slow.some(s=>s.q==='rest:app_store') && p.slow.some(s=>s.q==='api:holidays') && !JSON.stringify(p).includes('daniel'),'느린 조회 이름만 · 사람 정보 없음',p.slow);
 ok(a.r.peek2.n===0 && a.r.rpc2===1,'보낸 뒤 비우고, 기록 보내기 자체는 재지 않음',[a.r.peek2,a.r.rpc2]);
 ok(a.errs.length===0,'페이지 오류 없음 (로그인)',a.errs);
 const b=await run(true);
 ok(b.r.rpc.length===0 && b.r.peek0.boot===0,'로그인 안 한 상태 — 보내지 않고 접속 시간도 안 잡음',b.r);
 ok(b.errs.length===0,'페이지 오류 없음 (로그인 전)',b.errs);
 ok(/^1\.1\.(5[0-9]|[6-9][0-9])$/.test(a.r.ver),'버전 1.1.50 이상',a.r.ver);
 console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
