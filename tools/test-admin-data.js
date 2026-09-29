// 관리자 자료 고치기 · 지우기 — 서버 쪽 법인차량 예약 · 운행일지 (2026-09-28). Supabase 는 가짜 fetch 로 대신합니다.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const store = {
    'gwUsers.v1': [
        { email: 'admin@k.co', name: '관리', groupId: 'admin' },
        { email: 'sub@k.co', name: '겸직', groupId: 'sales', isAdmin: true },
        { email: 'data@k.co', name: '자료', groupId: 'dataGroup' },
        { email: 'car@k.co', name: '차량', groupId: 'mgmtGroup' },
        { email: 'staff@k.co', name: '직원', groupId: 'sales' },
        { email: 'other@k.co', name: '다른직원', groupId: 'sales' }
    ],
    'gwVehicles.v1': [{ id: 'CAR-1', plate: '1가1', model: '차', status: '운행가능' }],
    'gwPermissionGroups.v2': { version: 2, groups: [
        { id: 'dataGroup', permissions: ['data-admin'] },
        { id: 'mgmtGroup', permissions: ['management-vehicle-reserve', 'management-vehicle'] },
        { id: 'sales', permissions: ['sales'] }
    ] }
};
const tables = {
    vehicle_reservations: new Map([['VR-0001', { vehicle: '1호', applicant: '직원', status: '승인완료' }]]),
    vehicle_logs: new Map([['VL-0001', { driver: '직원', startKm: 10, endKm: 20 }]])
};
let whoEmail = '';
global.fetch = async (url, opt = {}) => {
    const u = new URL(String(url)), m = opt.method || 'GET';
    const res = (body, status) => new Response(body === undefined ? null : JSON.stringify(body), { status: status || 200 });
    if (u.pathname === '/auth/v1/user') return whoEmail ? res({ email: whoEmail }) : res({}, 401);
    const t = u.pathname.replace('/rest/v1/', '');
    if (t === 'app_store') {
        const k = u.searchParams.get('key') || '';
        const keys = k.startsWith('in.(') ? k.slice(4, -1).split(',').map(x => x.replace(/"/g, '')) : [k.replace(/^eq\./, '')];
        return res(keys.filter(x => x in store).map(x => ({ key: x, value: store[x] })));
    }
    if (tables[t]) {
        if (m === 'GET') return res(Array.from(tables[t].entries()).map(([id, data]) => ({ id, data })));
        if (m === 'POST') { JSON.parse(opt.body).forEach(r => tables[t].set(r.id, r.data)); return res(undefined, 201); }
        if (m === 'DELETE') { tables[t].delete(decodeURIComponent(u.searchParams.get('id')).replace(/^eq\./, '')); return res(undefined, 204); }
    }
    return res([], 200);
};

(async () => {
    const { onRequest } = await import('../functions/api/[[route]].js');
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    let last = null;
    const call = async (who, method, path, body) => {
        whoEmail = who;
        const r = await onRequest({ request: new Request('https://gw' + path, { method, headers: who ? { Authorization: 'Bearer t' } : {}, body: method === 'GET' ? undefined : JSON.stringify(body) }), env });
        last = await r.json().catch(() => null);
        return r.status;
    };

    console.log('\n[1] 예약 고치기');
    ok(await call('', 'PATCH', '/api/reservations', { id: 'VR-0001', patch: { destination: 'x' } }) === 401, '로그인 없으면 401');
    ok(await call('staff@k.co', 'PATCH', '/api/reservations', { id: 'VR-0001', patch: { destination: 'x' } }) === 403, '일반 직원은 403');
    ok(await call('car@k.co', 'PATCH', '/api/reservations', { id: 'VR-0001', patch: { destination: '부산' } }) === 200
        && tables.vehicle_reservations.get('VR-0001').destination === '부산', '예약관리 권한 그룹은 고칠 수 있다 · 서버에 저장된다');
    ok(tables.vehicle_reservations.get('VR-0001').applicant === '직원', '안 보낸 항목은 그대로');
    ok(await call('sub@k.co', 'PATCH', '/api/reservations', { id: 'VR-0001', patch: { status: '반납완료' } }) === 200, '겸직 관리자도 된다');
    ok(await call('admin@k.co', 'PATCH', '/api/reservations', { id: 'NONE', patch: {} }) === 400, '없는 예약은 400');

    console.log('\n[2] 지우기는 관리자 · 전체 자료 권한만');
    ok(await call('car@k.co', 'DELETE', '/api/reservations', { id: 'VR-0001' }) === 403, '예약관리 권한만으로는 못 지운다');
    ok(await call('data@k.co', 'DELETE', '/api/reservations', { id: 'VR-0001' }) === 200 && !tables.vehicle_reservations.has('VR-0001'), '전체 자료 권한 그룹은 지운다');
    ok(await call('car@k.co', 'PATCH', '/api/vehicle-logs', { id: 'VL-0001', patch: { endKm: 25 } }) === 200 && tables.vehicle_logs.get('VL-0001').endKm === 25, '운행내역 권한 그룹은 운행일지를 고친다');
    ok(await call('staff@k.co', 'DELETE', '/api/vehicle-logs', { id: 'VL-0001' }) === 403, '일반 직원은 운행일지를 못 지운다');
    ok(await call('admin@k.co', 'DELETE', '/api/vehicle-logs', { id: 'VL-0001' }) === 200 && !tables.vehicle_logs.has('VL-0001'), '관리자는 운행일지를 지운다');

    console.log('\n[3] 예약 수정도 겹침 확인 (2026-09-28 검토)');
    tables.vehicle_reservations.set('VR-0010', { vehicle: '2호', applicant: 'A', status: '승인완료', start: '2026-10-01T09:00', end: '2026-10-01T12:00' });
    tables.vehicle_reservations.set('VR-0011', { vehicle: '2호', applicant: 'B', status: '승인완료', start: '2026-10-01T13:00', end: '2026-10-01T15:00' });
    ok(await call('admin@k.co', 'PATCH', '/api/reservations', { id: 'VR-0011', patch: { start: '2026-10-01T11:00' } }) === 400, '다른 예약과 겹치게 고치면 400');
    ok(await call('admin@k.co', 'PATCH', '/api/reservations', { id: 'VR-0011', patch: { start: '2026-10-01T12:30' } }) === 200, '겹치지 않게 고치면 저장 (자기 자신과는 견주지 않음)');
    ok(await call('admin@k.co', 'PATCH', '/api/reservations', { id: 'VR-0011', patch: { end: '2026-10-01T10:00' } }) === 400, '종료가 시작보다 앞이면 400');

    console.log('\n[4] 운행일지 · 예약 — 로그인한 직원만 · 운전자는 본인 (2026-09-28 · 4단계)');
    ok(await call('', 'GET', '/api/vehicles') === 401, '로그인 없이 차량 목록 401');
    ok(await call('', 'POST', '/api/vehicle-logs', { date: '2026-10-01', vehicle: '1가1', driver: '누구', from: 'a', to: 'b' }) === 401, '로그인 없이 운행일지 등록 401');
    ok(await call('nobody@x.co', 'GET', '/api/vehicles') === 403, '직원 목록에 없는 계정 403');
    ok(await call('staff@k.co', 'GET', '/api/vehicles') === 200 && last.vehicles.length === 1, '직원은 차량 목록을 본다');
    ok(await call('staff@k.co', 'POST', '/api/reservations', { vehicle: '1가1', applicant: '다른직원', start: '2026-11-01T09:00', end: '2026-11-01T10:00' }) === 201
        && last.reservation.applicant === '직원', '예약 신청자는 로그인한 본인으로 적힌다(다른 이름으로 못 넣음)');
    const rid = last.reservation.id;
    ok(await call('staff@k.co', 'POST', '/api/reservations/action', { id: rid, action: 'approve' }) === 403, '일반 직원은 승인 못 함');
    ok(await call('car@k.co', 'POST', '/api/reservations/action', { id: rid, action: 'approve' }) === 200, '차량 담당은 승인');
    ok(await call('other@k.co', 'POST', '/api/reservations/action', { id: rid, action: 'cancel' }) === 403, '남의 예약은 취소 못 함');
    ok(await call('staff@k.co', 'POST', '/api/reservations/action', { id: rid, action: 'return-request', startKm: 1, endKm: 5 }) === 200, '본인 예약은 반납 요청');
    ok(await call('staff@k.co', 'POST', '/api/vehicle-logs', { date: '2026-10-01', vehicle: '1가1', driver: '다른직원', from: 'a', to: 'b', startKm: 1 }) === 201
        && last.log.driver === '직원', '운행일지 운전자도 본인으로 적힌다');
    const lid = last.log.id;
    ok(await call('other@k.co', 'POST', '/api/vehicle-logs/complete', { id: lid, endKm: 9 }) === 403, '남의 운행일지는 못 마침');
    ok(await call('staff@k.co', 'POST', '/api/vehicle-logs/complete', { id: lid, endKm: 9 }) === 200, '본인 운행일지는 마침');
    ok(await call('car@k.co', 'POST', '/api/vehicle-logs', { date: '2026-10-01', vehicle: '1가1', driver: '다른직원', from: 'a', to: 'b', startKm: 1 }) === 201
        && last.log.driver === '다른직원', '차량 담당은 다른 운전자 이름으로 대신 적을 수 있다');

    console.log('\n[차량 이름 바꾸기 (2026-09-29)]');
    tables.vehicle_reservations.set('VR-0100', { vehicle: '옛이름', applicant: '직원' });
    tables.vehicle_logs.set('VL-0100', { vehicle: '옛이름', driver: '직원', startKm: 1 });
    ok(await call('staff@k.co', 'POST', '/api/vehicles/rename', { from: '옛이름', to: '새이름' }) === 403, '일반 직원은 못 바꾼다');
    ok(await call('car@k.co', 'POST', '/api/vehicles/rename', { from: '옛이름', to: '새이름' }) === 200 && last.changed === 2
        && tables.vehicle_reservations.get('VR-0100').vehicle === '새이름' && tables.vehicle_logs.get('VL-0100').vehicle === '새이름'
        && tables.vehicle_logs.get('VL-0100').driver === '직원', '차량 담당은 기존 예약 · 운행내역의 차량 이름을 한 번에 바꾼다 (다른 칸은 그대로)');

    console.log(`\n=========== 통과 ${pass} · 실패 ${fail} ===========`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
