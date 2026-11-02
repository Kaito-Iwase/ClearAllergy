// Node/HTTP seams only. These tests never launch Playwright or call a service.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { prepareManagedServiceBrowser, serviceBrowserApplication as target, serviceBrowserRequestPolicy, expectedServiceShopPayload,
    observeServiceDom, assertUploadUiObservation, createManagedServicePreparation, serviceBrowserImage } from '../scripts/issue118-managed-service-browser.mjs';
const { prepareWriteObservation } = createRequire(import.meta.url)('tsx/cjs/api').require('../scripts/issue118-service-observer.ts', import.meta.url);
const uuid = '11111111-1111-4111-8111-111111111111';
const scope = { runId: uuid, applicationSha: target.source, shopId: 'cshopa', isolationReceiptSha256: 'a'.repeat(64) };
function harness({ mode = 'DELIVER', fault } = {}) {
    const cell = { kind: 'MENU_SAVE', mode, id: 'MENU_SAVE_' + mode };
    const fixture = { menuId: 'cnewfixture', before: { id: 'cnewfixture', priceYen: 800, version: 1 }, priceYen: 801 };
    const counts = { fetch: 0, abort: 0, fulfill: 0, authorize: 0, consume: 0, fallback: 0, finish: 0, prepare: 0,
        click: 0, fill: 0, fileInput: 0, hydrationWait: 0 };
    let url, handler, saved = false, error = false, closed = false, owned = structuredClone(fixture.before);
    const values = new Map();
    const context = { newPage: async () => page };
    const mainFrame = { page: () => page };
    const request = { method: () => 'PUT', url: () => target.origin + '/api/admin/menus/cnewfixture',
        frame: () => fault === 'foreign-frame' ? { page: () => ({}) } : fault === 'child-frame' ? { page: () => page } : mainFrame,
        postDataBuffer: () => Buffer.from(JSON.stringify({ expectedVersion: fault === 'cas' ? 2 : 1, priceYen: 801 })),
        allHeaders: async () => { if (fault === 'headers') throw Error('SYNTHETIC_SECRET'); return { cookie: 'SYNTHETIC_SECRET' }; } };
    const route = { request: () => request,
        fetch: async options => {
            counts.fetch++; assert.equal(options.maxRedirects, 0); assert.equal(options.maxRetries, 0);
            assert.equal(options.headers['x-vercel-trusted-oidc-idp-token'], 'SYNTHETIC.TOKEN.VALUE');
            owned = { ...owned, priceYen: 801, version: 2 };
            if (fault === 'network') throw Error('SYNTHETIC_SECRET');
            const menu = { ...owned, name: '架空', description: null, category: null, ingredients: null, precaution: null,
                imageUrl: null, imageFrame: 'square', imageFit: 'cover', imagePosition: 'center', imageZoom: 1,
                imagePositionX: 50, imagePositionY: 50, isPublished: false, foodVersion: 1,
                reviewedFoodVersion: null, publicationConfirmedFoodVersion: null, foodReviews: [], allergens: [] };
            return { status: () => fault === 'redirect' ? 307 : 200,
                headers: () => ({ 'x-request-id': uuid }), json: async () => ({ menu }) };
        },
        abort: async () => { counts.abort++; error = true; },
        fulfill: async () => { counts.fulfill++; saved = true; },
        fallback: async () => { counts.fallback++; },
    };
    const locator = selector => ({
        fill: async value => { counts.fill++; values.set(selector, value); },
        setInputFiles: async () => { counts.fileInput++; }, first() { return this; },
        getByRole() { return this; },
        click: async () => { counts.click++; void handler(route); },
    });
    const page = { context: () => context, mainFrame: () => mainFrame, url: () => url, goto: async value => { url = value; },
        route: async (_pattern, fn) => { handler = fn; }, locator, getByRole: () => locator('button'),
        evaluate: async (_fn, args) => ({ inputRetained: values.get('#edit-menu-field-2') === String(args.expected), fileRetained: false,
            successDisplayed: saved, followupWrites: 0 }),
        waitForFunction: async (predicate, args, options) => {
            if (args?.kind === 'SERVICE_OWNER_HYDRATION') {
                counts.hydrationWait++; assert.equal(options.timeout, 20000);
                for (const key of ['fill', 'fileInput', 'click', 'fetch']) assert.equal(counts[key], 0);
                const previous = globalThis.window;
                try {
                    globalThis.window = { Clerk: { loaded: fault !== 'hydration-delayed', user: { id:
                        fault === 'hydration-owner' ? 'user_OTHER' : 'user_3LFy4E2hco0VpC63CbjjMjOznIx' } } };
                    if (fault === 'hydration-error') throw Error('SYNTHETIC_SECRET');
                    if (fault === 'hydration-delayed') {
                        assert.equal(predicate(args), false); await Promise.resolve(); globalThis.window.Clerk.loaded = true;
                    }
                    if (!predicate(args)) throw Error('SYNTHETIC_HYDRATION_NOT_CONFIRMED');
                } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
            } else { assert.ok(saved || error); }
        },
        close: async () => { if (fault === 'close') throw Error('SYNTHETIC_SECRET'); closed = true; }, isClosed: () => closed,
    };
    const ports = { prepareWriteObservation, prepareCell: async () => { counts.prepare++; return fixture; },
        verifyActor: async () => { if (fault === 'owner') throw Error('SYNTHETIC_SECRET'); },
        readOwner: async () => structuredClone(owned), claimPrivate: async () => true, emit: async () => {},
        oidcHeaders: async (_url, headers) => ({ ...headers, 'x-vercel-trusted-oidc-idp-token': 'SYNTHETIC.TOKEN.VALUE' }),
        finishCell: async () => { counts.finish++; return { known: true }; } };
    let started = 0, settled = 0;
    const tracker = { wrap: fn => async route => { started++; try { return await fn(route); } finally { settled++; } },
        drain: async () => { for (let i = 0; i < 20 && started !== settled; i++) await Promise.resolve(); return { status: fault !== 'drain' && started === settled ? 'QUIET_CONFIRMED' : 'DRAIN_TIMEOUT' }; },
        snapshot: () => ({ pending: started - settled, started, settled }) };
    const actor = { owner: 'S1', context, page: {}, access: { token: () => 'SYNTHETIC.TOKEN.VALUE' }, lifecycle: { tracker } };
    const adapter = prepareManagedServiceBrowser({ actor, target, scope, ports });
    const run = (selectedCell = cell) => adapter.runServiceCell({ cell: selectedCell,
        authorize: async claim => { counts.authorize++; assert.equal(claim.resource.path, '/api/admin/menus/cnewfixture');
            return { id: claim.id, allowedForward: mode !== 'BLOCK_BEFORE_FORWARD', resource: claim.resource }; },
        consumeSendPermission: () => { counts.consume++; assert.equal(counts.consume, 1); }, recordCreated: () => {} });
    return { adapter, run, counts, ports, route, late: () => handler(route) };
}
test('request policy covers all six actual API contracts and rejects unknown cells', () => {
    for (const kind of ['MENU_CREATE', 'MENU_SAVE', 'STOP', 'MENU_UPLOAD', 'SHOP_SAVE', 'SHOP_UPLOAD']) for (const mode of ['DELIVER', 'BLOCK_BEFORE_FORWARD', 'WITHHOLD_AFTER_RESPONSE']) {
        const p = serviceBrowserRequestPolicy({ kind, mode, id: kind + '_' + mode }, { menuId: 'cnew' });
        assert.ok(p.path.startsWith('/api/admin/')); assert.ok(['POST', 'PUT'].includes(p.method));
    }
    assert.throws(() => serviceBrowserRequestPolicy({ kind: 'UNKNOWN', mode: 'DELIVER', id: 'UNKNOWN_DELIVER' }, {}));
});
test('8bf Shop wire projection preserves fields and follows exact hours/budget normalization', () => {
    const before = { id: 'cshopa', name: '架空店舗', description: null, address: null, prefecture: null, city: null,
        nearestStation: null, category: null, latitude: null, longitude: null, googlePlaceId: null,
        hours: '平日：10:00-18:00\n休日 11:00-17:00', regularHoliday: null, phoneNumber: null, note: 'before',
        averageBudgetYen: 800, coverImageUrl: null, coverImageFrame: 'wide', coverImageFit: 'cover', coverImagePosition: 'center',
        coverImageZoom: 100, coverImagePositionX: 50, coverImagePositionY: 50, updatedAt: '2026-11-02T00:00:00.000Z' };
    const snapshot = structuredClone(before), wire = expectedServiceShopPayload(before, { note: ' test ', coverImageUrl: 'https://synthetic.invalid/image.png' });
    assert.equal(wire.hours, '平日 10:00-18:00\n土日祝 11:00-17:00');
    assert.equal(wire.averageBudgetYen, '800'); assert.equal(wire.note, 'test'); assert.equal(wire.description, '');
    assert.equal(wire.expectedUpdatedAt, before.updatedAt); assert.equal(wire.latitude, null);
    assert.deepEqual(before, snapshot); assert.equal(Object.hasOwn(wire, 'id'), false);
    assert.throws(() => expectedServiceShopPayload(before, { address: 'unapproved' }));
    assert.throws(() => expectedServiceShopPayload({ ...before, coverImageFrame: undefined }));
    assert.equal(expectedServiceShopPayload({ ...before, hours: '10:00-18:00', averageBudgetYen: null }).hours, '10:00-18:00');
    assert.equal(expectedServiceShopPayload({ ...before, hours: null, averageBudgetYen: null }).averageBudgetYen, '');
});
test('missing runtime integration is NOT_IMPLEMENTED, never a live success', async () => {
    const h = harness(); delete h.ports.prepareCell;
    assert.equal((await h.run()).status, 'NOT_IMPLEMENTED'); assert.equal(h.counts.fetch, 0);
});
test('service page waits for delayed fixed S1 hydration before any fill/file/click/network', async () => {
    const h = harness({ fault: 'hydration-delayed' }), r = await h.run();
    assert.equal(r.status, 'KNOWN_OBSERVATION'); assert.equal(h.counts.hydrationWait, 1);
    assert.equal(h.counts.fill, 1); assert.equal(h.counts.click, 1); assert.equal(h.counts.fetch, 1);
});
test('unconfirmed or unknown service hydration holds before UI mutation or any send', async () => {
    for (const fault of ['hydration-owner', 'hydration-error']) for (const kind of ['MENU_SAVE', 'MENU_UPLOAD']) {
        const h = harness({ fault }), r = await h.run({ kind, mode: 'DELIVER', id: kind + '_DELIVER' });
        assert.equal(r.status, 'HOLD'); assert.equal(h.counts.hydrationWait, 1);
        for (const key of ['fill', 'fileInput', 'click', 'fetch', 'authorize', 'consume']) assert.equal(h.counts[key], 0);
        assert.doesNotMatch(JSON.stringify(r), /SYNTHETIC_SECRET|SYNTHETIC_HYDRATION/);
    }
});
test('actual observer and page seam deliver once with one permission consumption', async () => {
    const h = harness(), r = await h.run();
    assert.equal(r.status, 'KNOWN_OBSERVATION', JSON.stringify(r));
    assert.equal(h.counts.fetch, 1); assert.equal(h.counts.consume, 1); assert.equal(h.counts.fulfill, 1);
    assert.equal(r.source.clientUnknown, false); assert.equal(r.source.externalAuthDatabaseBlob, 'NOT_ATTESTED');
    assert.equal((await h.adapter.close()).ownedPageClosed, true);
});
test('BLOCK requires unchanged own API and client input, keeps original clientUnknown', async () => {
    const h = harness({ mode: 'BLOCK_BEFORE_FORWARD' }), r = await h.run();
    assert.equal(r.status, 'KNOWN_NO_FORWARD'); assert.equal(r.clientUnknown, true); assert.equal(r.serverOutcome, 'NO_FORWARD_PROVEN');
    assert.equal(h.counts.fetch, 0); assert.equal(h.counts.consume, 0); assert.equal(h.counts.abort, 1);
});
test('WITHHOLD commits only once, never fulfills or permits another cell', async () => {
    const h = harness({ mode: 'WITHHOLD_AFTER_RESPONSE' }), r = await h.run();
    assert.equal(r.status, 'HOLD'); assert.equal(r.clientUnknown, true);
    assert.equal(h.counts.fetch, 1); assert.equal(h.counts.fulfill, 0); assert.equal(h.counts.abort, 1);
    await assert.rejects(h.run());
});
test('foreign page, owner mismatch and provider errors fail closed without raw exception', async () => {
    for (const fault of ['foreign-frame', 'owner', 'headers', 'network', 'redirect', 'cas']) {
        const h = harness({ fault }), r = await h.run();
        assert.equal(r.status, 'HOLD'); assert.doesNotMatch(JSON.stringify(r), /SYNTHETIC_SECRET/);
        assert.equal(h.counts.fulfill, 0); assert.ok(h.counts.fetch <= 1);
        if (['foreign-frame', 'owner', 'headers', 'cas'].includes(fault)) assert.equal(h.counts.fetch, 0);
    }
});
test('same-page child-frame mutations are refused before authorization or network', async () => {
    const h = harness({ fault: 'child-frame' }), r = await h.run();
    assert.equal(r.status, 'HOLD'); assert.equal(h.counts.fetch, 0); assert.equal(h.counts.authorize, 0);
    assert.equal(h.counts.consume, 0); assert.equal(h.counts.abort, 1);
});
test('MENU_CREATE_DELIVER setup object port is required before prepare, click or any network', async () => {
    const h = harness();
    const r = await h.run({ kind: 'MENU_CREATE', mode: 'DELIVER', id: 'MENU_CREATE_DELIVER' });
    assert.equal(r.status, 'NOT_IMPLEMENTED'); assert.equal(r.code, 'SERVICE_BROWSER_SETUP_OBJECT_PORT_MISSING');
    for (const key of ['prepare', 'click', 'fetch', 'authorize', 'consume']) assert.equal(h.counts[key], 0);
});
test('persistent page guard aborts late writes after cell, not fallback to context sender', async () => {
    const h = harness(); await h.run(); const before = h.counts.fetch; await h.late();
    assert.equal(h.counts.fetch, before); assert.equal(h.counts.fallback, 0); assert.equal(h.counts.abort, 1);
    await assert.rejects(h.run());
});
test('page close or route drain uncertainty overrides a known cell status to HOLD', async () => {
    for (const fault of ['close', 'drain']) {
        const h = harness({ fault }), r = await h.run();
        assert.equal(r.status, 'HOLD'); assert.equal(r.code, 'SERVICE_PAGE_CLOSE_OR_DRAIN_UNVERIFIED');
        assert.equal(r.source.clientDelivery, 'DELIVERY_CONFIRMED'); assert.equal(h.counts.fetch, 1);
        await assert.rejects(h.run()); assert.doesNotMatch(JSON.stringify(r), /SYNTHETIC_SECRET/);
    }
});
test('a blocked send cannot hide a failed separately authorized cleanup/reconciliation port', async () => {
    const h = harness({ mode: 'BLOCK_BEFORE_FORWARD' }); h.ports.finishCell = async () => ({ known: false });
    const r = await h.run(); assert.equal(r.status, 'HOLD'); assert.equal(h.counts.fetch, 0);
    assert.equal(r.source.clientUnknown, true); await assert.rejects(h.run());
});
function observedUploadDom(text, { reflected = false } = {}) {
    const previous = globalThis.document, url = 'https://synthetic.invalid/exact-object.png';
    globalThis.document = { body: { innerText: text }, querySelector: selector =>
        selector === '#input' ? { value: 'retained' } : selector === '#file' ? { files: [{}] }
            : selector === '#image' ? { value: reflected ? url : '' } : null };
    try { return observeServiceDom({ expected: 'retained', inputSelector: '#input', fileSelector: '#file', imageSelector: '#image',
        createdId: null, knownObjectUrl: url, followupWrites: 0 }); }
    finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
}
test('UPLOAD BLOCK/WH success DOM remains observed true and is refused, never masked by expected mode', () => {
    for (const mode of ['BLOCK_BEFORE_FORWARD', 'WITHHOLD_AFTER_RESPONSE']) {
        const observed = observedUploadDom('店舗情報を保存しました。');
        assert.equal(observed.successDisplayed, true, mode);
        assert.throws(() => assertUploadUiObservation(observed, mode === 'WITHHOLD_AFTER_RESPONSE', false));
    }
});
test('parked upload acknowledgement cannot conceal an erroneously displayed save success', () => {
    const observed = observedUploadDom('保存しました。保存中...', { reflected: true });
    assert.equal(observed.successDisplayed, true); assert.equal(observed.savePending, true); assert.equal(observed.uploadUrlReflected, true);
    assert.throws(() => assertUploadUiObservation(observed, true, true));
});
test('upload URL reflection and pending save are separate observations, not a completed save', () => {
    const observed = observedUploadDom('保存中...', { reflected: true });
    assert.equal(observed.successDisplayed, false); assert.equal(observed.savePending, true); assert.equal(observed.uploadUrlReflected, true);
    assert.doesNotThrow(() => assertUploadUiObservation(observed, true, true));
    assert.throws(() => assertUploadUiObservation({ ...observed, savePending: false }, true, true));
    // A withheld ACK is not delivered into the form; no reflected URL is required.
    const failed = observedUploadDom('画像を送信できませんでした。');
    assert.doesNotThrow(() => assertUploadUiObservation(failed, true, false));
    assert.equal(failed.uploadUrlReflected, false); assert.equal(failed.savePending, false);
});

