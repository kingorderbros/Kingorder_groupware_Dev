// 사용법: node tools/e2e-ops-kakao-channel.js   (맥 크롬 헤드리스) — 운영업무센터 AS유지보수 · 기타&단순문의 · 메뉴유지보수 3곳에만 접수방식 '카카오채널' (2026-11-27, v1.1.49)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
const K='카카오채널';
srv.listen(8875,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1400,height:800});await pg.goto('http://localhost:8875/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const r=await pg.evaluate(async(K)=>{
  const wait=ms=>new Promise(x=>setTimeout(x,ms));const out={tabs:{}};
  const opts=id=>{const el=wcEl('ops',id);return el?[...el.options].map(o=>o.value):null;};
  navigate('ops-work-center',document.getElementById('nav-ops-work-center'));await wait(300);
  for(const t of wcDef('ops').types){ if(t.panel==='allworks'||t.noIntake) continue; setWorkType('ops',t.id);await wait(150);
    // 화면에 보이는 접수방식 선택칸을 탭마다 모읍니다
    const ids=['intake-channel','mnu-channel','dst-channel'];const seen={};ids.forEach(i=>{const el=wcEl('ops',i);if(el&&el.offsetParent)seen[i]=opts(i);});
    out.tabs[t.id]=seen; }
  // 순서: 카카오톡 바로 뒤
  setWorkType('ops','as');await wait(150); out.asOpts=opts('intake-channel');
  // AS 에서 카카오채널 고른 뒤 기타&단순문의로 옮겨도 유지, 장비설치(있으면)로 가면 없어짐
  wcEl('ops','intake-channel').value=K; setWorkType('ops','simple');await wait(150); out.keepOnSimple=wcEl('ops','intake-channel').value;
  // AS 접수 저장
  customers.push({id:'cK',name:'카채식당',businessNo:'333-33-33333',contact:'010-3333-4444',contactName:'최카채',ceo:'최카채',status:'거래중'});
  setWorkType('ops','as');await wait(150);wcEl('ops','search-name').value='카채식당';searchWorkCenterCustomer('ops');await wait(200);
  wcEl('ops','intake-channel').value=K;
  [...wcEl('ops','intake-fields').querySelectorAll('select')].forEach(x=>{const o=[...x.options].find(y=>y.value&&y.value!=='택배'&&y.value!=='기타');if(o)x.value=o.value;x.dispatchEvent(new Event('change'));});
  wcEl('ops','intake-memo').value='카카오채널 문의';
  const n0=wcDef('ops').works.length;submitWorkIntake({preventDefault(){}},'ops');await wait(200);
  const w=wcDef('ops').works.find(x=>x.memo==='카카오채널 문의');
  out.saved=wcDef('ops').works.length-n0;out.channel=w&&w.channel;
  // 업무 수정 창 — AS · 메뉴는 보이고, 유통은 안 보임
  const def=wcDef('ops'); const mk=(id,type)=>{def.works.unshift({id,customerId:'x',company:'시험',type,title:'t',status:'received',receiver:'정장훈',assignee:'',receivedAt:'2026-11-27',extra:{},contact:'',channel:'전화',priority:'normal'});};
  mk('W-K-AS','as');mk('W-K-MN','menu');mk('W-K-DS','dist');
  const editOpts=id=>{openWorkOwnEdit('ops',id);const v=[...document.getElementById('woe-channel').options].map(o=>o.value);document.getElementById('work-own-edit-modal').classList.add('hidden');return v;};
  out.editAs=editOpts('W-K-AS');out.editMenu=editOpts('W-K-MN');out.editDist=editOpts('W-K-DS');
  out.sales=wcChannels('sales','activity');
  out.ver=(window.KOB_VERSION||{}).groupware;
  return out;},K);
 console.log(JSON.stringify(r.tabs));
 const has=(t)=>Object.values(r.tabs[t]||{}).some(l=>l&&l.includes(K));
 ok(has('as'),'AS유지보수 접수방식에 카카오채널',r.tabs.as);
 ok(has('simple'),'기타&단순문의 접수방식에 카카오채널',r.tabs.simple);
 ok(has('menu'),'메뉴유지보수 접수방식에 카카오채널',r.tabs.menu);
 const others=Object.keys(r.tabs).filter(t=>!['as','simple','menu'].includes(t));
 ok(others.every(t=>!has(t)),'다른 탭('+others.join('·')+')에는 없음',others.map(t=>[t,r.tabs[t]]));
 ok(r.asOpts.indexOf(K)===r.asOpts.indexOf('카카오톡')+1,'카카오톡 바로 다음에 나옴',r.asOpts);
 ok(r.keepOnSimple===K,'AS → 기타&단순문의로 옮겨도 고른 값 유지',r.keepOnSimple);
 ok(r.saved===1&&r.channel===K,'카카오채널로 저장됨',r);
 ok(r.editAs.includes(K)&&r.editMenu.includes(K)&&!r.editDist.includes(K),'업무 수정 창도 3곳만',{a:r.editAs,m:r.editMenu,d:r.editDist});
 ok(!r.sales.includes(K),'영업업무센터에는 없음',r.sales);
 ok(r.ver==='1.1.49','버전 1.1.49',r.ver);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
