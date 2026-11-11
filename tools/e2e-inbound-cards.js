// 사용법: node tools/e2e-inbound-cards.js   (맥 크롬 헤드리스) — 인바운드 관리 카드(미컨택·진행중·영업수주·컨택 중단)를 누르면 그 건만 목록 · 줄 누르면 상세 창 (2026-11-11)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8868,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1500,height:950});await pg.goto('http://localhost:8868/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(()=>{localUsers.length=0;[['u3','정장훈','it']].forEach(([id,name,dept])=>localUsers.push({id,name,dept,email:id+'@x.kr',groupId:'management',level:'manager'}));enterApp(localUsers[0]);
  inboundRecords.length=0;const ex=n=>Array.from({length:n},(_,i)=>({at:'2026-11-0'+(i+1),by:'정장훈',note:''}));
  const mk=(id,contactAt,result,extras,spam)=>({id,company:'가게'+id,name:'',phone:'',inDate:'2026-11-0'+id.slice(-1),routes:[],services:[],spam:!!spam,kob:{dept:'영업',contactAt,result,owner:'',extras:extras||[]}});
  inboundRecords.push(mk('i1','',''),mk('i2','2026-11-02','진행중'),mk('i3','2026-11-03','영업수주'),mk('i4','2026-11-04','',ex(inboundMaxContact)),mk('i5','','진행중'),mk('i6','','','',true));
  navigate('inbound-center',document.getElementById('nav-inbound-center'));inboundTab='list';renderInboundCenter();
  const cardEl=id=>document.querySelector(`[data-inbound-card="${id}"]`);const num=id=>parseInt(cardEl(id).querySelector('.text-xl').textContent,10);
  const ids=()=>[...document.querySelectorAll('#inbound-rows tr[onclick]')].map(tr=>tr.getAttribute('onclick').match(/i\d/)[0]).join();
  const out={};
  ['nocontact','progress','won','stopped'].forEach(id=>{setInboundFilter('q','가게');cardEl(id).click();out[id]={n:num(id),rows:ids(),tag:(document.getElementById('inbound-list-title')||{}).textContent,ring:cardEl(id).className.includes('ring-2'),q:inboundFilter.q};});
  cardEl('stopped').click();out.toggle=ids();out.toggleCard=inboundFilter.card;
  cardEl('won').click();cardEl('').click();out.total=ids();
  cardEl('progress').click();document.querySelector('#inbound-rows tr[onclick]').click();out.modalOpen=!document.getElementById('inbound-modal').classList.contains('hidden');out.modalId=inboundEditId;closeInboundModal();
  // 빠른 거르기 칩을 누르면 카드 선택은 풀립니다
  [...document.querySelectorAll('#inbound-tab-body button')].find(b=>b.textContent.includes('확인 필요')).click();out.chipCard=inboundFilter.card;
  // 현황판 카드 → 인입 목록 (숫자 = 건수, 다른 거르기 비움)
  inboundRecords.push({id:'i7',company:'오늘가게',name:'',phone:'010',inDate:ymd(new Date()),routes:[],services:[],kob:{}});
  const dash={};
  [['오늘 접수 문의','today'],['미배정','unassigned'],['기준 시간 초과','late'],['확인 필요','check'],['추가 컨택','stop']].forEach(([label,q])=>{
    setInboundFilter('q','zzz');inboundTab='dash';renderInboundCenter();
    const b=[...document.querySelectorAll('#inbound-tab-body button')].find(x=>x.querySelector('p')&&x.querySelector('p').textContent.startsWith(label));
    const n=b?parseInt(b.querySelectorAll('p')[1].textContent,10):-1;const dis=b?b.disabled:true;b&&b.click();
    dash[q]={n,dis,tab:inboundTab,rows:document.querySelectorAll('#inbound-rows tr[onclick]').length,tag:(document.getElementById('inbound-list-title')||{}).textContent||''};});
  out.dash=dash;
  return out;});
 console.log(JSON.stringify(r));
 ok(r.nocontact.rows==='i5,i1'&&r.nocontact.n===2,'미컨택 카드 → 컨택일 없는 건만 (스팸 제외), 숫자와 같음',r.nocontact);
 ok(r.progress.rows==='i5,i2'&&r.progress.n===2,'진행중 카드 → 진행중만',r.progress);
 ok(r.won.rows==='i3'&&r.won.n===1,'영업수주 카드 → 영업수주만',r.won);
 ok(r.stopped.rows==='i4'&&r.stopped.n===1,'컨택 중단 카드 → 추가 컨택 기준 이상',r.stopped);
 ok(['nocontact','progress','won','stopped'].every(k=>r[k].ring&&r[k].q===''),'누른 카드 표시 · 다른 거르기는 비움',r);
 ok(r.stopped.tag.includes('컨택 중단')&&r.stopped.tag.includes('전체 보기'),'목록 제목에 고른 카드 이름 · 전체 보기',r.stopped.tag);
 ok(r.toggle==='i5,i4,i3,i2,i1'&&r.toggleCard==='','같은 카드 다시 누르면 전체',r);
 ok(r.total==='i5,i4,i3,i2,i1','총 인입 카드 → 전체',r.total);
 ok(r.modalOpen&&r.modalId==='i5','목록 줄 누르면 상세 창',r);
 ok(r.chipCard==='','빠른 거르기 칩 누르면 카드 선택 풀림',r.chipCard);
 Object.entries(r.dash).forEach(([q,d])=>ok(!d.dis&&d.tab==='list'&&d.rows===d.n&&d.n>=0&&d.tag.includes('전체 보기'),'현황판 카드 '+q+' → 인입 목록 '+d.n+'건 (숫자와 같음)',d));
 ok(r.dash.today.n===1,'오늘 접수 문의 카드도 누를 수 있음',r.dash.today);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
