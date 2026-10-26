// 사용법: node tools/e2e-noti-over-wc.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-26 — 알림함 · 접속 상태 창이 운영 · 영업업무센터 고객조회 칸 뒤로 숨던 문제 / 휴대폰 메뉴는 머리 줄보다 위
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8822,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8822/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(()=>{
   const r={};
   for(let i=0;i<3;i++) collabNotifications.push({id:'nx'+i,type:'collab-comment',title:'시험 알림 '+i,toUser:'정장훈',detail:'내용',date:'2026-10-26',read:false});
   refreshNotiBell();
   const onTop=(id)=>{const p=document.getElementById(id);const b=p.getBoundingClientRect();return [0.25,0.5,0.75].every(f=>p.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height*f)));};
   for(const sec of ['ops-work-center','sales-work-center']){
     navigate(sec,document.getElementById('nav-'+sec));
     toggleNotiPanel(); r[sec+'Noti']=onTop('noti-panel'); closeNotiPanel();
   }
   const h=document.querySelector('#noti-panel p.text-sm.font-bold'); r.titleOneLine=h.getBoundingClientRect().height<30;
   return r;
 });
 // 휴대폰 — 메뉴를 열면 머리 줄보다 위
 await pg.setViewport({width:390,height:844});
 out.mobileSidebar=await pg.evaluate(()=>{ toggleSidebar(); const sb=document.getElementById('sidebar'); const b=sb.getBoundingClientRect(); const el=document.elementFromPoint(Math.min(b.right-10,120),30); const ok=sb.contains(el); toggleSidebar(); return ok; });
 const expect={'ops-work-centerNoti':true,'sales-work-centerNoti':true,titleOneLine:true,mobileSidebar:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
