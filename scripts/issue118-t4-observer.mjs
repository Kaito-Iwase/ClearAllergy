// Read-only observer, not an auth adapter or an executable live entrypoint.
// Caller owns target/isolation/auth/transport guards and the external STOP ledger.
// No cookies, headers, response bodies, raw URLs or provider exceptions are logged.
const pinnedPreview = 'https://clear-allergy-e2e-kzfhilgul-kaitoexe00-9350s-projects.vercel.app';
const refuse = () => { throw Error('ISSUE118_T4_TARGET_REFUSED'); };
export function t4Target(input) {
    let origin;
    try { origin = new URL(input.origin); } catch { refuse(); }
    if (origin.origin !== input.origin || origin.username || origin.password || origin.search || origin.hash
        || !(input.origin === pinnedPreview || origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname))) refuse();
    if (![input.shopId, input.menuId].every(id => typeof id === 'string' && /^c[a-z0-9]+$/.test(id))
        || typeof input.name !== 'string' || !input.name.startsWith('【架空') || input.name.length > 256) refuse();
    return Object.freeze({ origin: origin.origin, menu: `${origin.origin}/shops/${input.shopId}/menus/${input.menuId}`,
        away: `${origin.origin}/shops/${input.shopId}`, api: `${origin.origin}/api/menus/${input.menuId}`, menuId: input.menuId, name: input.name });
}

// Page routes precede context routes. Unmatched requests MUST fall back, not
// continue/fetch, so the existing protected transport still sees those requests.
// Abort every matching attempt; an automatic browser retry must not escape.
export function t4RefetchFailure(menuUrl) {
    const observation = { matchingAttempts: 0, abortConfirmed: 0, handlerFailed: false };
    return {
        observation,
        async handler(route) {
            try {
                const request = route.request();
                if (request.url() === menuUrl && request.method() === 'GET' && request.resourceType() === 'document') {
                    observation.matchingAttempts++;
                    await route.abort('failed'); observation.abortConfirmed++;
                } else await route.fallback();
            } catch {
                observation.handlerFailed = true;
                try { await route.abort('failed'); } catch { /* observation remains unverified; never leak provider text */ }
            }
        },
    };
}

export function t4FreshReadOutcome(api, page) {
    if (api?.status === 200 || page?.foodNameVisible === true) return 'STOPPED_CONTENT_STILL_OBSERVED';
    if (api?.status === 404 && page?.targetMatched === true && [200, 404].includes(page.navigationResponseStatus)
        && page.notFoundVisible === true && page.foodNameVisible === false)
        return 'FRESH_READS_HIDE_TARGET';
    return 'UNVERIFIED';
}

