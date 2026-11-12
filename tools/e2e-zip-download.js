// 사용법: node tools/e2e-zip-download.js   (맥 크롬 헤드리스) — 첨부가 2개 이상이면 [일괄 다운로드] → 압축 파일 한 개 (2026-11-12)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8872,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1400,height:900});await pg.goto('http://localhost:8872/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const r=await pg.evaluate(async()=>{
  const out={};const got=[];window.downloadBlobAs=(b,n)=>got.push({b,n});
  const blobUrl=t=>URL.createObjectURL(new Blob([t],{type:'text/plain'}));
  const files=n=>Array.from({length:n},(_,i)=>({id:'f'+i,name:'자료'+(i<2?'':'')+'.txt',size:3,type:'text/plain',url:blobUrl('내용'+i),by:'정장훈',at:'2026-11-12'}));
  // 협업 — 완료 첨부 3개 (이름 겹침), 요청 첨부 1개 (단추 없음)
  const req={id:'cq1',title:'시험 협업',status:'completed',requestFiles:files(1),completeFiles:files(3),requester:'정장훈'};
  const h1=collabCompleteFilesHtml(req),h2=collabRequestFilesHtml(req);
  out.collab=(h1.match(/data-zip-all="(\d+)"/)||[])[1];out.collabReq=/data-zip-all/.test(h2);
  const d=document.createElement('div');d.innerHTML=h1;document.body.appendChild(d);
  await gwZipDownload(d.querySelector('[data-zip-all]').getAttribute('onclick').match(/'(z\d+)'/)[1],d.querySelector('[data-zip-all]'));
  out.zipName=got[0]&&got[0].n;
  if(got[0]){const z=await (await loadJsZip()).loadAsync(got[0].b);out.zipFiles=Object.keys(z.files).sort();out.zipText=await z.file(out.zipFiles[0]).async('string');}
  // WBS
  const p={id:'p1',name:'프로젝트A'},w={id:'w1',name:'설계',deliverableFiles:files(2)};
  window.wbsDeliverableFiles=()=>w.deliverableFiles;
  out.wbs=/data-zip-all="2"/.test(wbsDeliverableSectionHtml(p,w));
  // 개발요청 문서
  const dv={id:'d1',title:'개발건',docs:[{name:'a.pdf',dataUrl:blobUrl('a')},{name:'b.pdf',dataUrl:blobUrl('b')}],thread:[{side:'kob',by:'정장훈',at:'2026-11-12',text:'첨부',files:[{name:'c.png',dataUrl:blobUrl('c')},{name:'d.png',dataUrl:blobUrl('d')}]}]};
  out.devThread=/data-zip-all="2"/.test(devThreadHtml(dv,'kob'));
  // 자료실 보기 창
  const arc={id:'a1',title:'자료글',files:[{name:'x.txt'},{name:'y.txt'}]};
  const old=kobFiles.src;kobFiles.src=(f)=>blobUrl(f.name);
  window.archivePosts=window.archivePosts||[];try{archivePosts.push(Object.assign(arc,{dept:'it',cat:'etc',by:'정장훈',at:'2026-11-12'}));openArchiveView('a1');out.arc=!!document.querySelector('#arc-view-body [data-zip-all="2"]');}catch(e){out.arcErr=String(e);}
  kobFiles.src=old;
  return out;});
 console.log(JSON.stringify(r));
 ok(r.collab==='3','협업 완료 첨부 3개 → 일괄 다운로드 단추',r.collab);
 ok(r.collabReq===false,'첨부 1개면 단추 없음');
 ok(/^시험 협업_완료자료_첨부\.zip$/.test(r.zipName||''),'압축 파일 이름',r.zipName);
 ok((r.zipFiles||[]).length===3&&new Set(r.zipFiles).size===3,'같은 이름 파일도 3개 모두 담김(번호 붙임)',r.zipFiles);
 ok(r.zipText==='내용0','파일 내용 그대로',r.zipText);
 ok(r.wbs,'WBS 산출물 2개 → 단추',r.wbs);
 ok(r.devThread,'개발요청 메시지 첨부 2개 → 단추',r.devThread);
 ok(r.arc,'자료실 글 첨부 2개 → 단추',r);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
