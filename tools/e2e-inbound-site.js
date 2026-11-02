// 사용법: node tools/e2e-inbound-site.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-02 — 인바운드 목록 · 보드 · 상세에 어느 홈페이지로 들어왔는지 표시 + [홈페이지] 거르기 (예전 아임웹 알림 메일은 source.site)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8841,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8841/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   const before=inboundRecords.length;
   const mk=(id,channel,extra)=>Object.assign({id,channel,name:'시험'+id,phone:'010-0000-000'+id.slice(-1),inDate:'2026-11-02',inAt:'2026-11-02 10:00',source:{},routes:[],services:[],kob:{}},extra||{});
   inboundRecords.push(mk('t1','kod_contact'),mk('t2','bf_contact'),mk('t3','mail',{source:{label:'아임웹 입력폼 알림 메일',site:'큐알킹'}}),mk('t4','phone'));
   const R=id=>inboundRecords.find(x=>x.id===id);
   r.chipKod=inboundChannelChip(R('t1')).includes('>킹오더닷컴</span>');
   r.chipBf=inboundChannelChip(R('t2')).includes('>브랜드팩토리</span>');
   r.chipMail=inboundChannelChip(R('t3')).includes('>큐알킹</span>');
   r.chipPhone=inboundChannelChip(R('t4')).includes('>전화 · 메신저</span>');
   r.labelMail=inboundChannelLabel(R('t3'))==='큐알킹 · 아임웹 알림 메일';
   r.labelKod=inboundChannelLabel(R('t1'))==='킹오더닷컴 · 문의하기';
   // [홈페이지] 거르기 — 폼 · 메일 모두 그 홈페이지 것만
   navigate('inbound-center', document.getElementById('nav-inbound-center'));
   setInboundTab('list');
   r.filterBox=document.body.innerText.includes('홈페이지');
   setInboundFilter('site','큐알킹');
   const shown=document.getElementById('content-area')||document.body;
   r.filterSite=shown.innerText.includes('시험t3')&&!shown.innerText.includes('시험t1')&&!shown.innerText.includes('시험t2');
   setInboundFilter('site','');
   inboundRecords.splice(before);
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
