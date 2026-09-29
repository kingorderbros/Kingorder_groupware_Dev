// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-persist.js .   — 설정 · 번호가 새로고침 뒤에도 남는지 (2026-09-29 메모리 점검)
// 새로고침해도 남는지 — 실제 화면 기능(추가 · 저장 버튼이 부르는 함수)으로 바꾸고, 다시 열어 확인 (로컬 모드 = localStorage)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
const out=[];const ok=(c,m)=>out.push((c?'  ✓ ':'  ✗ ')+m);
srv.listen(8817,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8817/',{waitUntil:'networkidle0'});
 const before=await pg.evaluate(async()=>{
  enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'});
  const el=(tag,id,val)=>{let e=document.getElementById(id);if(!e){e=document.createElement(tag);e.id=id;document.body.appendChild(e);}if(val!==undefined)e.value=val;return e;};
  // 계약서 승인 설정 — [추가] · [할인율 저장]
  el('input','special-type-input','감사특수'); addSpecialContractType();
  el('input','discount-threshold-input','33'); saveDiscountThreshold();
  // 승인권자 — 구성원 추가 · 단계 켜고 [저장]
  const sel=el('select','approver-member-add-contractApprovalLine');sel.innerHTML='<option value="감사멤버">감사멤버</option>';sel.value='감사멤버';addApproverMember('contractApprovalLine');
  appSettings.approvers.contractApprovalLine.stage2.enabled=true; appSettings.approvers.contractApprovalLine.stage2.approver='감사멤버'; saveApprovers('contractApprovalLine');
  // 보완서류 항목 — 관리 화면을 다시 그리면 저장
  payDocCatalog.push({id:'doc-'+payDocCatalogSeq++,name:'감사서류',regs:[],active:true}); renderPayDocCatalogAdmin();
  // 설치 장비 목록 — [저장] 과 같은 저장
  INSTALL_DEVICES.push('감사장비'); saveDeviceLists();
  // 번호: 보완서류 요청 · 프로젝트 WBS/이슈 · 지시 묶음
  payDocRequests.push({id:'PD-2608-0012',customerName:'x',status:'requested',items:[],log:[]}); savePayDocs();
  projects.push({id:'PRJ-0090',name:'감사',wbs:[{id:'WB-77',name:'a'}],issues:[{id:'IS-9',text:'b'}]}); saveProjects();
  collabRequests.push({id:'collab_950',title:'감사',directiveGroupId:'dir_40'}); saveCollabRequests();
  await new Promise(s=>setTimeout(s,400));
  return 1;});
 await pg.reload({waitUntil:'networkidle0'});
 const a=await pg.evaluate(()=>{enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'});return {
   special:appSettings.contractApproval.specialTypes.includes('감사특수'),thr:appSettings.contractApproval.discountThreshold,
   mem:appSettings.approverMembers.contractApprovalLine.includes('감사멤버'),st2:appSettings.approvers.contractApprovalLine.stage2,
   cat:payDocCatalog.some(d=>d.name==='감사서류'),dev:INSTALL_DEVICES.includes('감사장비'),
   payDocSeq,wbsSeq,prjIssueSeq,directiveGroupCounter};});
 ok(a.special&&a.thr===33,'계약서 승인 설정 (특수계약 종류 · 할인율) '+JSON.stringify([a.special,a.thr]));
 ok(a.mem&&a.st2.enabled&&a.st2.approver==='감사멤버','승인권자 (구성원 · 2차 단계 · 지정한 사람) '+JSON.stringify(a.st2));
 ok(a.cat,'보완필요서류 항목');
 ok(a.dev,'설치 장비 목록');
 ok(a.payDocSeq>=13,'보완서류 요청 번호가 저장된 것 다음부터 (PD-…-0012 → '+a.payDocSeq+')');
 ok(a.wbsSeq>=78&&a.prjIssueSeq>=10,'WBS · 이슈 번호 ('+a.wbsSeq+' · '+a.prjIssueSeq+')');
 ok(a.directiveGroupCounter>=41,'지시 묶음 번호 ('+a.directiveGroupCounter+')');
 console.log(out.join('\n'));console.log('errors',JSON.stringify(errs.slice(0,5)));await br.close();srv.close();});
