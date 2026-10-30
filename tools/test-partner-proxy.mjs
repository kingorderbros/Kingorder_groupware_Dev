// 사용법: node tools/test-partner-proxy.mjs   (npm run check 에는 넣지 않음)
// 2026-10-30 대리 접수 — 직원 열쇠(2시간) · 아이디 없이 업체로 들어가기 · 접수에 대리 접수 직원 이름은 서버가 적음(화면 값 무시)
import * as pc from '../functions/api/_partner.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const secret = 'test-secret';
const now = Date.parse('2026-10-30T10:00:00Z');
const tok = await pc.makeToken(secret, pc.PROXY_LOGIN_PREFIX + 'kim@k.co', 'c100', now, { proxy: { by: 'kim@k.co', name: '김영업' } });
const t = await pc.readToken(secret, tok, now + 60000);
ok(t && t.proxyBy === 'kim@k.co' && t.proxyName === '김영업' && t.partnerId === 'c100', '열쇠에 직원 이메일 · 이름 · 업체가 담김');
ok((await pc.readToken(secret, tok, now + (pc.PROXY_TTL_SEC + 60) * 1000)) === null, '2시간이 지나면 열쇠를 쓸 수 없음');
const normal = await pc.readToken(secret, await pc.makeToken(secret, 'p1', 'c100', now), now + 86400000);
ok(normal && !normal.proxyBy, '일반 파트너 열쇠는 그대로 (7일 · 대리 표시 없음)');
const io = { companies: async (ids) => ids.includes('c100') ? [{ id: 'c100', name: '시험파트너', kind: 'partner' }] : [], children: async () => [] };
const rp = await pc.resolveProxy(io, t);
ok(rp && !rp.missing && rp.me.partnerId === 'c100' && rp.me.partnerName === '시험파트너' && rp.me.proxyName === '김영업', '아이디 없이 업체로 들어감');
ok((await pc.resolveProxy(io, Object.assign({}, t, { partnerId: 'nope' }))).missing === true, '없는 업체면 들어가지 못함');
const r = pc.applyPartnerWrite('gwPartnerIntakes.v1', [], [{ id: 'PI-1', dept: 'sales', type: 'newshop', title: 't', history: [], proxyBy: '가짜' }], [], rp.me);
const x = (r.list || []).find(v => v.id === 'PI-1') || (r.list || [])[0];
ok(x && x.proxyBy === '김영업' && x.proxyByEmail === 'kim@k.co' && x.partnerId === 'c100', '접수에 대리 접수 직원을 서버가 적음 (화면이 보낸 값 무시)');
const r2 = pc.applyPartnerWrite('gwPartnerIntakes.v1', [], [{ id: 'PI-2', dept: 'sales', type: 'newshop', title: 't', history: [], proxyBy: '가짜' }], [],
                                { loginId: 'p1', partnerId: 'c100', partnerName: '시험파트너' });
const y = (r2.list || [])[0];
ok(y && !y.proxyBy, '일반 파트너는 대리 접수 표시를 붙일 수 없음');
console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
process.exit(fail ? 1 : 0);
