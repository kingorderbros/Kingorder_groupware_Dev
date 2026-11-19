// 사용법: node tools/e2e-paydoc-reject-upload.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-19 — 결제본부가 보완서류 항목을 [반려]하면 영업본부에 [업로드]가 보여야 함 (전에는 [반려 항목 재요청]까지 눌러야 했음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
const USERS=[{id:'t1',name:'김아름',dept:'payment',groupId:'payment'},{id:'t6',name:'김능영',dept:'sales',groupId:'sales'},{id:'t7',name:'박영업',dept:'sales',groupId:'sales'}];
srv.listen(8864,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];
 for(const [w,h] of [[1400,900],[390,844]]){
  console.log(`■ 화면 ${w}x${h}`);
  const pg=await br.newPage();await pg.setViewport({width:w,height:h,isMobile:w<700,hasTouch:w<700});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  pg.on('dialog',d=>d.accept(d.type()==='prompt'?'사업자등록증 흐림':undefined));
  await pg.goto('http://localhost:8864/',{waitUntil:'networkidle0'});
  const r=await pg.evaluate(async(USERS)=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const list=USERS.map(u=>Object.assign({email:u.id+'@x.kr',level:'manager',team:''},u));localUsers.push(...list);
   const it=(doc,st)=>Object.assign(payDocItem(doc,'사유'),{status:st,fileName:st==='pending'?'':doc+'.pdf',uploadedBy:'김능영',uploadedAt:'2026-11-18',rejectReason:st==='rejected'?'흐림':''});
   const mk=(id,status,items,type,tn)=>({id,merchant:'M-'+id,bizNo:'',regType:'pg',status,priority:'normal',requester:'김아름',requestedAt:'2026-11-18',dueDate:'2026-11-25',targetType:type||'team',targetName:tn||'영업본부 전체',claimedBy:'',items,history:[]});
   payDocRequests.length=0;
   payDocRequests.push(mk('PD-1','submitted',[it('bizreg','uploaded'),it('bank','uploaded')]),   // 결제본부가 이제 반려할 건
                       mk('PD-2','submitted',[it('bizreg','rejected'),it('bank','accepted')]),   // 예전에 반려만 하고 재요청은 안 누른 건(운영에 남아 있을 수 있음)
                       mk('PD-3','submitted',[it('bizreg','uploaded')]),                         // 반려 없는 확인대기
                       mk('PD-4','submitted',[it('bizreg','rejected')],'person','박영업'));        // 담당자 지정 — 다른 사람은 못 올림
   const btns=(id)=>{openPayDocDetail(id);const m=document.getElementById('paydoc-detail-modal');const b=[...m.querySelectorAll('button')].map(x=>x.textContent.trim());closePayDocDetail();return {upload:b.some(t=>/업로드/.test(t)),reply:b.some(t=>/회신/.test(t)),swap:b.some(t=>/교체/.test(t))};};
   const out={};
   // 결제본부: PD-1 의 첫 항목 반려
   enterApp(list[0]);await sleep(100);
   openPayDocDetail('PD-1');payDocReq('PD-1').items[0].viewed=true;payDocRejectItem('PD-1','bizreg');await sleep(50);
   out.pd1Status=payDocReq('PD-1').status;out.pd1Log=(payDocReq('PD-1').history||[]).map(h=>h.text).join(' / ');
   out.payCanReview=(()=>{openPayDocDetail('PD-1');const t=document.getElementById('paydoc-detail-modal').innerText;closePayDocDetail();return /확인/.test(t)&&/반려/.test(t);})();
   // 영업본부
   enterApp(list[1]);await sleep(100);
   out.pd1=btns('PD-1');out.pd2=btns('PD-2');out.pd3=btns('PD-3');out.pd4=btns('PD-4');
   // 다시 올리고 회신
   payDocReq('PD-2').items[0]=Object.assign(payDocReq('PD-2').items[0],{status:'uploaded',fileName:'new.pdf'});
   openPayDocDetail('PD-2');payDocSubmitDocs('PD-2');await sleep(50);out.pd2After=payDocReq('PD-2').status;closePayDocDetail();
   enterApp(list[2]);await sleep(100);out.pd4Owner=btns('PD-4');
   return out;},USERS);
  ok(r.pd1Status==='returned'&&/반려: 사업자등록증 흐림/.test(r.pd1Log),'결제본부가 항목을 반려하면 요청이 바로 반려·재요청',r);
  ok(r.payCanReview,'결제본부는 반려 뒤에도 남은 항목 확인 · 반려 가능');
  ok(r.pd1.upload&&r.pd1.reply,'영업본부: 방금 반려된 항목에 [업로드] · [회신]',r.pd1);
  ok(r.pd2.upload&&r.pd2.reply,'영업본부: 예전에 반려만 하고 재요청 안 한 건도 [업로드]',r.pd2);
  ok(!r.pd3.upload&&!r.pd3.reply&&!r.pd3.swap,'반려 없는 확인대기 건은 그대로 잠김',r.pd3);
  ok(r.pd2After==='submitted','다시 올리고 회신하면 확인대기',r.pd2After);
  ok(!r.pd4.upload&&r.pd4Owner.upload,'담당자 지정 건은 지정된 사람만 [업로드]',{other:r.pd4,owner:r.pd4Owner});
  await pg.close();
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
