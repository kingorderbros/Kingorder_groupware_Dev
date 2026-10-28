// 사용법: node tools/e2e-work-action-edit.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-28 — [수정] 창에서 업무처리 항목(처리자 · 조치일 · 조치사항 · 설치 · 택배 발송)도 고침, 완료 건은 업무이력 상세에서
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8828,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8828/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={}; const def=wcDef('ops');
   navigate('ops-work-center',document.getElementById('nav-ops-work-center'));
   const base={customerId:'',company:'시험매장',status:'done',receiver:'다른사람',assignee:'',receivedAt:'2026-10-26',receivedTime:'10:00',extra:{},contact:'010',channel:'전화',priority:'normal',actionBy:'김처리',actionAt:'2026-10-27',actionTime:'11:00'};
   const ws=[
     Object.assign({id:'W-E2E-AS',type:'as',title:'AS',memo:'m',actionNote:'처음 조치'},base),
     Object.assign({id:'W-E2E-MN',type:'menu',title:'메뉴',memo:'m',actionNote:'메뉴 조치',replyMethod:'전화'},base),
     Object.assign({id:'W-E2E-DS',type:'dist',title:'유통',intakeEntries:[{at:'2026-10-26',time:'10:00',by:'x',text:'접수'}],actionEntries:[{at:'2026-10-27',time:'10:00',by:'x',text:'1차'},{at:'2026-10-27',time:'11:00',by:'x',text:'2차'}],memo:'x'},base),
     Object.assign({id:'W-E2E-IN',type:'install',title:'설치',installDate:'2026-10-27',installNote:'설치함',installReason:'신규 설치'},base),
     Object.assign({id:'W-E2E-DL',type:'delivery',title:'택배',dlvInvoice:'111',dlvSender:'가',shipInfo:{}},base)
   ];
   ws.forEach(w=>def.works.unshift(w));
   const v=(id,x)=>{document.getElementById(id).value=x;};
   const go=(id,edit)=>{ openWorkHistoryDetail('ops',id); const btn=document.getElementById('wc-history-body').innerHTML.includes('openWorkOwnEdit'); openWorkOwnEdit('ops',id); const sec=document.getElementById('work-own-edit-modal').textContent.includes('업무처리'); edit(); submitWorkOwnEdit({preventDefault(){}}); return btn&&sec; };
   r.as=go('W-E2E-AS',()=>{v('woe-a-actionNote','고친 조치'); v('woe-a-actionAt','2026-10-28');});
   r.mn=go('W-E2E-MN',()=>{v('woe-a-actionNote','메뉴 고침'); v('woe-a-replyMethod','문자');});
   r.ds=go('W-E2E-DS',()=>{v('woe-a-actionEntries','2차 고침');});
   r.in=go('W-E2E-IN',()=>{v('woe-a-installNote','설치 고침'); v('woe-a-installReason','교체 설치');});
   r.dl=go('W-E2E-DL',()=>{v('woe-a-dlvInvoice','222'); v('woe-a-actionBy','이처리');});
   closeWorkHistoryDetail();
   const g=id=>def.works.find(x=>x.id===id);
   r.asSaved=g('W-E2E-AS').actionNote==='고친 조치'&&g('W-E2E-AS').actionAt==='2026-10-28'&&g('W-E2E-AS').status==='done';
   r.mnSaved=g('W-E2E-MN').actionNote==='메뉴 고침'&&g('W-E2E-MN').replyMethod==='문자';
   const d=g('W-E2E-DS'); r.dsSaved=d.actionEntries.length===2&&d.actionEntries[0].text==='1차'&&d.actionEntries[1].text==='2차 고침'&&d.actionNote.includes('2차 고침');
   r.inSaved=g('W-E2E-IN').installNote==='설치 고침'&&g('W-E2E-IN').installReason==='교체 설치';
   r.dlSaved=g('W-E2E-DL').dlvInvoice==='222'&&g('W-E2E-DL').actionBy==='이처리';
   r.history=ws.every(w=>(g(w.id).fieldEdits||[]).length>0);
   def.works=def.works.filter(x=>!String(x.id).startsWith('W-E2E-'));
   return r;
 });
 const expect={as:true,mn:true,ds:true,in:true,dl:true,asSaved:true,mnSaved:true,dsSaved:true,inSaved:true,dlSaved:true,history:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
