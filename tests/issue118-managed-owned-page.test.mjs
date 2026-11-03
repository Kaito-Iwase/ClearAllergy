// Read-only page/access seams. No browser, authentication, session or service I/O.
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyManagedOwnedPage, prepareManagedSignoutPage, target } from '../scripts/check-issue118-live-t1-browser.mjs';
import { ciIdentity, managedActorIdentity } from '../scripts/issue118-ci-auth.mjs';

function fixture(fault = 'NONE', role = 'S2') {
    const identity = managedActorIdentity[role], observations = [];
    const calls = { goto: 0, waits: 0, snapshots: 0, api: 0, cleanup: 0, auth: 0 };
    let loaded = fault !== 'DELAYED', owner = fault === 'OWNER' ? 'user_OTHER' : identity.ownerId;
    let url = target.origin + '/admin/shop';
    const context = { request: {}, close: async () => { calls.cleanup++; } };
    const response = { status: () => fault === 'HTTP' ? 503 : 200 };
    const page = {
        context: () => fault === 'CONTEXT' ? {} : context,
        goto: async (next, options) => { calls.goto++; assert.equal(next, target.origin + '/admin/shop');
            assert.ok(options.timeout > 0); if (fault === 'GOTO') throw Error('SYNTHETIC_SECRET'); return response; },
        url: () => fault === 'URL' ? target.origin + '/admin/login' : url,
        waitForFunction: async (predicate, expected, options) => {
            calls.waits++; assert.equal(expected, identity.ownerId); assert.ok(options.timeout > 0);
            // Explicitly execute the real predicate on a delayed model snapshot.
            const previous = globalThis.window;
            try {
                globalThis.window = { Clerk: { loaded, user: { id: owner } } };
                if (fault === 'UNKNOWN_WAIT') throw Error('SYNTHETIC_SECRET');
                if (fault === 'HANG') return new Promise(() => {});
                if (fault === 'DELAYED') {
                    assert.equal(predicate(expected), false);
                    await Promise.resolve(); loaded = true; globalThis.window.Clerk.loaded = true;
                }
                if (!predicate(expected)) { const error = Error('SYNTHETIC_SECRET'); error.name = 'TimeoutError'; throw error; }
            } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
        },
        evaluate: async (predicate, expected) => {
            calls.snapshots++; if (fault === 'UNKNOWN_SNAPSHOT') throw Error('SYNTHETIC_SECRET');
            if (fault === 'OWNER_AFTER_WAIT') owner = 'user_OTHER';
            if (fault === 'URL_AFTER_WAIT') url = target.origin + '/admin/login';
            const previous = globalThis.window;
            try {
                globalThis.window = { Clerk: { loaded, user: { id: owner },
                    publishableKey: 'pk_test_' + Buffer.from((fault === 'PK' ? 'other.synthetic.invalid' : ciIdentity.clerkDomain) + '$').toString('base64') } };
                return predicate(expected);
            } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
        }, close: async () => { calls.cleanup++; },
    };
    const access = { authenticate: async () => { calls.auth++; }, read: async (request, requestedUrl) => {
        calls.api++; assert.equal(request, context.request); assert.equal(requestedUrl, target.origin + '/api/admin/shop');
        if (fault === 'UNKNOWN_API') throw Error('SYNTHETIC_SECRET');
        return { status: () => fault === 'API_HTTP' ? 404 : 200,
            json: async () => { if (fault === 'UNKNOWN_JSON') throw Error('SYNTHETIC_SECRET');
                return { shop: { id: fault === 'SHOP' ? 'cother' : identity.shopId } }; } };
    } };
    const input = { role, page, context, access, timeoutMs: fault === 'HANG' ? 5 : 100,
        routeFailed: () => fault === 'ROUTE', record: observation => { observations.push(observation);
            if (fault === 'OBSERVER') throw Error('SYNTHETIC_SECRET'); } };
    return { input, calls, observations, response };
}
function safe(result, f) {
    assert.equal(result.cleanupAttempted, false); assert.equal(f.calls.cleanup, 0); assert.equal(f.calls.auth, 0);
    assert.doesNotMatch(JSON.stringify([result, f.observations]), /SYNTHETIC_SECRET|https:|pk_test|user_|cookie|Bearer/);
}
test('bounded delayed hydration passes only after real loaded+fixed-owner predicate, then own API', async () => {
    for (const role of ['S1', 'S2']) {
        const f = fixture('DELAYED', role), r = await verifyManagedOwnedPage(f.input);
        assert.equal(r.verified, true); assert.equal(r.failureStage, null); assert.equal(r.hydrationWaitCompleted, true);
        assert.equal(r.clerkLoaded, true); assert.equal(r.frontendOwnerMatched, true); assert.equal(r.publishableKeyMatched, true);
        assert.equal(r.ownShopMatched, true); assert.equal(f.calls.waits, 1); assert.equal(f.calls.api, 1); safe(r, f);
    }
});
test('root-owned reload response is required in navigate:false mode; no second navigation', async () => {
    const f = fixture(), r = await verifyManagedOwnedPage({ ...f.input, navigate: false, navigationResponse: f.response });
    assert.equal(r.verified, true); assert.equal(r.navigationAttempted, false); assert.equal(f.calls.goto, 0); safe(r, f);
    const missing = fixture(), held = await verifyManagedOwnedPage({ ...missing.input, navigate: false });
    assert.equal(held.verified, false); assert.equal(held.failureStage, 'HTTP'); assert.equal(missing.calls.api, 0); safe(held, missing);
});
test('fixed stage identifies context, HTTP, URL, hydration, PK and own API predicates without raw values', async () => {
    const expected = { CONTEXT: 'INPUT', HTTP: 'HTTP', URL: 'PAGE_URL', OWNER: 'HYDRATION_WAIT',
        OWNER_AFTER_WAIT: 'FRONTEND_IDENTITY', URL_AFTER_WAIT: 'FRONTEND_IDENTITY', PK: 'PUBLISHABLE_KEY',
        API_HTTP: 'OWN_API_STATUS', SHOP: 'OWN_API_SHOP', ROUTE: 'ROUTE_HEALTH' };
    for (const [fault, stage] of Object.entries(expected)) {
        const f = fixture(fault), r = await verifyManagedOwnedPage(f.input);
        assert.equal(r.verified, false, fault); assert.equal(r.failureStage, stage, fault);
        if (['CONTEXT', 'HTTP', 'URL', 'OWNER', 'OWNER_AFTER_WAIT', 'URL_AFTER_WAIT', 'PK'].includes(fault)) assert.equal(f.calls.api, 0);
        if (fault === 'OWNER') { assert.equal(r.clerkLoaded, true); assert.equal(r.frontendOwnerMatched, false); assert.equal(r.code, 'HYDRATION_TIMEOUT_HELD'); }
        safe(r, f);
    }
});
test('unknown provider failures and observer errors fail closed and never initiate cleanup/auth', async () => {
    for (const fault of ['GOTO', 'UNKNOWN_WAIT', 'UNKNOWN_SNAPSHOT', 'UNKNOWN_API', 'UNKNOWN_JSON', 'OBSERVER']) {
        const f = fixture(fault), r = await verifyManagedOwnedPage(f.input);
        assert.equal(r.verified, false); assert.ok(r.failureStage); safe(r, f);
        if (fault === 'UNKNOWN_WAIT') assert.equal(r.code, 'HYDRATION_EXCEPTION_HELD');
        if (fault === 'OBSERVER') assert.equal(r.observerFailed, true);
    }
});
test('a hung hydration seam is externally bounded and preserves original failure stage', async () => {
    const f = fixture('HANG'), r = await verifyManagedOwnedPage(f.input);
    assert.equal(r.verified, false); assert.equal(r.failureStage, 'HYDRATION_WAIT'); assert.equal(r.code, 'HYDRATION_TIMEOUT_HELD');
    assert.equal(r.hydrationWaitCompleted, false); assert.equal(f.calls.api, 0); safe(r, f);
});

