import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ciIdentity } from '../scripts/issue118-ci-auth.mjs';
import { initialHandshakeContract as contract } from '../scripts/issue118-initial-handshake-candidate.mjs';
import { disabledMode, syntheticTarget as target, assertSyntheticCandidateReceipt, simulateServerCallbackCandidate } from '../scripts/check-issue118-server-callback-candidate.mjs';

const secret = 'SYNTHETIC_PRIVATE_VALUE_NOT_A_CREDENTIAL';
const initialNow = 1900000000000;
const env = () => ({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_REPOSITORY: ciIdentity.repository, GITHUB_REPOSITORY_ID: ciIdentity.repositoryId, GITHUB_REF: ciIdentity.ref,
    GITHUB_WORKFLOW_REF: ciIdentity.workflowRef, ISSUE118_GITHUB_ENVIRONMENT: ciIdentity.environment,
    ISSUE118_DIAGNOSTIC_MODE: disabledMode, ISSUE118_OFFLINE_SYNTHETIC_ONLY: 'true',
    GITHUB_SHA: 'a'.repeat(40), ISSUE118_EXPECTED_RUNNER_SHA: 'a'.repeat(40) });
const receipt = () => ({ ...target, syntheticFixtureOnly: true, environment: 'Preview', status: 'Ready',
    verifiedBy: 'browser_metadata_observer', observedUtc: new Date(initialNow).toISOString(), evidenceReference: 'SYNTHETIC_NOT_A_REAL_DEPLOYMENT' });
const token = (changes = {}) => 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({
    iss: 'https://token.actions.githubusercontent.com', aud: ciIdentity.audience,
    sub: `repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`, repository: ciIdentity.repository,
    repository_id: ciIdentity.repositoryId, ref: ciIdentity.ref, workflow_ref: ciIdentity.workflowRef,
    environment: ciIdentity.environment, iat: initialNow / 1000, exp: initialNow / 1000 + 300, ...changes,
})).toString('base64url') + '.OFFLINE_SIGNATURE';
const outbound = () => contract.clerkOrigin + contract.clerkPath + '?' + new URLSearchParams({
    redirect_url: target.origin + '/admin/login', __clerk_api_version: contract.apiVersion,
    suffixed_cookies: 'true', __clerk_hs_reason: contract.reason, format: contract.format });
const callback = () => target.origin + '/admin/login?__clerk_handshake=synthetic.' + secret + '.signature';
const serverBody = () => ({ stage: 'COMPLETE', code: 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH',
    ...Object.fromEntries(['carrierPresent', 'carrierShape', 'decoded', 'headerTypeAllowed', 'algorithmAllowed', 'kidPresent',
        'jwksAttempted', 'jwksHttpOk', 'jwksParsed', 'kidMatched', 'signatureChecked', 'signatureValid',
        'directiveArray', 'directivesString', 'directiveBounds', 'sessionDirectivePresent', 'devBrowserDirectivePresent'].map(k => [k, true])) });
