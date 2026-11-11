// 사용법: node tools/e2e-org-all-card.js   (맥 크롬 헤드리스) — 조직도 '전체 인원' 카드를 누르면 다른 카드 · 검색을 풀고 전체 (2026-11-11)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8871,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));await pg.setViewport({width:1400,height:900});await pg.goto('http://localhost:8871/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(()=>{localUsers.length=0;[['u1','김능영','sales'],['u2','신민성','sales'],['u3','정장훈','it'],['u4','이운영','ops']].forEach(([id,name,dept])=>localUsers.push({id,name,dept,email:id+'@x.kr',groupId:dept==='it'?'management':dept,level:'manager'}));enterApp(localUsers[2]);
  navigate('org-chart',document.getElementById('nav-org-chart'));
  const cnt=()=>{const m=(document.querySelector('#page-org-chart, #content')||document.body).innerText.match(/(\d+)명 \/ 전체 (\d+)명/);return m?m[1]+'/'+m[2]:'';};
  const all=()=>document.querySelector('[data-org-all]');const out={};
  out.start={c:cnt(),ring:all().className.includes('ring-2')};
  const sales=[...document.querySelectorAll('button')].find(b=>b.getAttribute('onclick')==="setOrgFilter('dept', 'sales')");sales.click();
  out.sales={c:cnt(),ring:all().className.includes('ring-2')};
  setOrgFilter('q','김');out.q=cnt();
  all().click();out.after={c:cnt(),ring:all().className.includes('ring-2'),f:JSON.stringify(orgFilter)};
  setOrgView('card');[...document.querySelectorAll('button')].find(b=>b.getAttribute('onclick')==="setOrgFilter('dept', 'ops')").click();out.card1=cnt();all().click();out.card2=cnt();setOrgView('tree');
  return out;});
 console.log(JSON.stringify(r));
 ok(r.start.c==='4/4'&&r.start.ring,'처음은 전체 · 전체 카드 표시',r.start);
 ok(r.sales.c==='2/4'&&!r.sales.ring,'영업본부 카드 누르면 2명 · 전체 카드 표시 꺼짐',r.sales);
 ok(r.after.c==='4/4'&&r.after.ring&&r.after.f==='{"q":"","dept":""}','전체 인원 카드 → 부서·검색 풀고 전체',r.after);
 ok(r.card1==='1/4'&&r.card2==='4/4','카드 보기에서도 같음',r);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
