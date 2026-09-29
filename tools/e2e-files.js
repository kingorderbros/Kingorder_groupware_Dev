// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-files.js . <스크린샷 폴더>
// 맥의 크롬(/Applications/Google Chrome.app)을 헤드리스로 씁니다. npm run check 에는 넣지 않았습니다 (크롬 · 패키지가 필요해서).
// 3단계 화면 흐름 — 로컬 모드 + 파일 올리기만 시험 서버(/api/files/*, 메모리)로 바꿔 끼워 봅니다.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');
const ROOT=process.argv[2]; const OUT=process.argv[3];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml'};
const mem=new Map(); let seq=0;
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
 if(p==='/config/app-config.js'){r.writeHead(200,{'content-type':'text/javascript'});return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p==='/api/files/upload'){const ch=[];q.on('data',c=>ch.push(c));q.on('end',()=>{const b=Buffer.concat(ch);const key=`staff/2026/09/00000000-0000-0000-0000-${String(++seq).padStart(12,'0')}`;mem.set(key,{type:u.searchParams.get('type'),b});r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({ok:true,file:{path:key,name:u.searchParams.get('name'),type:u.searchParams.get('type'),size:b.length}}));});return;}
 if(p==='/api/files/get'){const o=mem.get(u.searchParams.get('p'));if(!o){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':o.type});return r.end(o.b);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b);});});
const results=[]; const ok=(c,m)=>{results.push((c?'  ✓ ':'  ✗ ')+m);};
srv.listen(8792,async()=>{
 const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
 const pg=await br.newPage(); await pg.setViewport({width:1280,height:900});
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e))); pg.on('dialog',d=>{errs.push('dialog: '+d.message().slice(0,120));d.accept();});
 await pg.goto('http://localhost:8792/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 // Storage 쪽을 시험 서버로 — upload 만 바꿔 끼웁니다 (src · text · has 는 진짜 코드)
 await pg.evaluate(()=>{
   const realSrc=kobFiles.src;
   kobFiles.upload=async(file,o)=>{o=o||{};const name=o.name||file.name;const type=o.type||file.type;const r=await fetch(`/api/files/upload?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,{method:'POST',body:file});return (await r.json()).file;};
   kobFiles.uploadDataUrl=async(d,name)=>{const b=await (await fetch(d)).blob();return kobFiles.upload(b,{name,type:b.type});};
   window.__png=async(name)=>{const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d');x.fillStyle='#e33';x.fillRect(0,0,120,80);const b=await new Promise(r=>c.toBlob(r,'image/png'));return new File([b],name||'사진.png',{type:'image/png'});};
   window.__txt=(name,s)=>new File([s],name,{type:'text/plain'});
   window.__imgOk=(src)=>new Promise(r=>{const i=new Image();i.onload=()=>r(i.naturalWidth>0);i.onerror=()=>r(false);i.src=src;});
 });
 const E=(f,...a)=>pg.evaluate(f,...a);

 // 1 자료실
 let r=await E(async()=>{ if (typeof openArchivePost==='function') openArchivePost(); archiveDraftFiles=[]; await addArchiveFiles({files:[await __png('매뉴얼.png'), __txt('안내.txt','자료실 본문')], value:''});
   const f=archiveDraftFiles; return {n:f.length,p:f.map(x=>!!x.path&&!x.dataUrl),img:await __imgOk(kobFiles.src(f[0]))}; });
 ok(r.n===2&&r.p.every(Boolean)&&r.img,'자료실: 그림·글 파일이 경로로 담기고 그림이 뜬다 '+JSON.stringify(r));
 r=await E(async()=>{ document.getElementById('arc-title').value='시험 자료'; const d=document.getElementById('arc-dept'); if(d&&d.options.length) d.value=d.options[0].value;
   archiveDraftFiles=archiveDraftFiles.length?archiveDraftFiles:[]; saveArchivePost(); const x=archivePosts[0]; openArchiveView(x.id);
   const imgs=[...document.querySelectorAll('#arc-view-modal img')]; await new Promise(s=>setTimeout(s,400));
   return {files:(x.files||[]).length, path:!!(x.files[0]||{}).path, json:JSON.stringify(x).includes('base64'), imgs:imgs.map(i=>i.naturalWidth), a:[...document.querySelectorAll('#arc-view-modal a[download]')].map(a=>a.getAttribute('href').slice(0,20))}; });
 ok(r.files===2&&r.path&&!r.json&&r.imgs[0]>0&&r.a.every(h=>h.startsWith('/api/files/get')),'자료실: 저장 → 보기 창 그림 표시 · 내려받기 주소 · base64 없음 '+JSON.stringify(r));

 // 2 보완서류
 r=await E(async()=>{ payDocRequests.push({id:'PD-T',customerName:'시험',status:'requested',items:[{docId:'d1',name:'사업자등록증',status:'pending'}],log:[],history:[]});
   payDocUploadTarget={reqId:'PD-T',docId:'d1'}; try{ window.payDocCanUpload=()=>true; }catch(e){}
   await onPayDocFilePicked({target:{files:[__txt('보완.txt','보완 서류 내용')],value:''}});
   const it=payDocRequests.find(x=>x.id==='PD-T').items[0];
   it.textCache=''; payDocLoadText('PD-T','d1'); await new Promise(s=>setTimeout(s,500));
   return {path:!!it.filePath,url:it.fileUrl.slice(0,15),text:it.textCache,status:it.status}; });
 ok(r.path&&r.url==='/api/files/get?'&&r.text==='보완 서류 내용','보완서류: 경로 저장 · 주소 · 글 내용 읽기 '+JSON.stringify(r));

 // 3 협업티켓 · 4 WBS
 r=await E(async()=>{ const e=newCollabFileEntry(__txt('요청.txt','협업 요청 본문')); for(let i=0;i<30&&e.uploading;i++) await new Promise(s=>setTimeout(s,100));
   const w=newWbsFileEntry(await __png('산출물.png')); for(let i=0;i<30&&w.uploading;i++) await new Promise(s=>setTimeout(s,100));
   const t=await kobFiles.text({path:e.path,name:e.name, ref:{}});
   return {c:!!e.path&&e.url.startsWith('/api/files/get'), w:!!w.path&&await __imgOk(w.url), t}; });
 ok(r.c&&r.w&&r.t==='협업 요청 본문','협업티켓·WBS: 고른 뒤 올라가 경로·주소로 바뀌고 저장된 뒤에도 글을 읽는다 '+JSON.stringify(r));
 r=await E(()=>{ const rows=gwDropDeadBlobs([{files:[{url:'blob:http://x/1'},{url:'/api/files/get?p=a',path:'a'}]}]); return rows[0].files.map(f=>f.url); });
 ok(r[0]===''&&r[1]==='/api/files/get?p=a','저장된 옛 blob: 주소는 비우고 경로 있는 것은 그대로');

 // 5 계약서
 r=await E(async()=>{ openContractModal(); const inp=document.getElementById('contract-file'); const dt=new DataTransfer(); dt.items.add(__txt('계약서.txt','계약')); inp.files=dt.files; onContractFileChange();
   for(let i=0;i<30&&contractFileDraft&&contractFileDraft.busy;i++) await new Promise(s=>setTimeout(s,100));
   const a=readContractAttachment(); const html=contractAttachLinkHtml({attachmentName:'계약서.txt',attachment:a.file}); closeContractModal&&closeContractModal();
   return {file:!!(a.file&&a.file.path),busy:a.busy,link:/href="\/api\/files\/get/.test(html)}; });
 ok(r.file&&!r.busy&&r.link,'계약서: 고르면 올라가고 저장값에 경로 · 이름이 내려받기 링크 '+JSON.stringify(r));

 // 6 견적 템플릿 그림 · 7 내 사진
 r=await E(async()=>{ quoteTplDraft=blankQuoteTplDraft(); await addQuoteTplImageFiles({files:[await __png('제품.png')],value:''});
   const u=quoteTplDraft.images[0]; await onMyPhotoPicked({files:[await __png('나.png')],value:''});
   return {tpl:u.slice(0,15),tplOk:await __imgOk(u),me:myPhotoDraft.slice(0,15),meOk:await __imgOk(myPhotoDraft)}; });
 ok(r.tpl==='/api/files/get?'&&r.tplOk&&r.me==='/api/files/get?'&&r.meOk,'견적 템플릿 그림 · 내 사진: 주소로 저장되고 뜬다 '+JSON.stringify(r));

 // 8 개발의뢰 · 9 파트너 서류 · 스냅샷 · 보기 창 글 읽기
 r=await E(async()=>{ const d=await devCollectFiles({files:[__txt('명세.txt','개발 명세')],value:''},'정장훈'); const chip=devFileChipHtml(d[0]);
   partnerDocTarget='doc1'; partnerDocFiles={}; try{renderPartnerDocSection=()=>{};}catch(e){}
   await onPartnerDocPicked({files:[await __png('통장.png')],value:''});
   partnerVanShots=[]; try{renderPartnerVanShots=()=>{};}catch(e){}
   await onPartnerVanShotPicked({files:[await __png('snap.png')],value:''});
   partnerViewReset(); const i=partnerViewAdd({name:'명세.txt',type:'text/plain',path:d[0].path,dataUrl:d[0].dataUrl},'시험'); openPartnerFileViewer(i);
   await new Promise(s=>setTimeout(s,600)); const pre=(document.querySelector('#pfile-modal pre')||{}).textContent||'';
   return {dev:!!d[0].path&&/href="\/api\/files\/get/.test(chip), doc:!!(partnerDocFiles.doc1||{}).path&&await __imgOk(partnerDocFiles.doc1.dataUrl), shot:!!(partnerVanShots[0]||{}).path, pre}; });
 ok(r.dev&&r.doc&&r.shot&&r.pre==='개발 명세','개발의뢰 · 파트너 서류 · 스냅샷: 경로와 주소 · 보기 창에서 글을 받아 읽는다 '+JSON.stringify(r));

 // 10 설치사진 (업무 건 하나를 만들어서)
 r=await E(async()=>{ const key=Object.keys(WORK_CENTERS)[0]; const c=wcDef(key); const w={id:'W-T',title:'설치 시험',installPhotos:[]}; c.works.push(w);
   try{ window.refreshInstallPhotoHost=()=>{}; window.refreshWorkViews=()=>{}; window.collectInstallAction=()=>{}; }catch(e){}
   addInstallPhotos(key,'W-T',{files:[await __png('설치.png')],value:''},'x'); for(let i=0;i<30&&!w.installPhotos.length;i++) await new Promise(s=>setTimeout(s,100));
   const p=w.installPhotos[0]||{}; return {path:!!p.path,ok:await __imgOk(kobFiles.src(p)),noData:!p.dataUrl}; });
 ok(r.path&&r.ok&&r.noData,'설치사진: 경로로 담기고 그림이 뜬다 '+JSON.stringify(r));

 await pg.screenshot({path:OUT+'/files_e2e.png'});
 console.log(results.join('\n')); console.log('errors',JSON.stringify(errs.slice(0,12)));
 console.log(`\n통과 ${results.filter(x=>x.includes('✓')).length} · 실패 ${results.filter(x=>x.includes('✗')).length}`);
 await br.close(); srv.close();
});
