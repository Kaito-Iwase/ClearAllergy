import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createManagedRuntimePorts, target } from '../scripts/check-issue118-live-t1-browser.mjs';
import { prepareManagedSuite } from '../scripts/issue118-managed-suite.mjs';
import { ciIdentity, managedActorIdentity } from '../scripts/issue118-ci-auth.mjs';
import { projectOriginalPayloads } from '../scripts/issue118-batch-stop';
import { ALLERGEN_MASTER } from '../lib/constants/allergen-master';
import { savedMenuResponseSchema, type SavedMenu } from '../features/admin/menus/schemas/menu-response';
import { shopResponseSchema } from '../features/admin/shop/schemas/shop-response';

// SYNTHETIC gold-known state model, not an application server or auth/SQL proof.
// No fixture service, listener, loopback, browser launch or network is used. The
// actual controller, runtime ports, T2/T3/T4 orchestrator and T4 observer run here.
type Owner = 'S1' | 'S2';
type Resource = { method: string; path: string; purpose: string; shopId?: string;
    menuId?: string; creationOperationId?: string; beforeVersion?: number; beforeUpdatedAt?: string; evidence?: Record<string, boolean> };
type Claim = { id: string; kind: string; owner: Owner; resource: Resource; cellId?: string; mode?: string };
type Permit = Claim & { allowedForward: boolean };
type Boundary = {
    authorize(value: Claim): Promise<Permit>;
    consumeSendPermission(value: { id: string; resource: Resource }): unknown;
    recordCreated(value: { operationId: string; id: string }): unknown;
};
type Body = Record<string, unknown>;
type Entry = { owner: Owner; menu: SavedMenu };
type Send = { id: string; owner: Owner; resource: Resource; body?: Body; status: number; before?: Entry; after?: Entry };
type Fault = 'NONE' | 'FETCH_UNKNOWN' | 'JSON_UNKNOWN' | 'READBACK_MISMATCH' | 'RESOURCE_SWAP' | 'CAS_SWAP' | 'OWNER_SWAP' | 'DENIAL_MUTATES';

