// 사용법: node tools/e2e-sales-allworks-all.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-20 — 영업본부 전체 업무이력: 영업업무센터 업무 + 영업본부 담당자에게 배정된 그룹웨어의 모든 일
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8874,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1400,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<700,hasTouch:vw<700});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8874/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'김영업',dept:'sales',groupId:'sales'},{id:'u4',name:'이영업',dept:'sales',groupId:'sales'},{id:'u3',name:'박운영',dept:'ops',groupId:'ops'},{id:'u5',name:'최결제',dept:'payment',groupId:'payment'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const S=WORK_CENTERS.sales,O=WORK_CENTERS.ops;S.works=[];O.works=[];
   const mk=(c,id,title,st,as,d)=>({id,center:c,type:'activity',title,status:st,priority:'normal',receivedAt:d||'2026-11-18',receiver:'대표',assignee:as,company:title.split(' ')[0]});
   S.works.push(mk('sales','S-1','강남치킨 견적','working','김영업'),mk('sales','S-2','역삼분식 상담','received',''),mk('sales','S-3','선릉카페 제안','done','이영업','2026-11-10'));
   O.works.push(mk('ops','O-1','키오스크 AS','working','박운영'),mk('ops','O-2','영업지원 설치','working','김영업'));
   inboundRecords=[{id:'IN-1',inDate:'2026-11-19',company:'홍대국밥',phone:'010-1234-5678',kob:{dept:'영업',owner:'김영업',extras:[],contactAt:'2026-11-19'}},{id:'IN-2',inDate:'2026-11-19',company:'운영국밥',phone:'010',kob:{dept:'운영',owner:'박운영',extras:[]}}];
   collabRequests.length=0;
   collabRequests.push({id:'collab_901',type:'collab',title:'영업 자료 요청',assignee:'박운영',assigneeUser:'',assigneeUsers:['이영업','박운영'],sourceDept:'ops',targetDept:'ops',status:'accepted',date:'2026-11-17'},
                       {id:'collab_902',type:'collab',title:'운영끼리 협업',assignee:'대표',assigneeUser:'박운영',sourceDept:'admin',targetDept:'ops',status:'pending',date:''},
                       {id:'collab_903',type:'collab',title:'취소된 요청',assignee:'대표',assigneeUser:'김영업',sourceDept:'admin',targetDept:'sales',status:'cancelled',date:'2026-11-16'});
   payDocRequests.length=0;
   payDocRequests.push({id:'PD-1',merchant:'잠실떡집',status:'requested',requester:'최결제',requestedAt:'2026-11-15',targetType:'person',targetName:'박운영',targetNames:['박운영','이영업'],claimedBy:'',items:[],history:[]});
   quotes.length=0;
   enterApp(U[0]);await sleep(120);
   navigate('sales-work-center',document.getElementById('nav-sales-allworks'));await sleep(250);
   const body=()=>document.getElementById('wc-allworks-body-sales');
   const rows=()=>[...body().querySelectorAll('tbody tr')].filter(t=>t.children.length>2).map(t=>({type:t.children[2].textContent.trim(),co:t.children[3].textContent.trim(),text:t.children[4].textContent.trim(),owner:t.children[6].textContent.trim(),st:t.children[7].textContent.trim(),open:t.className.includes('bg-amber-50')}));
   const out={};
   out.on=!!body();out.all=rows();out.head=body().querySelector('p').textContent;
   const frame=body().parentElement;
   const sels=()=>[...frame.querySelectorAll('select')];
   const setSel=(i,v)=>{const s=sels()[i];s.value=v;s.dispatchEvent(new Event('change'));};
   out.ownerOpts=[...sels()[2].options].map(o=>o.value);
   setSel(0,'k:paydoc');out.paydoc=rows();
   setSel(0,'k:inbound');out.inbound=rows();
   setSel(0,'');setSel(2,'김영업');out.kim=rows();
   setSel(2,'');setSel(1,'open');out.open=rows();
   setSel(1,'done');out.done=rows();
   setSel(1,'');
   const inp=frame.querySelector('input[type=text]');inp.value='5678';inp.dispatchEvent(new Event('input'));out.phone=rows();
   inp.value='';inp.dispatchEvent(new Event('input'));
   // 협업 줄 클릭 → 협업 상세
   const tr=[...body().querySelectorAll('tbody tr')].find(t=>/영업 자료 요청/.test(t.textContent));tr.click();await sleep(80);
   out.collabClick=[...document.querySelectorAll('[id]')].some(e=>/collab.*detail.*modal/i.test(e.id)&&!e.classList.contains('hidden'));
   const fits=frame.getBoundingClientRect();out.fits=fits.left>=0&&fits.right<=window.innerWidth+1;
   return out;});
  const has=(l,t)=>l.some(x=>x.text.includes(t));
  ok(r.on&&r.all.length===8,'영업본부 전체 업무이력에 8건 (영업 3 + 운영업무 1 + 인바운드 1 + 협업 2 + 보완서류 1)',r.all.map(x=>x.text));
  ok(has(r.all,'영업지원 설치')&&!has(r.all,'키오스크 AS'),'운영업무센터 업무는 영업본부 담당자 건만',r.all.map(x=>x.text));
  ok(has(r.all,'홍대국밥')&&!has(r.all,'운영국밥'),'인바운드는 영업본부 배정 건만');
  ok(has(r.all,'영업 자료 요청')&&!has(r.all,'운영끼리 협업')&&has(r.all,'취소된 요청'),'협업요청은 영업 직원이 받는 사람에 들어 있거나 영업본부 앞 건만');
  ok(has(r.all,'잠실떡집'),'보완서류는 담당자 여러 명 중 영업 직원이 있으면 표시');
  const firstDone=r.all.findIndex(x=>!x.open);ok(firstDone>0&&r.all.slice(firstDone).every(x=>!x.open),'미완료 건이 먼저',r.all.map(x=>x.open));
  ok(!r.all.find(x=>x.text.includes('취소된 요청')).open,'취소된 협업은 끝난 건으로');
  ok(r.ownerOpts.join()===',김영업,이영업','담당자 거르기는 영업본부 직원',r.ownerOpts);
  ok(r.paydoc.length===1&&r.paydoc[0].owner==='박운영, 이영업'&&r.inbound.length===1,'업무유형 거르기 (보완서류 · 인바운드)',[r.paydoc,r.inbound]);
  ok(r.kim.length===4&&r.kim.every(x=>/김영업/.test(x.owner)),'담당자 거르기 — 김영업 (영업 · 운영업무 · 인바운드 · 취소 협업)',r.kim.map(x=>x.text));
  ok(r.open.every(x=>x.open)&&r.open.length===6,'상태 미완료',r.open.length);
  ok(r.done.length===1&&r.done[0].text==='선릉카페 제안','상태 완료 (취소된 협업은 완료로 세지 않음)',r.done.map(x=>x.text));
  ok(r.phone.length===1&&r.phone[0].co==='홍대국밥','연락처 숫자 검색',r.phone);
  ok(r.collabClick,'협업 줄 클릭 → 협업 상세 창');
  ok(r.fits,'화면 폭 안');
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
