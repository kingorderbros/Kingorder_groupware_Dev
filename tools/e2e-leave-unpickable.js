// 사용법: node tools/e2e-leave-unpickable.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-03 — 휴직자 · 퇴사자는 사람 고르기에서 선택할 수 없음: 한 명 고르기 창(회색 · 눌러도 안 바뀜) · 여러 명 체크 목록(체크 막음, 이미 골라 둔 사람은 풀 수 있음) · 인바운드 담당자 목록
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8842,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8842/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const out=await pg.evaluate(async()=>{
   const r={};
   const before=localUsers.length;
   localUsers.push({id:'L1',name:'시험근무',dept:'sales',rank:'사원',email:'l1@x'},{id:'L2',name:'시험휴직',dept:'sales',rank:'사원',email:'l2@x',onLeave:true},{id:'L3',name:'시험퇴사',dept:'sales',rank:'사원',email:'l3@x',resigned:true});
   // ① 한 명 고르기 창
   const host=document.createElement('div');document.body.appendChild(host);
   host.innerHTML='<select id="t-sel"><option value="">선택하세요</option><option value="시험근무">시험근무</option><option value="시험휴직">시험휴직</option><option value="시험퇴사">시험퇴사</option></select>';
   const sel=document.getElementById('t-sel');enhancePeopleSelect(sel);
   openPeoplePicker(sel);
   document.getElementById('ptree-search').value='시험';renderPeoplePicker();
   const body=document.getElementById('ptree-body');
   r.leaveShownGray=!!Array.from(body.querySelectorAll('.cursor-not-allowed')).find(x=>x.textContent.includes('시험휴직')&&x.textContent.includes('휴직중'));
   r.workerClickable=!!Array.from(body.querySelectorAll('button')).find(x=>x.textContent.includes('시험근무'));
   r.leaveNotButton=!Array.from(body.querySelectorAll('button')).some(x=>x.textContent.includes('시험휴직')||x.textContent.includes('시험퇴사'));
   ptreeCurSel=sel;ptreePick('시험휴직');
   r.pickBlocked=sel.value==='';
   openPeoplePicker(sel);ptreePick('시험근무');
   r.pickWorker=sel.value==='시험근무';
   // 이미 휴직자가 담겨 있으면 그 값은 그대로 보임(바뀌지 않음)
   sel.value='시험휴직';openPeoplePicker(sel);
   r.currentKept=ptreeSelectInfo(sel).people.find(p=>p.value==='시험휴직').off===false;
   closePeoplePicker();host.remove();
   // ② 여러 명 체크 목록
   const d=document.createElement('div');document.body.appendChild(d);
   d.innerHTML=peopleCheckTreeHtml(localUsers.filter(u=>/^L\d$/.test(u.id)),'t-chk',['시험퇴사']);
   const box=n=>d.querySelector(`input.t-chk[value="${n}"]`);
   r.checkLeaveDisabled=box('시험휴직').disabled&&!box('시험근무').disabled;
   r.checkSelectedFree=!box('시험퇴사').disabled&&box('시험퇴사').checked;
   const grp=d.querySelector('[data-ptree-grp]');grp.checked=true;grp.dispatchEvent(new Event('change',{bubbles:true}));
   r.groupSkipsLeave=box('시험근무').checked&&!box('시험휴직').checked;
   d.remove();
   // ③ 인바운드 담당자 목록 · 공용 목록
   r.inboundNoLeave=!inboundDeptUsers('영업').includes('시험휴직')&&inboundDeptUsers('영업').includes('시험근무');
   r.pickableNoLeave=!pickableUsers().some(u=>u.id==='L2'||u.id==='L3');
   localUsers.splice(before);
   return r;
 });
 const bad=Object.keys(out).filter(k=>out[k]!==true);
 console.log(JSON.stringify(out));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
