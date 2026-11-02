// Callable Playwright adapter only. No CLI/auth acquisition/default network sender.
// Setup and terminal reconciliation remain with the single managed-suite owner.
import { createHash, randomUUID } from 'node:crypto';

export const serviceBrowserApplication = Object.freeze({
    source: '8bf5bea476d5cf5a8dd6ac38713a2d393d7460b1',
    deployment: 'dpl_14PXhbZ9EnKuiL2kTQwbuU7d5ebo',
    origin: 'https://clear-allergy-e2e-qs7v9eaim-kaitoexe00-9350s-projects.vercel.app',
});
export const serviceBrowserImage = Object.freeze({ bytes: 1904984,
    sha256: '0dd35a26a11cd90536b1610ce8d5d04bd6933b456602264d53f209a58e83add6',
    origin: 'https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com' });
const kinds = ['MENU_CREATE', 'MENU_SAVE', 'STOP', 'MENU_UPLOAD', 'SHOP_SAVE', 'SHOP_UPLOAD'];
const modes = ['DELIVER', 'BLOCK_BEFORE_FORWARD', 'WITHHOLD_AFTER_RESPONSE'];
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_k, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const check = value => { if (!value) throw Error('SERVICE_BROWSER_HELD'); };
const mutation = method => !['GET', 'HEAD', 'OPTIONS'].includes(method);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
// Exact 8bf ShopEditClient formValues + uploadSelectedImage wire projection.
// In-memory only: never emit this full payload or the source Shop record.
export function expectedServiceShopPayload(before, changes = {}) {
    check(before && typeof before.name === 'string' && typeof before.updatedAt === 'string'
        && Number.isFinite(Date.parse(before.updatedAt)) && Object.keys(changes).every(k => ['note', 'coverImageUrl'].includes(k)));
    const text = key => { check(before[key] === null || typeof before[key] === 'string'); return (before[key] ?? '').trim(); };
    const hoursText = text('hours'), weekday = hoursText.match(/(?:^|\n)\s*平日\s*[:：]?\s*([^\n]+)/),
        holiday = hoursText.match(/(?:^|\n)\s*(?:土日祝|土日|休日)\s*[:：]?\s*([^\n]+)/);
    const hours = weekday || holiday ? [weekday?.[1]?.trim() ? '平日 ' + weekday[1].trim() : null,
        holiday?.[1]?.trim() ? '土日祝 ' + holiday[1].trim() : null].filter(Boolean).join('\n') : hoursText;
    const note = Object.hasOwn(changes, 'note') ? changes.note : before.note;
    const cover = Object.hasOwn(changes, 'coverImageUrl') ? changes.coverImageUrl : before.coverImageUrl;
    check((note === null || typeof note === 'string') && (cover === null || typeof cover === 'string'));
    check(['latitude', 'longitude'].every(k => before[k] === null || Number.isFinite(before[k]))
        && (before.googlePlaceId === null || typeof before.googlePlaceId === 'string')
        && (before.averageBudgetYen === null || Number.isSafeInteger(before.averageBudgetYen)));
    for (const key of ['coverImageFrame', 'coverImageFit', 'coverImagePosition', 'coverImageZoom', 'coverImagePositionX', 'coverImagePositionY']) check(before[key] !== undefined);
    return { name: before.name.trim(), description: text('description'), address: text('address'), prefecture: text('prefecture'),
        city: text('city'), nearestStation: text('nearestStation'), category: text('category'), latitude: before.latitude,
        longitude: before.longitude, googlePlaceId: before.googlePlaceId, hours, regularHoliday: text('regularHoliday'),
        phoneNumber: text('phoneNumber'), note: (note ?? '').trim(), averageBudgetYen: before.averageBudgetYen?.toString().trim() ?? '',
        coverImageUrl: (cover ?? '').trim() || null, coverImageFrame: before.coverImageFrame, coverImageFit: before.coverImageFit,
        coverImagePosition: before.coverImagePosition, coverImageZoom: before.coverImageZoom,
        coverImagePositionX: before.coverImagePositionX, coverImagePositionY: before.coverImagePositionY, expectedUpdatedAt: before.updatedAt };
}
async function bounded(promise, ms) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('SERVICE_BROWSER_TIMEOUT_HELD')), ms); })]); }
    finally { clearTimeout(timer); }
}
// Evaluate this function in the owned page. Expected outcome/mode never masks
// a success message: even a blocked upload reporting success must be visible.
export function observeServiceDom({ expected, inputSelector, fileSelector, imageSelector, createdId, knownObjectUrl, followupWrites }) {
    const field = document.querySelector(inputSelector), file = document.querySelector(fileSelector);
    const image = document.querySelector(imageSelector), text = document.body.innerText;
    return { inputRetained: field?.value === String(expected), fileRetained: file?.files?.length === 1,
        successDisplayed: /保存しました|店舗情報を保存しました|公開停止を保存しました/.test(text)
            || !!createdId && !!document.querySelector(`a[href="/admin/menus/${createdId}/edit"]`),
        uploadUrlReflected: !!knownObjectUrl && image?.value === knownObjectUrl,
        savePending: /保存中|作成中|アップロード中/.test(text), followupWrites };
}
export function assertUploadUiObservation(observed, uploadTransportAcknowledged, parkedSaveObserved = false) {
    check(observed && typeof observed.successDisplayed === 'boolean' && typeof observed.savePending === 'boolean'
        && typeof observed.uploadUrlReflected === 'boolean');
    // An upload acknowledgement does not constitute completion of the parked save.
    check(observed.successDisplayed === false);
    if (parkedSaveObserved) check(uploadTransportAcknowledged === true && observed.uploadUrlReflected === true && observed.savePending === true);
}
export function serviceBrowserRequestPolicy(cell, fixture) {
    check(kinds.includes(cell.kind) && modes.includes(cell.mode) && cell.id === cell.kind + '_' + cell.mode);
    if (cell.kind === 'MENU_CREATE') return { method: 'POST', path: '/api/admin/menus' };
    if (cell.kind.endsWith('_UPLOAD')) return { method: 'POST', path: '/api/admin/upload-' + (cell.kind === 'MENU_UPLOAD' ? 'menu' : 'shop') + '-image' };
    if (cell.kind === 'SHOP_SAVE') return { method: 'PUT', path: '/api/admin/shop' };
    check(/^c[a-z0-9]+$/.test(fixture.menuId || ''));
    return { method: cell.kind === 'STOP' ? 'POST' : 'PUT', path: '/api/admin/menus/' + fixture.menuId + (cell.kind === 'STOP' ? '/stop' : '') };
}