function integration(directory: string, fault: Fault = 'NONE') {
    const now = Date.now(), t1FixtureId = 'csynthetict1private';
    const store = new Map<string, Entry>(), sends: Send[] = [], phases: string[] = [];
    const acknowledged = new Map<string, string>(), created: Array<{ operationId: string; id: string }> = [];
    const modelCreationOperations = new Set<string>();
    const authorized = new Map<string, Claim>(), consumed = new Set<string>();
    let pending: Claim | undefined, serial = 0;
    const runIds = { T2: randomUUID(), T3: randomUUID(), T4: randomUUID() };
    const keys = Array.from({ length: 8 }, (_, i) => 'M0' + (i + 1));
    const operationIds = { T2: Object.fromEntries(keys.map(k => [k, randomUUID()])),
        T3: Object.fromEntries(keys.map(k => [k, randomUUID()])), T4: { M02: randomUUID() } };
    const claims = { iss: 'https://token.actions.githubusercontent.com', aud: ciIdentity.audience,
        sub: `repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`, repository: ciIdentity.repository,
        repository_id: ciIdentity.repositoryId, ref: ciIdentity.ref, workflow_ref: ciIdentity.workflowRef,
        environment: ciIdentity.environment, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600 };
    const token = 'e30.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.SYNTHETIC';
    const pk = 'pk_test_' + Buffer.from(ciIdentity.clerkDomain + '$').toString('base64');
    const shops = Object.fromEntries((['S1', 'S2'] as const).map(owner => [owner, shopResponseSchema.parse({ shop: {
        id: managedActorIdentity[owner].shopId, name: 'SYNTHETIC ' + owner, description: null, address: null, prefecture: null,
        city: null, nearestStation: null, category: null, googlePlaceId: null, hours: null, regularHoliday: null,
        phoneNumber: null, note: 'SYNTHETIC ORIGINAL', latitude: null, longitude: null, averageBudgetYen: null,
        coverImageUrl: null, coverImageFrame: 'square', coverImageFit: 'cover', coverImagePosition: 'center',
        coverImageZoom: 100, coverImagePositionX: 50, coverImagePositionY: 50, updatedAt: new Date(now).toISOString(),
    } }).shop]));
    function newMenu(id: string, body: Body): SavedMenu {
        const payload = structuredClone(body);
        return savedMenuResponseSchema.parse({ menu: { ...payload, id, version: 43, foodVersion: 19, reviewedFoodVersion: null,
            publicationConfirmedFoodVersion: null, foodReviews: [], isPublished: false,
            allergens: ALLERGEN_MASTER.map(a => ({ ...a,
                status: (body.allergenStatusBySlug as Record<string, SavedMenu['allergens'][number]['status']>)[a.slug] })) } }).menu;
    }
    store.set(t1FixtureId, { owner: 'S1', menu: newMenu(t1FixtureId, projectOriginalPayloads(randomUUID()).expectedByMenu.M04) });
    const t1Before = structuredClone(store.get(t1FixtureId));

    // This sole API seam derives outcomes from owner/body/persisted CAS state;
    // it does not receive the caller's expected status or scenario result.
    const fetchFor = (owner: Owner) => async (raw: string, options: { method?: string; data?: Body;
        maxRedirects?: number; maxRetries?: number; timeout?: number; headers?: Record<string, string> } = {}) => {
        const url = new URL(raw), method = options.method ?? 'GET';
        assert.equal(url.origin, target.origin);
        const permit = pending;
        const before = permit?.resource.menuId ? structuredClone(store.get(permit.resource.menuId)) : undefined;
        if (method !== 'GET' || permit) {
            assert.ok(permit, 'every mutating/denial request must consume a controller permit first');
            assert.equal(permit.owner, owner); assert.equal(permit.resource.method, method);
            assert.equal(permit.resource.path, url.pathname); assert.ok(consumed.has(permit.id));
            assert.equal(options.maxRedirects, 0); assert.equal(options.maxRetries, 0); assert.equal(options.timeout, 20000);
            assert.equal(options.headers?.Origin, target.origin);
            assert.ok(options.headers?.['x-vercel-trusted-oidc-idp-token']);
            if (permit.kind === 'MENU_CREATE') {
                assert.equal(permit.resource.shopId, managedActorIdentity[owner].shopId);
                assert.equal(permit.resource.creationOperationId, options.data?.operationId);
            } else if (permit.kind === 'SHOP_WRITE') {
                assert.equal(permit.resource.shopId, managedActorIdentity[owner].shopId);
                assert.equal((permit.resource as Resource & { beforeUpdatedAt: string }).beforeUpdatedAt, options.data?.expectedUpdatedAt);
            } else if (method !== 'GET') assert.equal(permit.resource.beforeVersion, options.data?.expectedVersion);
            pending = undefined;
        }
        let status: number, body: unknown;
        if (url.pathname === '/api/admin/shop' && method === 'GET') {
            status = 200; body = { shop: shops[owner] };
        } else if (url.pathname === '/api/admin/shop' && method === 'PUT') {
            const shop = shops[owner], data = options.data!;
            if (data.expectedUpdatedAt !== shop.updatedAt) { status = 409; body = { error: 'VERSION_CONFLICT' }; }
            else { shop.note = String(data.note ?? '').trim() || null; shop.coverImageUrl = data.coverImageUrl as string | null;
                shop.updatedAt = new Date(Date.parse(shop.updatedAt) + 1).toISOString(); status = 200; body = { shop }; }
        } else if (url.pathname === '/api/admin/menus' && method === 'GET') {
            status = 200; body = { menus: [...store.values()].filter(e => e.owner === owner).map(e => ({
                id: e.menu.id, name: e.menu.name, version: e.menu.version, isPublished: e.menu.isPublished,
                updatedAt: new Date(now + e.menu.version).toISOString() })) };
        } else if (url.pathname === '/api/admin/menus' && method === 'POST') {
            assert.ok(permit); assert.equal(permit.kind, 'MENU_CREATE');
            assert.equal(options.data?.isPublished, false);
            assert.equal(typeof options.data?.operationId, 'string');
            const operationId = options.data!.operationId as string;
            assert.equal(modelCreationOperations.has(operationId), false); modelCreationOperations.add(operationId);
            const id = 'c' + String(++serial).padStart(24, '0'), menu = newMenu(id, options.data!);
            if (fault === 'READBACK_MISMATCH') menu.name = 'SYNTHETIC_WRONG_NAME';
            store.set(id, { owner, menu }); status = 201; body = { id };
            acknowledged.set(permit.id, id);
        } else {
            const id = url.pathname.split('/').filter(x => x && x !== 'stop').at(-1)!;
            const entry = store.get(id), publicRead = url.pathname.startsWith('/api/menus/');
            if (!entry || (!publicRead && entry.owner !== owner) || (publicRead && !entry.menu.isPublished)) {
                status = 404; body = { error: 'NOT_FOUND' };
                if (fault === 'DENIAL_MUTATES' && entry && permit?.resource.purpose.startsWith('CROSS_OWNER_')) entry.menu.priceYen = 999;
            } else if (method === 'GET') { status = 200; body = { menu: entry.menu }; }
            else if (options.data?.expectedVersion !== entry.menu.version) {
                status = 409; body = { error: 'VERSION_CONFLICT' };
            } else {
                const menu = entry.menu, data = options.data!;
                assert.equal(data.__menuId, undefined);
                menu.version++;
                if (url.pathname.endsWith('/stop')) menu.isPublished = false;
                else if (data.publicationAction === 'publish') {
                    menu.isPublished = true; menu.publicationConfirmedFoodVersion = menu.foodVersion;
                } else {
                    if (typeof data.priceYen === 'number') menu.priceYen = data.priceYen;
                    if (typeof data.ingredients === 'string') {
                        menu.ingredients = data.ingredients; menu.foodVersion++;
                        menu.publicationConfirmedFoodVersion = null;
                        menu.allergens = menu.allergens.map(a => ({ ...a,
                            status: (data.allergenStatusBySlug as Record<string, SavedMenu['allergens'][number]['status']>)[a.slug] }));
                    }
                }
                status = 200;
                // The actual STOP route acknowledges only these three menu
                // fields. Full persisted state is available solely via GET.
                body = url.pathname.endsWith('/stop')
                    ? { ok: true, menu: { id: menu.id, isPublished: menu.isPublished, version: menu.version } }
                    : { menu };
            }
        }
        if (permit) {
            sends.push({ id: permit.id, owner, resource: structuredClone(permit.resource),
                body: structuredClone(options.data), status, before,
                after: structuredClone(store.get(permit.resource.menuId ?? acknowledged.get(permit.id)!)) });
            phases.push('SEND:' + permit.id);
            if (fault === 'FETCH_UNKNOWN' && sends.length === 1) throw Error('SYNTHETIC_PRIVATE_TRANSPORT');
        }
        const snapshot = structuredClone(body);
        return { status: () => status, headers: () => ({ 'x-request-id': randomUUID() }),
            json: async () => { if (fault === 'JSON_UNKNOWN' && permit && sends.length === 1) throw Error('SYNTHETIC_PRIVATE_JSON');
                return structuredClone(snapshot); } };
    };

    // The four observer-owned pages preserve held DOM until navigation. Their
    // fresh reads use the same store that the API model changed, not an expected
    // T4 answer. The observer's actual route-abort handler is invoked on reload.
    function publicPage() {
        let current = 'about:blank', previous = '', visible = false, notFound = false, closed = false;
        const listeners = new Map<string, (value: unknown) => void>();
        let routeHandler: ((route: unknown) => Promise<void>) | undefined;
        const emit = (type: string, value: unknown) => listeners.get(type)?.(value);
        const navigate = async (next: string, back = false) => {
            const request = { url: () => next, method: () => 'GET', resourceType: () => 'document' };
            emit('request', request); let aborted = false;
            if (routeHandler) await routeHandler({ request: () => request, abort: async () => { aborted = true; }, fallback: async () => {} });
            if (aborted) { emit('requestfailed', request); throw Error('SYNTHETIC_DOCUMENT_ABORT'); }
            const old = current; current = next; if (!back) previous = old;
            const entry = store.get(new URL(next).pathname.split('/').at(-1)!);
            visible = !!entry?.menu.isPublished; notFound = !!entry && !entry.menu.isPublished;
            emit('response', { request: () => request, status: () => 200 }); emit('requestfinished', request);
            return { status: () => 200 };
        };
        return { url: () => current, isClosed: () => closed,
            on: (type: string, callback: (value: unknown) => void) => { listeners.set(type, callback); }, addInitScript: async () => {},
            goto: (next: string) => navigate(next), reload: () => navigate(current), goBack: () => navigate(previous, true),
            evaluate: async () => ({ foodNameVisible: visible, notFoundVisible: notFound, pageshowPersisted: false, navigationType: 'navigate' }),
            route: async (_pattern: string, callback: (route: unknown) => Promise<void>) => { routeHandler = callback; },
            unroute: async () => { routeHandler = undefined; }, close: async () => { closed = true; } };
    }
    const pages: ReturnType<typeof publicPage>[] = [];
    const actors = (['S1', 'S2'] as const).map(owner => {
        const identity = managedActorIdentity[owner], request = { fetch: fetchFor(owner) };
        const context = { request, pages: () => [page, ...pages.filter(p => !p.isClosed())],
            newPage: async () => { const p = publicPage(); pages.push(p); return p; } };
        const page = { context: () => context, url: () => target.origin + '/admin/shop', isClosed: () => false,
            evaluate: async () => ({ id: identity.ownerId, pk }) };
        return { binding: { owner, shopId: identity.shopId, contextRef: owner }, expectedUserId: identity.ownerId,
            page, context, access: { token: () => token,
                read: async (api: typeof request, url: string) => api.fetch(url) } };
    });
    const batchInput = { runId: randomUUID(), managed: { mode: 'APPROVED_MANAGED_LIVE', actors, claimDirectory: directory,
        runIds, operationIds, now: () => now, t4EvidenceLevel: 'SYNTHETIC_HTTP_BROWSER',
        ownerEvidence: actors.map(a => ({ clerkUserId: a.expectedUserId, ...a.binding,
            deployment: target.deployment, source: target.source, origin: target.origin, observedUtc: new Date(now).toISOString(),
            verifiedBy: 'human', evidenceReference: 'SYNTHETIC_NOT_REAL_OWNER_PROOF' })),
        identityReceipt: { ...target, environment: 'Preview', status: 'Ready', observedUtc: new Date(now).toISOString(),
            verifiedBy: 'human', evidenceReference: 'SYNTHETIC_NOT_REAL_DEPLOYMENT_PROOF' } } };
    const runtime = createManagedRuntimePorts({ actors, batchInput, claimDirectory: directory, t1FixtureId });
    const install = runtime.ports.installSendGuard;
    let observedBoundary: Boundary;
    runtime.ports.installSendGuard = async (real: Boundary) => {
        observedBoundary = { ...real,
        authorize: async (value: Claim) => {
            const request: Claim = fault === 'OWNER_SWAP' ? { ...value, owner: value.owner === 'S1' ? 'S2' : 'S1' } : value;
            const permit = await real.authorize(request); assert.equal(authorized.has(value.id), false);
            authorized.set(value.id, structuredClone(value)); phases.push('AUTHORIZE:' + value.id); return permit;
        },
        consumeSendPermission: (value: { id: string; resource: Resource }) => {
            const resource = fault === 'RESOURCE_SWAP' ? { ...value.resource, creationOperationId: randomUUID() }
                : fault === 'CAS_SWAP' && value.resource.beforeVersion !== undefined
                    ? { ...value.resource, beforeVersion: value.resource.beforeVersion + 1 } : value.resource;
            const result = real.consumeSendPermission({ ...value, resource });
            assert.equal(pending, undefined); assert.equal(consumed.has(value.id), false);
            const claim = authorized.get(value.id)!; assert.deepEqual(value.resource, claim.resource);
            consumed.add(value.id); pending = claim; phases.push('CONSUME:' + value.id); return result;
        },
        recordCreated: async (value: { operationId: string; id: string }) => {
            assert.equal(acknowledged.get(value.operationId), value.id); assert.ok(consumed.has(value.operationId));
            assert.equal(created.some(c => c.id === value.id), false);
            await real.recordCreated(value); created.push(value); phases.push('RECORD_201:' + value.operationId);
        } };
        return install(observedBoundary);
    };
    // Denials receive authorize directly from the controller as well as the
    // installed boundary. Observe that same real callback at this second seam.
    const runDenials = runtime.ports.runDenials;
    runtime.ports.runDenials = (value: { authorize: Boundary['authorize']; fixtures: Array<{ id: string; owner: Owner }> }) =>
        runDenials({ ...value, authorize: observedBoundary.authorize });
    const suite = prepareManagedSuite({ suiteId: 'SYNTHETIC_INTEGRATED_CORE', batchInput, ports: runtime.ports,
        t1: { flow: 'PASS_APP_BROWSER_API', cleanup: 'PRIVATE_VERIFIED', protection: 'PASS_API_REPRESENTATION',
            unknownWrite: false, fixtureId: t1FixtureId, menuWrites: 6, sessions: 2 } });
    return { suite, runtime, sends, store, shops, actors, t1FixtureId, t1Before, pages, authorized, consumed, acknowledged, created, phases,
        boundary: () => observedBoundary };
}

