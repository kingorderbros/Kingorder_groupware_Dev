// 사용법: node tools/e2e-allworks-sales.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-11 — 영업본부 왼쪽 메뉴 '전체 업무이력'(보완서류 제출함 다음) + 운영·영업 전체 업무이력 줄을 누르면 상세
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
srv.listen(8865,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
 await pg.goto('http://localhost:8865/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const res=[];const ok=(n,c,d)=>res.push([n,!!c,d]);const wait=ms=>new Promise(r=>setTimeout(r,ms));
 // 시험 업무: 영업 활동 2(등록·보류) + 완료 1, 운영 AS 1
 await pg.evaluate(()=>{const S=wcDef('sales'),O=wcDef('ops');const d=ymd(new Date());
   S.works.push({id:'S-T1',type:'activity',category:'prospect',status:'received',company:'영업시험상호',customerId:'',receivedAt:d,receivedTime:'09:00',title:'신규 문의',memo:'키오스크 2대 문의',contact:'010-2222-3333',receiver:'정장훈',assignee:'김영업'},
                {id:'S-T2',type:'consult',status:'hold',company:'보류상호',customerId:'',receivedAt:d,title:'상담 보류',memo:'다음 달 재연락',receiver:'정장훈'},
                {id:'S-T3',type:'activity',category:'care',status:'done',company:'완료상호',customerId:'',receivedAt:d,title:'사후관리',receiver:'정장훈'});
   O.works.push({id:'O-T1',type:'as',status:'received',company:'운영시험상호',customerId:'',receivedAt:d,title:'POS 고장',memo:'카드 단말기',contact:'010-9999-8888',receiver:'정장훈',intakeEntries:[]});
   saveWorks();});
 let s=await pg.evaluate(()=>{const a=document.getElementById('nav-sales-allworks'),doc=document.getElementById('nav-sales-doc-supplement'),b=document.getElementById('nav-sales-allworks-badge');
   return {shown:!a.classList.contains('hidden'),afterDoc:doc.nextElementSibling===a,badge:b.innerText,badgeShown:!b.classList.contains('hidden'),title:b.title};});
 ok('영업 메뉴 보임 · 보완서류 제출함 바로 다음',s.shown&&s.afterDoc,s);
 ok('영업 메뉴 숫자 = 등록 1 + 보류 1 = 2',s.badge==='2'&&s.badgeShown&&s.title==='등록 1건 · 보류 1건',s);
 await pg.click('#nav-sales-allworks');await wait(500);
 s=await pg.evaluate(()=>{const nav=document.getElementById('nav-sales-allworks');const body=document.getElementById('wc-allworks-body-sales');
   return {active:wcState.sales.activeType,sec:!document.getElementById('sec-sales-work-center').classList.contains('hidden'),navOn:nav.classList.contains('bg-blue-600/25'),
     title:document.getElementById('page-title').innerText,wcTitle:document.getElementById('wc-title-sales').textContent,tabsHidden:wcEl('sales','type-tabs').classList.contains('hidden'),
     rows:body?[...body.querySelectorAll('tbody tr')].map(r=>r.innerText.replace(/\s+/g,' ')):null};});
 ok('영업 전체 업무이력 화면 · 메뉴 강조 · 제목',s.sec&&s.active==='allworks'&&s.navOn&&s.title==='전체 업무이력'&&s.wcTitle==='전체 업무이력'&&s.tabsHidden,s);
 ok('영업 업무 3건 · 미완료가 먼저',s.rows&&s.rows.length>=3&&!s.rows[0].includes('완료상호'),s.rows);
 // 줄 누르면 상세
 const openDetail=async(key,id)=>{await pg.evaluate((k,i)=>{const tr=[...document.querySelectorAll('#wc-allworks-body-'+k+' tbody tr')].find(r=>String(r.getAttribute('onclick')).includes(i));tr.click();},key,id);await wait(500);
   return pg.evaluate(()=>{const m=document.getElementById('wc-history-modal');const r={open:m&&!m.classList.contains('hidden'),text:m?m.innerText:''};if(typeof closeWorkHistoryDetail==='function')closeWorkHistoryDetail();return r;});};
 let d=await openDetail('sales','S-T1');
 ok('영업 줄 누르면 상세 (상호·내용·연락처)',d.open&&d.text.includes('영업시험상호')&&d.text.includes('키오스크 2대 문의')&&d.text.includes('010-2222-3333'),d.text.slice(0,200));
 d=await openDetail('sales','S-T2');ok('영업 보류 건 상세',d.open&&d.text.includes('보류상호'),d.text.slice(0,120));
 // 영업업무센터 메뉴로 돌아가면 업무 탭, 탭 줄에 전체 업무이력 없음
 await pg.click('#nav-sales-work-center');await wait(400);
 s=await pg.evaluate(()=>({active:wcState.sales.activeType,tabs:[...wcEl('sales','type-tabs').querySelectorAll('button')].map(b=>b.textContent.trim()),title:document.getElementById('wc-title-sales').textContent}));
 ok('영업업무센터 메뉴 → 업무 탭 · 탭 줄에 전체 업무이력 없음',s.active!=='allworks'&&!s.tabs.some(t=>t.includes('전체 업무이력'))&&s.title!=='전체 업무이력',s);
 // 운영도 줄 누르면 상세
 await pg.click('#nav-ops-allworks');await wait(500);
 d=await openDetail('ops','O-T1');ok('운영 줄 누르면 상세',d.open&&d.text.includes('운영시험상호')&&d.text.includes('카드 단말기'),d.text.slice(0,120));
 // 모든 업무 유형 줄이 상세로 열리는지 (영업 파생 건 포함) — 오류 없이
 const all=await pg.evaluate(async()=>{const out=[];for(const k of ['ops','sales']){for(const w of wcDef(k).works.slice(0,60)){try{openWorkHistoryDetail(k,w.id);const m=document.getElementById('wc-history-modal');out.push([k,w.id,m&&!m.classList.contains('hidden')]);closeWorkHistoryDetail();}catch(e){out.push([k,w.id,'ERR '+e.message]);}}}return out;});
 const bad=all.filter(x=>x[2]!==true);ok(`모든 업무 상세 열림 (${all.length}건)`,!bad.length,bad.slice(0,5));
 // 권한 없으면 메뉴 숨김
 const hid=await pg.evaluate(()=>{allowedPageIds=allowedPageIds.filter(x=>x!=='sales-wc-allworks');applyMenuPermissions();return document.getElementById('nav-sales-allworks').classList.contains('hidden');});
 ok('영업 전체 업무이력 권한 없으면 메뉴 숨김',hid===true);
 res.forEach(([n,c,dd])=>console.log((c?'✓ ':'✗ ')+n+(c?'':'  → '+JSON.stringify(dd))));
 console.log('errors:',errs.length?errs:'없음');const fail=res.filter(x=>!x[1]).length+errs.length;console.log(fail?`실패 ${fail}`:`통과 ${res.length}`);
 await br.close();srv.close();process.exit(fail?1:0);});
