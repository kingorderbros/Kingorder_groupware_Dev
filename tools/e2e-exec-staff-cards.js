// 사용법: node tools/e2e-exec-staff-cards.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-23 — 경영현황판 직원별 처리 현황 창의 요약 카드(담당 업무 · 진행중 · 완료 · 지연 · 문제)를 누르면 목록이 그 상태로 걸러짐
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8880,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1400,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<700,hasTouch:vw<700});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8880/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'김영업',dept:'sales',groupId:'sales'},{id:'u3',name:'이영업',dept:'sales',groupId:'sales'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const S=WORK_CENTERS.sales;S.works=[];WORK_CENTERS.ops.works=[];inboundRecords=[];
   const y=ymd(new Date(Date.now()-3*86400000));
   const mk=(id,st,as,extra)=>Object.assign({id,center:'sales',type:'activity',title:id+' 업무',status:st,priority:'normal',receivedAt:'2026-11-18',receiver:'대표',assignee:as},extra||{});
   S.works.push(mk('S-1','working','김영업'),mk('S-2','working','김영업',{dueDate:y,progressLog:[{id:'a',kind:'action',at:'2026-11-18 10:00',loggedAt:'2026-11-18 10:00',by:'김영업',text:'통화'}]}),mk('S-3','done','김영업',{doneAt:'2026-11-19'}),mk('S-4','hold','김영업'),mk('S-5','working','이영업'));
   enterApp(U[0]);await sleep(120);
   navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(200);
   const rows=()=>[...document.querySelectorAll('#exec-modal-rows tr[onclick]')].filter(t=>!t.classList.contains('exec-prog-row')&&t.children.length>=9).map(t=>t.children[1].textContent.trim()).sort();
   const boxes=()=>[...document.querySelectorAll('#exec-modal-extra .exec-state-box')];
   const num=b=>+b.querySelector('p:last-child').textContent;
   const out={};
   for (const view of ['s:김영업','sd:sales']) {
    openExecListModal(view);await sleep(30);
    const res=[];
    for (const b of boxes()) {
     const st=b.getAttribute('data-exec-state');b.click();await sleep(20);
     const b2=boxes().find(x=>x.getAttribute('data-exec-state')===st);
     res.push({label:b.querySelector('p').textContent.trim(),n:num(b2),rows:rows().length,ids:rows().join(','),pressed:b2.getAttribute('aria-pressed'),sel:document.querySelector('#exec-modal-filter select:nth-of-type(3)').value,others:boxes().filter(x=>x!==b2&&x.getAttribute('aria-pressed')==='true').length});
    }
    out[view]=res;
    // 목록 거르기 칸에서 상태를 바꿔도 카드 표시가 따라감
    const sel=document.querySelectorAll('#exec-modal-filter select')[2];sel.value='late';sel.dispatchEvent(new Event('change'));await sleep(20);
    out[view+':sync']=boxes().find(x=>x.getAttribute('aria-pressed')==='true').getAttribute('data-exec-state');
    // 행 클릭 → 상세
    document.querySelector('#exec-modal-rows tr[onclick]').click();await sleep(30);
    out[view+':detail']=!document.getElementById('exec-item-modal').classList.contains('hidden');closeExecItemModal();
    closeExecListModal();
   }
   const box=document.querySelector('#exec-list-modal > div').getBoundingClientRect();out.fits=box.left>=0&&box.right<=window.innerWidth+1;
   return out;});
  for (const view of ['s:김영업','sd:sales']) {
   const res=r[view];
   ok(res.length===5,`${view} 카드 5개`,res.length);
   res.forEach(x=>ok(x.n===x.rows&&x.pressed==='true'&&x.others===0,`${view} '${x.label}' 카드 → 목록 ${x.rows}건 = 카드 숫자 ${x.n}, 선택 표시`,x));
   ok(res[0].sel===''&&res[1].sel==='open'&&res[2].sel==='done'&&res[3].sel==='late'&&res[4].sel==='issue',`${view} 상태 거르기 칸도 같이 바뀜`,res.map(x=>x.sel));
   ok(r[view+':sync']==='late',`${view} 거르기 칸에서 바꾸면 카드 표시도 따라감`,r[view+':sync']);
   ok(r[view+':detail'],`${view} 거른 뒤 행 클릭 → 상세 창`);
  }
  ok(r['s:김영업'][3].ids==='S-2'&&r['s:김영업'][2].ids==='S-3','김영업: 지연 = S-2, 완료 = S-3',r['s:김영업']);
  ok(r.fits,'창이 화면 폭 안');
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
