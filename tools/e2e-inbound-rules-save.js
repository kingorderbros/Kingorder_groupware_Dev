// 사용법: node tools/e2e-inbound-rules-save.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-05 — 인바운드 배정 규칙은 [저장] 을 눌러야 저장되고, 저장할 때 지금 미배정 건에 새로 적용할지 묻습니다.
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');const SHOT=process.env.SHOT_DIR||'';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8863,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1400,height:900});const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
 const ev=(f,...a)=>pg.evaluate(f,...a);const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const type=async(sel,text)=>{await pg.click(sel,{clickCount:3});await pg.keyboard.type(text);};
 try{
  await pg.goto('http://localhost:8863/',{waitUntil:'networkidle0'});await ev(()=>localStorage.clear());await pg.goto('http://localhost:8863/',{waitUntil:'networkidle0'});
  await ev(()=>enterApp({email:'admin@company.com',dept:'admin',name:'관리자'}));
  // 시험 자료 — 미배정 · 키워드 · 재문의 · 이미 배정 · 결과 · 블로그
  await ev(()=>{const D=ymd(new Date());const mk=(id,o,k)=>Object.assign({id,inDate:D,inAt:D+' 09:00',company:id,name:'',phone:'',requestNote:'',channel:'etc',flags:[],kob:Object.assign({dept:'',result:'',extras:[]},k||{})},o);
   inboundRecords.length=0;inboundRecords.push(mk('A-일반',{}),mk('B-키워드',{requestNote:'포스 환불 문의'}),mk('C-재문의',{phone:'010-1111-2222'}),mk('D-이전',{phone:'010-1111-2222'},{dept:'운영'}),mk('E-이미',{},{dept:'영업'}),mk('F-실패',{},{result:'실패'}),mk('G-블로그',{channel:'blog'}));
   inboundSources.rules.defaultDept='';inboundSources.rules.opsKeywords=['AS'];saveInboundSources();saveInboundRecords();
   navigate('inbound-center',document.getElementById('nav-inbound-center'));setInboundTab('rules');});
  await wait(500);
  const st=()=>ev(()=>({rules:JSON.parse(JSON.stringify(inboundSources.rules)),stored:JSON.parse(kobStorage.getItem(INBOUND_SOURCES_KEY)).rules,dept:Object.fromEntries(inboundRecords.map(r=>[r.id,r.kob.dept])),modal:!!document.getElementById('inb-rules-save-modal'),disabled:document.getElementById('inb-rules-save-btn').disabled,msg:document.getElementById('inb-rules-state').textContent,max:inboundMaxContact}));
  let s=await st();ok(s.disabled&&s.msg.includes('없습니다'),'처음에는 저장 단추가 눌리지 않음');
  // 고쳐도 저장되지 않음
  await type('#inbound-body textarea, #sec-inbound-center textarea','AS, 환불');
  await pg.select('#sec-inbound-center select[onchange*="defaultDept"]','영업');
  await pg.focus('#sec-inbound-center input[oninput*="dupDays"]');
  s=await st();ok(!s.disabled&&s.msg.includes('2건'),'고치면 저장 단추가 켜지고 변경 건수 표시');ok(!s.stored.opsKeywords.includes('환불')&&s.stored.defaultDept==='','저장 전에는 저장값 그대로');ok(!s.modal,'저장 전에는 창 없음');
  // 포커스가 칸에 있는 채 저장을 바로 눌러도 한 번에 열림
  await pg.click('#inb-rules-save-btn');await wait(200);
  const box=await ev(()=>document.getElementById('inb-rules-save-modal').innerText);
  ok(box.includes('지금 미배정인 건에도 새 규칙을 적용할까요?'),'저장을 누르면 새로 적용할지 물음');ok(box.includes('3건')&&box.includes('영업본부 1건')&&box.includes('운영본부 2건'),'적용 대상 건수 (일반=영업, 키워드 · 재문의=운영)');ok(box.includes('기타 문의 배정')&&box.includes('AS, 환불'),'바뀌는 내용 표시');ok(!/E-이미|F-실패|G-블로그/.test(box),'배정된 건 · 결과 난 건 · 블로그는 대상 아님');
  if(SHOT)await pg.screenshot({path:path.join(SHOT,'inb-rules-modal.png')});
  // 취소 — 저장 안 되고 고친 값은 남음
  await ev(()=>closeInbRulesSave());s=await st();ok(!s.modal&&s.stored.defaultDept===''&&!s.disabled,'취소하면 저장 안 되고 고친 값 유지');
  // 다른 탭 갔다 와도 고친 값 유지, 되돌리기
  await ev(()=>{setInboundTab('dashboard');setInboundTab('rules');});await wait(200);
  ok(await ev(()=>document.querySelector('#sec-inbound-center textarea').value.includes('환불')),'다른 탭에 다녀와도 고친 값 유지');
  await pg.click('#inb-rules-undo-btn');await wait(200);
  s=await st();ok(s.disabled&&await ev(()=>!document.querySelector('#sec-inbound-center textarea').value.includes('환불')),'되돌리기');
  // 적용하지 않고 저장
  await ev(()=>{setInboundRule('defaultDept','영업');});await pg.click('#inb-rules-save-btn');await wait(150);await pg.click('#inb-rules-save-only');await wait(200);
  s=await st();ok(s.stored.defaultDept==='영업'&&!s.modal,'적용하지 않고 저장 — 규칙 저장됨');ok(s.dept['A-일반']==='','적용하지 않고 저장 — 미배정 그대로');
  // 새로 적용하고 저장 + 숫자 칸 이상 값
  await ev(()=>{setInboundRule('opsKeywords','AS, 환불');setInboundRule('dupDays','');setInboundRule('maxContact','99');});await pg.click('#inb-rules-save-btn');await wait(150);await pg.click('#inb-rules-save-apply');await wait(200);
  s=await st();ok(s.dept['A-일반']==='영업'&&s.dept['B-키워드']==='운영'&&s.dept['C-재문의']==='운영','새로 적용 — 미배정이 규칙대로 배정');ok(s.dept['E-이미']==='영업'&&s.dept['F-실패']===''&&s.dept['G-블로그']==='','새로 적용 — 다른 건은 그대로');ok(s.stored.opsKeywords.includes('환불')&&s.stored.dupDays===30&&s.max===20,'키워드 저장 · 빈 숫자는 이전 값 · 컨택 횟수 상한');ok(s.disabled,'저장 후 변경 없음');
  // 대상 없으면 저장 단추 하나
  await ev(()=>setInboundRule('slaAssignMin','45'));await pg.click('#inb-rules-save-btn');await wait(150);
  const none=await ev(()=>({t:document.getElementById('inb-rules-save-modal').innerText,apply:!!document.getElementById('inb-rules-save-apply')}));ok(none.t.includes('미배정 건은 없습니다')&&!none.apply,'적용할 건이 없으면 그렇게 알리고 저장만');
  await pg.click('#inb-rules-save-only');await wait(150);s=await st();ok(s.stored.slaAssignMin===45,'기준 시간 저장');
  ok(errs.length===0,'페이지 오류 없음 '+errs.slice(0,2).join(' | '));
 }catch(e){fail++;console.log('  ✗ 멈춤',e.message);}
 console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