async function inDirectory(action: (directory: string) => Promise<void>) {
    const directory = mkdtempSync(join(tmpdir(), 'issue118-managed-integration-'));
    try { await action(directory); }
    finally { assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert.ok(basename(directory).startsWith('issue118-managed-integration-')); rmSync(directory, { recursive: true }); }
}

test('SYNTHETIC: real controller/runtime/original T2 T3 T4 core reaches 21/79 through one stateful sender', async () => inDirectory(async directory => {
    const f = integration(directory); assert.equal(f.sends.length, 0);
    const result = await f.suite.executeCore();
    assert.equal(result.status, 'CORE_COMPLETE_SUITE_INCOMPLETE', JSON.stringify({ counts: result.counts, arms: result.arms }));
    assert.deepEqual(result.counts, { menus: 21, createAttempts: 21, menuWrites: 79, shopWrites: 0, blobUploads: 0, sessions: 2, denialRequests: 10 });
    assert.equal(result.livePass, false); assert.equal(result.independentDatabase, 'NOT_ATTESTED');
    assert.equal(result.denialHistory, 'PENDING_INDEPENDENT_SQL');
    assert.ok(result.service.every((cell: { status: string }) => cell.status === 'NOT_RUN'));
    assert.equal(f.store.size, 21); assert.equal(f.created.length, 20);
    assert.equal(f.sends.filter(s => s.status === 201).length, 20);
    assert.equal(f.sends.filter(s => s.status === 200 && s.resource.purpose === 'CORE').length, 53);
    assert.equal(f.sends.length, 83); assert.equal(f.consumed.size, 83); assert.equal(f.authorized.size, 83);
    assert.deepEqual(f.store.get(f.t1FixtureId), f.t1Before, 'already-private T1 must not be stopped again');
    assert.ok([...f.store.values()].every(e => !e.menu.isPublished));
    assert.ok(f.sends.filter(s => s.resource.path.endsWith('/stop')).every(s => s.resource.menuId !== f.t1FixtureId));
    assert.equal(f.pages.length, 4); assert.ok(f.pages.every(p => p.isClosed()));
    const batch = f.runtime.snapshot().batch;
    assert.equal(batch.results.length, 3);
    assert.equal(batch.t4.observation.evidenceLevel, 'SYNTHETIC_HTTP_BROWSER');
    assert.equal(batch.t4.observation.held.foodNameVisible, true);
    assert.equal(batch.t4.observation.fresh.foodNameVisible, false);
    assert.equal(batch.t4.observation.freshApi.status, 404);
    assert.equal(batch.t4.observation.failedRefetch.injection, 'ONE_DOCUMENT_GET_ABORTED_BEFORE_FORWARD');
    for (const send of f.sends) {
        const claim = result.claims.find((c: Claim) => c.id === send.id);
        assert.ok(claim); assert.equal(claim.state, 'FORWARD_CONSUMED');
        assert.equal(claim.owner, send.owner); assert.deepEqual(claim.resource, send.resource);
        const a = f.phases.indexOf('AUTHORIZE:' + send.id), c = f.phases.indexOf('CONSUME:' + send.id), s = f.phases.indexOf('SEND:' + send.id);
        assert.ok(a >= 0 && a < c && c < s);
        if (send.status === 201) { assert.ok(s < f.phases.indexOf('RECORD_201:' + send.id));
            assert.equal(claim.createdId, f.acknowledged.get(send.id)); }
        if (send.resource.purpose === 'CORE' && send.resource.menuId) {
            assert.equal(f.store.get(send.resource.menuId)?.owner, send.owner);
            assert.equal(send.resource.beforeVersion, send.body?.expectedVersion);
            assert.equal(send.before?.menu.version, send.body?.expectedVersion);
            assert.equal(send.after?.menu.version, send.before!.menu.version + 1);
            if (send.resource.path.endsWith('/stop')) {
                assert.equal(send.before?.menu.isPublished, true);
                assert.equal(send.after?.menu.isPublished, false);
                assert.equal(send.after?.menu.foodVersion, send.before?.menu.foodVersion);
            }
        }
        if (send.resource.purpose !== 'CORE') assert.deepEqual(send.after, send.before, 'refusal must preserve the full model entry');
    }
    const cross = f.sends.filter(s => s.resource.purpose.startsWith('CROSS_OWNER_'));
    assert.equal(cross.length, 8); assert.ok(cross.every(s => s.status === 404));
    for (const owner of ['S1', 'S2']) {
        assert.equal(cross.filter(s => s.owner === owner).length, 4);
        assert.ok(cross.filter(s => s.owner === owner).every(s => f.store.get(s.resource.menuId!)?.owner !== owner));
    }
    const stale = f.sends.filter(s => s.resource.purpose === 'STALE_EDIT');
    assert.equal(stale.length, 2); assert.ok(stale.every(s => s.status === 409));
    assert.ok(stale.every(s => s.body?.expectedVersion === f.store.get(s.resource.menuId!)!.menu.version - 1));
    const cleanup = f.sends.filter(s => s.id.endsWith('_CLEANUP'));
    assert.equal(cleanup.length, 14); assert.equal(new Set(cleanup.map(s => s.resource.menuId)).size, 14);
    assert.ok(cleanup.every(s => f.created.some(c => c.id === s.resource.menuId) && s.status === 200));
    const journal = readFileSync(join(directory, 'events.jsonl'), 'utf8');
    assert.doesNotMatch(journal, /SYNTHETIC_PRIVATE|Bearer|e30\.|https:/);
    assert.ok(readdirSync(directory).includes('suite.json'));
    const before = f.sends.length; await assert.rejects(f.suite.executeCore()); assert.equal(f.sends.length, before);
}));

