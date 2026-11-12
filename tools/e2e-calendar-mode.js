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
                // 월 보기에서 일정 제목이 글씨로 보여야 함 (색 막대만 X)
                const chip = Array.from(g.querySelectorAll('[onclick^="event.stopPropagation(); openScheduleDetailModal"]')).find(c => c.getAttribute('onclick').includes('e2e-a'));
                const cs = chip ? getComputedStyle(chip) : null;
                out.monthText = !!chip && parseFloat(cs.fontSize) >= 10 && chip.getBoundingClientRect().height >= 12 && /팀/.test(chip.innerText) && cs.pointerEvents !== 'none';
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
            ok(r.monthText, '월 보기에서 일정 제목이 글씨로 보이고 누를 수 있음');
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

        // ---------- 캘린더 리스트 (11/12 다니엘님 샘플) ----------
        console.log('[L] 캘린더 리스트 — 캘린더별 · New 표시 · 누르면 그 캘린더 일정');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.removeItem('kobReads.v1'); } catch (e) { } enterApp(u); }, ADMIN);
            await m.evaluate(seedSchedules);
            const r = await m.evaluate(() => {
                const out = {};
                const vis = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
                out.dot = vis(document.querySelector('#calm-bar [data-view="callist"] .calm-dot'));
                calmOpenCalList();
                const box = document.getElementById('calm-callist');
                out.shown = vis(box) && !vis(document.getElementById('cal-grid'));
                const items = (tab) => { calmCalListTab(tab); return Array.from(box.querySelectorAll('[data-cal-item]')).map(x => x.dataset.calItem); };
                out.all = items('all').join();
                out.share = items('share').join();
                out.mine = items('mine').join();
                calmCalListTab('all');
                const item = (id) => box.querySelector(`[data-cal-item="${id}"]`);
                out.newSales = /New/.test(item('sales-share').innerText) && /New/.test(item('install-as').innerText) && !/New/.test(item('team').innerText);
                out.names = /킹오더 영업일정 및 진행상황 공유/.test(item('sales-share').innerText) && /설치 및 A\/S 일정 공유/.test(item('install-as').innerText);
                out.members = item('sales-share').querySelectorAll('[data-member]').length > 0;
                out.fits = box.scrollWidth <= innerWidth + 1;
                item('sales-share').click();
                const chips = Array.from(document.querySelectorAll('#cal-grid [onclick^="event.stopPropagation(); openScheduleDetailModal"]')).map(c => c.getAttribute('onclick'));
                out.after = !vis(box) && (document.getElementById('calendar-filter-cal') || {}).value === 'sales-share' && currentCalendarView === 'month'
                    && chips.length === 1 && chips[0].includes('e2e-b');
                out.curName = (document.getElementById('calm-cur-cal') || {}).innerText || '';
                calmShowAll();
                out.backAll = (document.getElementById('calendar-filter-cal') || {}).value === '' && /전체/.test((document.getElementById('calm-cur-cal') || {}).innerText || '');
                return out;
            });
            ok(r.dot, '아래 줄 [리스트] 에 새 일정 빨간 점');
            ok(r.shown, '캘린더 리스트 화면이 열림 (일정 칸은 숨김)');
            ok(r.all === 'sales-share,install-as,company,team,personal,birthday', `전체 탭 = 캘린더 6개 (얻음 ${r.all})`);
            ok(r.share === 'sales-share,install-as,company,birthday', `공유 탭 = 전 직원 공유 캘린더 (얻음 ${r.share})`);
            ok(r.mine === 'team,personal', `내 캘린더 탭 = 개인 · 팀별 (얻음 ${r.mine})`);
            ok(r.names, '캘린더 전체 이름 표시');
            ok(r.newSales, '새 일정이 있는 캘린더만 New');
            ok(r.members, '캘린더를 보는 사람 얼굴(첫 글자) 표시');
            ok(r.fits, '리스트 화면 가로 넘침 없음');
            ok(r.after, '캘린더를 누르면 그 캘린더 일정만 월 보기로');
            ok(/킹오더 영업일정 및 진행상황 공유/.test(r.curName), `위 줄에 고른 캘린더 이름 (얻음 ${r.curName})`);
            ok(r.backAll, '전체 캘린더로 돌아가기');
            if (SHOTS) { await m.evaluate(() => calmOpenCalList()); await m.screenshot({ path: `${SHOTS}/callist-390.png` }); }
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
        }

        // ---------- 설정 › 일정 표시 방법 (11/12 다니엘님) ----------
        console.log('[V] 설정 › 일정 표시 방법 — 월간 · 시간 단위(1일) · 시간 단위(3일) · 리스트 · 주간');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.removeItem('kobCalmView.v1'); } catch (e) { } enterApp(u); }, ADMIN);
            await m.evaluate(seedSchedules);
            const r = await m.evaluate(() => {
                const out = {};
                out.bar = Array.from(document.querySelectorAll('#calm-bar > button')).map(b => b.innerText.trim()).join(',');
                calmOpenSettings();
                const opts = Array.from(document.querySelectorAll('#calm-view-opts input[name="calm-view"]'));
                out.opts = opts.map(o => o.value + ':' + o.closest('label').innerText.trim()).join('|');
                out.checked = (opts.find(o => o.checked) || {}).value;
                opts.find(o => o.value === 'day3').click();
                out.view = currentCalendarView;
                out.saved = localStorage.getItem('kobCalmView.v1');
                out.closed = document.getElementById('calm-settings').classList.contains('hidden');
                const cols = Array.from(document.querySelectorAll('#cal-grid [data-day3]')).map(x => x.dataset.day3);
                const t = new Date(); const d = (k) => { const x = new Date(t); x.setDate(t.getDate() + k); return ymd(x); };
                out.cols = cols.join() === [d(0), d(1), d(2)].join();
                const cell = document.querySelector(`#cal-grid [data-day3-cell="${d(1)}|14"]`);
                out.chip = !!cell && /키오스크/.test(cell.innerText);
                out.fits = document.getElementById('cal-grid').scrollWidth <= innerWidth + 1;
                const tl = document.getElementById('cal-day-timeline'); const nh = new Date().getHours();
                out.scrolled = !!tl && tl.scrollHeight > tl.clientHeight + 10 && (nh < 2 || tl.scrollTop > 0);
                const before = ymd(currentDate); changeDate(1); out.step = ymd(currentDate) === (() => { const x = new Date(before + 'T00:00:00'); x.setDate(x.getDate() + 3); return ymd(x); })(); changeDate(-1);
                // 1일 · 주간 · 월간 · 리스트
                const pick = (v) => { calmOpenSettings(); Array.from(document.querySelectorAll('#calm-view-opts input[name="calm-view"]')).find(o => o.value === v).click(); return currentCalendarView; };
                out.others = ['day', 'week', 'month', 'list'].map(pick).join();
                pick('day3');
                // [일정] 단추는 고른 방법으로
                calmOpenCalList(); document.querySelector('#calm-bar [data-view="sched"]').click(); out.schedBtn = currentCalendarView === 'day3' && !document.getElementById('sec-calendar-center').classList.contains('calm-list-open');
                return out;
            });
            ok(r.bar === '캘린더,일정,,오늘,설정', `아래 줄 = 캘린더 · 일정 · + · 오늘 · 설정 (얻음 ${r.bar})`);
            ok(r.opts === 'month:월간|day:시간 단위(1일)|day3:시간 단위(3일)|list:리스트|week:주간', `표시 방법 5가지 (얻음 ${r.opts})`);
            ok(r.checked === 'list', '처음은 리스트');
            ok(r.view === 'day3' && r.saved === 'day3' && r.closed, '고르면 바로 그 방법으로 · 이 기기에 저장 · 설정 창 닫힘');
            ok(r.cols, '시간 단위(3일) = 오늘부터 3일');
            ok(r.chip, '내일 14시 일정이 내일 칸 14시 줄에');
            ok(r.fits, '3일 보기 가로 넘침 없음');
            ok(r.scrolled, '3일 시간표는 안에서 넘겨 보고, 지금 시각 쪽으로 내려가 있음');
            ok(r.step, '3일 보기에서 다음 = 3일 뒤');
            ok(r.others === 'day,week,month,list', `다른 방법도 고른 대로 (얻음 ${r.others})`);
            ok(r.schedBtn, '[일정] 단추는 고른 방법으로 보여 줌');
            if (SHOTS) { await m.screenshot({ path: `${SHOTS}/day3-390.png` }); }
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
            // 다시 열면 고른 방법으로 시작
            const m2 = await openPage(br, base + '?mode=calendar', 390, 800);
            await m2.evaluate(u => enterApp(u), ADMIN);
            ok(await m2.evaluate(() => currentCalendarView) === 'day3', '다시 열어도 고른 방법(3일)으로 시작');
            await m2.evaluate(() => { try { localStorage.removeItem('kobCalmView.v1'); } catch (e) { } });
            await m2.close();
        }

        // ---------- 설정 › 필터 설정 (11/12 다니엘님 샘플) ----------
        console.log('[F] 필터 설정 — 표시할 캘린더 · 공휴일 · 이름 표시 · 펼칠 때 줄 수');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.removeItem('kobCalmFilter.v1'); localStorage.setItem('kobCalmView.v1', 'list'); } catch (e) { } enterApp(u); }, ADMIN);
            await m.evaluate(seedSchedules);
            const r = await m.evaluate(() => {
                const out = {};
                const vis = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
                calmOpenSettings();
                document.getElementById('calm-open-filter').click();
                const sheet = document.getElementById('calm-filter-sheet');
                out.open = vis(sheet) && /필터 설정/.test(sheet.innerText) && /필터 이름 표시/.test(sheet.innerText) && /표시할 줄 수/.test(sheet.innerText);
                out.listAll = Array.from(sheet.querySelectorAll('[data-filter-row]')).map(x => x.dataset.filterRow).join();
                document.getElementById('calm-filter-pick-btn').click();
                const toggles = Array.from(sheet.querySelectorAll('input[data-filter-cal]'));
                out.toggles = toggles.map(t => t.dataset.filterCal + (t.checked ? '+' : '-')).join();
                toggles.find(t => t.dataset.filterCal === 'install-as').checked = false;
                toggles.find(t => t.dataset.filterCal === 'holiday').checked = false;
                document.getElementById('calm-filter-save').click();
                out.listAfter = Array.from(sheet.querySelectorAll('[data-filter-row]')).map(x => x.dataset.filterRow).join();
                calmCloseFilterSheet();
                const sids = Array.from(document.querySelectorAll('#cal-grid [data-sid]')).map(c => c.dataset.sid).sort().join();
                out.hidden = sids === 'e2e-a,e2e-b';
                out.legend = !document.querySelector('#calendar-legend [onclick="filterCalendarBy(&quot;install-as&quot;)"], #calendar-legend [onclick*="install-as"]');
                out.holidayOff = gwHolidayName('2026-12-25') === '';
                out.saved = JSON.parse(localStorage.getItem('kobCalmFilter.v1') || '{}');
                // 이름 표시 끄기 · 줄 수
                calmOpenFilterSheet();
                const nm = document.getElementById('calm-filter-names'); nm.checked = false; nm.dispatchEvent(new Event('change'));
                const rows = document.getElementById('calm-filter-rows'); rows.value = '3'; rows.dispatchEvent(new Event('change'));
                calmCloseFilterSheet();
                const chip = document.querySelector('#calendar-legend [onclick*="sales-share"]');
                out.noNames = !!chip && !/영업/.test(chip.innerText);
                calmToggleLegend();
                const lg = document.getElementById('calendar-legend');
                out.expanded = lg.classList.contains('calm-legend-open') && getComputedStyle(lg).flexWrap === 'wrap' && parseInt(getComputedStyle(lg).maxHeight) >= 3 * 30;
                return out;
            });
            ok(r.open, '설정 › 필터 설정 창 (필터 이름 표시 · 표시할 줄 수)');
            ok(r.listAll === 'sales-share,install-as,company,team,personal,birthday,holiday', `처음 필터 리스트 = 캘린더 6개 + 공휴일 (얻음 ${r.listAll})`);
            ok(r.toggles === 'sales-share+,install-as+,company+,team+,personal+,birthday+,holiday+', `표시할 필터를 선택 — 처음엔 모두 켜짐 (얻음 ${r.toggles})`);
            ok(r.listAfter === 'sales-share,company,team,personal,birthday', `저장하면 필터 리스트에 켠 것만 (얻음 ${r.listAfter})`);
            ok(r.hidden, '끈 캘린더(설치/AS) 일정은 목록에서 빠짐');
            ok(r.legend, '끈 캘린더는 필터 줄에서도 빠짐');
            ok(r.holidayOff, '공휴일을 끄면 공휴일 표시 없음');
            ok(r.saved && r.saved.show && r.saved.show['install-as'] === false && r.saved.holiday === false, '이 기기에 저장');
            ok(r.noNames, '필터 이름 표시를 끄면 아이콘만');
            ok(r.expanded, '필터 영역을 펼치면 고른 줄 수(3줄)까지');
            if (SHOTS) { await m.evaluate(() => calmOpenFilterSheet()); await m.screenshot({ path: `${SHOTS}/filter-390.png` }); await m.evaluate(() => { document.getElementById('calm-filter-pick-btn').click(); }); await m.screenshot({ path: `${SHOTS}/filter-pick-390.png` }); }
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.evaluate(() => { try { localStorage.removeItem('kobCalmFilter.v1'); } catch (e) { } });
            await m.close();
        }

        // ---------- 위쪽 [필터] = 필터 설정 창 (11/12 다니엘님: 하나로 합치기) ----------
        console.log('[F2] 위쪽 필터 단추 → 필터 설정 · 부서 고르기');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.removeItem('kobCalmFilter.v1'); localStorage.setItem('kobCalmView.v1', 'list'); } catch (e) { } enterApp(u); }, ADMIN);
            await m.evaluate(seedSchedules);
            await m.tap('#calm-filter-btn');
            const r = await m.evaluate(() => {
                const vis = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
                const out = {};
                out.sheet = vis(document.getElementById('calm-filter-sheet'));
                out.headHidden = !vis(document.getElementById('cal-head'));
                out.btnOff = !document.getElementById('calm-filter-btn').classList.contains('calm-filter-on');
                const dept = document.getElementById('calm-filter-dept');
                out.deptOpts = dept ? Array.from(dept.options).map(o => o.value).includes('sales') : false;
                dept.value = 'sales'; dept.dispatchEvent(new Event('change'));
                calmCloseFilterSheet();
                out.applied = (document.getElementById('calendar-filter-dept') || {}).value === 'sales'
                    && Array.from(document.querySelectorAll('#cal-grid [data-sid]')).map(c => c.dataset.sid).join() === 'e2e-b';
                out.btnOn = document.getElementById('calm-filter-btn').classList.contains('calm-filter-on');
                out.saved = (JSON.parse(localStorage.getItem('kobCalmFilter.v1') || '{}')).dept === 'sales';
                return out;
            });
            ok(r.sheet && r.headHidden, '위쪽 [필터] → 필터 설정 창 (예전 고르는 칸은 안 펼침)');
            ok(r.deptOpts, '필터 설정에 부서 고르기');
            ok(r.applied, '부서를 고르면 그 부서 일정만');
            ok(r.btnOff && r.btnOn, '필터가 걸리면 [필터] 단추 강조');
            ok(r.saved, '고른 부서는 이 기기에 저장');
            await m.close();
            const m2 = await openPage(br, base + '?mode=calendar', 390, 800);
            await m2.evaluate(u => enterApp(u), ADMIN);
            ok(await m2.evaluate(() => (document.getElementById('calendar-filter-dept') || {}).value) === 'sales', '다시 열어도 고른 부서 유지');
            await m2.evaluate(() => { try { localStorage.removeItem('kobCalmFilter.v1'); localStorage.removeItem('kobCalmView.v1'); } catch (e) { } });
            await m2.close();
        }

        // ---------- 실험실 › 음성으로 일정 만들기 (11/12 다니엘님) ----------
        console.log('[A] 실험실 — 음성으로 일정 만들기');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.removeItem('kobCalmLab.v1'); } catch (e) { } localUsers.push({ id: 'vu1', name: '김영업', dept: 'sales', level: 'leader', email: 'k@k.co' }); enterApp(u); }, ADMIN);
            const r = await m.evaluate(async () => {
                const vis = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
                const out = {};
                out.offFab = !vis(document.getElementById('calm-voice-fab'));
                calmOpenSettings();
                const sw = document.getElementById('calm-lab-voice');
                out.labText = /실험실/.test(document.getElementById('calm-settings').innerText) && !!sw && !sw.checked;
                sw.checked = true; sw.dispatchEvent(new Event('change'));
                calmCloseSettings();
                out.onFab = vis(document.getElementById('calm-voice-fab'));
                out.saved = (JSON.parse(localStorage.getItem('kobCalmLab.v1') || '{}')).voice === true;
                document.getElementById('calm-voice-fab').click();
                await new Promise(r => setTimeout(r, 100));
                out.sheet = vis(document.getElementById('calm-voice-sheet'));
                const ta = document.getElementById('calm-voice-text');
                ta.value = '내일 오후 3시 강남 고객사 미팅 김영업 초대'; ta.dispatchEvent(new Event('input'));
                document.getElementById('calm-voice-make').click();
                await new Promise(r => setTimeout(r, 200));
                const t = new Date(); t.setDate(t.getDate() + 1);
                out.modal = vis(document.getElementById('schedule-modal')) && !vis(document.getElementById('calm-voice-sheet'));
                out.title = document.getElementById('schedule-title').value;
                out.date = document.getElementById('schedule-date').value === ymd(t);
                out.time = document.getElementById('schedule-start-time').value + '~' + document.getElementById('schedule-end-time').value;
                out.att = scheduleDraftAttendees.map(a => a.name).join();
                out.notSaved = !schedules.some(s => s.title === '강남 고객사 미팅');
                closeScheduleModal();
                // 끄면 단추 사라짐
                calmOpenSettings(); const sw2 = document.getElementById('calm-lab-voice'); sw2.checked = false; sw2.dispatchEvent(new Event('change')); calmCloseSettings();
                out.offAgain = !vis(document.getElementById('calm-voice-fab'));
                return out;
            });
            ok(await m.evaluate(() => { const a = document.getElementById('calm-open-gw'); return a.target === '_blank' && /\/$/.test(a.href) && !/mode=calendar/.test(a.href); }), '설정 [그룹웨어 열기] 는 새 창 (킹오더일정은 그대로 남음)');
            ok(r.offFab, '처음에는 꺼져 있어 🎤 단추 없음');
            ok(r.labText, '설정에 실험실 · 음성으로 일정 만들기 (꺼짐)');
            ok(r.onFab && r.saved, '켜면 🎤 단추 · 이 기기에 저장');
            ok(r.sheet, '🎤 를 누르면 듣기 창');
            ok(r.modal && r.notSaved, '[일정 만들기] → 일정 입력창을 채워 열고, 저장은 하지 않음');
            ok(r.title === '강남 고객사 미팅', `제목 채움 (${r.title})`);
            ok(r.date, '날짜 채움 (내일)');
            ok(r.time === '15:00~16:00', `시간 채움 (${r.time})`);
            ok(r.att === '김영업', `참석자 채움 (${r.att})`);
            ok(r.offAgain, '끄면 🎤 단추 사라짐');
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
        }

        // ---------- 받아쓰기가 멈춰 끝나지 않을 때 (11/12 다니엘님 "멈춰서 안 움직임") ----------
        console.log('[A2] 음성 — 받아쓰기가 끝나지 않으면 멈추지 않고 키보드 받아쓰기로');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.setItem('kobCalmLab.v1', '{"voice":true}'); } catch (e) { } enterApp(u); }, ADMIN);
            const r = await m.evaluate(async () => {
                const vis = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
                const out = {};
                // 아이폰 홈 화면 앱처럼: start() 는 되지만 아무 소식도 오지 않음 (onresult · onend 없음)
                let started = 0, aborted = 0;
                class Hang { start() { started++; } stop() { } abort() { aborted++; } }
                window.SpeechRecognition = Hang; window.webkitSpeechRecognition = Hang;
                window.CALM_VOICE_WAIT_MS = 300;
                document.getElementById('calm-voice-fab').click();
                await new Promise(r => setTimeout(r, 80));
                out.listening = /듣고 있습니다/.test(document.getElementById('calm-voice-status').textContent);
                out.stopBtn = /멈추기/.test(document.getElementById('calm-voice-listen').textContent);
                await new Promise(r => setTimeout(r, 600));
                out.started = started; out.aborted = aborted;
                out.fallback = /키보드/.test(document.getElementById('calm-voice-status').textContent);
                out.noPulse = !document.getElementById('calm-voice-fab').classList.contains('listening');
                out.retryBtn = /다시 듣기/.test(document.getElementById('calm-voice-listen').textContent);
                out.remember = (JSON.parse(localStorage.getItem('kobCalmLab.v1') || '{}')).voiceNative === false;
                // 직접 입력 후 [일정 만들기] 는 그대로 됨
                const ta = document.getElementById('calm-voice-text');
                ta.value = '내일 오후 3시 미팅'; ta.dispatchEvent(new Event('input'));
                document.getElementById('calm-voice-make').click();
                await new Promise(r => setTimeout(r, 200));
                out.modal = vis(document.getElementById('schedule-modal')) && document.getElementById('schedule-title').value === '미팅';
                closeScheduleModal();
                // 다음에 열 때는 바로 키보드 안내 (기다리지 않음) · [다시 듣기] 로 다시 시도 가능
                started = 0;
                document.getElementById('calm-voice-fab').click();
                await new Promise(r => setTimeout(r, 80));
                out.second = started === 0 && /키보드/.test(document.getElementById('calm-voice-status').textContent) && vis(document.getElementById('calm-voice-listen'));
                calmCloseVoice();
                // [멈추기] 를 누르면 바로 멈춤
                const p = calmLabPrefs(); delete p.voiceNative; localStorage.setItem('kobCalmLab.v1', JSON.stringify(p));
                window.CALM_VOICE_WAIT_MS = 60000;
                document.getElementById('calm-voice-fab').click();
                await new Promise(r => setTimeout(r, 80));
                document.getElementById('calm-voice-listen').click();
                await new Promise(r => setTimeout(r, 80));
                out.stopped = !document.getElementById('calm-voice-fab').classList.contains('listening') && !/듣고 있습니다/.test(document.getElementById('calm-voice-status').textContent);
                calmCloseVoice();
                // 정상 받아쓰기: 말이 끝나면 내용이 채워짐
                class Good { start() { setTimeout(() => { this.onresult && this.onresult({ results: [[{ transcript: '모레 오전 10시 교육' }]] }); setTimeout(() => this.onend && this.onend(), 30); }, 50); } stop() { } abort() { } }
                window.SpeechRecognition = Good; window.webkitSpeechRecognition = Good; window.CALM_VOICE_WAIT_MS = 300;
                document.getElementById('calm-voice-fab').click();
                await new Promise(r => setTimeout(r, 500));
                out.good = document.getElementById('calm-voice-text').value === '모레 오전 10시 교육' && /일정 만들기/.test(document.getElementById('calm-voice-status').textContent) && /교육/.test(document.getElementById('calm-voice-preview').textContent);
                out.goodRemember = (JSON.parse(localStorage.getItem('kobCalmLab.v1') || '{}')).voiceNative !== false;
                calmCloseVoice();
                return out;
            });
            ok(r.listening && r.stopBtn, `듣는 동안 '듣고 있습니다' · 단추는 [멈추기] (${JSON.stringify(r)})`);
            ok(r.started === 1 && r.aborted >= 1 && r.fallback && r.noPulse && r.retryBtn, '소식이 없으면 스스로 멈추고 키보드 받아쓰기 안내 · [다시 듣기]');
            ok(r.remember, '이 기기에서 안 되는 것을 기억');
            ok(r.modal, '직접 입력해도 [일정 만들기] 됨');
            ok(r.second, '다음부터는 기다리지 않고 바로 키보드 안내 ([다시 듣기] 로 다시 시도 가능)');
            ok(r.stopped, '[멈추기] 를 누르면 바로 멈춤');
            ok(r.good && r.goodRemember, '정상 받아쓰기는 그대로 채워짐');
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
        }

        // ---------- 음성 안내로 묻고 답하기 (11/12 다니엘님 — 시리처럼) ----------
        console.log('[A3] 음성 안내 — 묻고 답해서 바로 등록');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => {
                try { localStorage.setItem('kobCalmLab.v1', '{"voice":true}'); } catch (e) { }
                localUsers.push({ id: 'vu2', name: '박설치', dept: 'ops', level: 'staff', email: 'p@k.co' });
                enterApp(u);
            }, ADMIN);
            const r = await m.evaluate(async () => {
                const vis = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
                const sleep = ms => new Promise(r => setTimeout(r, ms));
                const out = {};
                window.CALM_TTS_OFF = true;
                calmOpenSettings();
                const sw = document.getElementById('calm-lab-talk');
                out.switch = !!sw && !sw.checked;
                sw.checked = true; sw.dispatchEvent(new Event('change')); calmCloseSettings();
                // 차례대로 대답하는 가짜 받아쓰기
                const answers = ['내일 오후 2시', '청주 매장 키오스크 설치', '네', '박설치랑 홍길동', '아니요', '아니요'];
                class Fake { start() { const a = answers.shift(); setTimeout(() => { if (a == null) return; this.onresult && this.onresult({ results: [[{ transcript: a }]] }); setTimeout(() => this.onend && this.onend(), 20); }, 30); } stop() { } abort() { } }
                window.SpeechRecognition = Fake; window.webkitSpeechRecognition = Fake;
                const before = schedules.length;
                document.getElementById('calm-voice-fab').click();
                await sleep(50);
                out.sheet = vis(document.getElementById('calm-talk-sheet')) && !vis(document.getElementById('calm-voice-sheet'));
                for (let k = 0; k < 200 && schedules.length === before; k++) await sleep(50);
                const log = document.getElementById('calm-talk-log').innerText;
                out.log = Array.from(document.querySelectorAll('#calm-talk-log > div')).map(x => x.textContent);
                const s = schedules[schedules.length - 1];
                const t = new Date(); t.setDate(t.getDate() + 1);
                out.saved = schedules.length === before + 1 && s.title === '청주 매장 키오스크 설치' && s.date === ymd(t) && s.startTime === '14:00';
                out.att = (s.attendees || []).map(a => a.name).join();
                out.cal = s.calendar;
                out.closed = !vis(document.getElementById('calm-talk-sheet')) && !vis(document.getElementById('schedule-modal'));
                out.toast = /일정을 등록했습니다/.test((document.getElementById('calm-toast') || {}).textContent || '');
                // 받아쓰기 없는 기기 — [네] · [아니요] · 입력칸으로
                window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;
                const b2 = schedules.length;
                document.getElementById('calm-voice-fab').click();
                await sleep(400);
                out.hint = /키보드/.test(document.getElementById('calm-talk-hint').textContent);
                const send = async (v) => { document.getElementById('calm-talk-input').value = v; document.getElementById('calm-talk-send').click(); await sleep(40); };
                await send('모레 오전 10시 강남 고객사 미팅');
                document.getElementById('calm-talk-no').click(); await sleep(40);        // 참석자 아니요
                document.getElementById('calm-talk-yes').click(); await sleep(40);       // 세부내용 네
                await send('견적서 챙기기');
                out.confirmQ = /이대로 일정을 등록할까요/.test(document.getElementById('calm-talk-log').innerText);
                document.getElementById('calm-talk-yes').click();
                for (let k = 0; k < 40 && schedules.length === b2; k++) await sleep(50);
                const s2 = schedules[schedules.length - 1];
                out.saved2 = schedules.length === b2 + 1 && s2.title === '강남 고객사 미팅' && s2.startTime === '10:00' && s2.description === '견적서 챙기기';
                // '아니' → 입력창만 열고 저장 안 함 · 취소 → 닫힘
                const b3 = schedules.length;
                document.getElementById('calm-voice-fab').click(); await sleep(40);
                await send('내일 3시 회의'); document.getElementById('calm-talk-no').click(); await sleep(40);
                document.getElementById('calm-talk-yes').click(); await sleep(40); await send('자료 준비');
                document.getElementById('calm-talk-no').click();
                await sleep(600);
                out.edit = vis(document.getElementById('schedule-modal')) && schedules.length === b3 && document.getElementById('schedule-title').value === '회의';
                closeScheduleModal();
                document.getElementById('calm-voice-fab').click(); await sleep(40);
                await send('취소'); await sleep(700);
                out.cancel = !vis(document.getElementById('calm-talk-sheet'));
                return out;
            });
            ok(r.switch, '설정 › 실험실에 음성 안내로 묻고 답하기 (꺼짐)');
            ok(r.sheet, '켜면 🎤 → 묻고 답하기 창');
            ok(r.log.some(x => /어떤 내용으로 일정을 잡을까요/.test(x)), '제목을 안 말하면 → 어떤 내용으로 일정을 잡을까요?');
            ok(r.log.some(x => /참석자를 지정하시겠어요/.test(x)), '참석자를 지정하시겠어요?');
            ok(r.log.some(x => /박설치 님을 참석자로 추가했습니다/.test(x) && /참석자 홍길동을 그룹웨어에서 찾지 못했습니다/.test(x)), '찾으면 바로 추가 · 없으면 그룹웨어에서 찾지 못했습니다');
            ok(r.log.some(x => /바로 이 일정으로 등록하겠습니다/.test(x)), '세부내용 아니요 → 바로 이 일정으로 등록하겠습니다');
            ok(r.saved && r.closed && r.toast, `실제로 등록됨 · 창 닫힘 · 알림 (${JSON.stringify(r.log)})`);
            ok(r.att === '박설치', `참석자 저장 (${r.att})`);
            ok(r.cal === 'install-as', `'설치' → 설치/AS 캘린더 (${r.cal})`);
            ok(r.hint, '받아쓰기가 없는 기기는 [네] · [아니요] · 키보드 🎤 안내');
            ok(r.confirmQ && r.saved2, '세부내용 → 이대로 일정을 등록할까요? → 네 → 등록 (입력 · 단추로)');
            ok(r.edit, '이대로 등록할까요? → 아니요 → 입력창만 열고 저장 안 함');
            ok(r.cancel, "'취소' → 닫힘");
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
        }

        // ---------- 음성 안내 소리 (11/12 다니엘님 "음성으로는 안내가 안 돼?") ----------
        console.log('[A4] 음성 안내 — 소리로 읽기');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.setItem('kobCalmLab.v1', '{"voice":true,"talk":true}'); } catch (e) { } enterApp(u); }, ADMIN);
            const r = await m.evaluate(async () => {
                const sleep = ms => new Promise(r => setTimeout(r, ms));
                const out = {}; const calls = [];
                // 가짜 읽기 — 아이폰처럼: 멈추기(cancel) 바로 뒤에 낸 소리는 버려짐 · 무음이면 시작(onstart)이 안 옴
                let mute = false, lastCancel = -1; const voices = [];  // 아이폰: 처음엔 목소리 목록이 비어 있다가 나중에 Eddy(장난감 목소리)가 맨 앞으로 옴
                const fake = { speaking: false, pending: false, getVoices() { return this._vc++ ? [{ lang: 'ko-KR', name: 'Eddy' }, { lang: 'ko-KR', name: 'Yuna' }] : []; }, _vc: 0, resume() { calls.push('resume'); },
                    cancel() { calls.push('cancel'); lastCancel = calls.length; this.speaking = false; },
                    speak(u) { voices.push(u.voice ? u.voice.name : '기본'); const dropped = lastCancel === calls.length; calls.push('speak:' + u.text.slice(0, 8) + (dropped ? '(버려짐)' : '')); if (dropped || mute) return; this.speaking = true; setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => { this.speaking = false; u.onend && u.onend(); }, 30); }, 10); } };
                Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
                window.SpeechSynthesisUtterance = function (t) { this.text = t; this.voice = null; };
                window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;
                document.getElementById('calm-voice-fab').click();
                out.syncSpeak = calls.some(c => c.startsWith('speak:'));                     // 누른 그 순간 읽기 시작 (아이폰 조건)
                await sleep(100);
                out.notDropped = calls.filter(c => c.startsWith('speak:')).every(c => !c.includes('버려짐'));
                // [네] 를 눌러 다음 질문 — 버려지지 않아야 함
                document.getElementById('calm-talk-input').value = '내일 오후 3시 미팅'; document.getElementById('calm-talk-send').click();
                await sleep(300);
                out.calls = calls.slice();
                out.second = calls.filter(c => c.startsWith('speak:') && !c.includes('버려짐')).length >= 2;
                // 다시 듣기 단추
                const n = calls.length;
                const rb = document.getElementById('calm-talk-replay');
                out.replayBtn = !!rb;
                if (rb) { rb.click(); await sleep(100); }
                out.replay = calls.slice(n).some(c => c.startsWith('speak:참석자') && !c.includes('버려짐'));
                // 무음 — 소리가 시작되지 않으면 안내
                mute = true;
                document.getElementById('calm-talk-no').click();
                await sleep(2600);
                out.muteHint = /무음/.test(document.getElementById('calm-talk-hint').textContent);
                out.voices = voices.slice();
                calmCloseTalk();
                return out;
            });
            ok(r.voices.length >= 3 && r.voices.every(v => v === r.voices[0]) && r.voices[0] !== 'Eddy', `모든 질문을 처음 질문과 같은 목소리로 읽음 (${r.voices.join(',')})`);
            ok(r.syncSpeak, '🎤 를 누른 그 순간 읽기 시작 (아이폰은 누른 때만 소리를 냄)');
            ok(r.notDropped && r.second, `멈추기 바로 뒤에 읽어 버려지는 일 없음 (${JSON.stringify(r.calls)})`);
            ok(r.replayBtn && r.replay, '[🔊 다시 듣기] 로 마지막 질문을 다시 읽음');
            ok(r.muteHint, '소리가 시작되지 않으면 무음 모드 · 음량 안내');
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
        }

        // ---------- 아이폰 증상 (11/12 다니엘님: 잘 듣지 못했다 반복 · 다음 질문 지체 · 안내 없음 · 받아쓰기 됐다 안 됐다) ----------
        console.log('[A5] 음성 안내 — 아이폰 증상');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.setItem('kobCalmLab.v1', '{"voice":true,"talk":true}'); } catch (e) { } enterApp(u); }, ADMIN);
            const r = await m.evaluate(async () => {
                const sleep = ms => new Promise(r => setTimeout(r, ms));
                const out = {}; const ev = [];
                const T0 = Date.now(); const at = () => Date.now() - T0;
                // 가짜 읽기 — 아이폰처럼 '다 읽었다(onend)' 신호를 안 보냄, speaking 만 false 로 바뀜. dropNext 면 소리 시작 안 됨
                let dropNext = 0;
                const fake = { speaking: false, pending: false, getVoices() { return []; }, resume() { }, cancel() { this.speaking = false; },
                    speak(u) { ev.push(['speak', at(), u.text]); if (dropNext > 0) { dropNext--; return; } this.speaking = true; setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => { this.speaking = false; }, 200); }, 20); } };
                Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
                window.SpeechSynthesisUtterance = function (t) { this.text = t; };
                // 가짜 받아쓰기 — 대본: 'fail' = 소리 받기 전에 바로 꺼짐(aborted), 문자열 = 그 말을 함
                let script = [];
                class Fake { start() { ev.push(['rec', at()]); const a = script.shift();
                    setTimeout(() => { if (a === 'fail') { this.onerror && this.onerror({ error: 'aborted' }); this.onend && this.onend(); return; }
                        if (a == null) return; this.onaudiostart && this.onaudiostart(); this.onresult && this.onresult({ results: [[{ transcript: a }]] }); setTimeout(() => this.onend && this.onend(), 20); }, 30); }
                    stop() { } abort() { } }
                window.SpeechRecognition = Fake; window.webkitSpeechRecognition = Fake;
                // (1) 다 읽은 뒤 바로 듣기 — onend 가 없어도 1.5초 안에
                script = [null];
                document.getElementById('calm-voice-fab').click();
                for (let k = 0; k < 120 && !ev.some(e => e[0] === 'rec'); k++) await sleep(50);
                const sp = ev.find(e => e[0] === 'speak'), rc = ev.find(e => e[0] === 'rec');
                out.gap = rc ? rc[1] - sp[1] : 99999;
                calmCloseTalk(); await sleep(100);
                // (2) 받아쓰기가 바로 꺼지면 '잘 듣지 못했습니다' 가 아니라 다시 듣기 → 말한 것 받음
                ev.length = 0; script = ['fail', '내일 오후 3시 미팅'];
                document.getElementById('calm-voice-fab').click();
                for (let k = 0; k < 100 && !/참석자를 지정/.test(document.getElementById('calm-talk-log').innerText); k++) await sleep(50);
                out.log2 = Array.from(document.querySelectorAll('#calm-talk-log > div')).map(x => x.textContent);
                out.retryOk = out.log2.some(x => /참석자를 지정/.test(x)) && !out.log2.some(x => /잘 듣지 못했습니다/.test(x));
                calmCloseTalk(); await sleep(100);
                // (3) 계속 꺼지면 되묻기 반복 없이 안내만
                ev.length = 0; script = ['fail', 'fail', 'fail', 'fail'];
                document.getElementById('calm-voice-fab').click();
                await sleep(3500);
                out.log3 = Array.from(document.querySelectorAll('#calm-talk-log > div')).map(x => x.textContent);
                out.noLoop = !out.log3.some(x => /잘 듣지 못했습니다/.test(x)) && ev.filter(e => e[0] === 'rec').length <= 2;
                out.failHint = /받아쓰기/.test(document.getElementById('calm-talk-hint').textContent) && /🎤/.test(document.getElementById('calm-talk-hint').textContent);
                calmCloseTalk(); await sleep(100);
                // (4) 받아쓰기 뒤 읽기가 버려지면 한 번 다시 읽기
                ev.length = 0; script = ['내일 오후 3시 미팅', null]; dropNext = 0;
                document.getElementById('calm-voice-fab').click();
                for (let k = 0; k < 60 && ev.filter(e => e[0] === 'rec').length < 1; k++) await sleep(50);
                dropNext = 1;
                for (let k = 0; k < 100 && ev.filter(e => e[0] === 'speak' && /참석자/.test(e[2])).length < 2; k++) await sleep(50);
                out.respeak = ev.filter(e => e[0] === 'speak' && /참석자/.test(e[2])).length >= 2;
                // (5) 진단 기록
                const dg = document.getElementById('calm-talk-diag');
                out.diag = !!dg && /읽기/.test(dg.textContent) && /듣기/.test(dg.textContent);
                calmCloseTalk();
                return out;
            });
            ok(r.gap < 1500, `다 읽은 뒤 바로 듣기 (아이폰은 '다 읽음' 신호를 빠뜨림) — ${r.gap}ms`);
            ok(r.retryOk, `받아쓰기가 시작 못 하고 꺼지면 '잘 듣지 못했습니다' 없이 다시 들음 (${JSON.stringify(r.log2)})`);
            ok(r.noLoop && r.failHint, `계속 안 되면 되묻기 반복 없이 🎤 · 입력 안내 (${JSON.stringify(r.log3)})`);
            ok(r.respeak, '받아쓰기 뒤 안내가 소리 나지 않으면 한 번 다시 읽음');
            ok(r.diag, '창 아래 진단 기록(읽기 · 듣기 순서와 시각)');
            ok(m.__errs.length === 0, '스크립트 오류 없음 ' + m.__errs.join(' | '));
            await m.close();
        }

        // ---------- [오늘] = 날짜별 목록을 오늘 위치로 (11/12 다니엘님) ----------
        console.log('[T] 아래 줄 [오늘] → 날짜별 목록 · 오늘');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => { try { localStorage.setItem('kobCalmView.v1', 'day3'); } catch (e) { } enterApp(u); }, ADMIN);
            await m.evaluate(seedSchedules);
            const r = await m.evaluate(async () => {
                const out = {};
                calmSetView('day3');
                changeDate(5);
                document.querySelector('#calm-bar [data-view="today"]').click();
                await new Promise(r => setTimeout(r, 300));
                out.view = currentCalendarView;
                out.today = ymd(currentDate) === ymd(new Date());
                out.cards = document.querySelectorAll('#cal-grid [data-sid]').length >= 2 && !!document.querySelector('#cal-grid [data-today="1"]');
                out.on = document.querySelector('#calm-bar [data-view="today"]').classList.contains('calm-on');
                out.pref = localStorage.getItem('kobCalmView.v1');
                document.querySelector('#calm-bar [data-view="sched"]').click();
                out.back = currentCalendarView === 'day3';
                return out;
            });
            ok(r.view === 'list' && r.today && r.cards, `[오늘] → 날짜별 목록 · 오늘 (${JSON.stringify(r)})`);
            ok(r.on, '[오늘] 단추 켜짐 표시');
            ok(r.pref === 'day3' && r.back, '설정의 표시 방법은 그대로 · [일정] 은 고른 방법으로');
            await m.evaluate(() => { try { localStorage.removeItem('kobCalmView.v1'); } catch (e) { } });
            await m.close();
        }

        // ---------- 위 줄 고정 — 페이지 전체가 시계 뒤로 밀려 올라가지 않게 (11/12 다니엘님) ----------
        console.log('[S] 위 제목 줄 고정 · 아래 내용만 넘김');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 700);
            await m.evaluate(u => { try { localStorage.setItem('kobCalmView.v1', 'list'); } catch (e) { } enterApp(u); }, ADMIN);
            await m.evaluate(() => { const d = new Date(); d.setDate(1); for (let k = 0; k < 25; k++) { const x = new Date(d); x.setDate(1 + k); schedules.push({ id: 'sc-' + k, title: '넘김 시험 ' + k, date: ymd(x), startTime: '10:00', calendar: 'team', dept: 'admin', salesperson: '정장훈', attendees: [] }); } renderCalendar(); });
            const r = await m.evaluate(async () => {
                const ms = document.getElementById('main-scroll');
                const out = {};
                out.docFits = document.documentElement.scrollHeight <= innerHeight + 1 && document.body.scrollHeight <= innerHeight + 1;
                window.scrollTo(0, 500); document.scrollingElement.scrollTop = 500;
                out.docStays = (document.scrollingElement.scrollTop || 0) === 0;
                out.bodyLocked = getComputedStyle(document.body).overflow === 'hidden';
                ms.scrollTop = 400; await new Promise(r => setTimeout(r, 50));
                out.inner = ms.scrollTop > 0;
                const top = document.getElementById('calm-top').getBoundingClientRect();
                out.topFixed = Math.abs(top.top) <= 1 && top.height > 30;
                const bar = document.getElementById('calm-bar').getBoundingClientRect();
                out.barBottom = Math.abs(bar.bottom - innerHeight) <= 1;
                return out;
            });
            ok(r.docFits && r.bodyLocked && r.docStays, `페이지 전체는 움직이지 않음 (${JSON.stringify(r)})`);
            ok(r.inner, '일정 내용 칸만 넘겨짐');
            ok(r.topFixed, '내용을 넘겨도 위 제목 줄은 맨 위에 고정');
            ok(r.barBottom, '아래 줄은 맨 아래에 고정');
            await m.evaluate(() => { try { localStorage.removeItem('kobCalmView.v1'); } catch (e) { } });
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

        // ---------- Task 5: 설정 화면 · 알림에서 일정 열기 ----------
        console.log('[5] 설정 — 캘린더별 새 일정 알림 · 주소의 schedule 로 일정 열기');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => enterApp(u), ADMIN);
            await m.evaluate(() => calmOpenSettings());
            await new Promise(r => setTimeout(r, 300));
            const st = await m.evaluate(() => {
                const box = document.getElementById('calm-noti');
                const t = Array.from(box.querySelectorAll('input[type="checkbox"][data-cal]')).map(x => [x.dataset.cal, x.checked]);
                return { t, text: box.innerText };
            });
            ok(st.t.length === 4 && st.t.map(x => x[0]).join() === 'team,sales-share,install-as,company', `캘린더별 켬/끔 4개 (얻음 ${JSON.stringify(st.t)})`);
            ok(st.t.filter(x => x[1]).map(x => x[0]).join() === 'team', '처음 상태 팀별만 켜짐');
            ok(/홈 화면에 추가한 킹오더일정 아이콘으로 열어야 알림을 받을 수 있습니다/.test(st.text) && /iOS 16\.4/.test(st.text), '아이폰 안내 문구');
            await m.evaluate(() => calmCloseSettings());
            await m.close();
            // 알림을 누르고 들어온 주소
            const m2 = await openPage(br, base + '?mode=calendar&schedule=e2e-z', 390, 800);
            const r2 = await m2.evaluate(async (u) => {
                schedules.push({ id: 'e2e-z', title: '알림으로 연 일정', date: ymd(new Date()), startTime: '11:00', calendar: 'team', dept: 'admin', salesperson: '김영업', attendees: [] });
                enterApp(u);
                await new Promise(r => setTimeout(r, 900));
                return { open: !document.getElementById('schedule-detail-modal').classList.contains('hidden'), title: document.getElementById('detail-schedule-title').innerText, q: location.search };
            }, ADMIN);
            ok(r2.open && r2.title === '알림으로 연 일정', '?mode=calendar&schedule=<id> 로 열면 로그인 뒤 그 일정 상세가 열림');
            ok(r2.q === '?mode=calendar', '주소에서 schedule 은 지우고 mode=calendar 는 남김');
            ok(m2.__errs.length === 0, '스크립트 오류 없음 ' + m2.__errs.join(' | '));
            await m2.close();
        }

        // ---------- 검토 C1: 볼 수 없는 사람에게 알림 · 상세가 가지 않게 ----------
        console.log('[C1] 새 일정 알림 받는 사람 = 그 일정을 볼 수 있는 사람만');
        {
            const m = await openPage(br, base + '?mode=calendar', 390, 800);
            await m.evaluate(u => enterApp(u), ADMIN);
            const r = await m.evaluate(() => {
                calendarLevelScope.manager = 'self'; calendarLevelScope.leader = 'dept';
                localUsers.push({ id: 'tu1', name: '시험매니저', dept: 'sales', level: 'manager', email: 'tu1@k.co', groupId: 'sales' });
                localUsers.push({ id: 'tu2', name: '시험팀장', dept: 'sales', level: 'leader', email: 'tu2@k.co', groupId: 'sales' });
                localUsers.push({ id: 'tu3', name: '시험운영', dept: 'ops', level: 'leader', email: 'tu3@k.co', groupId: 'ops' });
                localUsers.push({ id: 'tu4', name: '시험외주', dept: 'vendor', level: 'manager', email: 'tu4@x.co', groupId: 'vendor' });
                localUsers.push({ id: 'tu5', name: '시험퇴사', dept: 'sales', level: 'leader', email: 'tu5@k.co', groupId: 'sales', resigned: true });
                const team = { id: 'c1-t', title: '팀', date: ymd(new Date()), calendar: 'team', dept: 'sales', salesperson: '정장훈', attendees: [{ name: '시험매니저', status: 'pending' }] };
                const share = { id: 'c1-s', title: '공유', date: ymd(new Date()), calendar: 'sales-share', dept: 'sales', salesperson: '정장훈', attendees: [] };
                const v = (s) => scheduleNewViewers(s).filter(id => /^tu/.test(id)).sort().join();
                return { team: v(team), share: v(share), teamNoInvite: v(Object.assign({}, team, { attendees: [] })) };
            });
            ok(r.teamNoInvite === 'tu2', `팀별: 조회 범위가 '본인만' 인 매니저 · 다른 부서 · 외주 · 퇴사자 제외 (얻음 ${r.teamNoInvite})`);
            ok(r.team === 'tu1,tu2', `팀별: 초대받은 매니저는 볼 수 있으니 포함 (얻음 ${r.team})`);
            ok(r.share === 'tu1,tu2,tu3', `공유: 외주 · 퇴사자만 제외 (얻음 ${r.share})`);
            await m.close();
            // 볼 수 없는 일정 번호로 들어와도 상세가 열리지 않음
            const m2 = await openPage(br, base + '?mode=calendar&schedule=c1-p', 390, 800);
            const r2 = await m2.evaluate(async () => {
                schedules.push({ id: 'c1-p', title: '남의 개인 일정', date: ymd(new Date()), calendar: 'personal', dept: 'sales', salesperson: '다른사람', attendees: [] });
                enterApp({ email: 'staff@kingorder.co.kr', dept: 'sales', name: '시험직원' });
                await new Promise(r => setTimeout(r, 900));
                return !document.getElementById('schedule-detail-modal').classList.contains('hidden');
            });
            ok(!r2, '?schedule=<남의 개인 일정> 으로 들어와도 상세가 열리지 않음');
            await m2.close();
            // 그룹웨어(PC) 주소 /?schedule= 로 들어오면 그룹웨어 일정 화면에서 상세
            const g = await openPage(br, base + '?schedule=c1-g', 1400, 900);
            const r3 = await g.evaluate(async (u) => {
                schedules.push({ id: 'c1-g', title: 'PC에서 연 일정', date: ymd(new Date()), calendar: 'team', dept: 'admin', salesperson: '김영업', attendees: [] });
                enterApp(u);
                await new Promise(r => setTimeout(r, 900));
                return { open: !document.getElementById('schedule-detail-modal').classList.contains('hidden'), mode: document.documentElement.dataset.mode, q: location.search };
            }, ADMIN);
            ok(r3.open && r3.mode === 'groupware' && r3.q === '', '그룹웨어 /?schedule=<id> → 그룹웨어 화면에서 상세 (휴대폰 화면 아님)');
            await g.close();
        }

        console.log('[1] 그룹웨어 기본 주소는 그대로');
        const gw = await openPage(br, base, 1400, 900);
        ok(await gw.evaluate(() => document.documentElement.dataset.mode) === 'groupware', '모드 없음 = groupware');
        await gw.evaluate(u => enterApp(u), ADMIN);
        ok(await gw.evaluate(() => getComputedStyle(document.getElementById('sidebar')).display !== 'none'), '그룹웨어는 왼쪽 메뉴 보임');
        await gw.evaluate(() => navigate('calendar-center', document.getElementById('nav-calendar-center')));
        const link = await gw.evaluate(() => { const a = document.getElementById('calm-open-link'); return a ? { href: a.href, vis: a.getBoundingClientRect().width > 0, target: a.target, text: a.innerText } : null; });
        ok(link && link.vis && /\?mode=calendar$/.test(link.href) && link.target === '_blank' && /킹오더일정/.test(link.text), `일정캘린더에 킹오더일정 링크 (얻음 ${JSON.stringify(link)})`);
        await gw.close();
    } catch (e) {
        fail++; console.log('  ✗ 시험 중 오류', e && e.stack || e);
    } finally {
        await br.close(); srv.close();
        console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
        process.exit(fail ? 1 : 0);
    }
});