// Creates four owned pages in the caller's existing context. It never closes that
// context, acquires auth, calls STOP or opens an admin page. readPublicApi must be
// the caller's guarded GET adapter, returning only {status,menuId}; no raw body.
export async function prepareT4Observation({ context, fixture, assertReadTarget, readPublicApi, evidenceLevel }) {
    const target = t4Target(fixture);
    if (typeof assertReadTarget !== 'function' || typeof readPublicApi !== 'function'
        || !['SYNTHETIC_HTTP_BROWSER', 'APP_BROWSER_READS_ONLY'].includes(evidenceLevel)) refuse();
    const pages = [], events = [], byRequest = new WeakMap();
    let stage = 'BASELINE', sequence = 0, collected = false, closed = false, observationFailed = false;
    let truncated = false;
    const guard = async () => { try { await assertReadTarget(); } catch { throw Error('ISSUE118_T4_GUARD_REFUSED'); } };
    const roles = ['held', 'back', 'fresh', 'refetchFailure'];
    const safeApi = async () => {
        await guard();
        try {
            const result = await readPublicApi(target.api);
            if (!Number.isInteger(result?.status) || ![200, 404].includes(result.status)
                || result.status === 200 && result.menuId !== target.menuId) return { status: null, error: 'PUBLIC_API_UNVERIFIED' };
            return { status: result.status, targetMatched: result.status === 200 ? true : null };
        } catch { return { status: null, error: 'PUBLIC_API_UNVERIFIED' }; }
    };
    const snapshot = async page => {
        if (page.url() !== target.menu) return { targetMatched: false, foodNameVisible: null, notFoundVisible: null, pageshowPersisted: null };
        try {
            const view = await page.evaluate(name => ({
                foodNameVisible: document.body.innerText.includes(name),
                notFoundVisible: [...document.querySelectorAll('h1,h2')].some(h => h.textContent.trim() === 'ページが見つかりません'),
                pageshowPersisted: typeof window.__ISSUE118_T4_PAGESHOW__ === 'boolean' ? window.__ISSUE118_T4_PAGESHOW__ : null,
                navigationType: performance.getEntriesByType('navigation')[0]?.type ?? null,
            }), target.name);
            return { targetMatched: true, ...view };
        } catch { return { targetMatched: true, error: 'DOM_OBSERVATION_UNVERIFIED', foodNameVisible: null, notFoundVisible: null, pageshowPersisted: null }; }
    };
    const close = async () => {
        if (closed) return { allOwnedPagesClosed: pages.every(page => page.isClosed()) };
        closed = true;
        let allOwnedPagesClosed = true;
        for (const page of pages) { try { await page.close(); } catch { allOwnedPagesClosed = false; } }
        return { allOwnedPagesClosed: allOwnedPagesClosed && pages.every(page => page.isClosed()) };
    };
    try {
        const baselineApi = await safeApi();
        if (baselineApi.status !== 200) throw Error('ISSUE118_T4_BASELINE_UNVERIFIED');
        for (const role of roles) {
            await guard();
            const page = await context.newPage(); pages.push(page);
            page.on('request', request => {
                try {
                    const url = new URL(request.url());
                    if (url.origin !== target.origin || ![new URL(target.menu).pathname, new URL(target.api).pathname].includes(url.pathname)) return;
                    if (events.length >= 128) { truncated = true; return; }
                    const event = { sequence: ++sequence, role, stage, method: ['GET', 'HEAD'].includes(request.method()) ? request.method() : 'OTHER',
                        queryPresent: !!url.search, document: request.resourceType() === 'document', status: null, finished: false, failed: false };
                    events.push(event); byRequest.set(request, event);
                } catch { observationFailed = true; }
            });
            page.on('response', response => { try { const event = byRequest.get(response.request()); if (event) event.status = response.status(); } catch { observationFailed = true; } });
            page.on('requestfinished', request => { const event = byRequest.get(request); if (event) event.finished = true; });
            page.on('requestfailed', request => { const event = byRequest.get(request); if (event) event.failed = true; });
            await page.addInitScript(() => {
                window.__ISSUE118_T4_PAGESHOW__ = null;
                window.addEventListener('pageshow', event => { window.__ISSUE118_T4_PAGESHOW__ = event.persisted; });
            });
            await guard();
            const baselineResponse = await page.goto(target.menu, { waitUntil: 'load', timeout: 15000 });
            if (baselineResponse?.status() !== 200 || (await snapshot(page)).foodNameVisible !== true) throw Error('ISSUE118_T4_BASELINE_UNVERIFIED');
        }
        await guard();
        await pages[1].goto(target.away, { waitUntil: 'load', timeout: 15000 });
        if (pages[1].url() !== target.away) throw Error('ISSUE118_T4_BASELINE_UNVERIFIED');
        return {
            close,
            async afterExternalChange() {
                if (collected || closed) throw Error('ISSUE118_T4_OBSERVER_ALREADY_USED');
                collected = true; stage = 'AFTER_EXTERNAL_CHANGE';
                try {
                await guard();
                const held = await snapshot(pages[0]);
                const freshApi = await safeApi();
                let fresh, back, failedRefetch;
                await guard();
                try {
                    const response = await pages[2].reload({ waitUntil: 'load', timeout: 15000 });
                    fresh = { ...await snapshot(pages[2]), navigationResponseStatus: response?.status() ?? null };
                }
                catch { fresh = { error: 'FRESH_PAGE_UNVERIFIED' }; }
                await guard();
                try {
                    const response = await pages[1].goBack({ waitUntil: 'load', timeout: 15000 });
                    back = { ...await snapshot(pages[1]), navigationResponseStatus: response?.status() ?? null };
                } catch { back = { error: 'HISTORY_BACK_UNVERIFIED' }; }
                await guard();
                const failure = t4RefetchFailure(target.menu);
                await pages[3].route('**/*', failure.handler);
                try {
                    let rejected = false;
                    try { await pages[3].reload({ waitUntil: 'load', timeout: 15000 }); } catch { rejected = true; }
                    failedRefetch = { ...await snapshot(pages[3]), ...failure.observation, navigationRejected: rejected,
                        injection: rejected && failure.observation.matchingAttempts === 1 && failure.observation.abortConfirmed === 1
                            && !failure.observation.handlerFailed ? 'ONE_DOCUMENT_GET_ABORTED_BEFORE_FORWARD' : 'UNVERIFIED' };
                } finally { await pages[3].unroute('**/*', failure.handler); }
                return { evidenceLevel, fixtureMenuId: target.menuId, externalStopAndDatabase: 'NOT_ATTESTED',
                    held, freshApi, fresh, back, failedRefetch, freshReadOutcome: t4FreshReadOutcome(freshApi, fresh),
                    events: structuredClone(events), truncated, observationFailed,
                    limits: ['No guarantee of automatic correction for held/back views', 'Only pageshow.persisted=true attests an observed BFCache restoration',
                        'Routing may disable HTTP cache; record the caller transport policy separately', 'Abort is a browser-injected GET failure, not a real service outage or lost write response'] };
                } catch { throw Error('ISSUE118_T4_OBSERVATION_UNVERIFIED'); }
            },
        };
    } catch {
        await close(); throw Error('ISSUE118_T4_PREPARE_UNVERIFIED');
    }
}
