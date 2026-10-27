// 사용법: node tools/e2e-xss-guard.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-28 보안 점검 — 파트너 · 직원이 넣은 값(번호 · 첨부 주소 · 알림)이 직원 화면에서 코드로 실행되지 않는지
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8824,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8824/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={}; window.__xss=0;
   const evilId=`PI-X');window.__xss++;//`; const evilId2=`PI-Y"><img src=x onerror="window.__xss++">`;
   partnerIntakes.push({id:evilId,partnerId:'PA-1',partnerName:'시험',dept:'ops',type:'as',title:'<img src=x onerror="window.__xss++">',at:'2026-10-28',status:'received',history:[],replies:[],docs:[],extra:{},
     files:[{name:'a.png',type:'image/png',dataUrl:'x" onerror="window.__xss++'},{name:'b',type:'image/png',dataUrl:'javascript:window.__xss++'}]});
   partnerIntakes.push({id:evilId2,partnerId:'PA-1',partnerName:'시험',dept:'ops',type:'as',title:'t2',at:'2026-10-28',status:'received',history:[],replies:[],docs:[],extra:{},files:[]});
   // 직원 파트너센터 목록 · 상세
   try { navigate('partner-center-ops',document.getElementById('nav-partner-center-ops')); } catch(e) {}
   const host=document.getElementById('sec-partner-center-ops');
   await new Promise(res=>setTimeout(res,300));
   const row=[...document.querySelectorAll('[onclick^="openPartnerIntakeModal("]')].find(el=>el.getAttribute('onclick').includes('PI-X'));
   r.rowFound=!!row;
   if(row) row.click();
   await new Promise(res=>setTimeout(res,300));
   r.modalOpenedRightOne=typeof partnerIntakeViewId!=='undefined' && partnerIntakeViewId===evilId;
   // 알림에 이상한 번호
   const n={id:'nz1',type:'dev-update',devId:`D1');window.__xss++;//`,title:'시험',toUser:'정장훈',detail:'x',date:'2026-10-28',read:false};
   collabNotifications.push(n); refreshNotiBell(); toggleNotiPanel();
   const item=[...document.querySelectorAll('#noti-panel-list [onclick]')].find(el=>el.getAttribute('onclick').includes('openDevFromNotice'));
   r.notiFound=!!item; if(item) item.click();
   await new Promise(res=>setTimeout(res,300));
   r.safeUrl=safeFileUrl('javascript:alert(1)')===''&&safeFileUrl('data:text/html,x')===''&&safeFileUrl('data:image/png;base64,AA').startsWith('data:image/png');
   r.noExec=window.__xss===0;
   partnerIntakes.splice(partnerIntakes.findIndex(x=>x.id===evilId),2);
   collabNotifications.splice(collabNotifications.indexOf(n),1);
   return r;
 });
 const expect={rowFound:true,modalOpenedRightOne:true,notiFound:true,safeUrl:true,noExec:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length?1:0);});
