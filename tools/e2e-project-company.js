// 사용법: node tools/e2e-project-company.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-23 보완사항 — 프로젝트 관리에서 킹오더브라더스 / 브랜드팩토리 구분 (등록 시 선택 · 탭으로 거르기 · 예전 자료는 킹오더브라더스)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8811,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8811/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={}; const before=projects.length;
   navigate('project-center',document.getElementById('nav-project-center'));
   const add=(name,co)=>{ openProjectModal(); document.getElementById('prj-name').value=name; document.getElementById('prj-start-plan').value='2026-10-23'; document.getElementById('prj-end-tbd').checked=true; onProjectEndTbdChange();
     document.querySelector(`input[name="prj-company"][value="${co}"]`).checked=true; submitProject({preventDefault(){}}); };
   add('킹오더시험프로젝트','kob'); add('브팩시험프로젝트','bf');
   const made=projects.slice(before);
   r.saved=made.map(p=>p.company).join(',');
   r.tabs=document.getElementById('prj-company-tabs').innerText.includes('브랜드팩토리');
   setProjectCompanyFilter('bf');
   const opts=[...document.getElementById('project-select').options].map(o=>o.text).join('|');
   r.filtered=opts.includes('브팩시험프로젝트')&&!opts.includes('킹오더시험프로젝트');
   setProjectCompanyFilter('bf');   // 다시 누르면 전체
   r.legacyKob=projectCompanyOf({name:'옛것'})==='kob';
   projects.splice(before); renderProjectCenter();
   return r;
 });
 const expect={saved:'kob,bf',tabs:true,filtered:true,legacyKob:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