// Required ports are explicit; missing integration never synthesizes a success.
// prepareCell returns setup fixture/own baseline/inputs, after its guarded setup writes.
// finishCell performs only separately authorized publish/STOP/restore and returns
// {known:true, private:true}; SHOP_UPLOAD/DELIVER deliberately parks the next PUT.
export function prepareManagedServiceBrowser({ actor, target, scope, image, ports }) {
    check(actor?.owner === 'S1' && actor.context && actor.page && actor.access && ports && scope);
    for (const key of ['source', 'deployment', 'origin']) check(target?.[key] === serviceBrowserApplication[key]);
    check(scope.applicationSha === target.source && /^c[a-z0-9]+$/.test(scope.shopId || ''));
    let page, active = false, held = false, parked, cellState, currentHandler;
    const tracker = actor.lifecycle?.tracker;
    const required = ['prepareCell', 'finishCell', 'verifyActor', 'readOwner', 'claimPrivate', 'emit', 'prepareWriteObservation', 'oidcHeaders'];
    const verify = async () => { check(!held); await ports.verifyActor(actor, target); };
    const abort = async route => { await route.abort('failed'); };
    const frameCheck = route => {
        const frame = route.request().frame();
        check(page && page.context() === actor.context && frame === page.mainFrame() && frame.page() === page);
    };
    const emit = async event => { await ports.emit(event); };
    const resource = (cell, fixture, purpose, request) => ({ method: request.method, path: request.path,
        shopId: scope.shopId, purpose,
        ...(cell.kind === 'MENU_CREATE' && purpose === 'PRIMARY' ? { creationOperationId: fixture.creationOperationId } : {}),
        ...(fixture.menuId && !['MENU_CREATE', 'SHOP_SAVE', 'SHOP_UPLOAD'].includes(cell.kind) ? { menuId: fixture.menuId } : {}),
        ...(['MENU_SAVE', 'STOP'].includes(cell.kind) ? { beforeVersion: fixture.before.version } : {}),
        ...(cell.kind === 'SHOP_SAVE' ? { beforeUpdatedAt: fixture.before.updatedAt } : {}) });
    const send = async (route, permit, actual, consumeSendPermission) => {
        frameCheck(route); await verify();
        check(route.request().method() === actual.method && route.request().url() === target.origin + actual.path);
        const headers = await ports.oidcHeaders(target.origin + actual.path, await route.request().allHeaders(), actor.access.token());
        frameCheck(route); check(permit.allowedForward === true);
        consumeSendPermission({ id: permit.id, resource: actual });
        return route.fetch({ headers, maxRedirects: 0, maxRetries: 0, timeout: 20000 });
    };
    const ui = async (fixture, cell) => {
        // Return booleans only; DOM text/input values never enter artifacts.
        const shop = cell.kind.startsWith('SHOP'), create = cell.kind === 'MENU_CREATE';
        const observed = await page.evaluate(observeServiceDom, { expected: shop ? fixture.note : create ? fixture.name : fixture.priceYen,
            inputSelector: shop ? '#shop-note' : create ? '#new-menu-field-1' : '#edit-menu-field-2',
            fileSelector: shop ? '#shop-cover-image-file' : create ? '#new-menu-field-7' : '#edit-menu-field-7',
            imageSelector: shop ? '#shop-cover-image-url' : create ? '#new-menu-field-8' : '#edit-menu-field-8',
            createdId: cellState.createdId || null, knownObjectUrl: cellState.objectRef?.url || null,
            followupWrites: cellState.followupWrites });
        cellState.uiObservation = { ...observed, uploadTransportAcknowledged: !!cellState.objectRef };
        if (cell.kind.endsWith('_UPLOAD')) assertUploadUiObservation(observed, !!cellState.objectRef, !!parked);
        return observed;
    };
    const bindRoute = async (route, cell, fixture, authorize, consumeSendPermission, recordCreated) => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if (!mutation(method)) return route.fallback(); // Existing context transport owns every read.
        frameCheck(route); check(url.origin === target.origin && !url.search && !url.hash && !url.username && !url.password);
        const expected = serviceBrowserRequestPolicy(cell, fixture);
        const setupUpload = cell.kind === 'MENU_CREATE' && cell.mode === 'DELIVER' && method === 'POST' && url.pathname === '/api/admin/upload-menu-image';
        if (setupUpload) {
            check(!cellState.setupUpload && !cellState.primary); cellState.setupUpload = true;
            const actual = { method, path: url.pathname, shopId: scope.shopId, purpose: 'SETUP_UPLOAD' };
            const permit = await authorize({ id: cell.id + '_SETUP_UPLOAD', kind: 'BLOB_UPLOAD', owner: 'S1', mode: 'DELIVER', cellId: cell.id, resource: actual });
            const response = await send(route, permit, actual, consumeSendPermission);
            check(response.status() === 200); const body = await response.json();
            const object = new URL(body?.url);
            check(object.origin === serviceBrowserImage.origin && !object.username && !object.password && !object.search && !object.hash
                && object.pathname.startsWith('/menu-images/' + scope.shopId + '/') && object.pathname === '/' + body.pathname
                && !object.pathname.includes('%') && typeof ports.recordSetupObject === 'function');
            const requestId = response.headers()['x-request-id'];
            check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId || ''));
            check(await ports.recordSetupObject({ stage: 'KNOWN_SETUP_BLOB_RETAIN', kind: 'menu', url: object.href,
                pathname: body.pathname, objectSha256: sha(object.href), requestId }) === true);
            await route.fulfill({ response }); return;
        }
        const followup = cell.kind.endsWith('_UPLOAD') && cell.mode === 'DELIVER' && method === 'PUT'
            && url.pathname === (cell.kind === 'SHOP_UPLOAD' ? '/api/admin/shop' : '/api/admin/menus/' + fixture.menuId);
        if (followup) {
            check(cellState.primary && !parked); const release = deferred();
            parked = { route, request, fixture, cell, release }; cellState.parkReady.resolve(true);
            await release.promise; return;
        }
        if (method !== expected.method || url.pathname !== expected.path || cellState.primary) {
            cellState.unexpectedWrites++; await abort(route); return;
        }
        cellState.primary = true;
        const bytes = request.postDataBuffer() || Buffer.alloc(0);
        check(bytes.length <= 6 * 1024 * 1024);
        if (cell.kind === 'MENU_SAVE') check(JSON.parse(bytes.toString('utf8')).expectedVersion === fixture.before.version);
        if (cell.kind === 'STOP') {
            // 8bf's normal UI sends an empty POST, not a version-bearing body.
            // Fresh own-state equality is evidence only; this is not atomic CAS.
            check(bytes.length === 0 && canonical(await ports.readOwner({ kind: cell.kind, menuId: fixture.menuId })) === canonical(fixture.before));
        }
        if (cell.kind === 'SHOP_SAVE') check(fixture.expectedShopPayload
            && canonical(JSON.parse(bytes.toString('utf8'))) === canonical(fixture.expectedShopPayload));
        if (cell.kind === 'MENU_CREATE') {
            const data = JSON.parse(bytes.toString('utf8'));
            check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.operationId || '')
                && data.name === fixture.name && data.isPublished === false);
            fixture.creationOperationId = data.operationId; // Actual UI-generated ID, never rewritten on the wire.
        }
        const actual = resource(cell, fixture, 'PRIMARY', expected);
        const permit = await authorize({ id: cell.id + '_PRIMARY', kind: cell.kind === 'MENU_CREATE' ? 'MENU_CREATE'
            : cell.kind === 'SHOP_SAVE' ? 'SHOP_WRITE' : cell.kind.endsWith('_UPLOAD') ? 'BLOB_UPLOAD' : 'MENU_WRITE',
            owner: 'S1', mode: cell.mode, cellId: cell.id, resource: actual });
        cellState.claimRetained = true;
        cellState.primaryClaimId = permit.id;
        let response, createdId;
        const observer = ports.prepareWriteObservation({ scope, target: { kind: cell.kind, ...expected, bodySha256: sha(bytes),
            ...(fixture.menuId ? { menuId: fixture.menuId } : {}), ...(fixture.before?.version !== undefined ? { beforeVersion: fixture.before.version } : {}),
            ...(fixture.before?.updatedAt ? { beforeUpdatedAt: fixture.before.updatedAt } : {}),
            ...(cell.kind === 'MENU_CREATE' ? { creationOperationId: fixture.creationOperationId } : {}) }, mode: cell.mode,
            fileExpected: fixture.fileExpected === true,
            ...(cell.kind.endsWith('_UPLOAD') ? { upload: { origin: serviceBrowserImage.origin, fixtureSha256: serviceBrowserImage.sha256, fixtureBytes: serviceBrowserImage.bytes } } : {}),
            adapter: {
                assertScope: verify,
                claim: async () => permit.allowedForward === (cell.mode !== 'BLOCK_BEFORE_FORWARD'),
                forwardOnce: async () => {
                    cellState.forwardCalls++; response = await send(route, permit, actual, consumeSendPermission);
                    cellState.rawResponse = response; // In-memory only; never serialized.
                    check(response.status() < 300 || response.status() >= 400);
                    if (cell.kind === 'MENU_CREATE' && response.status() === 201) {
                        const body = await response.json();
                        if (/^c[a-z0-9]+$/.test(body?.id || '')) {
                            createdId = body.id; cellState.createdId = createdId;
                            recordCreated({ operationId: permit.id, id: createdId });
                            check(await ports.claimPrivate({ stage: 'CREATED_201_BEFORE_CORRELATION', operationId: fixture.creationOperationId, menuId: createdId }) === true);
                        }
                    }
                    return { status: () => response.status(), json: () => response.json(), requestId: async () => response.headers()['x-request-id'] ?? null };
                },
                deliverOnce: async () => { frameCheck(route); await route.fulfill({ response }); },
                abortClient: async () => { cellState.abortCalls++; await abort(route); },
                observeUi: async () => {
                    if (cell.kind.endsWith('_UPLOAD') && cell.mode === 'DELIVER') {
                        await bounded(cellState.parkReady.promise, 15000);
                        check(cellState.objectRef && await page.locator(cell.kind === 'SHOP_UPLOAD' ? '#shop-cover-image-url' : '#edit-menu-field-8').inputValue() === cellState.objectRef.url);
                    }
                    else await page.waitForFunction(({ kind, createdId }) => document.querySelector('[role="alert"]')
                        || /保存しました|公開停止を保存しました|店舗情報を保存しました/.test(document.body.innerText)
                        || kind === 'MENU_CREATE' && createdId && !!document.querySelector(`a[href="/admin/menus/${createdId}/edit"]`),
                    { kind: cell.kind, createdId: cellState.createdId || null }, { timeout: 15000 });
                    return ui(fixture, cell);
                },
                record: emit,
                recordKnownObject: async ref => {
                    const recorded = await ports.claimPrivate({ ...ref, stage: 'KNOWN_RUN_BLOB_RETAIN' });
                    if (recorded === true) cellState.objectRef = ref;
                    return recorded;
                },
            } });
        const result = await observer.execute({ method, path: url.pathname, bodySha256: sha(bytes) });
        cellState.observer = observer; cellState.result.resolve({ result, createdId });
    };
    return {
        async runServiceCell({ cell, authorize, consumeSendPermission, recordCreated }) {
            if (required.some(key => typeof ports[key] !== 'function') || !['wrap', 'drain', 'snapshot'].every(key => typeof tracker?.[key] === 'function'))
                return { status: 'NOT_IMPLEMENTED', code: 'SERVICE_BROWSER_PORT_MISSING' };
            if (cell?.id === 'MENU_CREATE_DELIVER' && typeof ports.recordSetupObject !== 'function')
                return { status: 'NOT_IMPLEMENTED', code: 'SERVICE_BROWSER_SETUP_OBJECT_PORT_MISSING' };
            check(!active && !held); active = true;
            let fixture, returned;
            cellState = { result: deferred(), parkReady: deferred(), primary: false, forwardCalls: 0, abortCalls: 0,
                followupWrites: 0, unexpectedWrites: 0, claimRetained: false };
            try {
                check(typeof authorize === 'function' && typeof consumeSendPermission === 'function' && typeof recordCreated === 'function');
                await verify();
                fixture = await ports.prepareCell({ cell, authorize, consumeSendPermission, recordCreated });
                check(fixture && fixture.before !== undefined);
                const resumeShop = cell.id === 'SHOP_SAVE_DELIVER' && parked?.cell.id === 'SHOP_UPLOAD_DELIVER';
                if (!page) {
                    page = await actor.context.newPage();
                    await page.route('**/*', tracker.wrap(async route => {
                        try {
                            const request = route.request();
                            if (request.url() === target.origin + '/_vercel/insights/script.js' && request.method() === 'GET' && request.resourceType() === 'script')
                                return await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
                            if (!mutation(request.method())) return await route.fallback();
                            if (!active || !currentHandler || held) { held = true; await abort(route); return; }
                            return await currentHandler(route);
                        } catch {
                            held = true; try { await abort(route); } catch { /* never expose provider text */ }
                            cellState?.result.resolve({ failed: true });
                        }
                    }));
                }
                check(page.context() === actor.context);
                const shop = cell.kind.startsWith('SHOP');
                if (!resumeShop) {
                    check(!parked);
                    const path = shop ? '/admin/shop' : cell.kind === 'MENU_CREATE' ? '/admin/menus/new' : '/admin/menus/' + fixture.menuId + '/edit';
                    await page.goto(target.origin + path, { waitUntil: 'load', timeout: 20000 });
                    check(page.url() === target.origin + path);
                    if (cell.kind === 'MENU_CREATE') {
                        check(fixture.name?.startsWith('【架空') && fixture.name.includes(scope.runId));
                        await page.locator('#new-menu-field-1').fill(fixture.name);
                        await page.locator('#new-menu-field-2').fill(String(fixture.priceYen));
                        await page.locator('#new-menu-field-5').fill(fixture.ingredients);
                        check(Array.isArray(fixture.allergens) && fixture.allergens.length === 29);
                        const labels = { FREE: '原材料に含まない登録', CONTAINS: '含む', UNKNOWN: '未設定', MAY_CONTAIN: '含む可能性あり・要確認' };
                        for (const a of fixture.allergens) { check(labels[a.status]); await page.getByRole('group', { name: a.nameJa, exact: true }).getByRole('button', { name: labels[a.status], exact: true }).click(); }
                    } else if (shop) await page.locator('#shop-note').fill(fixture.note);
                    else if (cell.kind === 'MENU_SAVE') await page.locator('#edit-menu-field-2').fill(String(fixture.priceYen));
                    if (cell.kind.endsWith('_UPLOAD') || cell.id === 'MENU_CREATE_DELIVER') {
                        check(Buffer.isBuffer(image?.buffer) && image.buffer.length === serviceBrowserImage.bytes && sha(image.buffer) === serviceBrowserImage.sha256);
                        await page.locator(shop ? '#shop-cover-image-file' : cell.kind === 'MENU_CREATE' ? '#new-menu-field-7' : '#edit-menu-field-7')
                            .setInputFiles({ name: 'cion_notxt.png', mimeType: 'image/png', buffer: image.buffer });
                        fixture.fileExpected = true;
                    }
                }
                currentHandler = route => bindRoute(route, cell, fixture, authorize, consumeSendPermission, recordCreated)
                    .catch(async () => { held = true; try { await abort(route); } catch { /* no retry */ } cellState.result.resolve({ failed: true }); });
                if (resumeShop) {
                    const pending = parked; parked = null;
                    void bindRoute(pending.route, cell, fixture, authorize, consumeSendPermission, recordCreated)
                        .then(() => pending.release.resolve(), () => { held = true; pending.release.resolve(); cellState.result.resolve({ failed: true }); });
                } else if (cell.kind === 'STOP') {
                    page.once('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss());
                    await page.getByRole('button', { name: '公開を停止する', exact: true }).click();
                } else if (shop) await page.locator('form').getByRole('button', { name: '変更を保存', exact: true }).click();
                else if (cell.kind === 'MENU_CREATE') await page.locator('form button[type="submit"]').first().click();
                else await page.getByRole('button', { name: '保存する', exact: true }).click();
                const observed = await bounded(cellState.result.promise, 45000);
                check(!observed.failed && !held && cellState.unexpectedWrites === 0);
                const source = observed.result; cellState.source = source;
                const after = await ports.readOwner({ kind: cell.kind, menuId: observed.createdId || fixture.menuId });
                if (cell.mode === 'BLOCK_BEFORE_FORWARD') {
                    const proof = { status: 'KNOWN_NO_FORWARD', clientUnknown: true, serverOutcome: 'NO_FORWARD_PROVEN',
                        forwardCalls: cellState.forwardCalls, retryCalls: 0, fallbackCalls: 0, followupWrites: cellState.followupWrites,
                        successDisplayed: source.ui?.successDisplayed, inputRetained: source.ui?.inputRetained,
                        ...(cell.kind.endsWith('_UPLOAD') ? { fileRetained: source.ui?.fileRetained } : {}),
                        ownerApiUnchanged: canonical(after) === canonical(fixture.before), soleSenderConfirmed: cellState.unexpectedWrites === 0 && cellState.abortCalls === 1,
                        uiObservation: cellState.uiObservation,
                        originalClaimRetained: cellState.claimRetained, source };
                    check(proof.forwardCalls === 0 && proof.ownerApiUnchanged && proof.soleSenderConfirmed && proof.inputRetained && !proof.successDisplayed
                        && (!cell.kind.endsWith('_UPLOAD') || proof.fileRetained));
                    const finished = await ports.finishCell({ cell, fixture, result: proof, authorize, consumeSendPermission, recordCreated });
                    check(finished?.known === true); returned = proof; return returned;
                }
                if (cell.mode === 'WITHHOLD_AFTER_RESPONSE') {
                    if (typeof ports.retainHeldCell === 'function') await ports.retainHeldCell({ cell, fixture, source,
                        primaryClaimId: cellState.primaryClaimId, createdMenuId: cellState.createdId,
                        knownObject: cellState.objectRef,
                        validatedResponse: source.bodyValidated && cellState.rawResponse ? await cellState.rawResponse.json() : null });
                    held = true; returned = { status: 'HOLD', clientUnknown: true,
                    originalClaimRetained: cellState.claimRetained, forwardCalls: cellState.forwardCalls, followupWrites: 0,
                    ...(cellState.createdId ? { createdMenuId: cellState.createdId } : {}), uiObservation: cellState.uiObservation, source }; return returned; }
                check(source.clientDelivery === 'DELIVERY_CONFIRMED' && source.bodyValidated && !source.clientUnknown && cellState.forwardCalls === 1);
                const finished = await ports.finishCell({ cell, fixture, result: source, after, authorize, consumeSendPermission, recordCreated,
                    ...(cellState.objectRef ? { knownObject: Object.freeze({ ...cellState.objectRef }) } : {}),
                    getParkedSubmission: () => {
                        check(parked?.cell.id === cell.id); const request = parked.request;
                        return { method: request.method(), path: new URL(request.url()).pathname,
                            body: Buffer.from(request.postDataBuffer() || Buffer.alloc(0)) }; // Never state/artifact data.
                    },
                    parked: !!parked, releaseFollowup: async ({ actualResource, permit }) => {
                        check(parked?.cell.id === cell.id && cell.kind === 'MENU_UPLOAD' && actualResource.purpose === 'FOLLOWUP_SAVE'
                            && actualResource.menuId === fixture.menuId && actualResource.shopId === scope.shopId);
                        const data = JSON.parse(parked.request.postDataBuffer().toString('utf8'));
                        check(data.expectedVersion === actualResource.beforeVersion && data.imageUrl === cellState.objectRef?.url);
                        const pending = parked; const response = await send(pending.route, permit, actualResource, consumeSendPermission);
                        check(response.status() === 200); await pending.route.fulfill({ response }); parked = null; pending.release.resolve(); return response;
                    } });
                check(finished?.known === true);
                returned = { status: 'KNOWN_OBSERVATION', clientUnknown: false, bodyValidated: true, originalClaimRetained: cellState.claimRetained,
                    forwardCalls: 1, followupWrites: 0, source, uiObservation: cellState.uiObservation, parkedWriteAwaitingNextCell: !!parked,
                    ...(cell.kind === 'STOP' ? { concurrencyProtection: 'FRESH_READ_AND_REQUEST_IDENTITY_ONLY_NOT_ATOMIC_CAS' } : {}),
                    setupAndFollowup: 'SEPARATE_AUTHORIZED_PORTS_NOT_PRIMARY_UI_PASS' }; return returned;
            } catch {
                held = true;
                if (cell.mode === 'WITHHOLD_AFTER_RESPONSE' && cellState.primaryClaimId && typeof ports.retainHeldCell === 'function') {
                    try { await ports.retainHeldCell({ cell, fixture, source: { bodyValidated: false },
                        primaryClaimId: cellState.primaryClaimId, createdMenuId: cellState.createdId, knownObject: cellState.objectRef,
                        validatedResponse: null }); } catch { /* retain original HOLD; no service operation */ }
                }
                returned = { status: 'HOLD', code: 'SERVICE_BROWSER_UNVERIFIED', clientUnknown: true,
                originalClaimRetained: cellState.claimRetained, forwardCalls: cellState.forwardCalls, followupWrites: cellState.followupWrites,
                ...(cellState.source ? { source: cellState.source } : {}),
                ...(cellState.uiObservation ? { uiObservation: cellState.uiObservation } : {}),
                ...(cellState.createdId ? { createdMenuId: cellState.createdId } : {}) }; return returned; }
            finally {
                active = false; currentHandler = null; // Idle/late mutations remain blocked, never fall back.
                if (!parked && page) {
                    try {
                        await bounded(page.close({ runBeforeUnload: false }), 15000); check(page.isClosed());
                        const drain = await tracker.drain(), state = tracker.snapshot();
                        check(drain.status === 'QUIET_CONFIRMED' && state.pending === 0 && state.started === state.settled);
                        page = undefined;
                    } catch { held = true; if (returned) { returned.status = 'HOLD'; returned.code = 'SERVICE_PAGE_CLOSE_OR_DRAIN_UNVERIFIED'; } }
                }
                if (held && returned && returned.status !== 'HOLD') { returned.status = 'HOLD'; returned.code = 'SERVICE_LATE_WRITE_OR_GUARD_HELD'; }
            }
        },
        async close() {
            if (parked) { held = true; const pending = parked; parked = null; try { await abort(pending.route); } catch { /* unverified */ } pending.release.resolve(); }
            try {
                if (page) await bounded(page.close({ runBeforeUnload: false }), 15000);
                const drain = await tracker.drain(), state = tracker.snapshot();
                check(drain.status === 'QUIET_CONFIRMED' && state.pending === 0 && state.started === state.settled);
                return { ownedPageClosed: !page || page.isClosed(), routesDrained: true, managedHeld: held };
            }
            catch { held = true; return { ownedPageClosed: false, managedHeld: true }; }
        },
    };
}

