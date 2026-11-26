// 사용법: node tools/e2e-mobile-dash-cards.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-26 — 휴대폰에서 현황 화면(경영현황판 · 운영본부 · 결제본부 현황)의 표를 한 건씩 카드로, 옆으로 밀지 않음 · 상세 창도 옆 넘침 없음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8896,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[390,844],[360,640],[1440,900]]){
  const phone=vw<640;console.log(`■ 화면 ${vw}x${vh} ${phone?'(휴대폰)':'(컴퓨터)'}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:phone,hasTouch:phone});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8896/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'김영업',dept:'sales',groupId:'sales'},{id:'u3',name:'최운영',dept:'ops',groupId:'ops'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const S=WORK_CENTERS.sales;S.works=[];WORK_CENTERS.ops.works=[];
   for(let k=1;k<=4;k++)S.works.push({id:'S-'+k,type:'consult',title:'영업 업무 '+k+' 긴 제목이 들어가도 화면 안에',status:'working',priority:'normal',receivedAt:'2026-11-20',receiver:'대표',assignee:'김영업'});
   for(let k=1;k<=4;k++)WORK_CENTERS.ops.works.push({id:'O-'+k,type:'as',title:'운영 업무 '+k+' 아주 긴 제목',status:k%2?'working':'received',priority:'normal',receivedAt:'2026-11-20',receiver:'대표',assignee:'최운영'});
   const d=ymd(new Date());payDocRequests.push({id:'PD-T1',merchant:'결제시험상호',status:'requested',targetType:'person',targetName:'김영업',items:[],requestedAt:d,dueDate:'2020-01-01',regType:'pg',priority:'normal'});
   enterApp(U[0]);await sleep(150);
   const o={};
   const check=(hostSel)=>{const host=document.querySelector(hostSel);const tabs=[...host.querySelectorAll('table.kob-mstack')];
     const wide=tabs.filter(t=>t.getBoundingClientRect().right>window.innerWidth+0.5||t.scrollWidth>t.parentElement.clientWidth+1).length;
     const labeled=tabs.filter(t=>t.querySelector('thead')).every(t=>t.querySelector('tbody td[data-label]')||!t.querySelector('tbody tr td:not([colspan])'));
     return {n:tabs.length,wide,labeled,pageX:document.documentElement.scrollWidth>window.innerWidth+1,trBlock:tabs[0]?getComputedStyle(tabs[0].querySelector('tbody tr')).display:''};};
   navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(200);o.exec=check('#sec-exec-center');
   // 거르기로 다시 그려도 칸 이름 다시 붙음
   if(typeof setExecFilter==='function'){setExecFilter('kind','영업업무');await sleep(80);o.execRe=check('#sec-exec-center');resetExecFilter();await sleep(50);}
   navigate('ops',document.getElementById('nav-ops'));await sleep(200);o.ops=check('#ops-dash');
   const orow=document.querySelector('#ops-dash table.kob-mstack tbody tr[onclick*="openWorkHistoryDetail"]');
   if(orow){orow.click();await sleep(150);const m=[...document.querySelectorAll('.fixed.inset-0:not(.hidden)')].pop();o.opsDetail=!!m;o.opsDetailWide=m?[...m.querySelectorAll('*')].some(e=>e.getBoundingClientRect().right>window.innerWidth+2&&getComputedStyle(e).position!=='fixed'&&e.closest('.overflow-x-auto')==null):null;
     document.querySelectorAll('.fixed.inset-0:not(.hidden)').forEach(x=>x.classList.add('hidden'));}
   navigate('payment',document.getElementById('nav-payment'));await sleep(200);o.pay=check('#payment-dash');
   return o;});
  if(phone){
   ok(r.exec.n===2&&r.exec.wide===0&&r.exec.trBlock==='grid','경영현황판 표 2개 → 카드, 옆 넘침 없음',r.exec);
   ok(r.exec.labeled,'경영현황판 칸 이름 표시',r.exec);
   ok(r.execRe&&r.execRe.labeled&&r.execRe.wide===0,'거르기 후 다시 그려도 칸 이름',r.execRe);
   ok(r.ops.n===2&&r.ops.wide===0&&r.ops.labeled,'운영본부 현황 표 → 카드',r.ops);
   ok(r.opsDetail&&r.opsDetailWide===false,'운영 업무 상세 창 옆 넘침 없음',r);
   ok(r.pay.n===1&&r.pay.wide===0,'결제본부 현황 표 → 카드',r.pay);
   ok(!r.exec.pageX&&!r.ops.pageX&&!r.pay.pageX,'화면 전체 옆 넘침 없음',r);
  } else {
   ok(r.exec.trBlock!=='grid'&&r.ops.trBlock!=='grid','컴퓨터 — 표 그대로',[r.exec.trBlock,r.ops.trBlock]);
  }
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
