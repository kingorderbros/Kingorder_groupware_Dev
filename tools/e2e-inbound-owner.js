// 사용법: node tools/e2e-inbound-owner.js   (맥 크롬 헤드리스) — 인입 목록을 상담 담당자로 조회 · 추가 컨택 상담자 (2026-11-09)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8867,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1500,height:950});await pg.goto('http://localhost:8867/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(()=>{localUsers.length=0;[['u1','김능영','sales'],['u2','신민성','sales'],['u3','정장훈','it']].forEach(([id,name,dept])=>localUsers.push({id,name,dept,email:id+'@x.kr',groupId:dept==='it'?'management':dept,level:'manager'}));enterApp(localUsers[2]);
  inboundRecords.length=0;const mk=(id,company,owner,ex)=>({id,company,name:'',phone:'',inDate:'2026-11-0'+id.slice(-1),routes:[],services:[],kob:{dept:'영업',owner,extras:ex||[]}});
  inboundRecords.push(mk('i1','가게하나','김능영'),mk('i2','가게둘','신민성',[{at:'2026-11-05',by:'김능영',note:'재통화'}]),mk('i3','가게셋','김 능영'),mk('i4','가게넷',''));
  navigate('inbound-center',document.getElementById('nav-inbound-center'));inboundTab='list';renderInboundCenter();
  const sel=()=>[...document.querySelectorAll('#inbound-tab-body select')].find(x=>x.previousElementSibling&&x.previousElementSibling.textContent==='상담 담당자');const opts=[...sel().options].map(o=>o.textContent);
  const ids=()=>inboundFiltered().map(x=>x.id).join();const s=sel();s.value='김능영';s.dispatchEvent(new Event('change'));const a=ids();
  setInboundFilter('owner','신민성');const b=ids();setInboundFilter('owner','none');const c=ids();resetInboundFilter();
  // 상세 창: 담당자 칸은 고르기, 추가 컨택에 상담자 (기본 = 나)
  openInboundModal('i4');const ownerEl=document.getElementById('inb-kob-owner');const ownerTag=ownerEl&&ownerEl.tagName;const ownerOpts=ownerEl?[...ownerEl.options].map(o=>o.value):[];
  addInboundExtra();const ex=inboundKob(inboundDraft).extras;const exSel=document.querySelector('#inbound-extras select');return{opts,a,b,c,ownerTag,ownerOpts,exBy:ex[ex.length-1].by,exSel:exSel&&exSel.value};});
 console.log(JSON.stringify(r));
 ok(r.opts.join()==='전체,김능영 (3),신민성 (1),상담자 없음 (1)','선택지: 띄어쓰기 다른 이름 합침 · 추가 상담자 포함',r.opts);
 ok(r.a==='i3,i2,i1','담당자 + 추가 컨택 상담자로 조회',r.a);ok(r.b==='i2','다른 담당자',r.b);ok(r.c==='i4','상담자 없음',r.c);
 ok(r.ownerTag==='SELECT'&&r.ownerOpts.includes('김능영'),'담당자는 직원 목록에서 고르기',r);ok(r.exBy==='정장훈'&&r.exSel==='정장훈','추가 컨택 상담자 기본은 나',r);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