// Root-owned API is the sole sender for setup/publication/restoration. The
// browser adapter remains the only sender for PRIMARY and SETUP_UPLOAD routes.
// State is a safe checkpoint projection, never a Shop response or HTTP capture.
export function createManagedServicePreparation({ api, state = {}, runId, menuTemplate, allergens,
    shopId = 'cmvs4x80y000twn0wbxkwzbt6' }) {
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId || '')
        && shopId === 'cmvs4x80y000twn0wbxkwzbt6' && api && menuTemplate?.priceYen === 800 && menuTemplate.ingredients === '米、水'
        && Array.isArray(allergens) && allergens.length === 29 && new Set(allergens.map(a => a.slug)).size === 29
        && Object.keys(menuTemplate.allergenStatusBySlug || {}).length === 29
        && allergens.every(a => typeof a.nameJa === 'string' && menuTemplate.allergenStatusBySlug[a.slug] === 'FREE'));
    check(Object.keys(state).every(k => ['version', 'runId', 'cells', 'normalShopObject'].includes(k)));
    if (state.runId !== undefined) check(state.runId === runId && state.version === 1);
    state.version = 1; state.runId = runId; state.cells ??= {};
    const template = structuredClone(menuTemplate), master = structuredClone(allergens), prepared = new Map();
    let currentCell;
    const need = name => { check(typeof api[name] === 'function'); return api[name]; };
    const food = menu => ({ name: menu.name, description: menu.description, category: menu.category, priceYen: menu.priceYen,
        ingredients: menu.ingredients, precaution: menu.precaution, imageUrl: menu.imageUrl,
        imageFrame: menu.imageFrame, imageFit: menu.imageFit, imagePosition: menu.imagePosition, imageZoom: menu.imageZoom,
        imagePositionX: menu.imagePositionX, imagePositionY: menu.imagePositionY,
        allergenStatusBySlug: Object.fromEntries(menu.allergens.map(a => [a.slug, a.status])) });
    const isMenu = menu => check(menu && /^c[a-z0-9]+$/.test(menu.id || '') && Number.isSafeInteger(menu.version)
        && Number.isSafeInteger(menu.foodVersion) && typeof menu.isPublished === 'boolean' && Array.isArray(menu.allergens)
        && menu.allergens.length === 29 && new Set(menu.allergens.map(a => a.slug)).size === 29
        && master.every(a => menu.allergens.some(x => x.slug === a.slug)));
    const stableShop = shop => { const copy = structuredClone(shop); delete copy.note; delete copy.coverImageUrl; delete copy.updatedAt; return canonical(copy); };
    const sameOptionalText = (a, b) => (a ?? '') === (b ?? '');
    const entryFor = cell => { check(state.cells[cell.id]); return state.cells[cell.id]; };
    const knownRef = ref => {
        const url = new URL(ref?.url);
        check(url.origin === serviceBrowserImage.origin && !url.username && !url.password && !url.search && !url.hash && !url.port
            && url.href === ref.url && url.pathname === '/' + ref.pathname && !url.pathname.includes('%')
            && ['menu', 'shop'].includes(ref.kind)
            && url.pathname.startsWith(ref.kind === 'menu' ? '/menu-images/' + shopId + '/' : '/shops/' + shopId + '/cover-')
            && ref.objectSha256 === sha(ref.url)
            && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.requestId || ''));
        return { url: ref.url, pathname: ref.pathname, objectSha256: ref.objectSha256, requestId: ref.requestId,
            kind: ref.kind };
    };
    const observeObject = async ref => {
        const got = await need('observeKnownBlob')(Object.freeze(structuredClone(ref)));
        check(got?.status === 200 && got.sha256 === serviceBrowserImage.sha256 && got.bytes === serviceBrowserImage.bytes);
    };
    const evidence = () => ({ knownOutcome: true, ownerStateMatches: true, freshVersion: true });
    const writeMenu = async (cell, menuId, purpose, publicationAction, extraEvidence = {}, expectedFood = entryFor(cell).fixtureFood) => {
        const before = await readFixture(menuId, expectedFood);
        const got = await need('menuWrite')({ id: cell.id + '_' + purpose, cellId: cell.id, purpose, menuId,
            publicationAction, evidence: { ...evidence(), ...extraEvidence } });
        isMenu(got); check(got.id === menuId && got.version > before.version && got.foodVersion === before.foodVersion
            && canonical(food(got)) === canonical(expectedFood) && got.isPublished === (publicationAction === 'publish'));
        entryFor(cell).lastKnown = { version: got.version, foodVersion: got.foodVersion, isPublished: got.isPublished };
        return got;
    };
    const readFixture = async (id, expectedFood) => {
        const got = await need('readMenu')(id); isMenu(got); check(got.id === id);
        if (expectedFood) check(canonical(food(got)) === canonical(expectedFood)); return got;
    };
    const retain = (entry, stage) => { entry.status = stage; };
    const fixedFailure = entry => { if (entry) retain(entry, 'HOLD_NO_AUTOMATIC_RETRY_OR_CLEANUP'); throw Error('SERVICE_PREPARATION_HELD'); };
    return {
        async prepareCell({ cell }) {
            let entry;
            try {
                serviceBrowserRequestPolicy(cell, { menuId: 'cshapecheck' });
                check(!state.cells[cell.id]); currentCell = cell;
                entry = state.cells[cell.id] = { status: 'PREPARING', kind: cell.kind, mode: cell.mode };
                const name = `【架空・Issue118 service】${runId} ${cell.id} M04`;
                const payload = { ...structuredClone(template), name, imageUrl: null };
                if (!cell.kind.startsWith('SHOP')) entry.fixtureFood = payload;
                let fixture;
                if (cell.kind === 'MENU_CREATE') {
                    const before = cell.mode === 'BLOCK_BEFORE_FORWARD' ? await need('readCreationBaseline')() : { creationNotYetObserved: true };
                    fixture = { before, name, priceYen: 800, ingredients: payload.ingredients,
                        allergens: master.map(a => ({ ...a, status: payload.allergenStatusBySlug[a.slug] })) };
                } else if (cell.kind.startsWith('SHOP')) {
                    const before = await need('readShop')(); check(before?.id === shopId && typeof before.updatedAt === 'string');
                    const shopNoteCell = cell.id === 'SHOP_SAVE_DELIVER' ? 'SHOP_UPLOAD_DELIVER' : cell.id;
                    if (cell.id === 'SHOP_SAVE_DELIVER') check(state.cells.SHOP_UPLOAD_DELIVER?.status === 'UPLOAD_ACK_SAVE_PARKED');
                    const note = `【架空・Issue118 service】${runId} ${shopNoteCell}`;
                    entry.restoreOriginal = { note: before.note, coverImageUrl: before.coverImageUrl };
                    const coverImageUrl = state.normalShopObject?.url ?? before.coverImageUrl;
                    fixture = { before, note, expectedShopPayload: expectedServiceShopPayload(before, { note, coverImageUrl }) };
                } else {
                    const operationId = randomUUID(); entry.creationOperationId = operationId;
                    let menu = await need('createMenu')({ id: cell.id + '_SETUP_CREATE', cellId: cell.id, purpose: 'SETUP_CREATE',
                        payload: { ...payload, operationId, isPublished: false } });
                    isMenu(menu); check(!menu.isPublished && canonical(food(menu)) === canonical(payload));
                    entry.menuId = menu.id;
                    if (cell.kind === 'STOP') {
                        menu = await writeMenu(cell, menu.id, 'SETUP_PUBLISH', 'publish');
                        check(menu.isPublished && menu.publicationConfirmedFoodVersion === menu.foodVersion);
                    }
                    fixture = { before: menu, menuId: menu.id, name, priceYen: cell.kind === 'MENU_SAVE' ? 801 : 800 };
                }
                prepared.set(cell.id, fixture); retain(entry, 'PREPARED_NOT_EXECUTED'); return fixture;
            } catch { return fixedFailure(entry); }
        },
        async recordSetupObject(ref) {
            const entry = currentCell && entryFor(currentCell);
            try {
                check(currentCell?.id === 'MENU_CREATE_DELIVER' && !entry.setupObject);
                entry.setupObject = knownRef(ref); await observeObject(entry.setupObject); return true;
            } catch { return fixedFailure(entry); }
        },
        // Pure checkpoint projection of an already buffered, validated response.
        // It neither reconciles a DB write nor sends a restoration operation.
        retainHeldCell({ cell, source, primaryClaimId, createdMenuId, knownObject, validatedResponse }) {
            const entry = entryFor(cell);
            try {
                check(prepared.has(cell.id) && cell.mode === 'WITHHOLD_AFTER_RESPONSE');
                entry.primaryClaimId = primaryClaimId; retain(entry, 'HOLD_TERMINAL_RECONCILIATION_REQUIRED');
                if (createdMenuId) { check(/^c[a-z0-9]+$/.test(createdMenuId)); entry.menuId = createdMenuId; }
                if (knownObject) entry.knownObject = knownRef(knownObject);
                if (cell.kind === 'SHOP_SAVE' && source.bodyValidated && validatedResponse?.shop) {
                    const shop = validatedResponse.shop, fixture = prepared.get(cell.id);
                    check(shop.id === shopId && stableShop(shop) === stableShop(fixture.before)
                        && shop.note === fixture.note && shop.coverImageUrl === fixture.expectedShopPayload.coverImageUrl);
                    entry.expectedOwnAfterSha256 = sha(canonical(shop)); entry.expectedOwnUpdatedAt = shop.updatedAt;
                }
            } catch { return fixedFailure(entry); }
        },
        async finishCell({ cell, fixture, result, after, knownObject, authorize, releaseFollowup, getParkedSubmission }) {
            const entry = entryFor(cell);
            try {
                check(prepared.get(cell.id) === fixture && cell.mode !== 'WITHHOLD_AFTER_RESPONSE' && !entry.finishStarted);
                entry.finishStarted = true;
                if (cell.mode === 'BLOCK_BEFORE_FORWARD') {
                    check(result.serverOutcome === 'NO_FORWARD_PROVEN' && result.forwardCalls === 0 && result.followupWrites === 0
                        && result.retryCalls === 0 && result.fallbackCalls === 0 && result.ownerApiUnchanged === true
                        && result.inputRetained === true && result.successDisplayed === false && result.soleSenderConfirmed === true
                        && (!cell.kind.endsWith('_UPLOAD') || result.fileRetained === true));
                    if (cell.kind === 'STOP') {
                        const before = await readFixture(entry.menuId, entry.fixtureFood);
                        check(before.isPublished && before.version === fixture.before.version);
                        const stopped = await writeMenu(cell, entry.menuId, 'CLEANUP', 'stop', { noForwardProven: true }); check(!stopped.isPublished);
                    }
                    retain(entry, 'NO_FORWARD_PROVEN_CLIENT_UNKNOWN'); return { known: true };
                }
                check(result.clientDelivery === 'DELIVERY_CONFIRMED' && result.bodyValidated === true && result.clientUnknown === false);
                if (cell.kind.endsWith('_UPLOAD')) {
                    entry.knownObject = knownRef(knownObject); await observeObject(entry.knownObject);
                }
                if (cell.kind === 'SHOP_UPLOAD') {
                    check(canonical(after) === canonical(fixture.before));
                    state.normalShopObject = structuredClone(entry.knownObject); retain(entry, 'UPLOAD_ACK_SAVE_PARKED'); return { known: true };
                }
                if (cell.kind === 'SHOP_SAVE') {
                    const own = await need('readShop')();
                    check(own.id === shopId && stableShop(own) === stableShop(fixture.before)
                        && sameOptionalText(own.note, fixture.note) && own.coverImageUrl === fixture.expectedShopPayload.coverImageUrl
                        && Date.parse(own.updatedAt) > Date.parse(fixture.before.updatedAt));
                    entry.expectedOwnAfterSha256 = sha(canonical(own)); entry.expectedOwnUpdatedAt = own.updatedAt;
                    entry.restoreAttempted = true;
                    const restored = await need('shopWrite')({ id: cell.id + '_RESTORE', cellId: cell.id, purpose: 'RESTORE', before: own,
                        values: structuredClone(entry.restoreOriginal), expectedOwnAfter: own,
                        evidence: { knownOutcome: true, ownerStateMatches: true, freshUpdatedAt: true, ownChangeMatches: true, noConcurrentChange: true } });
                    check(restored.id === shopId && stableShop(restored) === stableShop(own)
                        && sameOptionalText(restored.note, entry.restoreOriginal.note) && restored.coverImageUrl === entry.restoreOriginal.coverImageUrl);
                    retain(entry, 'KNOWN_AND_RESTORED_NOT_LIVE_PASS'); return { known: true };
                }
                let menuId = result.createdMenuId || entry.menuId;
                if (cell.kind === 'MENU_CREATE') {
                    check(/^c[a-z0-9]+$/.test(menuId || '') && entry.setupObject);
                    entry.menuId = menuId; entry.creationOperationId = fixture.creationOperationId;
                    // The root claimPrivate callback already registers the 201 ID.
                }
                let expected = structuredClone(entry.fixtureFood);
                if (cell.kind === 'MENU_CREATE') expected.imageUrl = entry.setupObject.url;
                if (cell.kind === 'MENU_SAVE') expected.priceYen = 801;
                if (cell.kind === 'MENU_UPLOAD') {
                    const before = await readFixture(menuId, expected), submission = getParkedSubmission();
                    const data = JSON.parse(submission.body.toString('utf8'));
                    const wanted = { ...expected, imageUrl: entry.knownObject.url, expectedVersion: before.version, isPublished: false };
                    check(!before.isPublished && submission.method === 'PUT' && submission.path === '/api/admin/menus/' + menuId
                        && canonical(data) === canonical(wanted));
                    const resource = { method: 'PUT', path: submission.path, menuId, shopId, purpose: 'FOLLOWUP_SAVE',
                        beforeVersion: before.version, evidence: evidence() };
                    const permit = await authorize({ id: cell.id + '_FOLLOWUP_SAVE', cellId: cell.id, kind: 'MENU_WRITE', owner: 'S1', mode: 'DELIVER', resource });
                    const response = await releaseFollowup({ actualResource: resource, permit });
                    check(response.status() === 200); const body = await response.json(); expected.imageUrl = entry.knownObject.url;
                    const saved = await readFixture(menuId, expected);
                    check(saved.version === body.menu?.version && saved.version > before.version && !saved.isPublished);
                }
                let menu = await readFixture(menuId, expected);
                if (cell.kind === 'STOP') check(!menu.isPublished);
                if (cell.kind === 'MENU_SAVE') check(!menu.isPublished && menu.foodVersion === fixture.before.foodVersion);
                if (['MENU_CREATE', 'MENU_UPLOAD'].includes(cell.kind)) {
                    check(!menu.isPublished);
                    menu = await writeMenu(cell, menuId, 'FOLLOWUP_PUBLISH', 'publish', {}, expected);
                    check(menu.isPublished && menu.publicationConfirmedFoodVersion === menu.foodVersion);
                    check(await need('verifyPublicImage')({ menuId, url: expected.imageUrl }) === true);
                    menu = await writeMenu(cell, menuId, 'CLEANUP', 'stop', {}, expected); check(!menu.isPublished);
                }
                retain(entry, 'KNOWN_PRIVATE_NOT_LIVE_PASS'); return { known: true };
            } catch { return fixedFailure(entry); }
        },
        async restorePriorShop({ sources, independentTerminalVerified }) {
            const verifiedSourceClaimIds = [];
            try {
                check(independentTerminalVerified === true && Array.isArray(sources) && sources.length === 1);
                for (const source of sources) {
                    const entry = Object.values(state.cells).find(e => e.primaryClaimId === source.sourceClaimId);
                    check(entry?.kind === 'SHOP_SAVE' && entry.mode === 'WITHHOLD_AFTER_RESPONSE' && !entry.restoreAttempted
                        && entry.expectedOwnAfterSha256 && entry.restoreOriginal);
                    const before = await need('readShop')();
                    check(sha(canonical(before)) === entry.expectedOwnAfterSha256 && before.updatedAt === entry.expectedOwnUpdatedAt);
                    entry.restoreAttempted = true;
                    const got = await need('shopWrite')({ id: 'SHOP_SAVE_WH_RESTORE_PRIOR', purpose: 'RESTORE_PRIOR_SHOP',
                        sourceClaimId: source.sourceClaimId, before, values: structuredClone(entry.restoreOriginal), expectedOwnAfter: before,
                        evidence: { knownOutcome: true, ownerStateMatches: true, freshUpdatedAt: true, ownChangeMatches: true,
                            noConcurrentChange: true, independentTerminalVerified: true } });
                    check(got.id === shopId && stableShop(got) === stableShop(before) && sameOptionalText(got.note, entry.restoreOriginal.note)
                        && got.coverImageUrl === entry.restoreOriginal.coverImageUrl);
                    verifiedSourceClaimIds.push(source.sourceClaimId); retain(entry, 'RESTORED_AFTER_INDEPENDENT_TERMINAL');
                }
                return { unknownWrite: false, freshStateMatched: true, verifiedSourceClaimIds };
            } catch { throw Error('SERVICE_PRIOR_SHOP_RESTORATION_HELD'); }
        },
    };
}
