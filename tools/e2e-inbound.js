// 인바운드 관리 화면 (2026-10-08) — 탭 · 수집 · 연결 · 빠른 등록 · 엑셀 가져오기 · 상세 · 권한. 로컬 저장소 모드 헤드리스.
// 사용법: (한 번) npm i --no-save puppeteer-core  →  node tools/e2e-inbound.js [엑셀 경로]   (맥 크롬 · npm run check 에는 넣지 않음)
const http = require('http'), fs = require('fs'), path = require('path'), pp = require('puppeteer-core');
const ROOT = path.join(__dirname, '..');
const XLSX = process.argv[2] || '';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p === '/config/app-config.js') { r.writeHead(200); return r.end("window.KOB_CONFIG={env:'dev',supabaseUrl:'',supabaseAnonKey:'',apiBase:''};"); }
    if (p.startsWith('/api/')) { r.writeHead(404); return r.end('{}'); }
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(b); });
});
srv.listen(8797, async () => {
    const br = await pp.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
    const pg = await br.newPage(); await pg.setViewport({ width: 1400, height: 950 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200))); pg.on('dialog', d => d.accept());
    const ev = (f, ...a) => pg.evaluate(f, ...a);
    const shot = (n) => pg.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', n + '.png'), fullPage: false });
    try {
        await pg.goto('http://localhost:8797/', { waitUntil: 'networkidle0' });
        await ev(() => { localStorage.clear(); });
        await pg.goto('http://localhost:8797/', { waitUntil: 'networkidle0' });
        await ev(() => enterApp({ email: 'admin@company.com', dept: 'admin', name: '관리자' }));
        await ev(() => navigate('inbound-center', document.getElementById('nav-inbound-center')));

        console.log('\n[1] 탭 틀');
        const tabs = await ev(() => [...document.querySelectorAll('#sec-inbound-center button')].filter(b => /^setInboundTab\('\w+'\)$/.test(b.getAttribute('onclick') || '')).map(b => b.innerText.trim()));
        ok(tabs.length === 6, '관리자 — 탭 6개: ' + tabs.join(' / '));
        ok(await ev(() => !!document.getElementById('inbound-tab-body') && /오늘 들어온 문의/.test(document.getElementById('inbound-tab-body').innerText)), '처음은 현황판');
        await shot('inb-1-dash');

        console.log('\n[2] 빠른 등록');
        await ev(() => { setInboundTab('sources'); setInbSrcTab('quick'); });
        await ev(() => { inbQuickDraft.channel = 'blog'; inbQuickDraft.raw = '[비밀댓글] 카페 오픈 준비 중이라 키오스크 렌탈 견적 받고 싶어요. 010-1234-1102 박민수 입니다.'; inbQuickDraft.url = 'https://blog.naver.com/kingorder_b/2236'; inbQuickDraft.post = '키오스크 렌탈 vs 구매'; fillInbQuick(); });
        const q = await ev(() => JSON.parse(JSON.stringify(inbQuickDraft)));
        ok(q.phone === '010-1234-1102' && q.name === '박민수' && q.services.includes('키오스크'), '원문에서 연락처 · 이름 · 서비스 채움');
        await shot('inb-2-quick');
        await ev(() => saveInbQuick());
        let r0 = await ev(() => inboundRecords[0]);
        ok(r0 && r0.channel === 'blog' && r0.routes[0] === '블로그' && r0.kob.dept === '영업' && r0.source.post === '키오스크 렌탈 vs 구매' && /^IN-\d{4}$/.test(r0.id), '등록 — 블로그 · 영업본부 · 출처 글 · 번호');
        await ev(() => { inbQuickDraft.channel = 'phone'; inbQuickDraft.raw = '기존 매장, 키오스크 영수증 프린터 고장 010-1234-1102'; fillInbQuick(); saveInbQuick(); });
        r0 = await ev(() => inboundRecords[0]);
        ok(r0.kob.dept === '영업' && r0.dupOf && r0.flags.some(f => f.startsWith('재문의')), '같은 연락처 재문의 → 이전 건 본부 · 재문의 표시');
        await ev(() => { inbQuickDraft.channel = 'kakao'; inbQuickDraft.raw = '메뉴 가격 바꾸는 방법 알려주세요 010-9999-8888'; fillInbQuick(); saveInbQuick(); });
        r0 = await ev(() => inboundRecords[0]);
        ok(r0.kob.dept === '운영', '운영 낱말(메뉴 가격) → 운영본부');

        console.log('\n[3] 알림 메일 붙여넣기');
        await ev(() => setInbSrcTab('mail'));
        await ev(() => parseInbMailPaste());
        const mi = await ev(() => inbSrcResult.mail.items[0].record);
        ok(mi.name === '신○○' && mi.phone === '010-5063-0889' && mi.services[0] === '키오스크' && mi.inAt === '2026-09-30 14:35' && mi.flags.includes('문의내용 없음'), '이미지 샘플 모양 그대로 해석');
        await shot('inb-3-mail');
        await ev(() => registerInbPicked('mail'));
        ok(await ev(() => inboundRecords[0].channel === 'mail'), '미리보기에서 골라 등록');
        ok(await ev(() => /로컬 저장소 모드/.test(document.getElementById('inbound-tab-body').innerText)), '서버 없는 모드 안내');

        console.log('\n[4] 엑셀 가져오기');
        if (XLSX && fs.existsSync(XLSX)) {
            await ev(() => setInbSrcTab('sheet'));
            const input = await pg.$('#inbound-tab-body input[type=file]');
            await input.uploadFile(XLSX);
            await pg.waitForFunction(() => inbSrcResult.sheet && !inbSrcResult.sheet.loading, { timeout: 20000 });
            const sum = await ev(() => inbSrcResult.sheet.error || inbSrcResult.sheet.summary.map(x => x[0] + ' ' + x[1]).join(' · '));
            console.log('     ', sum);
            const n = await ev(() => inbSrcResult.sheet.items ? inbSrcResult.sheet.items.length : 0);
            ok(n >= 250, '실데이터 행 읽음 (' + n + ')');
            const s0 = await ev(() => { const it = inbSrcResult.sheet.items.find(x => x.record.company === '세이치라멘'); return it && it.record; });
            const a0 = await ev(() => { const it = inbSrcResult.sheet.items.find(x => x.record.company === '공연기획사 ODO'); return it && it.record; });
            ok(a0 && a0.name === '' && a0.phone === '010-4758-2985' && a0.bizNo === '', '빈 칸(<c …/>) 뒤 칸이 밀리지 않음 — readXlsxRows');
            ok(s0 && s0.inDate === '2025-08-01' && s0.kob.result === '실패' && s0.kob.failReason === '기타' && s0.services[0] === '키오스크' && s0.routes[0] === '블로그', '칸 대응 — 날짜 숫자 · 결과 · 실패사유 · 서비스 · 경로');
            await shot('inb-4-excel');
            await ev(() => registerInbPicked('sheet'));
            const total = await ev(() => inboundRecords.length);
            ok(total >= 254, '이관 후 ' + total + '건');
            await ev(() => { const f = document.querySelector('#inbound-tab-body input[type=file]'); });
            // 같은 파일 다시 — 모두 '이미 있음'
            const input2 = await pg.$('#inbound-tab-body input[type=file]');
            await input2.uploadFile(XLSX);
            await pg.waitForFunction(() => inbSrcResult.sheet && !inbSrcResult.sheet.loading, { timeout: 20000 });
            ok(await ev(() => inbSrcPicked.sheet.size === 0), '같은 파일을 다시 올리면 새로 고를 것이 없음');
        } else console.log('  (엑셀 경로가 없어 건너뜀)');

        console.log('\n[5] 화면들');
        for (const t of ['dash', 'list', 'board', 'analysis', 'rules']) { await ev(t2 => setInboundTab(t2), t); await shot('inb-5-' + t); }
        ok(await ev(() => { setInboundTab('list'); return document.querySelectorAll('#inbound-rows tr').length > 3; }), '인입 목록 줄');
        ok(await ev(() => /수집 채널/.test(document.getElementById('inbound-head').innerText) && /본부/.test(document.getElementById('inbound-head').innerText)), '목록에 수집 채널 · 본부 칸');
        await ev(() => inboundQuick('check'));
        const chk = await ev(() => ({ rows: document.querySelectorAll('#inbound-rows tr').length, want: inboundLive().filter(inboundNeedsCheck).length, got: inboundFiltered().length }));
        ok(chk.want >= 2 && chk.got === chk.want && chk.rows === chk.want, '확인 필요 칩으로 거르기 ' + JSON.stringify(chk));
        await ev(() => { inboundFilter.quick = ''; renderInboundCenter(); });
        const id = await ev(() => inboundRecords.find(r => r.channel === 'blog').id);
        await ev(i => openInboundModal(i), id);
        ok(await ev(() => !document.getElementById('inbound-origin-wrap').classList.contains('hidden') && /키오스크 렌탈 vs 구매/.test(document.getElementById('inbound-origin-body').innerText)), '상세 — 원문 · 유입 정보');
        ok(await ev(() => !!document.getElementById('inb-kob-dept')), '상세 — 본부 고르기');
        await shot('inb-6-modal');
        await ev(() => { document.getElementById('inb-kob-dept').value = '운영'; setInboundKobField('dept', '운영'); setInboundKobField('contactAt', ymd(new Date())); saveInbound(); });
        ok(await ev(i => inboundRecords.find(r => r.id === i).kob.dept === '운영', id), '본부 바꿔 저장');
        await ev(i => { openInboundModal(i); toggleInboundSpam(); }, id);
        ok(await ev(i => inboundRecords.find(r => r.id === i).spam === true && !inboundFiltered().some(r => r.id === i), id), '스팸으로 옮기면 목록에서 빠짐');
        await ev(() => { setInboundTab('board'); inboundBoardDept = '운영'; renderInboundCenter(); });
        ok(await ev(() => /운영본부/.test(document.getElementById('inbound-tab-body').innerText)), '본부 보드 전환');
        await ev(() => { setInboundTab('sources'); });
        for (const t of ['naver', 'blog', 'insta', 'auto', 'form']) { await ev(t2 => setInbSrcTab(t2), t); await shot('inb-7-src-' + t); }
        ok(await ev(() => document.querySelectorAll('#inbound-tab-body button[disabled]').length > 0), '서버가 필요한 버튼은 로컬 모드에서 꺼짐');

        console.log('\n[6] 영업 그룹 계정');
        await ev(() => { localUsers.push({ id: 'u9', name: '이영업', dept: 'sales', email: 'sales@company.com', groupId: 'sales', level: 'manager' }); enterApp({ email: 'sales@company.com', dept: 'sales', groupId: 'sales', name: '이영업' }); navigate('inbound-center', document.getElementById('nav-inbound-center')); });
        const st = await ev(() => [...document.querySelectorAll('#sec-inbound-center button')].filter(b => /^setInboundTab\('\w+'\)$/.test(b.getAttribute('onclick') || '')).map(b => b.innerText.trim()));
        ok(st.length === 5 && !st.some(t => /수집/.test(t)), '영업 — 수집 · 연결 탭 없음 (' + st.join(' / ') + ')');
        await ev(() => setInboundTab('rules'));
        ok(await ev(() => /보기만 됩니다/.test(document.getElementById('inbound-tab-body').innerText)), '규칙은 보기만');

        console.log('\n[7] 다른 화면 회귀');
        await ev(() => enterApp({ email: 'admin@company.com', dept: 'admin', name: '관리자' }));
        const ids = await ev(() => [...document.querySelectorAll('[id^="nav-"]')].map(a => a.id.slice(4)).filter(Boolean));
        for (const i of ids) await ev(x => { try { navigate(x, document.getElementById('nav-' + x)); } catch (e) { throw new Error(x + ': ' + e.message); } }, i).catch(e => errs.push(String(e).slice(0, 160)));
        ok(true, '메뉴 ' + ids.length + '개 열어 봄');
    } catch (e) { errs.push('테스트 중단: ' + e.message); }
    ok(errs.length === 0, '페이지 오류 0 ' + JSON.stringify(errs.slice(0, 5)));
    console.log(`\n인바운드 화면: ${pass} 통과 · ${fail} 실패`);
    await br.close(); srv.close(); process.exit(fail ? 1 : 0);
});