test('signout preparation drains then verifies canonical document and owner without auth or mutation',async()=>{
    for(const role of ['S1','S2']){
        const f=fixture('DELAYED',role);let drained=false;
        const goto=f.input.page.goto;f.input.page.goto=async(...args)=>{assert.equal(drained,true);return goto(...args);};
        await prepareManagedSignoutPage({page:f.input.page,access:f.input.access,expectedOwnerId:managedActorIdentity[role].ownerId,
            drainRoutes:async()=>{drained=true;return {status:'QUIET_CONFIRMED',pending:0};}});
        assert.equal(f.calls.goto,1);assert.equal(f.calls.api,1);assert.equal(f.calls.auth,0);assert.equal(f.calls.cleanup,0);
    }
});
test('signout preparation refuses nonquiet route, wrong owner, HTTP and current identity mismatch',async()=>{
    for(const fault of ['HTTP','OWNER','PK','SHOP']){
        const f=fixture(fault);
        await assert.rejects(prepareManagedSignoutPage({page:f.input.page,access:f.input.access,expectedOwnerId:managedActorIdentity.S2.ownerId,
            drainRoutes:async()=>({status:'QUIET_CONFIRMED',pending:0})}));assert.equal(f.calls.auth,0);
    }
    for(const input of [{status:'NOT_QUIET',pending:0},{status:'QUIET_CONFIRMED',pending:1}]){
        const f=fixture();await assert.rejects(prepareManagedSignoutPage({page:f.input.page,access:f.input.access,
            expectedOwnerId:managedActorIdentity.S2.ownerId,drainRoutes:async()=>input}));assert.equal(f.calls.goto,0);
    }
});
