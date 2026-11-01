import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ciIdentity } from '../scripts/issue118-ci-auth.mjs';
import { initialHandshakeContract as contract } from '../scripts/issue118-initial-handshake-candidate.mjs';
import { disabledMode, syntheticTarget as target, assertSyntheticCandidateReceipt, simulateServerCallbackCandidate, deployedMode, deployedTarget, diagnoseDeployedServerCallback, assertDeployedCandidateReceipt, keyClassMode, keyClassTarget, assertKeyClassReceipt, diagnoseKeyClassOnly } from '../scripts/check-issue118-server-callback-candidate.mjs';

const secret = 'SYNTHETIC_PRIVATE_VALUE_NOT_A_CREDENTIAL';
const initialNow = Date.now();
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
const outbound = (pinned = target) => contract.clerkOrigin + contract.clerkPath + '?' + new URLSearchParams({
    redirect_url: pinned.origin + '/admin/login', __clerk_api_version: contract.apiVersion,
    suffixed_cookies: 'true', __clerk_hs_reason: contract.reason, format: contract.format });
const callback = (pinned = target) => pinned.origin + '/admin/login?__clerk_handshake=synthetic.' + secret + '.signature';
const serverBody = () => ({ stage: 'COMPLETE', code: 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH',
    ...Object.fromEntries(['carrierPresent', 'carrierShape', 'decoded', 'headerTypeAllowed', 'algorithmAllowed', 'kidPresent',
        'jwksAttempted', 'jwksHttpOk', 'jwksParsed', 'kidMatched', 'signatureChecked', 'signatureValid',
        'directiveArray', 'directivesString', 'directiveBounds', 'sessionDirectivePresent', 'devBrowserDirectivePresent'].map(k => [k, true])) });
