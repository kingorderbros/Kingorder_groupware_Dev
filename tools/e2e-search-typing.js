// 사용법: node tools/e2e-search-typing.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-10-21 — 화면을 다시 그리는 검색칸에서 여러 글자를 이어서 칠 수 있는지 (한 글자 치면 칸이 새로 만들어져 커서가 빠지던 것)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2]||'.';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
srv.listen(8812,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});const pg=await br.newPage();await pg.setViewport({width:1500,height:900});
 const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,160)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8812/',{waitUntil:'networkidle0'});await pg.evaluate(()=>enterApp({email:'daniel@kingorder.co.kr',dept:'admin',name:'정장훈'}));
 // [이름, 화면 열기, 검색칸 찾는 선택자(oninput 시작 글자)]
 const cases=[
   ['거래처 관리 · 채널', "navigate('sales-supply',document.getElementById('nav-sales-supply')); const c=supplyVisibleChannels().find(x=>!supplyDef(x).custom); if(c) setSupplyChannel(c);", 'setSupplyFilter(\'q\''],
   ['거래처 관리 · 파트너사', "navigate('sales-supply',document.getElementById('nav-sales-supply')); setSupplyChannel('partner');", 'setTradeFilter(\'q\''],
   ['거래처 관리 · 지급명세', "navigate('sales-supply',document.getElementById('nav-sales-supply')); setSupplyChannel('payout');", 'setPayoutFilter(\'q\''],
   ['공급단가표', "navigate('common',document.getElementById('nav-common')); setCommonTab('price');", 'setPriceFilter(\'q\''],
   ['CMS·렌탈 현황', "navigate('common',document.getElementById('nav-common')); setCommonTab('cms');", 'setCmsStatusFilter(\'q\''],
   ['조직도', "navigate('org-chart',document.getElementById('nav-org-chart'));", 'setOrgFilter(\'q\''],
   ['조직도 관리', "goOrgManage();", 'setOrgManageFilter(\'q\''],
   ['인바운드', "navigate('inbound-center',document.getElementById('nav-inbound-center')); setInboundTab('list');", 'setInboundFilter(\'q\''],
   ['업체 관리', "navigate('common',document.getElementById('nav-common')); setCommonTab('companies');", 'companyFilter.q'],
 ];
 const out={};
 for (const [name, open, sel] of cases){
   try{
     await pg.evaluate(open);
     await new Promise(r=>setTimeout(r,200));
     const h=await pg.evaluateHandle(s=>[...document.querySelectorAll('input[oninput]')].find(i=>i.getAttribute('oninput').startsWith(s)&&i.offsetParent!==null)||null, sel);
     const el=h.asElement();
     if(!el){ out[name]='칸 없음'; continue; }
     await el.click({clickCount:3}); await pg.keyboard.press('Backspace');
     await pg.keyboard.type('abcd',{delay:30});
     await new Promise(r=>setTimeout(r,500));
     out[name]=await pg.evaluate(s=>{const i=[...document.querySelectorAll('input[oninput]')].find(i=>i.getAttribute('oninput').startsWith(s)&&i.offsetParent!==null); return i?i.value:'(칸 사라짐)';}, sel);
     // 다음 화면을 위해 비웁니다
     await pg.evaluate(s=>{const i=[...document.querySelectorAll('input[oninput]')].find(i=>i.getAttribute('oninput').startsWith(s)&&i.offsetParent!==null); if(i){i.value=''; i.dispatchEvent(new Event('input'));}}, sel);
   }catch(e){ out[name]='오류 '+String(e).slice(0,80); }
 }
 // 한글 조합 — 조합 중에는 다시 그리지 않고, 끝나면 한 번 그려서 값이 반영되는지 (공급단가표 검색칸으로)
 out['한글 조합']=await pg.evaluate(()=>{
   navigate('common',document.getElementById('nav-common')); setCommonTab('price');
   const find=()=>[...document.querySelectorAll('input[oninput]')].find(i=>i.getAttribute('oninput').startsWith("setPriceFilter('q'"));
   const i=find(); i.focus();
   let renders=0; const orig=window.renderPriceBook; window.renderPriceBook=function(){renders++; return orig.apply(this,arguments);};
   i.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
   i.value='ㅍ'; i.dispatchEvent(new Event('input',{bubbles:true}));
   i.value='포'; i.dispatchEvent(new Event('input',{bubbles:true}));
   const during=renders, sameEl=find()===i;
   i.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
   const after=renders, focused=document.activeElement===find(), val=find().value, q=priceFilter.q;
   window.renderPriceBook=orig; setPriceFilter('q','');
   return (during===0&&sameEl&&after>=1&&focused&&val==='포'&&q==='포')?'ok':JSON.stringify({during,sameEl,after,focused,val,q});
 });
 const bad=Object.keys(out).filter(k=>out[k]!=='abcd'&&out[k]!=='칸 없음'&&out[k]!=='ok');
 console.log(JSON.stringify(out,null,1));console.log(bad.length?'실패: '+bad.join(', '):'통과','· 오류',errs.length,JSON.stringify(errs.slice(0,5)));
 await br.close();srv.close();process.exit(bad.length||errs.length?1:0);});
