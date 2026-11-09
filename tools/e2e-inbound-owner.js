// 사용법: node tools/e2e-inbound-owner.js   (맥 크롬 헤드리스) — 인입 목록을 상담 담당자로 조회 (2026-11-09)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,300));}};
srv.listen(8867,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));await pg.setViewport({width:1500,height:950});await pg.goto('http://localhost:8867/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(()=>{enterApp({email:'a@x.kr',dept:'admin',name:'정장훈'});inboundRecords.length=0;const mk=(id,company,owner)=>({id,company,name:'',phone:'',inDate:'2026-11-0'+id.slice(-1),routes:[],services:[],kob:{dept:'영업',owner,extras:[]}});inboundRecords.push(mk('i1','가게하나','김능영'),mk('i2','가게둘','신민성'),mk('i3','가게셋','김능영 '),mk('i4','가게넷',''));
  navigate('inbound-center',document.getElementById('nav-inbound-center'));inboundTab='list';renderInboundCenter();
  const sel=[...document.querySelectorAll('#inbound-tab-body select')].find(x=>x.previousElementSibling&&x.previousElementSibling.textContent==='상담 담당자');const opts=sel?[...sel.options].map(o=>o.textContent):[];
  const ids=()=>inboundFiltered().map(x=>x.id).join();sel.value='김능영';sel.dispatchEvent(new Event('change'));const a=ids();const keep=[...document.querySelectorAll('#inbound-tab-body select')].find(x=>x.previousElementSibling&&x.previousElementSibling.textContent==='상담 담당자').value;
  setInboundFilter('owner','none');const b=ids();setInboundFilter('owner','');inboundFilter.q='신민성';const c=ids();resetInboundFilter();return{opts,a,keep,b,c,reset:inboundFilter.owner};});
 ok(r.opts.join()==='전체,김능영 (2),신민성 (1),담당자 미지정 (1)','선택지에 담당자 · 건수',r.opts);ok(r.a==='i3,i1'&&r.keep==='김능영','담당자로 조회',r);ok(r.b==='i4','미지정 조회',r);ok(r.c==='i2','검색어로도 담당자 찾기',r);ok(r.reset==='','초기화',r);ok(errs.length===0,'페이지 오류 없음',errs);
 console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