function preparationHarness() {
    const shopId = 'cmvs4x80y000twn0wbxkwzbt6';
    const allergens = Array.from({ length: 29 }, (_, i) => ({ slug: 'synthetic_' + i, nameJa: '架空' + i }));
    const menuTemplate = { name: 'M04', description: null, category: null, priceYen: 800, ingredients: '米、水', precaution: null,
        imageUrl: null, imageFrame: 'square', imageFit: 'cover', imagePosition: 'center', imageZoom: 100, imagePositionX: 50, imagePositionY: 50,
        allergenStatusBySlug: Object.fromEntries(allergens.map(a => [a.slug, 'FREE'])) };
    const menus = new Map(), state = {}, calls = []; let nextId = 0;
    let shop = { id: shopId, name: '架空店舗', description: null, address: 'PRIVATE_ADDRESS_NEVER_CHECKPOINT', prefecture: null,
        city: null, nearestStation: null, category: null, latitude: null, longitude: null, googlePlaceId: null, hours: null,
        regularHoliday: null, phoneNumber: null, note: 'original note', averageBudgetYen: null, coverImageUrl: null,
        coverImageFrame: 'wide', coverImageFit: 'cover', coverImagePosition: 'center', coverImageZoom: 100,
        coverImagePositionX: 50, coverImagePositionY: 50, updatedAt: '2026-11-02T00:00:00.000Z' };
    const create = payload => {
        const menu = { ...payload, id: 'cservice' + ++nextId, version: 1, foodVersion: 1, isPublished: false,
            publicationConfirmedFoodVersion: null, reviewedFoodVersion: null, foodReviews: [],
            allergens: allergens.map(a => ({ ...a, status: payload.allergenStatusBySlug[a.slug] })) };
        delete menu.operationId; delete menu.allergenStatusBySlug; menus.set(menu.id, menu); return structuredClone(menu);
    };
    const api = {
        readMenu: async id => { assert.ok(menus.has(id)); return structuredClone(menus.get(id)); },
        readShop: async () => structuredClone(shop), readCreationBaseline: async () => [...menus.keys()].sort(),
        createMenu: async command => { calls.push({ action: 'create', purpose: command.purpose }); return create(command.payload); },
        menuWrite: async command => {
            calls.push({ action: command.publicationAction, purpose: command.purpose });
            const menu = menus.get(command.menuId); assert.ok(menu); menu.version++;
            menu.isPublished = command.publicationAction === 'publish';
            if (menu.isPublished) menu.publicationConfirmedFoodVersion = menu.foodVersion;
            return structuredClone(menu);
        },
        observeKnownBlob: async () => { calls.push({ action: 'blobRead' }); return { status: 200, sha256: serviceBrowserImage.sha256, bytes: serviceBrowserImage.bytes }; },
        verifyPublicImage: async ({ menuId, url }) => { calls.push({ action: 'publicImageRead' }); return menus.get(menuId)?.isPublished && menus.get(menuId)?.imageUrl === url; },
        shopWrite: async command => {
            calls.push({ action: 'shopWrite', purpose: command.purpose }); assert.deepEqual(shop, command.expectedOwnAfter);
            shop = { ...shop, ...command.values, updatedAt: new Date(Date.parse(shop.updatedAt) + 1000).toISOString() };
            return structuredClone(shop);
        },
    };
    const setup = () => createManagedServicePreparation({ api, state, runId: uuid, menuTemplate, allergens });
    const ref = kind => {
        const pathname = kind === 'shop' ? `shops/${shopId}/cover-synthetic.png` : `menu-images/${shopId}/synthetic.png`;
        const url = serviceBrowserImage.origin + '/' + pathname;
        return { kind, pathname, url, objectSha256: createHashForTest(url), requestId: uuid };
    };
    return { setup, api, state, calls, menus, menuTemplate, allergens, create, ref,
        get shop() { return shop; }, commitShop: values => { shop = { ...shop, ...values, updatedAt: new Date(Date.parse(shop.updatedAt) + 1000).toISOString() }; return structuredClone(shop); } };
}
const createHashForTest = value => createRequire(import.meta.url)('node:crypto').createHash('sha256').update(value).digest('hex');
const cellOf = (kind, mode = 'DELIVER') => ({ kind, mode, id: kind + '_' + mode });
const delivered = extras => ({ clientDelivery: 'DELIVERY_CONFIRMED', clientUnknown: false, bodyValidated: true, ...extras });
const blockProof = () => ({ serverOutcome: 'NO_FORWARD_PROVEN', forwardCalls: 0, followupWrites: 0, retryCalls: 0, fallbackCalls: 0,
    ownerApiUnchanged: true, inputRetained: true, fileRetained: true, successDisplayed: false, soleSenderConfirmed: true, clientUnknown: true });

