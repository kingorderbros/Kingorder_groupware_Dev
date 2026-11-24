// 사용법: node tools/e2e-supply-fee-mask.js   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-24 — 거래처 관리 가맹점별 수수료(병원·기타 PG '가맹점 수수료' · 약국 '수수료')는 본부장급 이상만, 팀장급 · 매니저급은 *** (표 · 상세 창 · 검색 · 엑셀), 저장해도 원래 값 유지
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 if(p.startsWith('/api/')){r.writeHead(404);return r.end('{}');}
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript'});r.end(b);});});
let pass=0,fail=0;const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x===undefined?'':JSON.stringify(x));}};
srv.listen(8883,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];const pg=await br.newPage();await pg.setViewport({width:1400,height:900});pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:8883/',{waitUntil:'networkidle0'});
 const r=await pg.evaluate(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const U={id:'u1',name:'대표',dept:'admin',groupId:'admin',email:'a@x.kr',level:'admin'};localUsers.push(U);enterApp(U);await sleep(100);
  supplyRecords.push({id:'SP-901',channel:'pg',name:'시험병원',pg:'헥토',fee:2.345,cycle:'D+1'},{id:'SP-902',channel:'pharmacy',name:'시험약국',fee:1.5});
  let lastRows=null;const orig=window.buildXlsxBlob;window.buildXlsxBlob=(rows)=>{lastRows=rows;return new Blob(['x']);};window.downloadBlobAs=()=>{};
  const out={};
  for(const lv of ['admin','rk_ceo','rk_head','rk_gm','rk_leader','rk_part','rk_manager']){
   currentUserLevel=lv;const o={};
   const pf=supplyFields('pg').find(f=>f.id==='fee'),hf=supplyFields('pharmacy').find(f=>f.id==='fee');
   o.pgCell=supplyCellHtml(supplyRecords.find(x=>x.id==='SP-901'),pf);o.phCell=supplyCellHtml(supplyRecords.find(x=>x.id==='SP-902'),hf);
   supplyChannel='pg';supplyFilter={q:'2.345',owner:'',v1:'',v2:''};o.search=supplyFiltered().length;supplyFilter={q:'',owner:'',v1:'',v2:''};
   downloadSupplyXlsx();const row=lastRows.find(x=>x[1]==='시험병원'||x.includes('시험병원'));o.xls=row?row[pf?supplyFields('pg').indexOf(pf):0]:null;
   openSupplyModal('SP-901');const el=document.getElementById('sup-fee');o.input={type:el.type,value:el.value,disabled:el.disabled};
   document.getElementById('sup-cycle').value='D+2';submitSupply({preventDefault(){}});o.after=supplyRecords.find(x=>x.id==='SP-901').fee;o.cycle=supplyRecords.find(x=>x.id==='SP-901').cycle;
   o.can=canSeeMerchantFee();out[lv]=o;}
  return out;});
 for(const [lv,o] of Object.entries(r)){
  const see=['admin','rk_ceo','rk_head','rk_gm'].includes(lv);
  if(see){
   ok(o.can&&o.pgCell.includes('2.345%')&&o.phCell.includes('1.5%'),`${lv} 수수료 보임`,o);
   ok(o.search===1,`${lv} 수수료 값으로 검색됨`,o.search);
   ok(o.xls===2.345,`${lv} 엑셀에 수수료`,o.xls);
   ok(o.input.type==='number'&&o.input.value==='2.345'&&!o.input.disabled,`${lv} 상세 창 수수료 입력 가능`,o.input);
  } else {
   ok(!o.can&&o.pgCell.includes('***')&&!o.pgCell.includes('2.345')&&o.phCell.includes('***')&&!o.phCell.includes('1.5'),`${lv} 표 수수료 ***`,o);
   ok(o.search===0,`${lv} 수수료 값으로 검색 안 됨`,o.search);
   ok(o.xls==='***',`${lv} 엑셀 수수료 ***`,o.xls);
   ok(o.input.value==='***'&&o.input.disabled,`${lv} 상세 창 수수료 *** · 입력 막힘`,o.input);
  }
  ok(o.after===2.345&&o.cycle==='D+2',`${lv} 저장 후 수수료 원래 값 유지 · 다른 칸은 저장`,o);
 }
 ok(errs.length===0,'페이지 오류 없음',errs);console.log(`통과 ${pass} · 실패 ${fail}`);await br.close();srv.close();process.exit(fail?1:0);});
