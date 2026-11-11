// 사용법: node tools/e2e-calendar-mode.js .   (맥 크롬 헤드리스 · npm run check 에는 넣지 않음)
// 2026-11-12 — 킹오더일정(?mode=calendar): 휴대폰 전용 일정 화면
const http = require('http'), fs = require('fs'), path = require('path'), pp = require('puppeteer-core');
const ROOT = process.argv[2] || '.';
const SHOTS = process.argv[3] || '';
const PORT = 8817;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p === '/config/app-config.js') { r.writeHead(200); return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};"); }
    if (p.startsWith('/api/')) { r.writeHead(404); return r.end('{}'); }
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
});
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const ADMIN = { email: 'daniel@kingorder.co.kr', dept: 'admin', name: '정장훈' };

// 시험 일정 — 오늘 · 내일 (브라우저 안에서 실행)
function seedSchedules() {
    const t = ymd(new Date()); const d2 = new Date(); d2.setDate(d2.getDate() + 1); const t2 = ymd(d2);
    schedules.push({ id: 'e2e-a', title: '팀 주간회의', date: t, startTime: '09:30', endTime: '10:00', calendar: 'team', dept: 'admin', salesperson: '정장훈', createdBy: 'daniel@kingorder.co.kr', attendees: [] });
    schedules.push({ id: 'e2e-b', title: '영업 미팅 — 강남 고객사', date: t, startTime: '10:00', endTime: '11:00', calendar: 'sales-share', dept: 'sales', salesperson: '김영업', createdBy: 'kim@kingorder.co.kr', createdAt: new Date().toISOString(), attendees: [{ name: '정장훈', status: 'pending' }] });
    schedules.push({ id: 'e2e-c', title: '키오스크 설치', date: t2, startTime: '14:00', endTime: '16:00', calendar: 'install-as', dept: 'ops', salesperson: '박설치', createdBy: 'park@kingorder.co.kr', createdAt: new Date().toISOString(), attendees: [] });
    renderCalendar();
}

async function openPage(br, url, w, h) {
    const pg = await br.newPage();
    await pg.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    pg.on('dialog', d => d.accept());
    await pg.goto(url, { waitUntil: 'networkidle0' });
    await pg.waitForFunction(() => document.documentElement.hasAttribute('data-kob-ready'), { timeout: 20000 });
    pg.__errs = errs;
    return pg;
}