test('SYNTHETIC: real controller refuses owner/resource/CAS substitution before the corresponding send', async () => {
    for (const fault of ['OWNER_SWAP', 'RESOURCE_SWAP', 'CAS_SWAP'] as const) await inDirectory(async directory => {
        const f = integration(directory, fault), result = await f.suite.executeCore();
        const completedCreates = fault === 'CAS_SWAP' ? 1 : 0;
        assert.equal(result.status, 'HOLD_NO_FURTHER_WRITES'); assert.equal(f.sends.length, completedCreates);
        assert.equal(f.store.size, 1 + completedCreates); assert.equal(f.created.length, completedCreates);
        assert.ok([...f.store.values()].every(e => !e.menu.isPublished));
        assert.equal(result.arms[0].steps.length, 0);
        await assert.rejects(f.suite.executeServiceArm({ armId: 'FORBIDDEN_NEXT', cellIds: ['STOP_WITHHOLD_AFTER_RESPONSE'] }));
        assert.equal(f.sends.length, completedCreates);
    });
});

test('SYNTHETIC: unknown create outcome halts batch, controls, denials and cleanup without retry', async () => {
    for (const fault of ['FETCH_UNKNOWN', 'JSON_UNKNOWN', 'READBACK_MISMATCH'] as const) await inDirectory(async directory => {
        const f = integration(directory, fault), result = await f.suite.executeCore();
        assert.equal(result.status, 'HOLD_NO_FURTHER_WRITES'); assert.equal(f.sends.length, 1);
        assert.equal(f.store.size, 2, 'model committed the request even if the client lost its acknowledgement');
        assert.equal(f.created.length, fault === 'READBACK_MISMATCH' ? 1 : 0);
        assert.equal(result.counts.menus, fault === 'READBACK_MISMATCH' ? 2 : 1);
        assert.equal(result.counts.denialRequests, 0); assert.equal(result.arms[0].steps.length, 0);
        assert.equal(result.automaticCleanup, false); assert.equal(result.automaticRetry, false);
        assert.equal(f.pages.length, 0); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE/);
        const before = f.sends.length; await assert.rejects(f.suite.executeCore()); assert.equal(f.sends.length, before);
    });
});

