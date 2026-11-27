// 사용법: node tools/e2e-ops-duty-channels.js   (맥 크롬 헤드리스) — 운영업무센터 접수방식에 당직 4종, 골라서 저장하면 업무에 남음 (2026-11-17)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
const DUTY=['당직(유선)','당직(카톡)','주말당직(유선)','주말당직(카톡)'];
srv.listen(8874,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1400,height:800});await pg.goto('http://localhost:8874/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const r=await pg.evaluate(async(DUTY)=>{
  const wait=ms=>new Promise(x=>setTimeout(x,ms));const out={};
  navigate('ops-work-center',document.getElementById('nav-ops-work-center'));await wait(300);
  setWorkType('ops','as');await wait(200);
  out.asOpts=[...wcEl('ops','intake-channel').options].map(o=>o.value);
  setWorkType('ops','simple');await wait(200);
  out.simpleOpts=[...wcEl('ops','intake-channel').options].map(o=>o.value);
  // AS 접수에서 주말당직(카톡) 골라 저장
  customers.push({id:'cD',name:'당직식당',businessNo:'222-22-22222',contact:'010-2222-3333',contactName:'박당직',ceo:'박당직',status:'거래중'});
  setWorkType('ops','as');await wait(200);wcEl('ops','search-name').value='당직식당';searchWorkCenterCustomer('ops');await wait(200);
  wcEl('ops','intake-channel').value='주말당직(카톡)';
  [...wcEl('ops','intake-fields').querySelectorAll('select')].forEach(x=>{const o=[...x.options].find(y=>y.value&&y.value!=='택배'&&y.value!=='기타');if(o)x.value=o.value;x.dispatchEvent(new Event('change'));});
  wcEl('ops','intake-memo').value='주말 카톡 문의';
  const n0=wcDef('ops').works.length;submitWorkIntake({preventDefault(){}},'ops');await wait(200);
  const w=wcDef('ops').works.find(x=>x.memo==='주말 카톡 문의'||(x.company==='당직식당'));
  out.saved=wcDef('ops').works.length-n0;out.channel=w&&w.channel;
  out.ver=(document.querySelector('.js-app-ver')||{}).textContent||'';
  return out;},DUTY);
 console.log(JSON.stringify(r));
 ok(DUTY.every(d=>r.asOpts.includes(d)),'AS유지보수 접수방식에 당직 4종',r.asOpts);
 ok(r.asOpts.filter(x=>x!=='카카오채널').indexOf('당직(유선)')===r.asOpts.filter(x=>x!=='카카오채널').indexOf('카카오톡')+1,'카카오톡(·카카오채널) 바로 다음에 나옴',r.asOpts);   // 1.1.49 카카오채널이 카카오톡 뒤에 들어감
 ok(DUTY.every(d=>r.simpleOpts.includes(d)),'기타&단순문의에도 같이 나옴',r.simpleOpts);
 ok(r.saved===1&&r.channel==='주말당직(카톡)','주말당직(카톡)으로 저장됨',r);
 ok(/v\d+\.\d+\.\d+/.test(r.ver),'화면 버전 표시',r.ver);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
