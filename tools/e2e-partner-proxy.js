// 사용법: node tools/e2e-partner-proxy.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-30 대리 접수 — 파트너센터 접수함 [대리 접수] → 업체 고르기 → 새 탭 주소(#proxy=) · 파트너 화면 안내 띠 · 접수에 '대리 접수 · 직원' 표시
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(b);});});
srv.listen(8837,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1300,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8837/',{waitUntil:'networkidle0'});
 const out=await pg.evaluate(async()=>{
   const r={};
   localUsers.push({id:'u-e2e-p1',name:'김영업p',dept:'sales',team:'',rank:'매니저',email:'p1@t.l',groupId:'sales',level:'manager'});
   partners.push({id:'PA-PX',name:'대리시험파트너',kind:'partner',custType:'partner'});
   enterApp(localUsers.find(u=>u.id==='u-e2e-p1'));
   renderPartnerCenter('sales');
   r.button=document.getElementById('sec-partner-center-sales').innerHTML.includes('openPartnerProxyPicker');
   openPartnerProxyPicker('sales');
   partnerProxyQ='대리시험'; renderPartnerProxyList();
   r.listed=document.getElementById('partner-proxy-list').innerHTML.includes('대리시험파트너');
   let opened=''; const fakeWin={location:{set href(v){opened=v;}},close(){}};
   window.open=()=>fakeWin; kobAuth.call=async(p,b)=>({ok:true,token:'TOK'+b.partnerId});
   await startPartnerProxy('PA-PX');
   r.url=opened.includes('?mode=partner#proxy=TOKPA-PX');
   const hit=partnerProxyHit({loginId:'proxy:p1@t.l',partnerId:'PA-PX',proxyBy:'p1@t.l',proxyName:'김영업p'});
   r.hit=hit.partnerName==='대리시험파트너'&&hit.proxy===true&&hit.custType==='partner';
   const x={id:'PI-PX',partnerId:'PA-PX',partnerName:'대리시험파트너',dept:'sales',type:'newshop',title:'t',at:'2026-10-30 10:00',status:'received',history:[],files:[],docs:[],extra:{},proxyBy:'김영업p'};
   r.mark=partnerIntakeBodyHtml(x,true).includes('대리 접수 · 김영업p');
   return {r,hit};
 });
 // 파트너 화면 — 안내 띠
 const pg2=await br.newPage(); await pg2.goto('http://localhost:8837/?mode=partner',{waitUntil:'networkidle0'});
 out.r.banner=await pg2.evaluate((hit)=>{ partners.push({id:'PA-PX',name:'대리시험파트너',kind:'partner'}); enterPartner(hit); const b=document.getElementById('pc-proxy-banner'); return !!b&&b.textContent.includes('대리 접수 중')&&b.textContent.includes('김영업p'); },out.hit);
 const r=out.r;
 const expect=['button','listed','url','hit','mark','banner'];
 const bad=expect.filter(k=>r[k]!==true);
 console.log(JSON.stringify(r));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
