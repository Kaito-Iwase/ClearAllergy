import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createPublicRevalidator, fetchPublicSnapshot, readSnapshotResponse } from '../features/public/shops/freshness/revalidation';
import { targetKey, type PublicSnapshot, type PublicTarget } from '../features/public/shops/freshness/contracts';

const target: PublicTarget = { kind: 'menu', shopId: 'test-shop', menuId: 'test-menu' };
function snapshot(name = '以前の架空食品', requestId: string = randomUUID()): PublicSnapshot {
    return { version: 1, targetKey: targetKey(target), requestId, startedAt: '2026-11-05T00:00:00.000Z', result: {
        kind: 'menu', data: { shopId: 'test-shop', shopName: '架空店舗', menuName: name,
            description: null, category: null, priceText: '100円', updatedAtText: '同じ食品更新日時',
            safeImageUrl: null, imageFrame: null, imageFit: null, imagePosition: null, imageZoom: null, imagePositionX: null, imagePositionY: null,
            ingredients: '架空原材料', precaution: '架空の混入注意', allergensForClient: [{ slug: 'egg', nameJa: '卵' }],
            statusBySlugForClient: { egg: 'FREE' }, rows: [{ slug: 'egg', nameJa: '卵', status: 'FREE', storeHandlesAllergen: false, effectiveRisk: 'FREE' }],
            storeHandledAllergenSlugs: [] },
    } };
}
function harness() {
    const jobs: Array<{ id: string; signal: AbortSignal; resolve: (value: PublicSnapshot) => void; reject: (reason: Error) => void }> = [];
    const initial = snapshot();
    const engine = createPublicRevalidator(target, initial, (_target, id, signal) => new Promise((resolve, reject) => jobs.push({ id, signal, resolve, reject })));
    engine.applied(initial.requestId);
    return { engine, jobs, initial };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('同一originの保護認証を使って取得し、認証HTMLを正常snapshotとして扱わない', async (t) => {
    const id = randomUUID(); const signal = new AbortController().signal; const expected = snapshot('保護Previewの食品', id);
    t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
        assert.equal(init?.signal, signal); assert.equal(init?.cache, 'no-store');
        if (init?.credentials !== 'same-origin') return new Response('<html>Authentication Required</html>', { status: 401 });
        return new Response(JSON.stringify(expected), { status: 200 });
    });
    assert.deepEqual(await fetchPublicSnapshot(target, id, signal), expected);
});

test('IDに外部URLを含めても取得先を固定し、CookieやAuthorizationを手動転送しない', async (t) => {
    const hostile: PublicTarget = { kind: 'menu', shopId: 'https://outside.invalid/shops', menuId: '//outside.invalid/menu?x=1' };
    const id = randomUUID(); const expected: PublicSnapshot = { ...snapshot('unused', id), targetKey: targetKey(hostile), result: { kind: 'not-found' } };
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        assert.equal(typeof input, 'string'); assert.match(String(input), /^\/api\/public-snapshot\?/);
        const url = new URL(String(input), 'https://fixture.invalid');
        assert.equal(url.origin, 'https://fixture.invalid'); assert.equal(url.pathname, '/api/public-snapshot');
        assert.equal(url.searchParams.get('shopId'), hostile.shopId); assert.equal(url.searchParams.get('menuId'), hostile.menuId);
        assert.equal(init?.credentials, 'same-origin'); const headers = new Headers(init?.headers);
        assert.equal(headers.get('accept'), 'application/json'); assert.equal(headers.has('cookie'), false); assert.equal(headers.has('authorization'), false);
        return new Response(JSON.stringify(expected), { status: 404 });
    });
    assert.deepEqual(await fetchPublicSnapshot(hostile, id, new AbortController().signal), expected);
});

test('取得完了だけでは成功にせず、対応するDOM適用まで旧snapshotを保持する', async () => {
    const { engine, jobs, initial } = harness();
    assert.equal(engine.getState().phase, 'ready'); assert.equal(jobs.length, 0);
    engine.request(); jobs[0].resolve(snapshot('訂正後の食品', jobs[0].id)); await tick();
    assert.equal(engine.getState().phase, 'applying'); assert.equal(engine.getState().displayed, initial);
    engine.applied(randomUUID()); assert.equal(engine.getState().phase, 'applying');
    engine.applied(jobs[0].id); assert.equal(engine.getState().phase, 'ready'); assert.equal(engine.getState().stale, false);
    const result = engine.getState().displayed.result;
    assert.equal(result.kind === 'menu' && result.data.menuName, '訂正後の食品');
});

test('取得中の複数復帰は後続一要求へ集約し、先行結果を確認完了にしない', async () => {
    const { engine, jobs } = harness(); const confirmed: string[] = [];
    engine.subscribe(() => { if (!engine.getState().stale) confirmed.push(engine.getState().displayed.requestId); });
    engine.request(); engine.noteResume(); engine.noteResume(); engine.noteResume();
    jobs[0].resolve(snapshot('復帰より前のsnapshot', jobs[0].id)); await tick();
    assert.equal(jobs.length, 2); assert.equal(engine.getState().candidate, null); assert.deepEqual(confirmed, []);
    jobs[1].resolve(snapshot('復帰後のsnapshot', jobs[1].id)); await tick(); engine.applied(jobs[1].id);
    assert.deepEqual(confirmed, [jobs[1].id]); assert.equal(jobs.length, 2);
});

