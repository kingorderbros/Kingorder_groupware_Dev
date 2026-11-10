// 사용법: node tools/e2e-case-detail.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-11 — 영업본부 현황 '미처리 상담' 카드 → 상담관리(미완료만) → 줄을 누르면 상담 상세 창
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
srv.listen(8869,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>{errs.push('dialog: '+d.message());d.dismiss();});
 await pg.goto('http://localhost:8869/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const res=[];const ok=(n,c,d)=>res.push([n,!!c,d]);const wait=ms=>new Promise(r=>setTimeout(r,ms));
 await pg.evaluate(()=>{const cu=customers[0];cases.push({id:'CS-T1',receivedDate:ymd(new Date()),receiver:'정장훈',origin:'전화',customerId:cu?cu.id:'',type:'제품문의',replyMethod:'전화',description:'키오스크 화면이 멈춤\n재부팅해도 같음',responder:'',completed:false,responseContent:'',extraAction:'현장 방문 예정',decisionRequest:''},
   {id:'CS-T2',receivedDate:ymd(new Date()),receiver:'정장훈',origin:'이메일',customerId:'',type:'가격문의',description:'완료된 상담',responder:'김영업',responseDate:'2026-11-10 10:00',completed:true,responseContent:'견적 안내함'});renderCases();});
 await pg.click('#nav-sales > div');await wait(400);
 const card=await pg.evaluate(()=>{const c=[...document.querySelectorAll('#sec-sales [onclick*="sales-consulting"]')].find(x=>x.innerText.includes('미처리 상담'));return c?c.innerText.replace(/\s+/g,' '):null;});
 ok('영업 현황에 미처리 상담 카드',card,card);
 await pg.evaluate(()=>[...document.querySelectorAll('#sec-sales [onclick*="sales-consulting"]')].find(x=>x.innerText.includes('미처리 상담')).click());await wait(400);
 let s=await pg.evaluate(()=>({sec:!document.getElementById('sec-sales-consulting').classList.contains('hidden'),filter:caseFilterStatus,rows:[...document.querySelectorAll('#cases-table-body tr')].map(r=>r.innerText.replace(/\s+/g,' '))}));
 ok('카드 → 상담관리 · 미완료만',s.sec&&s.filter==='pending'&&s.rows.some(r=>r.includes('CS-T1'))&&!s.rows.some(r=>r.includes('CS-T2')),s);
 // 줄 누르기 (실제 마우스)
 const box=await pg.evaluate(()=>{const tr=[...document.querySelectorAll('#cases-table-body tr')].find(r=>r.innerText.includes('CS-T1'));tr.scrollIntoView({block:'center'});const td=tr.children[7].getBoundingClientRect();return [td.left+20,td.top+td.height/2];});
 await pg.mouse.click(box[0],box[1]);await wait(400);
 s=await pg.evaluate(()=>{const m=document.getElementById('case-detail-modal');return {open:m&&!m.classList.contains('hidden'),text:m?m.innerText:'',edit:!document.getElementById('case-modal').classList.contains('hidden')};});
 ok('줄 누르면 상담 상세 창 (수정 창 아님)',s.open&&!s.edit,s);
 ok('상세: 번호·접수·문의 내용 줄바꿈·추가 조치',s.text.includes('CS-T1')&&s.text.includes('키오스크 화면이 멈춤\n재부팅해도 같음')&&s.text.includes('현장 방문 예정')&&s.text.includes('미완료'),s.text.slice(0,300));
 // 수정 단추 → 수정 창
 await pg.evaluate(()=>[...document.querySelectorAll('#case-detail-modal button')].find(b=>b.innerText.includes('수정')).click());await wait(300);
 s=await pg.evaluate(()=>({detail:!document.getElementById('case-detail-modal').classList.contains('hidden'),edit:!document.getElementById('case-modal').classList.contains('hidden'),id:document.getElementById('edit-case-id').value}));
 ok('[수정] → 상세 닫고 수정 창',!s.detail&&s.edit&&s.id==='CS-T1',s);
 await pg.evaluate(()=>closeCaseModal());
 // Esc · 바깥 누르면 닫힘, 수정 아이콘은 수정 창만
 await pg.evaluate(()=>openCaseDetail('CS-T1'));await pg.keyboard.press('Escape');await wait(200);
 s=await pg.evaluate(()=>document.getElementById('case-detail-modal').classList.contains('hidden'));ok('Esc 로 닫힘',s);
 await pg.evaluate(()=>{setCaseFilter('all');const tr=[...document.querySelectorAll('#cases-table-body tr')].find(r=>r.innerText.includes('CS-T2'));tr.querySelector('button[title="수정"]').click();});await wait(300);
 s=await pg.evaluate(()=>({detail:!document.getElementById('case-detail-modal').classList.contains('hidden'),edit:!document.getElementById('case-modal').classList.contains('hidden')}));
 ok('수정 아이콘은 수정 창만 (상세 창 안 뜸)',!s.detail&&s.edit,s);
 await pg.evaluate(()=>closeCaseModal());
 await pg.evaluate(()=>openCaseDetail('CS-T2'));await wait(200);
 s=await pg.evaluate(()=>document.getElementById('case-detail-modal').innerText);ok('완료 건 상세: 처리 완료·응답자·응답 내용',s.includes('처리 완료')&&s.includes('김영업')&&s.includes('견적 안내함'),s.slice(0,200));
 res.forEach(([n,c,dd])=>console.log((c?'✓ ':'✗ ')+n+(c?'':'  → '+JSON.stringify(dd))));
 console.log('errors:',errs.length?errs:'없음');const fail=res.filter(x=>!x[1]).length+errs.length;console.log(fail?`실패 ${fail}`:`통과 ${res.length}`);
 await br.close();srv.close();process.exit(fail?1:0);});
