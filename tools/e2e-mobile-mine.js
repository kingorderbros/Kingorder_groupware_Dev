// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-mobile-mine.js . <스크린샷 폴더>   — 운행일지 '내 운행일지' (서버에서 · 새로고침해도 남음)
const http=require('http'),fs=require('fs'),path=require('path'),pp=require('puppeteer-core');const ROOT=process.argv[2],OUT=process.argv[3];
const now=new Date();const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
const logs=[{id:'VL-0001',date:ym+'-02',vehicle:'1호차',driver:'김운전',from:'본사',to:'판교',startKm:11900,endKm:12000,fuel:15000,status:'완료'},
 {id:'VL-0002',date:'2026-08-20',vehicle:'1호차',driver:'김운전',from:'본사',to:'수원',startKm:11000,endKm:11100,status:'완료'},
 {id:'VL-0003',date:ym+'-03',vehicle:'2호차',driver:'박남',from:'본사',to:'인천',startKm:500,endKm:600,status:'완료'}];
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';if(p==='/config/app-config.js'){r.writeHead(200);return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};");}
 const J=(o,s)=>{r.writeHead(s||200,{'content-type':'application/json'});r.end(JSON.stringify(o));};
 if(p==='/api/vehicle-logs'&&q.method==='POST'){const ch=[];q.on('data',c=>ch.push(c));q.on('end',()=>{const b=JSON.parse(Buffer.concat(ch));const log=Object.assign({id:'VL-000'+(logs.length+1),status:Number(b.endKm)>0?'완료':'진행중'},b);logs.push(log);J({ok:true,log},201);});return;}
 if(p==='/api/vehicle-logs'){let l=logs.slice();const st=u.searchParams.get('status'),dr=u.searchParams.get('driver');if(st)l=l.filter(x=>x.status===st);if(dr)l=l.filter(x=>x.driver===dr);return J({logs:l});}
 if(p==='/api/drivers')return J({drivers:['김운전','박남']});
 if(p==='/api/vehicles')return J({vehicles:[{id:'CAR-1',plate:'1가1',model:'1호차',status:'운행가능'}]});
 if(p.startsWith('/api/'))return J({reservations:[],logs:[]});
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream'});r.end(b);});});
const out=[];const ok=(c,m)=>out.push((c?'  ✓ ':'  ✗ ')+m);
const enter=async(pg)=>{await pg.goto('http://localhost:8816/?mode=mobile',{waitUntil:'networkidle0'});await new Promise(s=>setTimeout(s,600));await pg.select('#m-driver-select','김운전').catch(()=>{});await pg.evaluate(()=>mobileEnterForm());await new Promise(s=>setTimeout(s,1200));};
const list=(pg)=>pg.evaluate(()=>({txt:document.getElementById('m-recent-list').innerText.replace(/\s+/g,' '),sum:document.getElementById('m-mine-summary').innerText.replace(/\s+/g,' '),month:document.getElementById('m-mine-month').value}));
srv.listen(8816,async()=>{const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
 const errs=[];let pg=await br.newPage();await pg.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});pg.on('pageerror',e=>errs.push(String(e)));
 await enter(pg);
 let r=await list(pg);
 ok(/판교/.test(r.txt)&&!/인천/.test(r.txt)&&!/수원/.test(r.txt)&&r.month===new Date().toISOString().slice(0,7),'들어오면 이번 달 내 운행일지 (남의 것 · 다른 달은 빼고) '+JSON.stringify(r));
 // 새로 제출
 await pg.evaluate(()=>{const s=(id,v)=>{const e=document.getElementById(id);if(e){e.value=v;e.dispatchEvent(new Event('input'));}};s('m-from','본사');s('m-to','강남');s('m-start-km','12000');s('m-end-km','12050');s('m-fuel','9000');const v=document.getElementById('m-vehicle');v.innerHTML='<option value="1호차">1호차</option>';v.value='1호차';});
 await pg.evaluate(()=>submitMobileLog({preventDefault(){}}));
 await new Promise(s=>setTimeout(s,1500));
 r=await list(pg);
 ok(/강남/.test(r.txt)&&/완료/.test(r.txt),'제출하면 바로 내 운행일지에 나온다 '+r.txt.slice(0,120));
 ok(/2건/.test(r.sum)&&/150km/.test(r.sum),'이번 달 합계 (2건 · 150km) '+r.sum);
 await pg.screenshot({path:OUT+'/m_mine.png',fullPage:false});
 // 다시 열기
 await pg.close();pg=await br.newPage();await pg.setViewport({width:390,height:844,isMobile:true,hasTouch:true});pg.on('pageerror',e=>errs.push(String(e)));
 await enter(pg);r=await list(pg);
 ok(/강남/.test(r.txt)&&/판교/.test(r.txt),'새로 열어도(새로고침) 그대로 보인다');
 await pg.evaluate(()=>{const s=document.getElementById('m-mine-month');s.value='all';renderMobileMine();});r=await list(pg);
 ok(/수원/.test(r.txt)&&/3건/.test(r.sum),'전체를 고르면 지난 달 것도 '+r.sum);
 await pg.evaluate(()=>{document.getElementById('m-recent-list').scrollIntoView();});await pg.screenshot({path:OUT+'/m_mine2.png'});
 console.log(out.join('\n'));console.log('errors',JSON.stringify(errs.slice(0,5)));await br.close();srv.close();});
