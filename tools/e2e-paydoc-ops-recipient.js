// 사용법: node tools/e2e-paydoc-ops-recipient.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-06 — 보완서류 요청 수신 대상에 운영팀 관리파트 · 운영팀장 추가. 받은 사람은 제출함에서 본인 지정 건만 보고 올릴 수 있어야 합니다.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
const wait=ms=>new Promise(r=>setTimeout(r,ms));let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
const STAFF=[['t1','최지록','ops','운영팀','','팀장'],['t2','홍예지','ops','운영팀','관리파트','파트장'],['t3','김진경','ops','운영팀','관리파트','매니저'],['t4','이재영','ops','운영팀','운영파트','파트장'],['t5','조원규','ops','설치팀','','과장'],['t6','김능영','sales','','','팀장'],['t7','김아름','payment','','','본부장']];
srv.listen(8862,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));await pg.setViewport({width:1400,height:900});
 const login=async(name)=>{await pg.goto('http://localhost:8862/',{waitUntil:'networkidle0'});await pg.evaluate((STAFF,name)=>{
   const list=STAFF.map(([id,n,dept,team,part,rank])=>({id,name:n,dept,team,part,rank,email:id+'@x.kr',groupId:dept,level:'manager'}));
   localUsers.push(...list);
   payDocRequests.length=0;const mk=(id,type,tn)=>({id,merchant:'M-'+id,bizNo:'',regType:'pg',status:'requested',priority:'normal',requester:'김아름',requestedAt:'2026-11-06',dueDate:'2026-11-09',targetType:type,targetName:tn,claimedBy:'',memo:'',items:[payDocItem('x','')],history:[]});
   payDocRequests.push(mk('PD-A','person','홍예지'),mk('PD-B','team','영업본부 전체'),mk('PD-C','person','김능영'));
   window.__t=list;enterApp(list.find(u=>u.name===name));},STAFF,name);await wait(500);};
 const state=()=>pg.evaluate(()=>{const nav=[...document.querySelectorAll('#nav-cross-dept a')].map(a=>a.textContent.trim());const inbox=nav.some(t=>t.includes('보완서류 제출함'));return{inbox,nav,recipient:payDocIsOpsRecipient(),mine:payDocMyRequests().map(r=>r.id),canA:payDocCanUpload(payDocReq('PD-A')),canB:payDocCanUpload(payDocReq('PD-B')),canC:payDocCanUpload(payDocReq('PD-C')),rev:payDocCanReview()};});
 console.log('■ 결제본부: 담당자 목록');await login('김아름');
 const o=await pg.evaluate(()=>{openPayDocRequestModal();const sel=document.getElementById('paydoc-assignee');const groups=[...sel.querySelectorAll('optgroup')].map(g=>[g.label,[...g.children].map(x=>x.value)]);closePayDocRequestModal();return groups;});
 const ops=(o.find(g=>g[0]==='운영팀')||[,[]])[1],sales=(o.find(g=>g[0]==='영업본부')||[,[]])[1];
 ok(ops.includes('최지록')&&ops.includes('홍예지')&&ops.includes('김진경'),'운영팀 칸에 팀장·관리파트 표시',o);ok(!ops.includes('이재영')&&!ops.includes('조원규'),'운영파트·설치팀은 제외',ops);ok(sales.includes('김능영'),'영업본부 담당자 유지',sales);
 let s=await state();ok(!s.recipient&&s.rev,'결제본부는 그대로 검토 화면',s);
 console.log('■ 관리파트(홍예지): 받은 건 처리');await login('홍예지');s=await state();
 ok(s.inbox,'왼쪽 메뉴에 보완서류 제출함',s.nav);ok(s.mine.join()==='PD-A','본인 지정 건만 보임',s.mine);ok(s.canA&&!s.canB&&!s.canC,'본인 건만 올릴 수 있음',s);ok(!s.rev,'검토 · 요청 등록 권한 없음');
 const scr=await pg.evaluate(()=>{const a=[...document.querySelectorAll('#nav-cross-dept a')].find(x=>x.textContent.includes('보완서류 제출함'));a.click();return new Promise(r=>setTimeout(()=>{const t=document.getElementById('section-payment-work-center')||document.getElementById('sec-payment-work-center');r({title:document.getElementById('paywc-center-title').textContent,text:(t||document.body).innerText.slice(0,1500),open:t?!t.classList.contains('hidden'):null,badge:(document.getElementById('nav-cross-payment-work-center-badge')||{}).innerText});},300));});
 ok(scr.title==='보완서류 제출함','제목이 보완서류 제출함',scr.title);ok(scr.text.includes('M-PD-A')&&!scr.text.includes('M-PD-B')&&!scr.text.includes('M-PD-C'),'목록에 본인 건만',scr.text.slice(0,300));ok(!scr.text.includes('영업본부 전체'),'범위 전환 단추 없음');ok(scr.badge==='1','미처리 숫자 1',scr.badge);
 const det=await pg.evaluate(()=>{openPayDocDetail('PD-A');return new Promise(r=>setTimeout(()=>{const m=document.getElementById('paydoc-detail-modal');r({t:m.innerText.slice(0,2500)});},200));});
 ok(/요청 확인/.test(det.t),'상세 창에 요청 확인 단추',det.t.slice(0,200));ok(/업로드|회신/.test(det.t),'상세 창에 올리기 · 회신',det.t.slice(0,200));
 console.log('■ 운영팀장(최지록)');await login('최지록');s=await state();ok(s.recipient&&s.inbox,'제출함 있음',s.nav);ok(s.mine.length===0,'지정 건 없으면 비어 있음',s.mine);
 console.log('■ 대상이 아닌 운영 직원');await login('이재영');s=await state();ok(!s.recipient&&!s.inbox,'운영파트는 제출함 없음',s.nav);await login('조원규');s=await state();ok(!s.recipient&&!s.inbox,'설치팀은 제출함 없음',s.nav);
 console.log('■ 영업본부');await login('김능영');s=await state();ok(!s.recipient&&s.canB&&s.canC&&!s.canA,'영업은 지금과 같음',s);ok(s.mine.join()==='PD-B,PD-C','영업 목록 유지',s.mine);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
