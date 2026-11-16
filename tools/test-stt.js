// 서버 받아쓰기 /api/stt (2026-11-16 다니엘님 — 아이폰 웹 받아쓰기가 불안정해 녹음을 서버에서 글자로) — Supabase · OpenAI 는 가짜 fetch
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const USERS = [{ email: 'daniel@kingorder.co.kr', name: '정장훈' }, { email: 'lhs@kingorder.co.kr', name: '임희선' }, { email: 'kim@kingorder.co.kr', name: '김영업' }, { email: 'old@kingorder.co.kr', name: '퇴사자', resigned: true }];
let sent = null, oaStatus = 200;
global.fetch = async (url, opt = {}) => {
    const u = new URL(String(url));
    const res = (body, status) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: status || 200, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/auth/v1/user') {
        const tok = String((opt.headers || {}).Authorization || '').replace(/^Bearer\s+/, '');
        return tok === 'good' ? res({ email: 'daniel@kingorder.co.kr' }) : tok === 'stranger' ? res({ email: 'x@y.z' }) : res({}, 401);
    }
    if (u.pathname === '/rest/v1/app_store') return res([{ key: 'gwUsers.v1', value: USERS }]);
    if (u.hostname === 'api.openai.com') {
        const fd = opt.body;
        sent = { auth: (opt.headers || {}).Authorization, model: fd.get('model'), language: fd.get('language'), prompt: fd.get('prompt'), file: fd.get('file') };
        return oaStatus === 200 ? res({ text: '임희선 추가해 줘' }) : res({ error: { message: 'bad' } }, oaStatus);
    }
    return res([], 200);
};
(async () => {
    const { onRequest } = await import('../functions/api/[[route]].js');
    const base = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const audio = new Uint8Array(4000).fill(7);
    const call = async (env, token, body, type) => {
        const h = { 'Content-Type': type || 'audio/mp4' }; if (token) h.Authorization = 'Bearer ' + token;
        const r = await onRequest({ request: new Request('https://gw/api/stt', { method: 'POST', headers: h, body: body === undefined ? audio : body }), env });
        return { status: r.status, j: await r.json() };
    };
    console.log('\n[서버 받아쓰기 /api/stt]');
    ok((await call(base, '')).status === 401, '로그인 없으면 401');
    ok((await call(base, 'stranger')).status === 403, '직원 명단에 없는 계정은 403');
    let r = await call(base, 'good');
    ok(r.status === 503 && r.j.error === 'no-key', `열쇠(OPENAI_API_KEY)가 없으면 503 no-key (${JSON.stringify(r.j)})`);
    const env = Object.assign({ OPENAI_API_KEY: 'sk-test' }, base);
    r = await call(env, 'good');
    ok(r.status === 200 && r.j.ok && r.j.text === '임희선 추가해 줘', `글자로 돌려줌 (${JSON.stringify(r.j)})`);
    ok(sent && sent.auth === 'Bearer sk-test' && sent.model === 'gpt-transcribe' && sent.language === 'ko', `기본 모델 gpt-transcribe · 한국어 (${sent && sent.model})`);
    ok(sent && /임희선/.test(sent.prompt) && /김영업/.test(sent.prompt) && !/퇴사자/.test(sent.prompt), '직원 이름(퇴사자 빼고)을 함께 넘겨 이름을 잘 알아듣게');
    ok(sent && sent.file && sent.file.size === 4000 && /\.m4a$|\.mp4$/.test(sent.file.name), `녹음 파일 그대로 (${sent && sent.file && sent.file.name})`);
    await call(Object.assign({ STT_MODEL: 'gpt-4o-mini-transcribe' }, env), 'good');
    ok(sent.model === 'gpt-4o-mini-transcribe', '모델은 STT_MODEL 로 바꿀 수 있음');
    await call(env, 'good', undefined, 'audio/webm;codecs=opus');
    ok(/\.webm$/.test(sent.file.name), '안드로이드 녹음(webm)도');
    ok((await call(env, 'good', new Uint8Array(0))).status === 400, '빈 녹음은 400');
    ok((await call(env, 'good', new Uint8Array(9 * 1024 * 1024))).status === 413, '너무 긴 녹음(8MB 넘음)은 413');
    oaStatus = 500; r = await call(env, 'good');
    ok(r.status === 502 && !r.j.ok, 'OpenAI 오류는 502');
    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})();
