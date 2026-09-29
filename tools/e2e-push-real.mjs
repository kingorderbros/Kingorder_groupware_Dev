// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-push-real.mjs .   — .dev.vars 의 VAPID 키로 진짜 크롬 구독 → 구글 푸시 서버(FCM) 실제 발송 → 알림이 떴는지
// 진짜 크롬 구독 → 서버 코드(_push.js)로 FCM 에 실제 발송 → 서비스 워커가 알림을 띄웠는지 확인
import http from 'http'; import fs from 'fs'; import path from 'path'; import pp from 'puppeteer-core';
const ROOT=process.argv[2];
const vars=Object.fromEntries(fs.readFileSync(path.join(ROOT,'.dev.vars'),'utf8').split('\n').filter(l=>/^VAPID_/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const P=await import(path.join(ROOT,'functions/api/_push.js'));
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'text/html; charset=utf-8'});r.end(b);});});
await new Promise(r=>srv.listen(8799,r));
const br=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const ctx=br.defaultBrowserContext(); await ctx.overridePermissions('http://localhost:8799',['notifications']);
const pg=await br.newPage(); await pg.goto('http://localhost:8799/sw.js');
const sub=await pg.evaluate(async(key)=>{
  const reg=await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
  const b=atob(key.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((key.length+3)%4));
  try{ const s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(b,c=>c.charCodeAt(0))}); return s.toJSON(); }catch(e){ return {error:String(e)}; }
},vars.VAPID_PUBLIC_KEY);
console.log('구독', sub.error ? sub.error : sub.endpoint.slice(0,60)+'…');
if(!sub.error){
  const q=await P.buildRequest(sub,{title:'[업무접수] 시험 알림',body:'진짜 푸시 서버를 거쳐 왔습니다',tag:'kob-test',url:'/?noti=T'},vars);
  const res=await fetch(q.url,q.init); console.log('푸시 서버 응답',res.status,(await res.text()).slice(0,120));
  let shown=[]; for(let i=0;i<20&&!shown.length;i++){ await new Promise(s=>setTimeout(s,500)); shown=await pg.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;return (await reg.getNotifications()).map(n=>({title:n.title,body:n.body,url:n.data&&n.data.url}));}); }
  console.log('기기에 뜬 알림',JSON.stringify(shown));
}
await br.close(); srv.close();
