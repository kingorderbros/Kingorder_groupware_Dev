// 사용법: node tools/e2e-as-method-chungho.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-26 — AS유지보수 처리방법에 '외주업체(청호)' — 기본 목록 · 이미 저장된 목록 모두에 들어가고, 관리자가 지우면 다시 생기지 않음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8819,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8819/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   r.seed=asOptionList('method').includes('외주업체(청호)');
   // 예전에 저장해 둔 목록(청호 없음)
   kobStorage.setItem(AS_OPTION_KEY, JSON.stringify({ method:['현장방문','원격','기타'] }));
   reloadAsOptions();
   r.savedGetsIt=asOptionList('method').join(',')==='현장방문,원격,외주업체(청호),기타';
   // 관리자가 지우고 저장
   openAsOptions(); asOptDraft.method=asOptDraft.method.filter(v=>v!=='외주업체(청호)'); saveAsOptionsFromModal();
   reloadAsOptions();
   r.staysDeleted=!asOptionList('method').includes('외주업체(청호)');
   kobStorage.removeItem(AS_OPTION_KEY); reloadAsOptions();
   return r;
 });
 const expect={seed:true,savedGetsIt:true,staysDeleted:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