test('SYNTHETIC: a 404 whose owner state changed is rejected before stale probes or private cleanup', async () => inDirectory(async directory => {
    const f = integration(directory, 'DENIAL_MUTATES'), result = await f.suite.executeCore();
    assert.equal(result.status, 'HOLD_NO_FURTHER_WRITES');
    assert.equal(f.sends.length, 60); assert.equal(f.sends.at(-1)?.status, 404);
    assert.equal(result.counts.denialRequests, 1);
    assert.equal(f.sends.some(s => s.id.endsWith('_CLEANUP')), false);
    assert.equal(f.sends.some(s => s.resource.purpose === 'STALE_EDIT'), false);
    assert.ok([...f.store.values()].some(e => e.menu.priceYen === 999));
    assert.equal(result.livePass, false);
}));

test('SYNTHETIC: first service arm uses the CORE runtime, fresh service registry, real controller phases and one sender', async () => inDirectory(async directory => {
    const f = integration(directory); assert.equal((await f.suite.executeCore()).status, 'CORE_COMPLETE_SUITE_INCOMPLETE');
    const before = f.sends.length, api = f.runtime.serviceApi;
    Object.assign(f.runtime.ports, {
        prepareServiceActor: async () => ({ owner: 'S1', identityVerified: true, separateFromClosedActors: true }),
        runServiceCell: async ({ cell }: { cell: { id: string; kind: string; mode: string } }) => {
            if (cell.mode === 'WITHHOLD_AFTER_RESPONSE') throw Error('SYNTHETIC_END_BEFORE_SECOND_PRIMARY');
            const baseline = await api.readCreationBaseline();
            assert.ok(baseline.menus.every((m: { id: string }) => f.store.get(m.id)?.owner === 'S1'));
            const menu = await api.createMenu({ id: cell.id + '_SETUP_CREATE', cellId: cell.id, purpose: 'SETUP_CREATE',
                payload: { ...projectOriginalPayloads(randomUUID()).expectedByMenu.M04, operationId: randomUUID(), isPublished: false } });
            assert.equal((await api.readMenu(menu.id)).id, menu.id);
            const evidence = { knownOutcome: true, ownerStateMatches: true, freshVersion: true };
            const published = await api.menuWrite({ id: cell.id + '_SETUP_PUBLISH', cellId: cell.id, purpose: 'SETUP_PUBLISH',
                menuId: menu.id, publicationAction: 'publish', evidence });
            const resource = { method: 'POST', path: '/api/admin/menus/' + menu.id + '/stop', menuId: menu.id,
                shopId: target.shop, beforeVersion: published.version, purpose: 'PRIMARY' };
            const permit = await f.boundary().authorize({ id: cell.id + '_PRIMARY', kind: 'MENU_WRITE', owner: 'S1',
                mode: 'BLOCK_BEFORE_FORWARD', cellId: cell.id, resource });
            assert.equal(permit.allowedForward, false); const unchanged = await api.readMenu(menu.id);
            assert.deepEqual(unchanged, published);
            const stopped = await api.menuWrite({ id: cell.id + '_CLEANUP', cellId: cell.id, purpose: 'CLEANUP', menuId: menu.id,
                publicationAction: 'stop', evidence: { ...evidence, noForwardProven: true } });
            assert.equal(stopped.isPublished, false);
            return { status: 'KNOWN_OBSERVATION', originalClaimRetained: true, clientUnknown: true, serverOutcome: 'NO_FORWARD_PROVEN',
                forwardCalls: 0, retryCalls: 0, fallbackCalls: 0, followupWrites: 0, successDisplayed: false, inputRetained: true,
                ownerApiUnchanged: true, soleSenderConfirmed: true };
        },
    });
    const result = await f.suite.executeServiceArm({ armId: 'SYNTHETIC_FIRST_SAME_A',
        cellIds: ['STOP_BLOCK_BEFORE_FORWARD', 'STOP_WITHHOLD_AFTER_RESPONSE'] });
    assert.equal(result.service.find((c: { id: string }) => c.id === 'STOP_BLOCK_BEFORE_FORWARD').status, 'NO_FORWARD_PROVEN_CLIENT_UNKNOWN');
    assert.equal(result.status, 'HOLD_NO_FURTHER_WRITES', 'the deliberately unfinished second cell is never a suite PASS');
    assert.equal(f.sends.length - before, 3); assert.equal(result.counts.sessions, 2); assert.equal(result.counts.menuWrites, 82);
    assert.equal(result.counts.menus, 22); assert.ok([...f.store.values()].every(e => !e.menu.isPublished));
    assert.equal(f.runtime.snapshot().held, false);
    assert.ok(f.sends.slice(before).every(s => s.owner === 'S1' && s.resource.purpose !== 'CORE'));
}));

