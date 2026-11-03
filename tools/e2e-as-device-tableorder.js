// 사용법: node tools/e2e-as-device-tableorder.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-03 — AS유지보수 대상 장비에 '테이블오더' — 기본 목록 · 이미 저장된 목록 모두에 들어가고, 관리자가 지우면 다시 생기지 않음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8842,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8842/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   r.seed=asOptionList('device').join(',')==='POS 단말,카드리더,주방프린터,라벨프린터,KIOSK,테이블오더,기타';
   kobStorage.setItem(AS_OPTION_KEY, JSON.stringify({ device:['POS 단말','KIOSK','기타'], method:['현장방문','기타'], _added:['method-chungho-20261026'] }));
   reloadAsOptions();
   r.savedGetsIt=asOptionList('device').join(',')==='POS 단말,KIOSK,테이블오더,기타';
   r.methodUntouched=asOptionList('method').join(',')==='현장방문,기타';
   openAsOptions(); asOptDraft.device=asOptDraft.device.filter(v=>v!=='테이블오더'); saveAsOptionsFromModal();
   reloadAsOptions();
   r.staysDeleted=!asOptionList('device').includes('테이블오더');
   kobStorage.removeItem(AS_OPTION_KEY); reloadAsOptions();
   return r;
 });
 const expect={seed:true,savedGetsIt:true,methodUntouched:true,staysDeleted:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
