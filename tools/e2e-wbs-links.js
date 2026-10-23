// 사용법: node tools/e2e-wbs-links.js . [스크린샷폴더]   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 — 프로젝트 관리 WBS 산출물: 파일 업로드에 더해 링크 등록 · 삭제, 링크도 '제출'로 셈(제출 필수 완료 가능)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.',SHOT=process.argv[3];
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8814,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:950});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8814/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   projects.push({id:'P-E2E-L',name:'링크시험',dept:'it',owner:'정장훈',startPlan:'2026-10-01',endPlan:'2026-12-31',status:'active',wbs:[{id:'WB-L1',code:'1',name:'기획서',assignee:'정장훈',dept:'it',startPlan:'2026-10-01',endPlan:'2026-10-20',status:'inprogress',progress:50,deliverableFormats:['doc'],deliverableRequired:true}],issues:[]});
   navigate('project-center',document.getElementById('nav-project-center'));
   currentProjectId='P-E2E-L'; renderProjectCenter();
   const p=findProject('P-E2E-L'), w=findWbs(p,'WB-L1');
   r.missingFirst=deliverableState(w).key==='missing';
   openWbsDetailModal(p.id,w.id);
   r.linkBtn=document.getElementById('wbs-detail-modal').innerHTML.includes('openWbsLinkModal');
   openWbsLinkModal(p.id,w.id);
   document.getElementById('wbs-link-url').value='drive.google.com/file/d/abc';
   document.getElementById('wbs-link-title').value='최종 기획서';
   submitWbsLink({preventDefault(){}});
   r.saved=(w.deliverableLinks||[]).length===1&&w.deliverableLinks[0].url==='https://drive.google.com/file/d/abc';
   r.filed=deliverableState(w).key==='filed';
   r.shown=document.getElementById('wbs-detail-modal').innerText.includes('최종 기획서');
   r.newTab=document.getElementById('wbs-detail-modal').innerHTML.includes('target="_blank" rel="noopener noreferrer"');
   // 잘못된 주소 · 위험한 주소 거절
   r.badUrl=normalizeDeliverableUrl('javascript:alert(1)')===''&&normalizeDeliverableUrl('abc')==='';
   return r;
 });
 if(SHOT) await pg.screenshot({path:SHOT+'/wbs-links.png'});
 const out2=await pg.evaluate(()=>{
   const r={}; const p=findProject('P-E2E-L'), w=findWbs(p,'WB-L1');
   closeWbsDetailModal&&closeWbsDetailModal();
   switchProjectTab('deliv');
   r.tab=document.getElementById('prj-view-deliv').innerText.includes('최종 기획서');
   removeWbsDeliverableLink(p.id,w.id,w.deliverableLinks[0].id);
   r.removed=w.deliverableLinks.length===0&&deliverableState(w).key==='missing';
   projects.splice(projects.findIndex(x=>x.id==='P-E2E-L'),1); renderProjectCenter();
   return r;
 });
 Object.assign(out,out2);
 const expect={missingFirst:true,linkBtn:true,saved:true,filed:true,shown:true,newTab:true,badUrl:true,tab:true,removed:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