test('SYNTHETIC: service API refuses core IDs, stale Shop proof and wrong exact-object bytes without fallback writes', async () => {
    for (const mode of ['CORE_ID', 'SHOP_PROOF', 'BLOB_BYTES'] as const) await inDirectory(async directory => {
        const f = integration(directory); await f.suite.executeCore(); const before = f.sends.length; let blobReads = 0;
        const api = f.runtime.serviceApi;
        const original = f.actors[0].context.request.fetch;
        f.actors[0].context.request.fetch = async (url, options) => {
            if (url.startsWith('https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com/')) {
                blobReads++; assert.equal(options?.method, 'GET'); assert.equal(options?.maxRedirects, 0); assert.equal(options?.maxRetries, 0);
                assert.equal(options?.headers, undefined, 'never deliver Preview/OIDC headers to Blob');
                return { status: () => 200, headers: () => ({ 'content-length': '1904984' }), body: async () => Buffer.alloc(1904984),
                    json: async () => ({}) } as unknown as Awaited<ReturnType<typeof original>>;
            }
            return original(url, options);
        };
        Object.assign(f.runtime.ports, {
            prepareServiceActor: async () => ({ owner: 'S1', identityVerified: true, separateFromClosedActors: true }),
            runServiceCell: async () => {
                if (mode === 'CORE_ID') await api.readMenu(f.t1FixtureId);
                if (mode === 'SHOP_PROOF') {
                    const before = await api.readShop(), forged = { ...before, note: 'SYNTHETIC_CONCURRENT_CHANGE' };
                    await api.shopWrite({ id: 'SHOP_RESTORE', cellId: 'SHOP_SAVE_WITHHOLD_AFTER_RESPONSE', purpose: 'RESTORE',
                        before: forged, expectedOwnAfter: forged, values: { note: before.note, coverImageUrl: before.coverImageUrl },
                        evidence: { knownOutcome: true, ownerStateMatches: true, freshUpdatedAt: true, ownChangeMatches: true, noConcurrentChange: true } });
                }
                if (mode === 'BLOB_BYTES') {
                    const pathname = 'menu-images/' + target.shop + '/SYNTHETIC.png';
                    const url = 'https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com/' + pathname;
                    await api.observeKnownBlob({ kind: 'menu', url, pathname, objectSha256: createHash('sha256').update(url).digest('hex'), requestId: randomUUID() });
                }
                assert.fail('invalid API request must not reach a service result');
            },
        });
        const result = await f.suite.executeServiceArm({ armId: 'SYNTHETIC_API_REFUSAL', cellIds: ['SHOP_SAVE_WITHHOLD_AFTER_RESPONSE'] });
        assert.equal(result.status, 'HOLD_NO_FURTHER_WRITES'); assert.equal(f.runtime.snapshot().held, true);
        assert.equal(f.sends.length, before); assert.equal(blobReads, mode === 'BLOB_BYTES' ? 1 : 0);
        await assert.rejects(api.readShop()); assert.equal(f.sends.length, before);
        assert.ok([...f.store.values()].every(e => !e.menu.isPublished));
    });
});
