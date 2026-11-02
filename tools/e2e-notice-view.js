// 사용법: node tools/e2e-notice-view.js .   — 공지사항 상세 창 · 킹오더챗에서 ?notice=번호 로 들어오기 (2026-11-02)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};
srv.listen(8821,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();
 const errs=[];const dlg=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>{dlg.push(d.message());d.accept();});
 await pg.goto('http://localhost:8821/?notice=n77',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{
   notices.unshift({id:'n77',title:'11월 휴무 안내',content:'첫째 줄\n<b>둘째</b> 줄',date:'2026-11-02',author:'관리자',pinned:true});
   enterApp({email:'s@k.co',dept:'sales',name:'직원'});
   await new Promise(res=>setTimeout(res,900));
   const m=document.getElementById('notice-view-modal');const o={};
   o.open=!!m&&!m.classList.contains('hidden');o.text=m?m.innerText:'';o.bold=m?m.innerHTML.includes('&lt;b&gt;'):false;
   o.url=location.search;
   closeNoticeView();o.closed=m.classList.contains('hidden');
   openNoticeView('없는번호');
   return o;});
 ok(r.open,'?notice=번호 로 들어오면 로그인 뒤 상세 창이 열린다');
 ok(r.text.includes('11월 휴무 안내')&&r.text.includes('첫째 줄')&&r.text.includes('관리자')&&r.text.includes('2026-11-02'),'제목 · 내용 · 작성자 · 날짜 표시');
 ok(r.bold,'내용의 태그는 글자로 표시(실행 안 됨)');
 ok(!r.url.includes('notice'),'주소에서 notice 를 지운다(새로고침해도 다시 안 열림)');
 ok(r.closed,'닫기');
 ok(dlg.some(x=>x.includes('찾을 수 없습니다')),'없는 공지는 안내');
 ok(!errs.length,'페이지 오류 없음 '+errs.join(' | '));
 console.log(`=========== 통과 ${pass} · 실패 ${fail} ===========`);await br.close();srv.close();process.exit(fail?1:0);});
