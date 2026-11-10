// 사용법: node tools/e2e-dept-dash.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-11 — 왼쪽 메뉴 본부 이름 = 현황 화면(펼치기·접기 안 함), 화살표 = 하위 메뉴 펼치기·접기. 운영·결제 현황은 실제 자료
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
srv.listen(8867,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>{errs.push('dialog: '+d.message());d.dismiss();});
 await pg.goto('http://localhost:8867/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const res=[];const ok=(n,c,d)=>res.push([n,!!c,d]);const wait=ms=>new Promise(r=>setTimeout(r,ms));
 await pg.evaluate(()=>{const O=wcDef('ops');const d=ymd(new Date());
   [['received',''],['received',''],['assigned','김운영'],['working','김운영'],['hold','이운영'],['done','김운영']].forEach(([st,a],i)=>O.works.push({id:'D-'+i,type:i%2?'menu':'as',status:st,assignee:a,company:'현황시험'+i,customerId:'',receivedAt:d,title:'시험 '+i,receiver:'정장훈',intakeEntries:[]}));saveWorks();});
 const st=(dp)=>pg.evaluate(dp=>({sub:!document.getElementById('submenu-'+dp).classList.contains('hidden'),sec:!document.getElementById('sec-'+dp).classList.contains('hidden'),title:document.getElementById('page-title').innerText}),dp);
 for(const dp of ['sales','ops','payment']){
   const b=await st(dp);
   await pg.click('#nav-'+dp+' > div');await wait(300);let a=await st(dp);
   ok(`${dp}: 이름 누르면 현황 화면 · 하위 메뉴 그대로`,a.sec&&a.sub===b.sub,{b,a});
   await pg.click('#nav-'+dp+' [role=button]');await wait(250);let c=await st(dp);
   ok(`${dp}: 화살표 누르면 접힘 · 화면 이동 없음`,c.sub===!a.sub&&c.sec,{a,c});
   await pg.click('#nav-'+dp+' [role=button]');await wait(250);let e=await st(dp);
   ok(`${dp}: 화살표 다시 누르면 펼침`,e.sub===a.sub,{e});
 }
 // 운영 현황 숫자
 await pg.click('#nav-ops > div');await wait(300);
 let o=await pg.evaluate(()=>{const h=document.getElementById('ops-dash');const cards=[...h.querySelectorAll('button')].slice(0,6).map(b=>b.innerText.replace(/\s+/g,' '));return {cards,text:h.innerText,old:document.body.innerText.includes('99.9%')};});
 ok('운영 현황: 예시 숫자(99.9%) 없음',!o.old);
 ok('운영 현황 카드: 접수 2 · 배정 1 · 처리중 1 · 보류 1 · 오늘 접수 6',o.cards[0].includes('2건')&&o.cards[1].includes('1건')&&o.cards[2].includes('1건')&&o.cards[3].includes('1건')&&o.cards[4].includes('6건'),o.cards);
 ok('운영 현황: 담당자별 · 업무유형별 · 최근 미완료',o.text.includes('미배정')&&o.text.includes('김운영')&&o.text.includes('업무유형별')&&o.text.includes('현황시험0'),o.text.slice(0,300));
 // 카드 누르면 전체 업무이력(보류만)
 await pg.evaluate(()=>[...document.querySelectorAll('#ops-dash button')][3].click());await wait(500);
 o=await pg.evaluate(()=>({active:wcState.ops.activeType,rows:[...document.querySelectorAll('#wc-allworks-body-ops tbody tr')].map(r=>r.innerText.replace(/\s+/g,' ')),sel:wcAllWorksFilter.status}));
 ok('보류 카드 → 전체 업무이력 보류 건만',o.active==='allworks'&&o.sel==='hold'&&o.rows.length===1&&o.rows[0].includes('현황시험4'),o);
 // 최근 미완료 줄 → 상세
 await pg.click('#nav-ops > div');await wait(300);
 await pg.evaluate(()=>document.querySelector('#ops-dash tr[onclick*="openWorkHistoryDetail"]').click());await wait(400);
 o=await pg.evaluate(()=>{const m=document.getElementById('wc-history-modal');const r={open:m&&!m.classList.contains('hidden'),t:m?m.innerText.slice(0,80):''};closeWorkHistoryDetail();return r;});
 ok('최근 미완료 줄 → 업무 상세',o.open&&o.t.includes('현황시험'),o);
 // 결제 현황
 await pg.evaluate(()=>{const d=ymd(new Date());payDocRequests.push({id:'PD-T1',merchant:'결제시험상호',status:'requested',targetType:'person',targetName:'김영업',items:[],requestedAt:d,dueDate:'2020-01-01',regType:'pg',priority:'normal'},{id:'PD-T2',merchant:'완료상호',status:'completed',targetType:'person',targetName:'김영업',items:[],requestedAt:d,regType:'pg'});});
 await pg.click('#nav-payment > div');await wait(300);
 o=await pg.evaluate(()=>({text:document.getElementById('payment-dash').innerText}));
 ok('결제 현황: 상태별 카드 · 기한 지남 · 최근 미완료',o.text.includes('보완요청')&&o.text.includes('확인완료')&&o.text.includes('기한 지남')&&o.text.includes('결제시험상호'),o.text.slice(0,300));
 await pg.evaluate(()=>document.querySelector('#payment-dash tr[onclick*="openPayDocDetail"]').click());await wait(400);
 o=await pg.evaluate(()=>{const m=[...document.querySelectorAll('[id$="-modal"]:not(.hidden)')].map(x=>x.id);return m;});
 ok('결제 최근 요청 줄 → 상세 창',o.length>0,o);
 await pg.evaluate(()=>document.querySelectorAll('[id$="-modal"]:not(.hidden)').forEach(m=>m.classList.add('hidden')));
 // 영업 현황은 기존 그대로
 await pg.click('#nav-sales > div');await wait(300);
 o=await pg.evaluate(()=>document.getElementById('sec-sales').innerText.includes('영업본부 현황'));ok('영업 현황 화면 그대로',o);
 res.forEach(([n,c,dd])=>console.log((c?'✓ ':'✗ ')+n+(c?'':'  → '+JSON.stringify(dd))));
 console.log('errors:',errs.length?errs:'없음');const fail=res.filter(x=>!x[1]).length+errs.length;console.log(fail?`실패 ${fail}`:`통과 ${res.length}`);
 await br.close();srv.close();process.exit(fail?1:0);});