test('17 independent cell preparations use nine disjoint private setups; paired normal Shop save is checked separately', async () => {
    const h = preparationHarness(), p = h.setup();
    for (const kind of ['MENU_CREATE', 'MENU_SAVE', 'STOP', 'MENU_UPLOAD', 'SHOP_UPLOAD', 'SHOP_SAVE'])
        for (const mode of ['DELIVER', 'BLOCK_BEFORE_FORWARD', 'WITHHOLD_AFTER_RESPONSE']) {
            const cell = cellOf(kind, mode);
            if (cell.id === 'SHOP_SAVE_DELIVER') continue; // Requires an actually acknowledged, parked SHOP_UPLOAD first.
            const f = await p.prepareCell({ cell });
            if (['MENU_SAVE', 'STOP', 'MENU_UPLOAD'].includes(kind)) {
                assert.equal(f.before.priceYen, 800); assert.equal(f.before.isPublished, kind === 'STOP');
                assert.equal(f.before.allergens.length, 29);
            } else if (kind === 'MENU_CREATE') assert.equal(f.allergens.length, 29);
        }
    assert.equal(h.calls.filter(c => c.action === 'create').length, 9);
    assert.equal(h.calls.filter(c => c.action === 'publish').length, 3);
    assert.equal(new Set([...h.menus.keys()]).size, 9);
    assert.doesNotMatch(JSON.stringify(h.state), /PRIVATE_ADDRESS_NEVER_CHECKPOINT|cookie|session|headers|buffer/);
});
test('SAVE remains private, STOP BLOCK cleans up once only after complete no-forward proof', async () => {
    const h = preparationHarness(), p = h.setup(), save = cellOf('MENU_SAVE'), sf = await p.prepareCell({ cell: save });
    const sm = h.menus.get(sf.menuId); sm.priceYen = 801; sm.version++;
    assert.deepEqual(await p.finishCell({ cell: save, fixture: sf, result: delivered() }), { known: true });
    assert.equal(h.calls.filter(c => c.action === 'publish').length, 0); assert.equal(sm.isPublished, false);
    const stop = cellOf('STOP', 'BLOCK_BEFORE_FORWARD'), f = await p.prepareCell({ cell: stop });
    await p.finishCell({ cell: stop, fixture: f, result: blockProof() });
    assert.equal(h.menus.get(f.menuId).isPublished, false);
    assert.equal(h.calls.filter(c => c.purpose === 'CLEANUP').length, 1);
    await assert.rejects(p.prepareCell({ cell: stop }));
    assert.equal(h.calls.filter(c => c.purpose === 'CLEANUP').length, 1);
});
test('CREATE deliver publishes separately, checks exact image, then stops without an extra creation', async () => {
    const h = preparationHarness(), p = h.setup(), cell = cellOf('MENU_CREATE'), f = await p.prepareCell({ cell });
    const ref = h.ref('menu'); await p.recordSetupObject(ref);
    const menu = h.create({ ...h.state.cells[cell.id].fixtureFood, imageUrl: ref.url }); f.creationOperationId = uuid;
    await p.finishCell({ cell, fixture: f, result: delivered({ createdMenuId: menu.id }) });
    assert.deepEqual(h.calls.map(c => c.action), ['blobRead', 'publish', 'publicImageRead', 'stop']);
    assert.equal(h.menus.get(menu.id).isPublished, false); assert.equal(h.state.cells[cell.id].menuId, menu.id);
    const calls = h.calls.length; await assert.rejects(p.finishCell({ cell, fixture: f, result: delivered({ createdMenuId: menu.id }) }));
    assert.equal(h.calls.length, calls);
});
test('parked menu save binds full food/display/price and CAS before authorization, then publishes and stops separately', async () => {
    for (const fault of [null, 'price', 'version', 'path']) {
        const h = preparationHarness(), p = h.setup(), cell = cellOf('MENU_UPLOAD'), f = await p.prepareCell({ cell });
        const ref = h.ref('menu'); let authorized = 0, released = 0;
        const wanted = { ...h.state.cells[cell.id].fixtureFood, imageUrl: ref.url, expectedVersion: f.before.version, isPublished: false };
        const body = { ...wanted }; if (fault === 'price') body.priceYen = 801; if (fault === 'version') body.expectedVersion++;
        const args = { cell, fixture: f, result: delivered(), knownObject: ref,
            getParkedSubmission: () => ({ method: 'PUT', path: '/api/admin/menus/' + (fault === 'path' ? 'cother' : f.menuId), body: Buffer.from(JSON.stringify(body)) }),
            authorize: async claim => { authorized++; assert.equal(claim.resource.beforeVersion, f.before.version); return { id: claim.id }; },
            releaseFollowup: async ({ actualResource }) => {
                released++; assert.equal(actualResource.menuId, f.menuId);
                const menu = h.menus.get(f.menuId); menu.imageUrl = ref.url; menu.version++; menu.foodVersion++;
                return { status: () => 200, json: async () => ({ menu: structuredClone(menu) }) };
            } };
        if (fault) { await assert.rejects(p.finishCell(args)); assert.equal(authorized, 0); assert.equal(released, 0); }
        else {
            await p.finishCell(args); assert.equal(authorized, 1); assert.equal(released, 1);
            assert.equal(h.menus.get(f.menuId).isPublished, false);
            assert.deepEqual(h.calls.map(c => c.purpose).filter(Boolean), ['SETUP_CREATE', 'FOLLOWUP_PUBLISH', 'CLEANUP']);
        }
    }
});
test('Shop upload/save pair uses the same pending note, restores known values once and checkpoints no Shop private fields', async () => {
    const h = preparationHarness(), p = h.setup(), upload = cellOf('SHOP_UPLOAD'), uf = await p.prepareCell({ cell: upload });
    await p.finishCell({ cell: upload, fixture: uf, result: delivered(), knownObject: h.ref('shop'), after: structuredClone(h.shop) });
    const save = cellOf('SHOP_SAVE'), sf = await p.prepareCell({ cell: save });
    assert.equal(sf.note, uf.note); assert.equal(sf.expectedShopPayload.coverImageUrl, h.ref('shop').url);
    h.commitShop({ note: sf.note, coverImageUrl: h.ref('shop').url });
    await p.finishCell({ cell: save, fixture: sf, result: delivered() });
    assert.equal(h.shop.note, 'original note'); assert.equal(h.shop.coverImageUrl, null);
    assert.equal(h.calls.filter(c => c.action === 'shopWrite').length, 1);
    assert.doesNotMatch(JSON.stringify(h.state), /PRIVATE_ADDRESS_NEVER_CHECKPOINT|expectedShopPayload|latitude|phoneNumber/);
});
test('WH retains safe state without writes; prior Shop restoration requires independent terminal and exact fresh hash', async () => {
    for (const fault of [null, 'no-terminal', 'concurrent', 'write-unknown']) {
        const h = preparationHarness(), p = h.setup(), cell = cellOf('SHOP_SAVE', 'WITHHOLD_AFTER_RESPONSE'), f = await p.prepareCell({ cell });
        const committed = h.commitShop({ note: f.note, coverImageUrl: f.expectedShopPayload.coverImageUrl });
        const before = h.calls.length;
        p.retainHeldCell({ cell, fixture: f, source: { bodyValidated: true }, primaryClaimId: 'SOURCE_WH', validatedResponse: { shop: committed } });
        assert.equal(h.calls.length, before); assert.doesNotMatch(JSON.stringify(h.state), /PRIVATE_ADDRESS_NEVER_CHECKPOINT|phoneNumber|latitude/);
        if (fault === 'concurrent') h.commitShop({ note: 'other editor' });
        if (fault === 'write-unknown') h.api.shopWrite = async () => { h.calls.push({ action: 'shopWrite' }); throw Error('SYNTHETIC_SECRET'); };
        const resumed = h.setup(), args = { sources: [{ sourceClaimId: 'SOURCE_WH' }], independentTerminalVerified: fault !== 'no-terminal' };
        if (fault) {
            await assert.rejects(resumed.restorePriorShop(args));
            if (fault === 'write-unknown') await assert.rejects(h.setup().restorePriorShop(args));
            assert.equal(h.calls.filter(c => c.action === 'shopWrite').length, fault === 'write-unknown' ? 1 : 0);
        }
        else {
            const r = await resumed.restorePriorShop(args); assert.deepEqual(r.verifiedSourceClaimIds, ['SOURCE_WH']);
            assert.equal(h.shop.note, 'original note'); await assert.rejects(resumed.restorePriorShop(args));
            assert.equal(h.calls.filter(c => c.action === 'shopWrite').length, 1);
        }
    }
});
test('setup unknown and missing ports hold without retry, publication or cleanup', async () => {
    for (const missing of [false, true]) {
        const h = preparationHarness(); if (missing) delete h.api.createMenu;
        else h.api.createMenu = async () => { h.calls.push({ action: 'unknown-create' }); throw Error('SYNTHETIC_SECRET'); };
        const p = h.setup(), cell = cellOf('STOP'); await assert.rejects(p.prepareCell({ cell }), { message: 'SERVICE_PREPARATION_HELD' });
        const calls = h.calls.length; await assert.rejects(p.prepareCell({ cell })); assert.equal(h.calls.length, calls);
        assert.equal(h.calls.filter(c => ['publish', 'stop', 'shopWrite'].includes(c.action)).length, 0);
        assert.doesNotMatch(JSON.stringify(h.state), /SYNTHETIC_SECRET/);
    }
});
