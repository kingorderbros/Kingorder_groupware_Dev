// 사용법: node tools/e2e-schedule-recur-days.js   (맥 크롬 헤드리스) — 반복 일정 요일 단추: 매일·평일·요일 지정에서 보이고, 요일을 고르면 그 요일마다 (2026-11-11)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end(`window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};`);}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x).slice(0,400));}};
srv.listen(8870,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());await pg.setViewport({width:1400,height:900});await pg.goto('http://localhost:8870/',{waitUntil:'networkidle0'});
 await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 const r=await pg.evaluate(()=>{
  const sel=document.getElementById('schedule-recur');const row=document.getElementById('schedule-recur-days-row');
  const checked=()=>[...document.querySelectorAll('#schedule-recur-days input:checked')].map(x=>x.value).join('');
  const box=v=>document.querySelector(`#schedule-recur-days input[value="${v}"]`);
  const set=v=>{sel.value=v;sel.dispatchEvent(new Event('change'));};
  openScheduleModal('2026-11-11');const out={};
  out.label=[...sel.options].find(o=>o.value==='weekly').textContent;
  set('');out.none=row.classList.contains('hidden');
  set('daily');out.daily={show:!row.classList.contains('hidden'),c:checked()};
  set('weekdays');out.wd={show:!row.classList.contains('hidden'),c:checked()};
  // 평일에서 금요일을 끄면 → 요일 지정(월~목)
  box(5).click();out.toWeekly={f:sel.value,c:checked(),sum:document.getElementById('schedule-recur-summary').textContent};
  // 매일 2일마다에서 일요일 끄면 → 요일 지정, 간격 1
  set('daily');document.getElementById('schedule-recur-interval').value=2;box(0).click();out.daily2={f:sel.value,c:checked(),n:document.getElementById('schedule-recur-interval').value};
  // 요일 지정에서 바꾸면 그대로
  set('weekly');box(0).click();out.wk={f:sel.value,c:checked()};
  set('monthly');out.monthly=row.classList.contains('hidden');
  // 저장: 월·수·금 매주 → 회차 날짜
  set('weekly');document.querySelectorAll('#schedule-recur-days input').forEach(x=>x.checked=['1','3','5'].includes(x.value));
  const rec=readScheduleRecur();out.rec=rec;out.dates=recurDates({date:'2026-11-11',recur:Object.assign(rec,{end:'count',count:5})},'2026-11-01','2026-12-31').join();
  return out;});
 console.log(JSON.stringify(r));
 ok(r.label.includes('요일 지정'),'반복 목록에 "요일 지정" 이름',r.label);
 ok(r.none,'반복 안 함이면 요일 단추 없음');
 ok(r.daily.show&&r.daily.c==='0123456','매일 → 요일 단추 보이고 7일 켜짐',r.daily);
 ok(r.wd.show&&r.wd.c==='12345','평일 → 월~금 켜짐',r.wd);
 ok(r.toWeekly.f==='weekly'&&r.toWeekly.c==='1234'&&r.toWeekly.sum.includes('월·화·수·목'),'평일에서 요일 바꾸면 요일 지정으로',r.toWeekly);
 ok(r.daily2.f==='weekly'&&r.daily2.c==='123456'&&r.daily2.n==='1','매일 n일마다에서 바꾸면 매주(간격 1)',r.daily2);
 ok(r.wk.f==='weekly','요일 지정에서는 그대로',r.wk);
 ok(r.monthly,'매월은 요일 단추 없음');
 ok(r.dates==='2026-11-11,2026-11-13,2026-11-16,2026-11-18,2026-11-20','월·수·금 5회 → 날짜 맞음',r.dates);
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
