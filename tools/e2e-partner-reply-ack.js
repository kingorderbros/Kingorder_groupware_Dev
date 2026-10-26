// 사용법: node tools/e2e-partner-reply-ack.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-26 — 파트너센터 '담당자 회신 등록': 상세 보기 → [확인] → 확인 완료 표시 · 조치 필요 목록에서 사라짐, 새 회신이 달리면 다시 뜸
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8820,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1300,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));
 const dialogs=[];pg.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 await pg.goto('http://localhost:8820/?mode=partner',{waitUntil:'networkidle0'});
 const out=await pg.evaluate(()=>{
   const r={};
   partnerUser={ loginId:'e2e-p', partnerId:'PA-E2E', partnerName:'시험파트너', manager:'김파트너' };
   const x={ id:'PI-E2E-1', partnerId:'PA-E2E', dept:'ops', type:'as', title:'회신시험 접수', at:'2026-10-26 09:00', status:'working', history:[], files:[], docs:[], extra:{},
             replies:[{ at:'2026-10-26 10:00', by:'운영담당', side:'kob', text:'내일 방문 예정입니다.' }] };
   partnerIntakes.push(x);
   const inTodo=()=>partnerTodoList().some(v=>v.id==='PI-E2E-1');
   r.todoBefore=inTodo();
   if(!partnerIntakeVisible(x)) { window.partnerIntakeVisible=()=>true; }
   openPartnerIntakeDetail('PI-E2E-1');
   const body=document.getElementById('pc-detail-body').innerHTML;
   r.ackBtn=body.includes("ackPartnerReply('PI-E2E-1')");
   ackPartnerReply('PI-E2E-1');
   r.saved=x.partnerAckCount===1&&!!x.partnerAckAt&&x.partnerAckBy==='김파트너';
   r.todoAfter=inTodo();
   r.modalClosed=document.getElementById('pc-detail-modal').classList.contains('hidden');
   r.doneShown=partnerIntakeBodyHtml(x,true).includes('파트너사 확인 완료');
   x.replies.push({ at:'2026-10-26 15:00', by:'운영담당', side:'kob', text:'일정 변경' });
   r.backOnNew=inTodo();
   partnerIntakes.splice(partnerIntakes.indexOf(x),1);
   return r;
 });
 out.alert=dialogs.some(m=>m.includes('확인 완료'));
 const expect={todoBefore:true,ackBtn:true,saved:true,todoAfter:false,modalClosed:true,doneShown:true,backOnNew:true,alert:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
