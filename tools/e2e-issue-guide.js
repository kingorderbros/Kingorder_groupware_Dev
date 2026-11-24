// 사용법: node tools/e2e-issue-guide.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — 인바운드 확인 필요: 항목별 안내 · [확인 완료] · 고치면 자동 해제 / 경영현황판 문제 · 지연: 무엇이 문제인지 · 할 일 · 바로 처리, 해결하면 빠짐
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8889,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [vw,vh] of [[1440,900],[390,844]]){
  console.log(`■ 화면 ${vw}x${vh}`);
  const pg=await br.newPage();await pg.setViewport({width:vw,height:vh,isMobile:vw<500,hasTouch:vw<500});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
  await pg.goto('http://localhost:8889/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const U=[{id:'u1',name:'대표',dept:'admin',groupId:'admin'},{id:'u2',name:'최운영',dept:'ops',groupId:'ops'}].map(u=>Object.assign({email:u.id+'@x.kr',level:'manager'},u));localUsers.push(...U);
   const old=ymd(new Date(Date.now()-22*86400000));
   const O=WORK_CENTERS.ops;O.works=[];WORK_CENTERS.sales.works=[];collabRequests.length=0;
   O.works.push({id:'O-1',type:'as',title:'오래된 AS',status:'working',priority:'normal',receivedAt:old,receiver:'대표',assignee:'최운영'},
                {id:'O-2',type:'as',title:'담당자 없음',status:'received',priority:'normal',receivedAt:ymd(new Date()),receiver:'대표',assignee:''});
   inboundRecords=[{id:'IB-1',company:'가',phone:'010-12',requestNote:'',flags:['연락처 확인 필요','문의내용 없음','재문의: IB-0'],dupOf:'IB-0',kob:{result:'진행중',dept:'영업',owner:'대표'}},
                   {id:'IB-0',company:'가',phone:'010-12',requestNote:'문의',flags:[],kob:{result:'진행중',dept:'영업',owner:'대표'}}];
   enterApp(U[0]);await sleep(120);
   const o={};
   // ---- 인바운드 확인 필요 ----
   o.need0=inboundNeedsCheck(inboundRecords[0]);
   openInboundModal('IB-1');await sleep(30);
   const items=()=>[...document.querySelectorAll('#inbound-check-body .inb-check-item')].map(li=>({k:li.dataset.key,done:!!li.querySelector('.line-through'),btn:!!li.querySelector('button.bg-gray-800')}));
   o.items1=items();o.guide=document.getElementById('inbound-check-body').textContent.includes('연락처 형식이 맞지 않습니다');
   o.head1=document.getElementById('inbound-check-head').textContent.replace(/\s+/g,' ').trim();
   document.querySelector('#inbound-check-body .inb-check-item[data-key="dup"] button.bg-gray-800').click();await sleep(20);
   o.items2=items();o.checks=JSON.stringify(inboundRecords[0].checks&&Object.keys(inboundRecords[0].checks));
   o.text2=inboundCheckText(inboundRecords[0]);
   // 연락처 · 문의 내용을 고치면 자동 해제
   inboundRecords[0].phone='010-1234-5678';inboundRecords[0].requestNote='키오스크 문의';saveInboundRecords();
   openInboundModal('IB-1');await sleep(30);o.items3=items();o.need3=inboundNeedsCheck(inboundRecords[0]);
   o.head3=document.getElementById('inbound-check-head').textContent.replace(/\s+/g,' ').trim();
   // 되돌리기
   [...document.querySelectorAll('#inbound-check-body button')].find(b=>b.textContent.includes('되돌리기')).click();await sleep(20);o.need4=inboundNeedsCheck(inboundRecords[0]);
   closeInboundModal();
   // ---- 경영현황판 안내 ----
   navigate('exec-center',document.getElementById('nav-exec-center'));await sleep(150);
   openExecItemModal('work','O-1');await sleep(20);
   const g1=[...document.querySelectorAll('#exec-item-body .exec-issue-guide')].map(x=>x.textContent.replace(/\s+/g,' '));
   o.stale=g1;o.staleBtn=[...document.querySelectorAll('#exec-item-body .exec-issue-guide button')].map(b=>b.textContent.trim());
   closeExecItemModal();
   openExecItemModal('work','O-2');await sleep(20);o.unassigned=[...document.querySelectorAll('#exec-item-body .exec-issue-guide')].map(x=>x.textContent.replace(/\s+/g,' '));closeExecItemModal();
   openExecItemModal('inbound','IB-1');await sleep(20);o.ibBox=document.getElementById('exec-item-body').textContent.includes('확인 필요 · 재문의');closeExecItemModal();
   // 목록 줄 '할 일'
   openExecListModal('issue');await sleep(20);o.rowTodo=[...document.querySelectorAll('#exec-modal-rows td')].some(td=>td.textContent.includes('할 일: 담당자에게 지금 상태를 확인합니다'));o.issueIds=[...document.querySelectorAll('#exec-modal-rows tr[onclick]')].filter(t=>t.children.length>=9).map(t=>t.children[1].textContent.trim()).sort().join(',');closeExecListModal();
   // 해결 → 빠짐
   O.works[0].status='done';O.works[0].doneAt=ymd(new Date());O.works[1].assignee='최운영';O.works[1].status='assigned';
   renderExecCenter();await sleep(30);
   openExecListModal('issue');await sleep(20);o.issueIds2=[...document.querySelectorAll('#exec-modal-rows tr[onclick]')].filter(t=>t.children.length>=9).map(t=>t.children[1].textContent.trim()).sort().join(',');closeExecListModal();
   return o;});
  ok(r.need0,'처음엔 확인 필요');
  ok(r.items1.length===3&&r.items1.every(x=>!x.done&&x.btn)&&r.guide,'항목 3개 · 안내 · [확인 완료] 단추',r.items1);
  ok(r.head1.includes('확인 필요 3건'),'머리 줄 확인 필요 3건',r.head1);
  ok(r.items2.find(x=>x.k==='dup').done&&r.checks==='["dup"]','재문의 [확인 완료] → 완료 표시 · 기록',r);
  ok(r.text2==='연락처 확인 필요 · 문의내용 없음','남은 항목만 표시',r.text2);
  ok(r.items3.every(x=>x.done)&&!r.need3&&r.head3.includes('확인 완료'),'연락처 · 문의 내용 고치면 자동 해제 → 확인 필요에서 빠짐',r);
  ok(r.need4,'되돌리기 하면 다시 확인 필요');
  ok(r.stale.some(t=>t.includes('장기 미처리 22일')&&t.includes('무엇이 문제인지')&&t.includes('할 일')&&t.includes('[완료]로 바꿉니다')),'장기 미처리 22일 — 문제 · 할 일 안내',r.stale);
  ok(r.staleBtn.includes('원본 화면에서 처리'),'바로 처리 단추',r.staleBtn);
  ok(r.unassigned.some(t=>t.includes('담당자 미배정')&&t.includes('담당자를 배정합니다')),'담당자 미배정 안내',r.unassigned);
  ok(r.ibBox,'경영현황판 인바운드 상세에 확인 필요 안내');
  ok(r.rowTodo,'목록 줄에 할 일 한 줄');
  ok(r.issueIds.includes('O-1')&&r.issueIds.includes('O-2'),'처리 전 문제 목록',r.issueIds);
  ok(!r.issueIds2.includes('O-1')&&!r.issueIds2.includes('O-2'),'완료 · 배정하면 문제 목록에서 빠짐',r.issueIds2);
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