srv.listen(PORT, async () => {
    const br = await pp.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
    const base = `http://localhost:${PORT}/`;
    try {
        // ---------- Task 1: 일정 전용 주소 ----------
        console.log('[1] 일정 전용 주소 ?mode=calendar');
        const pg = await openPage(br, base + '?mode=calendar', 390, 844);
        const head = await pg.evaluate(() => ({
            mode: document.documentElement.dataset.mode,
            title: document.title,
            manifest: (document.getElementById('pwa-manifest') || {}).href || '',
            appleTitle: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || '',
            loginVisible: !document.getElementById('login-view').classList.contains('hidden') && getComputedStyle(document.getElementById('login-view')).display !== 'none'
        }));
        ok(head.mode === 'calendar', `data-mode = calendar (얻음 ${head.mode})`);
        ok(head.title.includes('일정'), `창 제목에 '일정' (얻음 ${head.title})`);
        ok(/dev-calendar\.webmanifest$/.test(head.manifest), `manifest = dev-calendar.webmanifest (얻음 ${head.manifest})`);
        ok(head.appleTitle === '[DEV]킹오더일정', `홈 화면 이름 [DEV]킹오더일정 (얻음 ${head.appleTitle})`);
        ok(head.loginVisible, '로그인 전에는 로그인 화면');
        const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/pwa/calendar.webmanifest'), 'utf8'));
        ok(mf.start_url === '/?mode=calendar' && mf.short_name === '킹오더일정', 'calendar.webmanifest start_url · short_name');

        await pg.evaluate(u => enterApp(u), ADMIN);
        await new Promise(r => setTimeout(r, 500));
        const inApp = await pg.evaluate(() => {
            const vis = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
            const secs = Array.from(document.querySelectorAll('.content-section')).filter(s => !s.classList.contains('hidden')).map(s => s.id);
            return {
                cal: vis(document.getElementById('sec-calendar-center')),
                others: secs.filter(id => id !== 'sec-calendar-center'),
                sidebar: vis(document.getElementById('sidebar')),
                header: vis(document.querySelector('#app-view header'))
            };
        });
        ok(inApp.cal, '로그인 뒤 일정캘린더 화면이 보임');
        ok(inApp.others.length === 0, `다른 화면은 모두 숨김 (얻음 ${inApp.others.join(',')})`);
        ok(!inApp.sidebar, '왼쪽 메뉴 숨김');
        ok(!inApp.header, '그룹웨어 머리 줄 숨김');
        // 다른 화면으로 가려 해도 일정 화면에 머무름
        await pg.evaluate(() => { try { navigate('dashboard', null); } catch (e) { } });
        ok(await pg.evaluate(() => !document.getElementById('sec-calendar-center').classList.contains('hidden')), '다른 화면으로 이동해도 일정 화면 유지');

        await pg.evaluate(() => handleLogout());
        await new Promise(r => setTimeout(r, 300));
        const out = await pg.evaluate(() => ({ q: location.search, login: !document.getElementById('login-view').classList.contains('hidden') }));
        ok(/mode=calendar/.test(out.q) && out.login, '로그아웃 후 주소에 mode=calendar 유지 · 로그인 칸 보임');
        ok(pg.__errs.length === 0, '스크립트 오류 없음 ' + pg.__errs.join(' | '));
        await pg.close();

        // ---------- Task 2: 휴대폰 배치 ----------
        for (const W of [360, 390, 430]) {
            console.log(`[2] 휴대폰 배치 ${W}px`);
            const m = await openPage(br, base + '?mode=calendar', W, 800);
            await m.evaluate(u => enterApp(u), ADMIN);
            await m.evaluate(seedSchedules);
            const r = await m.evaluate(() => {
                const inView = el => { const b = el.getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1; };
                const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
                const out = {};
                out.defaultList = currentCalendarView === 'list';
                const cards = Array.from(document.querySelectorAll('#cal-grid [data-sid]'));
                const txt = id => ((cards.find(c => c.dataset.sid === id) || {}).innerText || '');
                out.cards = cards.length;
                out.calNames = txt('e2e-a').includes('팀별') && txt('e2e-b').includes('영업/진행 공유') && txt('e2e-c').includes('설치/AS 공유');
                out.owner = txt('e2e-b').includes('등록 김영업') && txt('e2e-a').includes('등록 정장훈');
                out.bar = vis(document.getElementById('calm-bar')) && inView(document.getElementById('calm-bar'));
                out.top = vis(document.getElementById('calm-top'));
                out.pageNoOverflow = document.documentElement.scrollWidth <= innerWidth + 1;
                setCalendarView('month');
                const g = document.getElementById('cal-grid');
                out.monthNoOverflow = g.scrollWidth <= g.clientWidth + 1 && inView(g);
                setCalendarView('list');
                // 일정 입력창 — 칸이 모두 화면 폭 안에, 저장 단추가 화면 안에
                openScheduleModal();
                const form = document.getElementById('schedule-form');
                const fields = Array.from(form.querySelectorAll('input,select,textarea,button')).filter(vis);
                out.fieldsOut = fields.filter(f => !inView(f)).map(f => f.id || f.name || f.type);
                const save = form.querySelector('button[type="submit"]');
                const sb = save.getBoundingClientRect();
                out.saveInView = vis(save) && sb.bottom <= innerHeight + 1 && sb.top >= 0;
                const panel = document.querySelector('#schedule-modal > div');
                out.full = Math.round(panel.getBoundingClientRect().width) >= innerWidth - 1;
                closeScheduleModal();
                return out;
            });
            ok(r.defaultList, '처음 보기 = 목록');
            ok(r.cards >= 3, `목록에 일정 카드 (얻음 ${r.cards})`);
            ok(r.calNames, '카드마다 캘린더 이름 (팀별 · 영업/진행 공유 · 설치/AS 공유)');
            ok(r.owner, '카드마다 등록한 사람');
            ok(r.top && r.bar, '위 줄 · 아래 줄 보임');
            ok(r.pageNoOverflow, '화면 가로 넘침 없음');
            ok(r.monthNoOverflow, '월 보기 폭 안에');
            ok(r.fieldsOut.length === 0, '입력창 칸 전부 폭 안에 있음 ' + r.fieldsOut.join(','));
            ok(r.saveInView, '저장 단추가 화면 안에');
            ok(r.full, '입력창 전체 화면');
            if (SHOTS) {
                await m.screenshot({ path: `${SHOTS}/list-${W}.png` });
                await m.evaluate(() => setCalendarView('month')); await m.screenshot({ path: `${SHOTS}/month-${W}.png` });
                await m.evaluate(() => { setCalendarView('list'); openScheduleModal(); }); await m.screenshot({ path: `${SHOTS}/new-${W}.png` });
                await m.evaluate(() => { closeScheduleModal(); openScheduleDetailModal('e2e-b'); }); await m.screenshot({ path: `${SHOTS}/detail-${W}.png` });
            }
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
        }

        // ---------- Task 3: 확인 기록 · 새 일정 숫자 ----------
        console.log('[3] 확인한 사람 · 새 일정 숫자');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.removeItem('kobReads.v1'); } catch (e) { } enterApp(u); }, ADMIN);
            await m.evaluate(seedSchedules);
            const badge = (cal) => m.evaluate(c => { const b = document.querySelector(`#calendar-legend [data-cal-new="${c}"]`); return b && !b.classList.contains('hidden') ? b.textContent.trim() : ''; }, cal);
            ok(await badge('sales-share') === '1', '영업/진행 공유 새 일정 숫자 1');
            ok(await badge('install-as') === '1', '설치/AS 공유 새 일정 숫자 1');
            ok(await badge('team') === '', '내가 등록한 팀별 일정은 숫자 없음');
            ok(await m.evaluate(() => !!document.querySelector('#cal-grid [data-sid="e2e-b"] .calm-new')), '목록 카드에 새 일정 표시');
            const saved = await m.evaluate(async () => {
                let n = 0; const orig = kobDb.save; kobDb.save = function (t) { if (t === 'schedules') n++; return orig.apply(this, arguments); };
                openScheduleDetailModal('e2e-b');
                await new Promise(r => setTimeout(r, 300));
                kobDb.save = orig;
                return n;
            });
            ok(saved === 0, '상세를 열어도 kobDb.save(\'schedules\') 가 불리지 않는다');
            const box = await m.evaluate(() => (document.getElementById('detail-schedule-reads') || {}).innerText || '');
            ok(/확인/.test(box) && /정장훈/.test(box), `상세에 확인한 사람 (참석자라 이름이 보임) — ${box.replace(/\n/g, ' ')}`);
            await m.evaluate(() => closeScheduleDetailModal());
            await new Promise(r => setTimeout(r, 200));
            ok(await badge('sales-share') === '', '상세를 열면 그 캘린더 숫자가 줄어듦');
            ok(await m.evaluate(() => !document.querySelector('#cal-grid [data-sid="e2e-b"] .calm-new')), '확인한 카드는 새 일정 표시 없음');
            // 모두 확인
            await m.evaluate(() => calmMarkAllSeen());
            await new Promise(r => setTimeout(r, 200));
            ok(await badge('install-as') === '', '모두 확인 → 숫자 없음');
            // 확인 뒤 남이 시간을 바꾸면 변경됨
            await m.evaluate(() => { const s = schedules.find(x => x.id === 'e2e-c'); s.startTime = '15:00'; s.changedAt = new Date(Date.now() + 1000).toISOString(); s.changedBy = '박설치'; renderCalendar(); });
            ok(await badge('install-as') === '1' && await m.evaluate(() => /변경됨/.test(document.querySelector('#cal-grid [data-sid="e2e-c"]').innerText)), '확인 뒤 남이 바꾸면 변경됨 · 숫자 1');
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
        }

        // ---------- Task 4: 초대 알림 ----------
        console.log('[4] 입력창에서 저장하면 새 참석자에게 초대 알림');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => enterApp(u), ADMIN);
            const r = await m.evaluate(async () => {
                const n0 = collabNotifications.length;
                openScheduleModal();
                document.getElementById('schedule-title').value = '초대 시험';
                toggleScheduleAttendee('김영업', true);
                document.getElementById('schedule-form').requestSubmit();
                await new Promise(r => setTimeout(r, 200));
                const s = schedules.find(x => x.title === '초대 시험');
                const inv = collabNotifications.slice(n0).filter(n => n.type === 'schedule-invite');
                // 다시 열어 저장 — 알림 더 없음
                const cnt0 = schedules.length;
                editSchedule(s.id);
                document.getElementById('schedule-title').value = '초대 시험 (고침)';
                document.getElementById('schedule-form').requestSubmit();
                await new Promise(r => setTimeout(r, 200));
                const inv2 = collabNotifications.slice(n0).filter(n => n.type === 'schedule-invite');
                // 수정에서 박설치를 더하면 박설치에게만
                editSchedule(s.id);
                toggleScheduleAttendee('박설치', true);
                document.getElementById('schedule-form').requestSubmit();
                await new Promise(r => setTimeout(r, 200));
                const inv3 = collabNotifications.slice(n0).filter(n => n.type === 'schedule-invite');
                return { n: inv.length, to: inv[0] && inv[0].toUser, by: s && s.attendees[0].invitedBy, again: inv2.length, edited: s.title === '초대 시험 (고침)' && schedules.length === cnt0,
                         third: inv3.length === 2 && inv3[1].toUser === '박설치', text: inv[0] ? notiText(inv[0]) : '' };
            });
            ok(r.n === 1 && r.to === '김영업', '새 참석자 김영업에게 초대 알림 1건');
            ok(r.by === '정장훈', '참석자 정보에 초대한 사람(invitedBy) 정장훈');
            ok(r.edited, '수정 저장 (새 일정이 생기지 않음)');
            ok(r.again === 1, '수정해서 다시 저장해도 기존 참석자에게 알림이 더 가지 않음');
            ok(r.third, '수정에서 박설치를 더하면 박설치에게만 알림');
            ok(/정장훈<\/b> 님이 .*초대했습니다/.test(r.text), '알림 문구: ○○○ 님이 … 초대했습니다');
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
        }

        console.log('[1] 그룹웨어 기본 주소는 그대로');
        const gw = await openPage(br, base, 1400, 900);
        ok(await gw.evaluate(() => document.documentElement.dataset.mode) === 'groupware', '모드 없음 = groupware');
        await gw.evaluate(u => enterApp(u), ADMIN);
        ok(await gw.evaluate(() => getComputedStyle(document.getElementById('sidebar')).display !== 'none'), '그룹웨어는 왼쪽 메뉴 보임');
        await gw.close();
    } catch (e) {
        fail++; console.log('  ✗ 시험 중 오류', e && e.stack || e);
    } finally {
        await br.close(); srv.close();
        console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
        process.exit(fail ? 1 : 0);
    }
});