function harness(change = {}) {
    const calls = [], closes = []; let clock = initialNow, seamFailure = false, bodyReads = 0, launched = 0;
    const check = value => { if (!value) { seamFailure = true; throw Error('SYNTHETIC_SEAM_FAILURE'); } };
    const context = { request: { fetch: async (url, options) => {
        calls.push({ url, options }); const index = calls.length - 1;
        check(index <= 2 && options.method === 'GET' && options.maxRedirects === 0 && options.maxRetries === 0 && options.timeout === 20000);
        check(options.headers.Cookie === undefined && options.headers.Authorization === undefined && options.headers.Origin === undefined && options.headers.Referer === undefined);
        check(Boolean(options.headers['x-vercel-trusted-oidc-idp-token']) === (index !== 1));
        check(Boolean(options.headers['x-issue118-callback-diagnostic']) === (index === 2));
        if (index === 0) check(url === target.origin + '/admin/login');
        if (index === 1) check(url === outbound());
        if (index === 2) check(url === callback());
        if (change.throwAt === index) throw change.throwObject || Error(secret);
        if (change.hangAt === index) return new Promise(() => {});
        if (index === 1 && change.advance) clock += change.advance;
        if (index < 2) return { status: () => change.statusAt === index ? 308 : 307,
            headers: () => change.headerFailure ? (() => { throw Error(secret); })() :
                { location: index === 0 ? change.outbound || outbound() : change.callback || callback() } };
        return { status: () => change.thirdStatus || 200,
            headers: () => ({ 'content-type': 'application/json', 'cache-control': 'no-store',
                ...(change.headers || {}), ...(change.declaredOversize ? { 'content-length': '16385' } : {}) }),
            body: async () => { bodyReads++; if (change.bodyFailure) throw Error(secret);
                if (change.oversize) return Buffer.alloc(16385);
                return Buffer.from(change.raw || JSON.stringify(change.body || serverBody())); } };
    } }, close: async () => { closes.push('context'); if (change.contextCloseFailure) throw Error(secret); } };
    const browser = { newContext: async options => { check(JSON.stringify(options) === JSON.stringify({ acceptDownloads: false, serviceWorkers: 'block' }));
        if (change.contextFailure) throw Error(secret); return context; },
        close: async () => { closes.push('browser'); if (change.browserCloseFailure) throw Error(secret); } };
    return { calls, closes, get bodyReads() { return bodyReads; }, get launched() { return launched; }, async run(e = env(), r = receipt()) {
        const result = await simulateServerCallbackCandidate(e, r, { kind: 'SYNTHETIC_OFFLINE_ONLY', token: change.oidc || token(change.claims),
            now: () => clock, timeoutMs: change.timeout || 1000,
            browserFactory: async () => { launched++; if (change.launchFailure) throw Error(secret); return browser; } });
        assert.equal(seamFailure, false, 'independent fixture assertions must never be swallowed into an expected HOLD');
        assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE|https:|__clerk|Authorization|Bearer|OFFLINE_SIGNATURE/);
        assert.equal(result.fixtureWriteStarted, false); assert.equal(result.explicitSessionApiStarted, false);
        assert.equal(result.liveOwnerVerified, false); assert.equal(result.stoppedBeforeFourthGet, true);
        return result;
    } };
}
test('three synthetic GETs: marker on callback only, app-only OIDC and unconditional stop', async () => {
    const h = harness(), r = await h.run();
    assert.equal(r.completed, true); assert.equal(r.serverSignatureShapeObserved, true); assert.equal(r.requestCount, 3);
    assert.equal(r.offlineOnly, true); assert.equal(r.allLocalClosed, true); assert.deepEqual(h.closes, ['context', 'browser']);
});
test('fixed candidate SHA/Deployment/origin/scope/owner receipt rejects before launch', async t => {
    const invalid = [ { source: '6293d5a02758f72a7cf00201fec239afc6b699eb' }, { projectId: 'other' }, { deployment: 'dpl_OTHER' },
        { origin: 'https://unapproved.invalid' }, { origin: target.origin + '@unapproved.invalid' }, { origin: target.origin + ':444' },
        { origin: target.origin + '#value' }, { origin: target.origin.replace('https:', 'http:') }, { owner: 'OTHER_OWNER' },
        { shop: 'OTHER_SHOP' }, { branch: 'main' }, { environment: 'Production' }, { status: 'Building' },
        { syntheticFixtureOnly: false }, { observedUtc: new Date(initialNow - 600001).toISOString() },
        { observedUtc: new Date(initialNow + 1).toISOString() }, { clerkDomain: 'other.clerk.accounts.dev' } ];
    for (let i = 0; i < invalid.length; i++) await t.test('receipt negative ' + i, async () => {
        const h = harness(), r = await h.run(env(), { ...receipt(), ...invalid[i] });
        assert.equal(r.completed, false); assert.equal(h.launched, 0); assert.equal(h.calls.length, 0);
    });
    assert.throws(() => assertSyntheticCandidateReceipt(null, initialNow));
});
test('CI context, retries, ambient credentials and expired/wrong-scope claims reject before launch', async () => {
    for (const change of [{ GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_WORKFLOW_REF: 'other' },
        { ISSUE118_GITHUB_ENVIRONMENT: 'other' }, { ISSUE118_APPLY: 'true' }, { CLERK_SECRET_KEY: secret },
        { ACTIONS_ID_TOKEN_REQUEST_TOKEN: secret }, { ISSUE118_EXPECTED_RUNNER_SHA: 'b'.repeat(40) }, { NODE_OPTIONS: secret }]) {
        const h = harness(), r = await h.run({ ...env(), ...change }); assert.equal(r.completed, false); assert.equal(h.launched, 0);
    }
    for (const claims of [{ aud: 'other' }, { ref: 'refs/heads/main' }, { exp: initialNow / 1000 - 1 }]) {
        const h = harness({ claims }), r = await h.run(); assert.equal(r.completed, false); assert.equal(h.launched, 0);
    }
    const altered = harness({ oidc: token().replace('.OFFLINE_SIGNATURE', '.OTHER_SIGNATURE') });
    assert.equal((await altered.run()).completed, false); assert.equal(altered.launched, 0);
});
test('unapproved outbound/callback, duplicate/unknown query and non-contract redirects never followed', async () => {
    const invalid = [
        { outbound: outbound().replace(contract.clerkOrigin, 'https://other.invalid') },
        { outbound: outbound().replace('https:', 'http:') }, { outbound: outbound() + '&extra=' + secret },
        { outbound: outbound().replace('/v1/client/handshake', '/unknown') },
        { callback: callback().replace(target.origin, 'https://other.invalid') },
        { callback: callback().replace('/admin/login', '/other') }, { callback: callback() + '&__clerk_handshake=' + secret },
        { callback: callback() + '&__clerk_handshake_nonce=' + secret }, { callback: callback().replace('synthetic.' + secret + '.signature', 'malformed') },
        { statusAt: 0 }, { statusAt: 1 }, { headerFailure: true },
    ];
    for (const change of invalid) { const h = harness(change), r = await h.run(); assert.equal(r.completed, false); assert.ok(h.calls.length <= 2); }
});
test('server redirect, signature false, contradictory schema, unknown body and oversize never accepted', async () => {
    const invalid = [ { thirdStatus: 307 }, { thirdStatus: 409 }, { headers: { location: callback() } },
        { body: { ...serverBody(), signatureValid: false } }, { body: { ...serverBody(), jwksParsed: false } },
        { body: { ...serverBody(), secret } }, { body: { ...serverBody(), code: secret } }, { raw: secret },
        { declaredOversize: true }, { oversize: true }, { bodyFailure: true },
    ];
    for (const change of invalid) { const h = harness(change), r = await h.run(); assert.equal(r.completed, false); assert.equal(h.calls.length, 3);
        if (change.declaredOversize || change.thirdStatus || change.headers) assert.equal(h.bodyReads, 0); }
});
test('unknown provider exceptions and throwing error accessor fail closed with no fourth GET', async () => {
    for (const throwObject of [Error(secret), { get message() { throw Error(secret); } }]) {
        const h = harness({ throwAt: 2, throwObject }), r = await h.run();
        assert.equal(r.code, 'UNKNOWN_EXCEPTION_HELD'); assert.equal(r.completed, false); assert.equal(h.calls.length, 3);
    }
});
test('deadline and mid-flow receipt/token expiry stop without extra request', async () => {
    const timeout = harness({ hangAt: 0, timeout: 5 }), held = await timeout.run();
    assert.equal(held.code, 'DEADLINE_HELD'); assert.equal(timeout.calls.length, 1); assert.equal(held.allLocalClosed, true);
    for (const advance of [301000, 600001]) {
        const h = harness({ advance }), r = await h.run(); assert.equal(r.completed, false); assert.equal(h.calls.length, 2);
    }
});
test('context/browser close confirmation is independent; no handle is not success after attempted create', async () => {
    for (const change of [{ contextCloseFailure: true }, { browserCloseFailure: true }, { contextFailure: true }, { launchFailure: true }]) {
        const h = harness(change), r = await h.run(); assert.equal(r.code, 'LOCAL_CLOSE_UNVERIFIED'); assert.equal(r.completed, false); assert.equal(r.allLocalClosed, false);
    }
});
test('CLI is unconditionally disabled and cannot use supplied provider credentials', () => {
    const r = spawnSync(process.execPath, ['scripts/check-issue118-server-callback-candidate.mjs', '--candidate-disabled'],
        { encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
            ACTIONS_ID_TOKEN_REQUEST_TOKEN: secret, CLERK_SECRET_KEY: secret } });
    assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.equal(r.stderr.trim(), 'SERVER_CALLBACK_CANDIDATE_DISABLED_NO_NETWORK');
});
test('workflow mode cannot reach existing live job and has zero permissions, secrets or authentication', () => {
    const file = readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml', import.meta.url), 'utf8');
    const workflow = createRequire(import.meta.url)('js-yaml').load(file);
    assert.equal(workflow.on.workflow_dispatch.inputs.confirmation.default, 'HOLD');
    assert.ok(workflow.on.workflow_dispatch.inputs.confirmation.options.includes(disabledMode));
    assert.equal(workflow.jobs['live-t1'].if.includes(disabledMode), false);
    assert.deepEqual(Object.keys(workflow.jobs), ['live-t1']);
    assert.equal(file.includes('run: node scripts/check-issue118-server-callback-candidate.mjs'), false);
    assert.equal((file.match(/id-token: write/g) || []).length, 1); assert.equal((file.match(/secrets\./g) || []).length, 1);
    assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
    const runner = readFileSync(new URL('../scripts/browser-runner.mjs', import.meta.url), 'utf8');
    assert.ok(runner.includes('tests/issue118-server-callback-candidate.test.mjs'));
});
