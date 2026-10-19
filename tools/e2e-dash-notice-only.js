// 사용법: node tools/e2e-dash-notice-only.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-19 — 마이 대시보드 공지사항 칸에는 직접 등록한 공지만, 알림(삭제 요청 · 협업 · 지연)은 알림함에만
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8804,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8804/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const nb=notices.length, cb=collabNotifications.length;
   notices.push({id:'e2e-n1',title:'시스템점검공지시험',content:'점검 안내',date:ymd(new Date()),author:'관리자'});
   pushNotification({id:'e2e-a1',type:'collab-requested',ticketId:'x',title:'알림시험제목',toUser:currentUserName,toDept:currentUserRole,detail:'알림시험상세',date:ymd(new Date())});
   navigate('personal-dashboard',document.getElementById('nav-personal-dashboard'));
   renderPersonalDashboard(currentUserName,currentUserRole);
   const panel=document.getElementById('personal-notifications-list').innerText;
   r.noticeShown=panel.includes('시스템점검공지시험');
   r.alertNotInNotice=!panel.includes('알림시험제목');
   r.alertInBell=myNotifications().some(n=>n.id==='e2e-a1');
   notices.splice(nb); collabNotifications.splice(cb);
   renderPersonalDashboard(currentUserName,currentUserRole);
   r.emptyMsg=document.getElementById('personal-notifications-list').innerText.includes('등록된 공지사항이 없습니다')||notices.length>0;
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
