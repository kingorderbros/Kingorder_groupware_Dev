// 사용법: node tools/e2e-inbound-check-done.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — 인바운드 '확인 필요': 결과가 영업수주 · 실패로 끝난 건은 제외 (표시는 기록으로 남김)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8892,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];const pg=await br.newPage();await pg.setViewport({width:1400,height:900});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8892/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const U={id:'u1',name:'대표',dept:'admin',groupId:'admin',level:'admin',email:'a@x.kr'};localUsers.push(U);
  const rec=(id,res,o)=>Object.assign({id,inDate:ymd(new Date()),company:id,phone:'010',kob:{dept:'영업',owner:'대표',result:res,extras:[]}},o);
  inboundRecords=[rec('FAIL','실패',{flags:['연락처 확인 필요']}),rec('WON','영업수주',{flags:['재문의: X'],dupOf:'X'}),rec('ING','진행중',{flags:['문의내용 없음']}),rec('HOLD','보류',{dupOf:'Y'}),rec('NONE','',{flags:['연락처 확인 필요']}),rec('CLEAN','실패',{}),rec('SPAM','',{flags:['문의내용 없음'],spam:true})];
  const ids=inboundRecords.filter(inboundNeedsCheck).map(x=>x.id).sort().join();
  enterApp(U);await sleep(150);navigate('inbound-center',document.getElementById('nav-inbound-center'));await sleep(300);
  const kpi=[...document.querySelectorAll('#inbound-tab-body button')].find(b=>/확인 필요/.test(b.innerText));
  return {ids,kpi:kpi?kpi.innerText.replace(/\s+/g,' '):'',flagsKept:inboundRecords.find(x=>x.id==='FAIL').flags.join()};});
 ok(r.ids==='HOLD,ING,NONE','확인 필요 = 진행중 · 보류 · 결과 없음 건만 (실패 · 수주 · 스팸 · 표시 없는 건 제외)',r.ids);
 ok(/확인 필요 3건/.test(r.kpi),'인바운드 현황판 확인 필요 숫자 3건',r.kpi);
 ok(r.flagsKept==='연락처 확인 필요','실패 건의 표시는 기록으로 남음',r.flagsKept);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