const keyClassBody = () => ({
    keyReadAttempted: true, keyReadCompleted: true, keyPresent: true,
    typeUndefined: false, typeNull: false, typeString: true, typeNumber: false, typeBoolean: false,
    typeObject: false, typeFunction: false, typeSymbol: false, typeBigInt: false,
    nonEmptyString: true, modernTestPrefix: true, legacyTestPrefix: false, productionPrefix: false,
    publishablePrefix: false, minimumLength16: true, hasCr: false, hasLf: false, hasNul: false,
    hasOtherAsciiControl: false, trimWouldChange: false, sdkDevelopmentCheckAttempted: true,
    sdkDevelopmentCheckCompleted: true, sdkDevelopmentClassified: true, existingDiagnosticGuardWouldAllow: true,
});
function harness(change = {}) {
    const pinned = change.keyClass ? keyClassTarget : change.live ? deployedTarget : target;
    const calls = [], closes = [], oidcCalls = []; let clock = initialNow, seamFailure = false, bodyReads = 0, launched = 0;
    const check = value => { if (!value) { seamFailure = true; throw Error('SYNTHETIC_SEAM_FAILURE'); } };
    const context = { request: { fetch: async (url, options) => {
        calls.push({ url, options }); const index = calls.length - 1;
        check(index <= 2 && options.method === 'GET' && options.maxRedirects === 0 && options.maxRetries === 0 && options.timeout === 20000);
        check(options.headers.Cookie === undefined && options.headers.Authorization === undefined && options.headers.Origin === undefined && options.headers.Referer === undefined);
        check(Boolean(options.headers['x-vercel-trusted-oidc-idp-token']) === (index !== 1));
        check(Boolean(options.headers['x-issue118-callback-diagnostic']) === (change.keyClass || index === 2));
        if (change.keyClass) check(index === 0 && options.headers['x-issue118-callback-diagnostic'] === 'key-class-only-v1' && !new URL(url).search);
        if (index === 0) check(url === pinned.origin + '/admin/login');
        if (index === 1) check(url === outbound(pinned));
        if (index === 2) check(url === callback(pinned));
        if (change.throwAt === index) throw change.throwObject || Error(secret);
        if (change.hangAt === index) return new Promise(() => {});
        if (index === 1 && change.advance) clock += change.advance;
        if (!change.keyClass && index < 2) return { status: () => change.statusAt === index ? 308 : 307,
            headers: () => change.headerFailure ? (() => { throw Error(secret); })() :
                { location: index === 0 ? change.outbound || outbound(pinned) : change.callback || callback(pinned) } };
        return { status: () => change.thirdStatus || 200,
            headers: () => ({ 'content-type': 'application/json', 'cache-control': 'no-store',
                ...(change.headers || {}), ...(change.declaredOversize ? { 'content-length': '16385' } : {}) }),
            body: async () => { bodyReads++; if (change.bodyFailure) throw Error(secret);
                if (change.oversize) return Buffer.alloc(16385);
                return Buffer.from(change.raw || JSON.stringify(change.body || (change.keyClass ? keyClassBody() : serverBody()))); } };
    } }, close: async () => { closes.push('context'); if (change.contextCloseFailure) throw Error(secret); } };
    const browser = { newContext: async options => { check(JSON.stringify(options) === JSON.stringify({ acceptDownloads: false, serviceWorkers: 'block' }));
        if (change.contextFailure) throw Error(secret); return context; },
        close: async () => { closes.push('browser'); if (change.browserCloseFailure) throw Error(secret); } };
    return { calls, closes, oidcCalls, get bodyReads() { return bodyReads; }, get launched() { return launched; }, async run(e = env(), r = receipt()) {
        const seams = { kind: 'SYNTHETIC_OFFLINE_ONLY', token: change.oidc || token(change.claims),
            now: () => clock, timeoutMs: change.timeout || 1000,
            browserFactory: async () => { launched++; if (change.launchFailure) throw Error(secret); return browser; } };
        let result;
        if (change.live || change.keyClass) {
            const liveEnv = { ...e, ISSUE118_DIAGNOSTIC_MODE: change.keyClass ? keyClassMode : deployedMode,
                ACTIONS_ID_TOKEN_REQUEST_URL: 'https://runner.actions.githubusercontent.com/opaque/path?api-version=2',
                ACTIONS_ID_TOKEN_REQUEST_TOKEN: secret };
            delete liveEnv.ISSUE118_OFFLINE_SYNTHETIC_ONLY;
            const liveReceipt = { ...r, ...pinned, syntheticFixtureOnly: false,
                protection: 'All Deployments', sourceManifestVerified: true, branchSecretScopeVerified: true,
                verifiedBy: 'cli_metadata_observer', ...(change.receiptChanges || {}) };
            Object.assign(liveEnv, change.envChanges || {});
            const fetcher = async (url, options) => {
                oidcCalls.push({ url, options });
                assert.equal(new URL(url).hostname, 'runner.actions.githubusercontent.com');
                assert.equal(options.redirect, 'error'); assert.equal(options.method, 'GET');
                assert.equal(options.headers.Authorization, 'bearer ' + secret);
                if (change.oidcError) throw Error(secret);
                return { ok: true, json: async () => ({ value: change.oidc || token(change.claims) }) };
            };
            result = await (change.keyClass ? diagnoseKeyClassOnly : diagnoseDeployedServerCallback)(liveEnv, liveReceipt, fetcher, seams.browserFactory);
        } else result = await simulateServerCallbackCandidate(e, r, seams);
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

test('deployed diagnostic is pinned, uses one OIDC request and three GETs, never normal auth', async () => {
    const h = harness({ live: true }), r = await h.run();
    assert.equal(r.completed, true); assert.equal(r.offlineOnly, false); assert.equal(r.requestCount, 3);
    assert.equal(h.oidcCalls.length, 1); assert.equal(r.serverObservation.signatureValid, true);
    assert.equal(r.serverSignatureShapeObserved, true); assert.equal(r.allLocalClosed, true);
    assert.equal(r.ownerReceiptMatched, true); assert.equal(r.liveOwnerVerified, false);
});

test('key-class mode sends exactly one query-free marked app GET and never Clerk/callback', async () => {
    const h = harness({ keyClass: true }), r = await h.run();
    assert.equal(r.completed, true); assert.equal(r.code, 'KEY_CLASS_OBSERVED_NOT_KEY_VALIDITY');
    assert.equal(h.calls.length, 1); assert.equal(r.requestCount, 1); assert.equal(h.oidcCalls.length, 1);
    assert.deepEqual(r.keyClassObservation, keyClassBody()); assert.equal(r.stoppedBeforeSecondGet, true);
    assert.equal(r.clerkSent, false); assert.equal(r.callbackSent, false); assert.equal(r.clerkJsStarted, false);
    assert.equal(r.allLocalClosed, true); assert.deepEqual(h.closes, ['context', 'browser']);
});
test('key-class mode rejects wrong/freshness/source/scope/owner receipt before OIDC', async () => {
    for (const receiptChanges of [{ source: deployedTarget.source }, { origin: deployedTarget.origin },
        { deployment: deployedTarget.deployment }, { owner: 'other' }, { shop: 'other' },
        { environment: 'Production' }, { branch: 'main' }, { protection: 'Standard' },
        { branchSecretScopeVerified: false }, { sourceManifestVerified: false },
        { observedUtc: new Date(initialNow - 600001).toISOString() }]) {
        const h = harness({ keyClass: true, receiptChanges }), r = await h.run();
        assert.equal(r.code, 'RECEIPT_HELD'); assert.equal(h.oidcCalls.length, 0); assert.equal(h.calls.length, 0);
    }
    assert.throws(() => assertKeyClassReceipt(null));
});
test('key-class mode context and OIDC failures cannot reach an app or Clerk', async () => {
    for (const change of [{ envChanges: { GITHUB_RUN_ATTEMPT: '2' } }, { envChanges: { ISSUE118_APPLY: 'true' } },
        { envChanges: { CLERK_SECRET_KEY: secret } }, { envChanges: { ISSUE118_TEST_CLERK_SECRET_KEY: secret } },
        { envChanges: { GITHUB_REF: 'refs/heads/main' } }, { envChanges: { ISSUE118_DIAGNOSTIC_MODE: deployedMode } },
        { envChanges: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://other.invalid/' } }, { oidcError: true },
        { claims: { exp: initialNow / 1000 - 1 } }]) {
        const h = harness({ keyClass: true, ...change }), r = await h.run();
        assert.equal(r.completed, false); assert.equal(h.calls.length, 0); assert.equal(h.launched, 0);
    }
});
test('key-class mode observes invalid/missing/legacy/short/control conditions without claiming validity', async () => {
    const modern = keyClassBody();
    const types = Object.fromEntries(Object.keys(modern).map(k => [k, false]));
    const cases = [
        { ...types, keyReadAttempted: true, keyReadCompleted: true, typeUndefined: true },
        { ...types, keyReadAttempted: true, keyReadCompleted: true, typeNull: true },
        { ...types, keyReadAttempted: true, keyReadCompleted: true, keyPresent: true, typeObject: true },
        { ...modern, modernTestPrefix: false, legacyTestPrefix: true, existingDiagnosticGuardWouldAllow: false },
        { ...modern, minimumLength16: false, existingDiagnosticGuardWouldAllow: false },
        { ...modern, hasLf: true, trimWouldChange: true, existingDiagnosticGuardWouldAllow: false },
        { ...modern, modernTestPrefix: false, publishablePrefix: true, sdkDevelopmentClassified: false, existingDiagnosticGuardWouldAllow: false },
    ];
    for (const body of cases) {
        const h = harness({ keyClass: true, body }), r = await h.run();
        assert.equal(r.completed, true); assert.deepEqual(r.keyClassObservation, body);
        assert.equal(r.serverSignatureShapeObserved, false); assert.equal(r.liveOwnerVerified, false); assert.equal(h.calls.length, 1);
    }
});
test('key getter or SDK classification failure is retained distinctly, never credential success', async () => {
    const empty = Object.fromEntries(Object.keys(keyClassBody()).map(k => [k, false]));
    for (const body of [{ ...empty, keyReadAttempted: true },
        { ...keyClassBody(), sdkDevelopmentCheckCompleted: false, sdkDevelopmentClassified: false }]) {
        const h = harness({ keyClass: true, thirdStatus: 409, body }), r = await h.run();
        assert.equal(r.completed, true); assert.deepEqual(r.keyClassObservation, body); assert.equal(h.calls.length, 1);
        assert.equal(r.serverSignatureShapeObserved, false);
    }
});
test('key-class mode refuses contradictions/extra values/wrong types/status/body without a second GET', async () => {
    const b = keyClassBody();
    for (const change of [{ thirdStatus: 307 }, { thirdStatus: 409 }, { headers: { location: callback(keyClassTarget) } },
        { body: { ...b, value: secret } }, { body: { ...b, minimumLength16: 22 } }, { body: { ...b, typeObject: true } },
        { body: { ...b, keyPresent: false } }, { body: { ...b, hasLf: true } },
        { body: { ...b, nonEmptyString: false } }, { body: { ...b, legacyTestPrefix: true } },
        { body: { ...b, sdkDevelopmentClassified: false } }, { raw: secret }, { oversize: true },
        { declaredOversize: true }, { bodyFailure: true }, { throwAt: 0 },
        { contextCloseFailure: true }, { browserCloseFailure: true }]) {
        const h = harness({ keyClass: true, ...change }), r = await h.run();
        assert.equal(r.completed, false); assert.equal(h.calls.length, 1); assert.equal(r.clerkSent, false); assert.equal(r.callbackSent, false);
    }
});
test('deployed diagnostic rejects wrong target, protection, source and owner BEFORE OIDC', async () => {
    for (const receiptChanges of [{ source: '0'.repeat(40) }, { origin: target.origin }, { deployment: 'dpl_OTHER' },
        { protection: 'Standard' }, { owner: 'other' }, { shop: 'other' }, { branch: 'main' },
        { environment: 'Production' }, { sourceManifestVerified: false }, { branchSecretScopeVerified: false },
        { syntheticFixtureOnly: true }, { observedUtc: new Date(initialNow - 600001).toISOString() }]) {
        const h = harness({ live: true, receiptChanges }), r = await h.run();
        assert.equal(r.code, 'RECEIPT_HELD'); assert.equal(h.calls.length, 0); assert.equal(h.oidcCalls.length, 0);
    }
    assert.throws(() => assertDeployedCandidateReceipt(null));
});
test('deployed context, attempt two, debug and ambient credentials reject BEFORE OIDC', async () => {
    for (const envChanges of [{ GITHUB_RUN_ATTEMPT: '2' }, { ISSUE118_APPLY: 'true' },
        { ISSUE118_DIAGNOSTIC_MODE: disabledMode }, { GITHUB_SHA: '0'.repeat(40) },
        { ISSUE118_TEST_CLERK_SECRET_KEY: secret }, { CLERK_SECRET_KEY: secret }, { DATABASE_URL: secret },
        { ISSUE118_OFFLINE_SYNTHETIC_ONLY: 'true' }, { ACTIONS_STEP_DEBUG: 'true' }]) {
        const h = harness({ live: true, envChanges }), r = await h.run();
        assert.equal(r.completed, false); assert.equal(h.calls.length, 0); assert.equal(h.oidcCalls.length, 0);
    }
});
test('OIDC failure/unknown or incorrect claims never launches browser or transmits callback', async () => {
    for (const change of [{ oidcError: true }, { claims: { ref: 'refs/heads/main' } },
        { envChanges: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://unapproved.invalid/opaque' } }]) {
        const h = harness({ live: true, ...change }), r = await h.run();
        assert.equal(r.completed, false); assert.equal(h.launched, 0); assert.equal(h.calls.length, 0);
    }
});
test('deployed callback returns only validated fixed server HOLD booleans, not provider content', async () => {
    for (const body of [{ ...serverBody(), stage: 'SIGNATURE', code: 'SIGNATURE_INVALID_HELD', signatureValid: false },
        { stage: 'GUARD', code: 'RUNTIME_TARGET_HELD' }]) {
        const h = harness({ live: true, thirdStatus: 409, body }), r = await h.run();
        assert.equal(r.completed, true); assert.equal(r.serverSignatureShapeObserved, false);
        assert.deepEqual(r.serverObservation, body); assert.equal(h.calls.length, 3);
    }
    for (const body of [serverBody(), { ...serverBody(), secret }, { stage: 'GUARD', code: secret },
        { ...serverBody(), stage: secret }, { ...serverBody(), signatureValid: secret }]) {
        const h = harness({ live: true, thirdStatus: 409, body }), r = await h.run();
        assert.equal(r.completed, false); assert.equal(r.serverObservation, undefined);
    }
});
test('deployed unknown errors, redirects and close failures cannot become auth or PASS', async () => {
    for (const change of [{ throwAt: 0 }, { throwAt: 1 }, { throwAt: 2 }, { thirdStatus: 307 },
        { callback: callback(deployedTarget) + '&unknown=' + secret }, { bodyFailure: true },
        { oversize: true }, { contextCloseFailure: true }, { browserCloseFailure: true }]) {
        const h = harness({ live: true, ...change }), r = await h.run();
        assert.equal(r.completed, false); assert.ok(h.calls.length <= 3);
    }
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
test('old disabled CLI cannot use supplied provider credentials', () => {
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
    assert.equal(file.includes('run: node scripts/check-issue118-server-callback-candidate.mjs --deployed-diagnostic-only'), true);
    const diagnostic = workflow.jobs['live-t1'].steps.find(x => x.run?.includes('--deployed-diagnostic-only'));
    assert.equal(diagnostic.if, `inputs.confirmation == '${deployedMode}'`);
    assert.equal(JSON.stringify(diagnostic).includes('secrets.'), false);
    const keyDiagnostic = workflow.jobs['live-t1'].steps.find(x => x.run?.endsWith(' --key-class-only'));
    assert.equal(keyDiagnostic.if, `inputs.confirmation == '${keyClassMode}'`);
    assert.equal(keyDiagnostic.env.ISSUE118_DIAGNOSTIC_MODE, keyClassMode);
    assert.doesNotMatch(JSON.stringify(keyDiagnostic), /secrets\.|ISSUE118_APPLY|CLERK_SECRET|--ci-apply/);
    assert.equal(workflow.jobs['live-t1'].steps.find(x => x.with?.name?.startsWith('issue118-key-class-')).with.path,
        '${{ runner.temp }}/issue118-key-class/result.json');
    assert.equal(workflow.jobs['live-t1'].steps.find(x => x.env?.ISSUE118_TEST_CLERK_SECRET_KEY).if, "inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1'");
    assert.equal((file.match(/id-token: write/g) || []).length, 1); assert.equal((file.match(/secrets\./g) || []).length, 1);
    assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
    const runner = readFileSync(new URL('../scripts/browser-runner.mjs', import.meta.url), 'utf8');
    assert.ok(runner.includes('tests/issue118-server-callback-candidate.test.mjs'));
});
