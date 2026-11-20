// 사용법: node tools/e2e-exec-list-filter.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-20 — 경영현황판 한눈에 보기 목록 창 안 거르기: 구분 칩 · 본부 · 담당자 · 상태 · 검색어 · 초기화
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8873,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1400,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<700,hasTouch:vw<700});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8873/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'김영업',dept:'sales',groupId:'sales'},{id:'u3',name:'박운영',dept:'ops',groupId:'ops'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const S=WORK_CENTERS.sales,O=WORK_CENTERS.ops;S.works=[];O.works=[];
   const y=ymd(new Date(Date.now()-86400000));
   const mk=(c,id,title,st,as,extra)=>Object.assign({id,center:c,type:'activity',title,status:st,priority:'normal',receivedAt:'2026-11-18',receiver:'대표',assignee:as},extra||{});
   S.works.push(mk('sales','S-1','강남치킨 견적','working','김영업',{dueDate:y,progressLog:[{id:'a1',kind:'action',at:'2026-11-18 10:00',loggedAt:'2026-11-18 10:00',by:'김영업',method:'전화',text:'고객 통화 설치 3대 확정'},{id:'a2',kind:'issue',at:'2026-11-18 15:00',loggedAt:'2026-11-18 15:00',by:'김영업',method:'',text:'특판 단가 승인 대기'},{id:'a3',kind:'system',at:'2026-11-18 15:01',loggedAt:'2026-11-18 15:01',by:'김영업',text:'완료 예정일 변경'}]}),mk('sales','S-2','역삼분식 상담','received',''),mk('sales','S-3','선릉카페 제안','working','김영업'));
   O.works.push(mk('ops','O-1','키오스크 AS','working','박운영'),mk('ops','O-2','메뉴 수정','hold','박운영'));
   inboundRecords=[{id:'IN-1',inDate:'2026-11-19',company:'홍대국밥',phone:'010',kob:{dept:'영업',owner:'김영업',extras:[],contactAt:'2026-11-19',progressLog:[{id:'b1',kind:'action',at:'2026-11-19 11:00',loggedAt:'2026-11-19 11:00',by:'김영업',method:'방문',text:'매장 방문 상담'}]}},{id:'IN-2',inDate:'2026-11-19',company:'운영국밥',phone:'010',kob:{dept:'운영',owner:'박운영',extras:[],contactAt:''}}];
   enterApp(U[0]);await sleep(120);
   navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(200);
   openExecListModal('open');
   const rows=()=>[...document.querySelectorAll('#exec-modal-rows tr')].filter(t=>t.getAttribute('onclick')&&!t.classList.contains('exec-prog-row')).map(t=>t.children[1].textContent.trim());
   const cnt=()=>(document.getElementById('exec-modal-count')||{}).textContent;
   const out={};
   const prog=id=>{const tr=[...document.querySelectorAll('#exec-modal-rows tr')].find(t=>!t.classList.contains('exec-prog-row')&&t.children[1]&&t.children[1].textContent.trim()===id);const nx=tr&&tr.nextElementSibling;return nx&&nx.classList.contains('exec-prog-row')?nx.innerText:'';};
   out.p={s1:prog('S-1'),s3:prog('S-3'),in1:prog('IN-1'),o1:prog('O-1'),in2:prog('IN-2'),s2:prog('S-2')};
   out.all=rows();out.cnt0=cnt();out.bar=!!document.querySelector('#exec-modal-filter select');
   // 구분 칩 클릭
   const chipBtn=t=>[...document.querySelectorAll('#exec-modal-chips button')].find(b=>b.textContent.startsWith(t));
   chipBtn('인바운드').click();out.kind=rows();out.chipOn=chipBtn('인바운드').className.includes('bg-gray-800');
   chipBtn('인바운드').click();out.kindOff=rows().length;
   // 본부
   const selects=()=>[...document.querySelectorAll('#exec-modal-filter select')];
   const setSel=(i,v)=>{const s=selects()[i];s.value=v;s.dispatchEvent(new Event('change'));};
   setSel(0,'ops');out.dept=rows();
   setSel(0,'');setSel(1,'김영업');out.owner=rows();out.cnt1=cnt();
   setSel(1,'미배정');out.unassigned=rows();
   setSel(1,'');setSel(2,'late');out.late=rows();
   setSel(2,'issue');out.issue=rows();
   setSel(2,'');
   // 검색 — 입력 중 칸이 다시 그려지지 않음
   const inp=document.querySelector('#exec-modal-filter input[type=search]');inp.focus();inp.value='선릉';inp.dispatchEvent(new Event('input'));
   out.q=rows();out.focusKept=document.activeElement===inp;
   inp.value='없는말';inp.dispatchEvent(new Event('input'));out.none=/조건에 맞는 건이 없습니다/.test(document.getElementById('exec-modal-rows').innerText);
   // 초기화
   [...document.querySelectorAll('#exec-modal-filter button')].find(b=>/초기화/.test(b.textContent)).click();out.reset=rows().length;out.resetQ=document.querySelector('#exec-modal-filter input[type=search]').value;
   // 조건을 건 채 행 클릭 → 상세 → 닫으면 거르기 유지
   setSel(0,'sales');document.querySelector('#exec-modal-rows tr[onclick]').click();await sleep(50);
   out.detail=!document.getElementById('exec-item-modal').classList.contains('hidden');closeExecItemModal();out.keep=rows().every(id=>/^S-|^IN-/.test(id));
   // 다른 카드를 열면 처음부터
   closeExecListModal();openExecListModal('late');out.otherCard={sel:selects()[0].value,rows:rows()};
   // 휴대폰 화면 폭
   const box=document.querySelector('#exec-list-modal > div').getBoundingClientRect();out.fits=box.left>=0&&box.right<=window.innerWidth+1;
   return out;});
  ok(/진행 내역 2건/.test(r.p.s1)&&/고객 통화 설치 3대 확정/.test(r.p.s1)&&/특판 단가 승인 대기/.test(r.p.s1)&&/전화/.test(r.p.s1)&&/문제 발생/.test(r.p.s1)&&!/완료 예정일 변경/.test(r.p.s1)&&/지연 1일/.test(r.p.s1),'영업 진행 중 건 줄 아래에 진행 내역 전부(구분 · 일시 · 방법 · 내용 · 지연/문제 표시, 시스템 기록 제외)',r.p.s1);
  ok(/아직 입력된 진행 내역이 없습니다/.test(r.p.s3)&&/진행 내역 1건/.test(r.p.in1)&&/매장 방문 상담/.test(r.p.in1),'내역 없는 진행 중 건은 안내 · 영업본부 인바운드도 표시',r.p);
  ok(r.p.o1===''&&r.p.in2===''&&r.p.s2==='','운영업무 · 운영본부 인바운드 · 착수 전(접수) 건은 진행 내역 줄 없음',r.p);
  ok(r.bar&&r.all.length===7&&r.cnt0==='7건','한눈에 보기 [진행 중] 목록에 거르기 칸 · 전체 7건',r);
  ok(r.kind.sort().join()==='IN-1,IN-2'&&r.chipOn&&r.kindOff===7,'구분 칩 클릭 → 그 구분만, 다시 클릭 → 전체',r);
  ok(r.dept.sort().join()==='IN-2,O-1,O-2','본부 거르기 (운영본부 배정 인바운드는 운영본부)',r.dept);
  ok(r.owner.length===3&&r.owner.every(x=>['S-1','S-3','IN-1'].includes(x))&&r.cnt1==='3건 / 전체 7건','담당자 거르기 · 건수 표시',r);
  ok(r.unassigned.join()==='S-2','미배정만 보기',r.unassigned);
  ok(r.late.join()==='S-1','상태 거르기 — 기한 지연',r.late);
  ok(r.issue.length>=2&&r.issue.includes('O-2'),'상태 거르기 — 문제 있음',r.issue);
  ok(r.q.join()==='S-3'&&r.focusKept,'검색어 거르기 (입력 중 커서 유지)',r);
  ok(r.none,'맞는 건이 없으면 안내');
  ok(r.reset===7&&r.resetQ==='','[초기화]',r);
  ok(r.detail&&r.keep,'거른 채 행 클릭 → 상세, 닫으면 거르기 유지');
  ok(r.otherCard.sel===''&&r.otherCard.rows.join()==='S-1','다른 카드를 열면 거르기 처음부터',r.otherCard);
  ok(r.fits,'목록 창이 화면 폭 안');
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
