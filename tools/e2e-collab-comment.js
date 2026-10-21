// 사용법: node tools/e2e-collab-comment.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-22 — 협업요청 상세의 코멘트: 입력칸은 처음엔 숨김 → [코멘트 작성] 누르면 열림 · 등록하면 목록 · 카드 숫자 · 요청자/담당자 알림 · 관리자 삭제
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8803,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8803/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const before=collabRequests.length, notiBefore=collabNotifications.length;
   collabRequests.push({id:'e2e-cc1',type:'collab',title:'코멘트시험',description:'내용',sourceDept:'ops',targetDept:'sales',assignee:'요청자시험',assigneeUser:'담당자시험',status:'accepted',date:'2026-10-30',ageDays:0});
   openCollabDetailModal('e2e-cc1');
   const form=document.getElementById('collab-comment-form');
   r.hiddenAtFirst=!!form&&form.classList.contains('hidden');
   r.openBtn=!!document.getElementById('collab-comment-open');
   toggleCollabCommentForm(true);
   r.openAfterClick=!form.classList.contains('hidden');
   document.getElementById('collab-comment-text').value='확인했습니다. 다음 주 진행 부탁드립니다.';
   addCollabComment('e2e-cc1');
   const req=collabRequests.find(x=>x.id==='e2e-cc1');
   r.saved=(req.comments||[]).length===1&&req.comments[0].by==='정장훈';
   const body=document.getElementById('collab-detail-body').innerText;
   r.listShown=body.includes('확인했습니다. 다음 주 진행 부탁드립니다.')&&body.includes('1건');
   r.formClosedAgain=document.getElementById('collab-comment-form').classList.contains('hidden');
   r.notis=collabNotifications.slice(notiBefore).filter(n=>n.type==='collab-comment').map(n=>n.toUser).sort().join(',');
   r.notiText=notiText(collabNotifications[collabNotifications.length-1]).includes('코멘트가 등록');
   r.cardBadge=collabTicketCard(req,'inbox').includes('코멘트 1건');
   deleteCollabComment('e2e-cc1',req.comments[0].id);
   r.deleted=(req.comments||[]).length===0;
   closeCollabDetailModal();
   collabRequests.splice(before); collabNotifications.splice(notiBefore);
   return r;
 });
 const expect={hiddenAtFirst:true,openBtn:true,openAfterClick:true,saved:true,listShown:true,formClosedAgain:true,notis:'담당자시험,요청자시험',notiText:true,cardBadge:true,deleted:true};
 const bad=Object.keys(expect).filter(k=>out[k]!==expect[k]);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
