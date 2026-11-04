// 사용법: node tools/e2e-sidebar-close.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-04 — 휴대폰에서 열린 메뉴가 줄 세 개를 가려도 메뉴 안 [닫기] 단추로 닫힘, 너비 768 이상에서는 단추 없음
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8854,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const r={};const errs=[];
 const open=async(w,h)=>{const pg=await br.newPage();await pg.setViewport({width:w,height:h,isMobile:true,hasTouch:true});pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));await pg.goto('http://localhost:8854/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));await new Promise(x=>setTimeout(x,500));return pg;};
 const wait=()=>new Promise(x=>setTimeout(x,400));
 const shown=pg=>pg.evaluate(()=>{const s=document.getElementById('sidebar').getBoundingClientRect();return s.right>0&&s.width>0;});
 const pos=(pg,sel)=>pg.evaluate(sel=>{const b=document.querySelector(sel).getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,right:b.right};},sel);
 let pg=await open(390,844);
 r.closedAtStart=!(await shown(pg));
 let b=await pos(pg,'header button[onclick="toggleSidebar()"]');await pg.touchscreen.tap(b.x,b.y);await wait();
 r.opened=await shown(pg);
 const c=await pos(pg,'#sidebar-close');
 const side=await pos(pg,'#sidebar');
 r.closeInsideMenu=c.w>=40&&c.right<=side.right;
 r.closeOnTop=await pg.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y),t=document.getElementById('sidebar-close');return !!e&&(e===t||t.contains(e));},[c.x,c.y]);
 await pg.touchscreen.tap(c.x,c.y);await wait();
 r.closedByButton=!(await shown(pg));
 r.overlayGone=await pg.evaluate(()=>getComputedStyle(document.getElementById('mobile-overlay')).display==='none');
 await pg.close();
 pg=await open(1280,800);
 r.noButtonOnPc=await pg.evaluate(()=>getComputedStyle(document.getElementById('sidebar-close')).display==='none');
 await pg.close();
 const bad=Object.keys(r).filter(k=>r[k]!==true);
 console.log(JSON.stringify(r));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