test('表示適用待ちの再復帰も古い取得を再確認済みとしない', async () => {
    const { engine, jobs } = harness(); engine.request(); jobs[0].resolve(snapshot('適用待ち', jobs[0].id)); await tick();
    assert.equal(engine.noteResume(), false); engine.applied(jobs[0].id);
    assert.equal(jobs.length, 2); assert.equal(engine.getState().stale, true); assert.equal(engine.getState().phase, 'loading');
});

test('通信失敗は登録状態・旧取得時刻を変更せず、自動再試行を連続させない', async () => {
    const { engine, jobs, initial } = harness(); engine.request(); jobs[0].reject(Error('offline')); await tick();
    assert.equal(engine.getState().displayed, initial); assert.equal(engine.getState().phase, 'error'); assert.equal(engine.getState().stale, true);
    assert.equal(jobs.length, 1); await tick(); assert.equal(jobs.length, 1);
});

test('中止後の新しい結果を古い後着が上書きしない（abortを無視するtransportでも拒否）', async () => {
    const { engine, jobs } = harness(); engine.request(); engine.cancel(); assert.equal(jobs[0].signal.aborted, true);
    engine.request(); jobs[1].resolve(snapshot('新しい結果', jobs[1].id)); await tick(); engine.applied(jobs[1].id);
    const committed = engine.getState().displayed;
    jobs[0].resolve(snapshot('遅れて届いた旧結果', jobs[0].id)); await tick(); engine.applied(jobs[0].id);
    assert.equal(engine.getState().displayed, committed); assert.equal(engine.getState().stale, false);
});

test('正常な対象なしの適用後に旧食品を復活させない', async () => {
    const { engine, jobs } = harness(); engine.request(); engine.cancel(); engine.request();
    jobs[1].resolve({ ...snapshot('unused', jobs[1].id), result: { kind: 'not-found' } }); await tick(); engine.applied(jobs[1].id);
    assert.equal(engine.getState().displayed.result.kind, 'not-found');
    jobs[0].resolve(snapshot('旧食品', jobs[0].id)); await tick(); assert.equal(engine.getState().displayed.result.kind, 'not-found');
});

test('viewの適用失敗は候補を破棄し、以前の注意情報とsnapshotを保持する', async () => {
    const { engine, jobs, initial } = harness(); engine.request(); jobs[0].resolve(snapshot('表示不能の候補', jobs[0].id)); await tick();
    engine.renderFailed(jobs[0].id); assert.equal(engine.getState().displayed, initial); assert.equal(engine.getState().candidate, null);
    assert.equal(engine.getState().phase, 'error'); assert.equal(engine.getState().error, 'render');
});

test('unmount後の結果を破棄し、Strict再接続は中断した取得だけをやり直す', async () => {
    const { engine, jobs, initial } = harness(); engine.connect(); assert.equal(jobs.length, 0);
    engine.request(); engine.disconnect(); jobs[0].resolve(snapshot('unmounted', jobs[0].id)); await tick(); assert.equal(engine.getState().displayed, initial);
    engine.connect(); assert.equal(jobs.length, 2); jobs[1].resolve(snapshot('reconnected', jobs[1].id)); await tick(); engine.applied(jobs[1].id);
    assert.equal(engine.getState().stale, false);
});

test('食品更新日時が同じでも、別メニュー由来の補足を完全snapshotで置換する', async () => {
    const { engine, jobs } = harness(); engine.request(); const next = snapshot('同じ本体', jobs[0].id);
    assert.equal(next.result.kind, 'menu'); if (next.result.kind !== 'menu') throw Error('fixture');
    next.result.data.storeHandledAllergenSlugs = ['egg']; next.result.data.rows[0] = { ...next.result.data.rows[0], storeHandlesAllergen: true, effectiveRisk: 'STORE_HANDLED' };
    jobs[0].resolve(next); await tick(); engine.applied(jobs[0].id);
    assert.deepEqual(engine.getState().displayed, next); assert.equal(next.result.data.rows[0].status, 'FREE');
});

test('応答のresource・request・状態・schemaを検証し、HTMLや失敗を正常な対象なしにしない', async () => {
    const id = randomUUID(); const good = snapshot('valid', id);
    const response = (status: number, value: unknown) => ({ status, json: async () => value });
    assert.deepEqual(await readSnapshotResponse(target, id, response(200, good)), good);
    const missing = { ...good, result: { kind: 'not-found' } };
    assert.deepEqual(await readSnapshotResponse(target, id, response(404, missing)), missing);
    const bad = [response(200, '<html>login</html>'), response(404, { error: 'not found' }), response(500, good),
        response(200, { ...good, requestId: randomUUID() }), response(200, { ...good, targetKey: '/shops/other' }),
        response(503, { ...good, result: { kind: 'unavailable' } }), response(200, { ...good, ownerId: 'must-not-leak' })];
    for (const item of bad) await assert.rejects(readSnapshotResponse(target, id, item));
    const invalid = structuredClone(good);
    if (invalid.result.kind === 'menu') (invalid.result.data.rows[0] as { status: string }).status = 'NOT_FREE';
    await assert.rejects(readSnapshotResponse(target, id, response(200, invalid)));
});
