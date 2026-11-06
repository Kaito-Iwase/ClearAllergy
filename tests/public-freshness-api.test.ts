import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import Module, { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/db';
import { ALLERGEN_MASTER } from '../lib/constants/allergen-master';
import { PublicReadUnavailableError } from '../lib/public-db';
import { publicSnapshotSchema } from '../features/public/shops/freshness/contracts';

// Node's test runtime is not an RSC runtime. Bypass only the marker while
// loading the real route; DB/snapshot/publication/supplement code stays real.
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let route: typeof import('../app/api/public-snapshot/route');
try {
    loader._load = function (id, ...args) { return id === 'server-only' ? {} : originalLoad.call(this, id, ...args); };
    route = requireForTest('../app/api/public-snapshot/route.ts');
} finally { loader._load = originalLoad; }

const master = ALLERGEN_MASTER.map((a, index) => ({ ...a, id: 'master-' + index }));
const shopId = 'test-shop'; const menuId = 'test-menu';
function menu() {
    return { id: menuId, shopId, name: '架空の公開食品', description: null, priceYen: 1000, category: null,
        ingredients: '架空原材料', precaution: '架空の注意', imageUrl: null, imageFrame: null, imageFit: null,
        imagePosition: null, imageZoom: null, imagePositionX: null, imagePositionY: null,
        isPublished: true, foodVersion: 1, reviewedFoodVersion: null, publicationConfirmedFoodVersion: 1,
        updatedAt: new Date('2026-11-05T00:00:00Z'), createdAt: new Date('2026-11-05T00:00:00Z'),
        shop: { id: shopId, name: '架空店舗' }, ownerUserId: 'PRIVATE_OWNER_SENTINEL',
        allergenLinks: master.map(a => ({ allergenId: a.id, status: 'FREE', allergen: { slug: a.slug } })) };
}
function shop() {
    return { id: shopId, name: '架空店舗', description: null, address: null, prefecture: null, city: null,
        nearestStation: null, category: null, latitude: null, longitude: null, googlePlaceId: null,
        averageBudgetYen: null, coverImageUrl: null, coverImageFit: null, coverImageZoom: null,
        coverImagePositionX: null, coverImagePositionY: null, hours: null, regularHoliday: null,
        phoneNumber: null, note: null, updatedAt: new Date('2026-11-05T00:00:00Z'), menus: [menu()], _count: { menus: 1 } };
}
function replace(t: TestContext, object: object, key: string, value: unknown) {
    const target = object as Record<string, unknown>; const original = target[key]; target[key] = value;
    t.after(() => { target[key] = original; });
}
function database(t: TestContext, options: { menu?: ReturnType<typeof menu> | null; fail?: boolean } = {}) {
    let transactions = 0; const reads: Array<{ model: string; args: unknown }> = [];
    for (const [object, method] of [[prisma.shop, 'findFirst'], [prisma.shop, 'findMany'], [prisma.allergen, 'findMany'], [prisma.menuItem, 'findFirst'], [prisma.menuItem, 'findMany']] as const) {
        replace(t, object, method, async () => { throw Error('ROOT_CLIENT_READ'); });
    }
    const read = (model: string, value: unknown) => async (args: unknown) => { reads.push({ model, args }); return value; };
    const tx = { shop: { findMany: read('shop.findMany', [shop()]), findFirst: read('shop.findFirst', shop()) },
        allergen: { findMany: read('allergen.findMany', master) },
        menuItem: { findFirst: read('menuItem.findFirst', options.menu === undefined ? menu() : options.menu), findMany: read('menuItem.findMany', []) } };
    replace(t, prisma, '$transaction', async (callback: (transaction: unknown) => Promise<unknown>, config: { isolationLevel: string }) => {
        transactions++; assert.equal(config.isolationLevel, 'RepeatableRead');
        if (options.fail) throw new PublicReadUnavailableError();
        return callback(tx);
    });
    return { reads, count: () => transactions };
}
function request(kind: string, requestId = randomUUID()) {
    const q = new URLSearchParams({ kind, requestId });
    if (kind !== 'list') q.set('shopId', shopId);
    if (kind === 'menu') q.set('menuId', menuId);
    return new Request('http://localhost/api/public-snapshot?' + q);
}

test('snapshot API: 不正・重複・任意URL入力をDB前に拒否する', async t => {
    const db = database(t);
    for (const query of ['kind=unknown', 'kind=list&url=https://example.invalid', 'kind=list&kind=menu&requestId=' + randomUUID(),
        'kind=menu&shopId=../private&menuId=x&requestId=' + randomUUID()]) {
        const result = await route.GET(new Request('http://localhost/api/public-snapshot?' + query)); assert.equal(result.status, 400);
    }
    assert.equal(db.count(), 0);
});

for (const kind of ['list', 'shop', 'menu']) {
    test(`snapshot API: ${kind}は実共有loader・一つのsnapshotで公開whitelistのみ返す`, async t => {
        const db = database(t); const id = randomUUID(); const response = await route.GET(request(kind, id));
        assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
        const body = publicSnapshotSchema.parse(await response.json()); assert.equal(body.requestId, id); assert.equal(body.result.kind, kind);
        assert.equal(db.count(), 1); const serialized = JSON.stringify(body);
        for (const secret of ['PRIVATE_OWNER_SENTINEL', 'foodVersion', 'reviewedFoodVersion', 'publicationConfirmedFoodVersion', 'master-0']) assert.equal(serialized.includes(secret), false, secret);
        assert.equal(db.reads.some(r => r.model === 'allergen.findMany'), true);
        if (kind === 'menu') {
            assert.equal(db.reads.some(r => r.model === 'menuItem.findMany'), true, 'same snapshot must include other-menu supplement');
            const args = db.reads.find(r => r.model === 'menuItem.findFirst')?.args as { where: { id: string; shopId: string; isPublished: boolean; shop: { isActive: boolean } } };
            assert.equal(args.where.id, menuId); assert.equal(args.where.shopId, shopId); assert.equal(args.where.isPublished, true); assert.equal(args.where.shop.isActive, true);
        }
    });
}

test('snapshot API: 非公開/不存在は存在oracleを増やさず同じ404結果に畳む', async t => {
    const db = database(t, { menu: null }); const response = await route.GET(request('menu')); assert.equal(response.status, 404);
    const body = publicSnapshotSchema.parse(await response.json()); assert.deepEqual(body.result, { kind: 'not-found' });
    assert.deepEqual(db.reads.map(r => r.model).sort(), ['allergen.findMany', 'menuItem.findFirst']);
});

for (const condition of ['UNKNOWN', 'version']) {
    test(`snapshot API: ${condition}の公開条件不成立も食品を返さない`, async t => {
        const invalid = menu(); if (condition === 'UNKNOWN') invalid.allergenLinks[0].status = 'UNKNOWN'; else invalid.foodVersion = 2;
        database(t, { menu: invalid }); const response = await route.GET(request('menu')); assert.equal(response.status, 404);
        assert.deepEqual(publicSnapshotSchema.parse(await response.json()).result, { kind: 'not-found' });
    });
}

test('snapshot API: DB取得不能は正常な対象なしやFREEに変換しない', async t => {
    database(t, { fail: true }); const response = await route.GET(request('menu')); assert.equal(response.status, 503);
    const body = publicSnapshotSchema.parse(await response.json()); assert.deepEqual(body.result, { kind: 'unavailable' });
    assert.equal(JSON.stringify(body).includes('架空原材料'), false);
});
