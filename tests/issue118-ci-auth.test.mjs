import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { assertCiEnvironment, ciIdentity, assertOidcClaims, oidcRequestUrl, inspectOidcRequestTarget, assertClerkPublishableKey, createCiAccess } from '../scripts/issue118-ci-auth.mjs';
import { oidcTargetDiagnostic } from '../scripts/check-issue118-oidc-target.mjs';
import { target, classifyLiveError, recordTransportDiagnostic } from '../scripts/check-issue118-live-t1-browser.mjs';
import { routePreviewRequest, transportObservation } from '../scripts/issue118-preview-transport.mjs';

const syntheticSecret = 'sk_test_SYNTHETIC_NOT_REAL';
const env = () => ({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_REPOSITORY: ciIdentity.repository, GITHUB_REPOSITORY_ID: ciIdentity.repositoryId,
    GITHUB_REF: ciIdentity.ref, GITHUB_WORKFLOW_REF: ciIdentity.workflowRef,
    ISSUE118_GITHUB_ENVIRONMENT: ciIdentity.environment, ISSUE118_APPLY: 'true',
    GITHUB_SHA: 'a'.repeat(40), ISSUE118_EXPECTED_RUNNER_SHA: 'a'.repeat(40),
    ISSUE118_TEST_CLERK_SECRET_KEY: syntheticSecret,
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://run-actions-synthetic.actions.githubusercontent.com/only/_apis/oidc/idtoken?api-version=2.0',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'SYNTHETIC_REQUEST_CREDENTIAL' });
const claims = () => ({ iss: 'https://token.actions.githubusercontent.com', aud: ciIdentity.audience,
    sub: `repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`, repository: ciIdentity.repository,
    repository_id: ciIdentity.repositoryId, ref: ciIdentity.ref, workflow_ref: ciIdentity.workflowRef,
    environment: ciIdentity.environment, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 });
const jwt = body => 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify(body)).toString('base64url') + '.synthetic';
const response = body => ({ ok: true, json: async () => body });
const code = expected => error => error.message === expected && !error.cause && !String(error.stack).includes(syntheticSecret);
const publicKey = 'pk_test_' + Buffer.from(ciIdentity.clerkDomain + '$').toString('base64');
const diagnosticEnv = () => ({ ...env(), ISSUE118_APPLY: undefined, ISSUE118_TEST_CLERK_SECRET_KEY: undefined,
    ISSUE118_DIAGNOSTIC_MODE: 'OIDC_TARGET_ONLY' });

// Unit-only page adapter: the old auth model must acknowledge the initial document
// route too. This uses a fake API response, not a live browser/authentication.
const wiredPages = new WeakMap();
function wireAuthPage(access, page) {
    if (!wiredPages.has(page)) {
        const frame = {}, visits = [], originalGoto = page.goto;
        const state = { access, requests: [], responses: [], fulfills: 0, aborts: 0 };
        page.mainFrame = () => frame;
        page.context = () => ({ request: { fetch: async (url, options) => {
            state.requests.push({ url, options });
            return state.responses.shift() || { status: () => 200, headers: () => ({}) };
        } } });
        page.goto = async url => {
            visits.push(url);
            if (url === target.origin + '/admin/login') try { await state.access.route({
                request: () => ({ url: () => url, method: () => 'GET', resourceType: () => 'document',
                    isNavigationRequest: () => true, frame: () => frame }),
                fulfill: async () => { state.fulfills++; }, abort: async () => { state.aborts++; },
            }); } catch (error) { if (!state.swallowRouteError) throw error; }
            return originalGoto?.(url);
        };
        wiredPages.set(page, state);
    }
    wiredPages.get(page).access = access;
    return wiredPages.get(page);
}
const authenticate = (access, page) => { wireAuthPage(access, page); return access.authenticate(page); };

test('wired initial handshake reaches auth only after exact four-GET exchange; later document redirects stay refused', async () => {
    const fixture = authFixture(); const reports = [];
    const access = await createCiAccess(env(), fixture.fetcher, () => {}, { handshake: r => reports.push(r) });
    const model = wireAuthPage(access, fixture.page);
    const outbound = new URL('https://' + ciIdentity.clerkDomain + '/v1/client/handshake');
    for (const [k,v] of Object.entries({redirect_url:target.origin+'/admin/login',__clerk_api_version:'2026-05-12',
        suffixed_cookies:'true',__clerk_hs_reason:'dev-browser-missing',format:'nonce'})) outbound.searchParams.set(k,v);
    const r = (status,location) => ({status:()=>status,headers:()=>({location})});
    model.responses.push(r(307,outbound.href),r(302,target.origin+'/admin/login?__clerk_handshake_nonce=SYNTHETIC_NONCE'),
        r(307,target.origin+'/admin/login'),r(200));
    await access.authenticate(fixture.page);
    assert.equal(model.requests.length,4);assert.equal(model.fulfills,1);assert.equal(access.isAuthenticated(),true);
    assert.equal(access.handshakeProgress().complete,true);assert.equal(reports.length,1);
    assert.ok(!JSON.stringify(reports).includes('SYNTHETIC_NONCE'));
    assert.ok(!Object.keys(model.requests[1].options.headers).some(k=>k.toLowerCase().includes('vercel')));
    let fetches=0;
    await assert.rejects(access.route({request:()=>({url:()=>target.origin+'/admin/shop',method:()=>'GET',
        resourceType:()=>'document',isNavigationRequest:()=>true,frame:()=>fixture.page.mainFrame(),allHeaders:async()=>({})}),
        fetch:async()=>{fetches++;return r(307,outbound.href);},fulfill:async()=>assert.fail('No later redirect'),abort:async()=>{}}),code('CI_ROUTE_FAILED'));
    assert.equal(fetches,1);
});
test('wired handshake HOLD or evidence failure prevents Backend API auth and never retries', async () => {
    for (const observerFailure of [false,true]) {
        const fixture=authFixture(); const access=await createCiAccess(env(),fixture.fetcher,()=>{},
            {handshake:()=>{if(observerFailure)throw Error(syntheticSecret);}});
        const model=wireAuthPage(access,fixture.page);
        // Production's event handler may absorb the route error after a fulfilled
        // document; authenticate's explicit completion/evidence gate must still stop.
        model.swallowRouteError=observerFailure;
        if(!observerFailure) model.responses.push({status:()=>307,headers:()=>({location:'https://other.invalid/?secret=SYNTHETIC'})});
        await assert.rejects(access.authenticate(fixture.page),code('CI_AUTHENTICATION_FAILED'));
        assert.equal(fixture.calls.length,1);assert.equal(access.authenticationProgress().ownerLookupStarted,false);
        assert.equal(access.authenticationProgress().testingTokenRequestStarted,false);assert.equal(model.requests.length,1);
    }
});

test('wired legacy carrier completes only the same bounded document exchange; mixed and malformed carriers stop before Backend auth',async()=>{
    const outbound=new URL('https://'+ciIdentity.clerkDomain+'/v1/client/handshake');
    for(const [k,v] of Object.entries({redirect_url:target.origin+'/admin/login',__clerk_api_version:'2026-05-12',
        suffixed_cookies:'true',__clerk_hs_reason:'dev-browser-missing',format:'nonce'}))outbound.searchParams.set(k,v);
    const legacy=target.origin+'/admin/login?__clerk_handshake=synthetic.payload.signature';
    const r=(status,location)=>({status:()=>status,headers:()=>({location})});
    for(const [location,allowed] of [[legacy,true],[legacy+'&__clerk_handshake_nonce=SYNTHETIC',false],
        [legacy+'&__clerk_db_jwt=SYNTHETIC',false],[legacy.replace('synthetic.payload.signature','not-jwt'),false]]){
        const fixture=authFixture(),reports=[];
        const access=await createCiAccess(env(),fixture.fetcher,()=>{},{handshake:x=>reports.push(x)});
        const model=wireAuthPage(access,fixture.page);
        model.responses.push(r(307,outbound.href),r(307,location),r(307,target.origin+'/admin/login'),r(200));
        if(allowed){await access.authenticate(fixture.page);assert.equal(model.requests.length,4);assert.equal(access.isAuthenticated(),true);}
        else{await assert.rejects(access.authenticate(fixture.page),code('CI_AUTHENTICATION_FAILED'));
            assert.equal(model.requests.length,2);assert.equal(fixture.calls.length,1);
            assert.equal(access.authenticationProgress().ownerLookupStarted,false);assert.equal(access.authenticationProgress().testingTokenRequestStarted,false);}
        assert.equal(model.requests[1].options.headers['x-vercel-trusted-oidc-idp-token'],undefined);
        for(const {options}of model.requests){assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);assert.equal(options.method,'GET');}
        assert.doesNotMatch(JSON.stringify(reports),/synthetic\.payload|SYNTHETIC|https:/);
    }
});

test('transport report permits enums/status/booleans only and retains first unexpected failure beyond cap', () => {
    const report = {};
    recordTransportDiagnostic(report, { originRole: syntheticSecret, method: 'https://u:p@invalid/', status: syntheticSecret,
        exception: syntheticSecret, stages: { fetchStarted: true, url: syntheticSecret }, url: syntheticSecret });
    assert.deepEqual(report.transportDiagnostics[0].originRole, 'OTHER');
    assert.equal(report.transportDiagnostics[0].method, 'OTHER'); assert.equal(report.transportDiagnostics[0].status, null);
    assert.ok(!JSON.stringify(report).includes('SYNTHETIC')); assert.ok(!JSON.stringify(report).includes('https:'));
    const capped = {};
    for (let i = 0; i < 70; i++) recordTransportDiagnostic(capped, transportObservation('OTHER', 'GET', null, 'POLICY_REFUSED'));
    assert.equal(capped.firstTransportFailure, undefined);
    recordTransportDiagnostic(capped, transportObservation('APP', 'GET', 302, 'REDIRECT_REFUSED', { redirectRejected: true }));
    recordTransportDiagnostic(capped, transportObservation('CLERK', 'GET', 503, 'NONE'));
    assert.equal(capped.transportDiagnostics.length, 64); assert.equal(capped.transportDiagnosticsTruncated, true);
    assert.equal(capped.firstTransportFailure.originRole, 'APP'); assert.equal(capped.firstTransportFailure.status, 302);
});

test('APP route diagnostics distinguish redirects, HTTP errors, and fetch/headers/status/fulfill failures without raw errors', async () => {
    for (const scenario of ['redirect', 'http403', 'fetch', 'headers', 'status', 'fulfill', 'abort']) {
        const events = []; let fetches = 0, fulfilled = 0;
        const raw = () => { throw Error(syntheticSecret + ' https://u:p@invalid/private?token=secret'); };
        const route = { request: () => ({ url: () => target.origin + '/admin/login', method: () => 'GET',
            allHeaders: async () => { if (scenario === 'headers') raw(); return {}; } }),
            fetch: async options => { fetches++; assert.equal(options.maxRedirects, 0); assert.equal(options.maxRetries, 0);
                if (['fetch', 'abort'].includes(scenario)) raw();
                return { status: () => { if (scenario === 'status') raw(); return scenario === 'redirect' ? 302 : scenario === 'http403' ? 403 : 200; } }; },
            fulfill: async () => { fulfilled++; if (scenario === 'fulfill') raw(); },
            abort: async () => { if (scenario === 'abort') raw(); } };
        if (scenario === 'http403') await routePreviewRequest(route, 'synthetic.payload.signature', value => events.push(value));
        else await assert.rejects(routePreviewRequest(route, 'synthetic.payload.signature', value => events.push(value)),
            error => ['PROTECTED_REDIRECT_BLOCKED', 'PROTECTED_TRANSPORT_FAILED', 'PROTECTED_ABORT_FAILED'].includes(error.message));
        const event = events[0]; assert.equal(event.originRole, 'APP'); assert.equal(event.method, 'GET');
        const expected = { redirect: 'REDIRECT_REFUSED', http403: 'NONE', fetch: 'FETCH_EXCEPTION', headers: 'HEADERS_EXCEPTION',
            status: 'STATUS_EXCEPTION', fulfill: 'FULFILL_EXCEPTION', abort: 'ABORT_EXCEPTION' };
        assert.equal(event.exception, expected[scenario]); assert.ok(!JSON.stringify(events).includes('SYNTHETIC'));
        assert.equal(fetches, scenario === 'headers' ? 0 : 1);
        if (scenario === 'redirect') { assert.equal(event.status, 302); assert.equal(fulfilled, 0); assert.equal(event.stages.redirectRejected, true); }
        if (scenario === 'fetch') assert.equal(event.stages.responseObserved, false);
        if (scenario === 'status') assert.equal(event.stages.responseObserved, true);
    }
});

test('Clerk/OTHER route diagnostics preserve fixed roles and never relax external redirect/header policy', async () => {
    const events = []; const access = await createCiAccess(env(), async () => response({ value: jwt(claims()) }), () => {},
        { transport: value => events.push(value) });
    const route = origin => ({ request: () => ({ url: () => origin + '/v1/client?synthetic-secret', method: () => 'GET',
        allHeaders: async () => ({ 'x-vercel-trusted-oidc-idp-token': 'synthetic.payload.signature' }) }),
        fetch: async options => { assert.ok(!Object.hasOwn(options.headers, 'x-vercel-trusted-oidc-idp-token'));
            assert.equal(options.maxRedirects, 0); assert.equal(options.maxRetries, 0); return { status: () => 307 }; },
        fulfill: async () => assert.fail('redirect must never fulfill'), abort: async () => {} });
    await assert.rejects(access.route(route('https://' + ciIdentity.clerkDomain)), code('CI_ROUTE_FAILED'));
    assert.equal(events[0].originRole, 'CLERK'); assert.equal(events[0].exception, 'REDIRECT_REFUSED'); assert.equal(events[0].status, 307);
    await access.route(route('https://other.invalid'));
    assert.equal(events[1].originRole, 'OTHER'); assert.equal(events[1].exception, 'POLICY_REFUSED');
    assert.ok(!JSON.stringify(events).includes('synthetic-secret')); assert.ok(!JSON.stringify(events).includes('/v1/'));
});

test('Backend API failures record Clerk role/method/status or fixed fetch class without key or response body', async () => {
    for (const network of [false, true]) {
        const events = []; let calls = 0;
        const access = await createCiAccess(env(), async url => {
            calls++;
            if (url.includes('actions.githubusercontent.com')) return response({ value: jwt(claims()) });
            if (network) throw Error(syntheticSecret + ' private response');
            return { ok: false, status: 401, json: async () => assert.fail('do not read failed body') };
        }, () => {}, { transport: value => events.push(value) });
        const fixture = authFixture();
        await assert.rejects(authenticate(access, fixture.page), code('CI_AUTHENTICATION_FAILED'));
        assert.equal(calls, 2); assert.equal(events.length, 1); assert.equal(events[0].originRole, 'CLERK');
        assert.equal(events[0].method, 'GET'); assert.equal(events[0].stages.backendRequest, true);
        assert.equal(events[0].status, network ? null : 401); assert.equal(events[0].exception, network ? 'FETCH_EXCEPTION' : 'NONE');
        assert.equal(access.authenticationProgress().ownerLookupStarted, true); assert.equal(access.authenticationProgress().ownerMatched, false);
        assert.ok(!JSON.stringify(events).includes('SYNTHETIC')); assert.ok(!JSON.stringify(events).includes('private'));
    }
});

test('OIDC predicate mirror matches candidate validator, never returns URL parts or exceptions', () => {
    const base = 'https://run-actions-synthetic.actions.githubusercontent.com/only/idtoken?api-version=2.0';
    for (const value of [undefined, '', 'not a URL', base, base.replace('https:', 'http:'),
        base.replace('run-actions-synthetic.actions.githubusercontent.com', 'actions.githubusercontent.com'),
        base.replace('actions.githubusercontent.com', 'actions.githubusercontent.com.evil.invalid'),
        base.replace('/idtoken', '/other'), base.replace('/idtoken?', '/idtoken/?'),
        base.replace('https://', 'https://sk_test_SYNTHETIC:password@'),
        base.replace('.com/', '.com:444/'), base.replace('.com/', '.com:443/'),
        base + '#sk_test_SYNTHETIC', base + '&secret=sk_test_SYNTHETIC']) {
        const result = inspectOidcRequestTarget(value);
        let accepted = true; try { oidcRequestUrl(value); } catch { accepted = false; }
        assert.equal(result.guardAccepts, accepted);
        assert.ok(Object.values(result).every(item => typeof item === 'boolean'));
        assert.ok(!/SYNTHETIC|password|https:|api-version|other/.test(JSON.stringify(result)));
    }
    const object = { toString() { throw Error('must not inspect secret-like object'); } };
    assert.equal(inspectOidcRequestTarget(object).parseable, false);
});

test('diagnostic accepts only fixed context and always stops before fetch/auth/browser/write', t => {
    let network = 0; t.mock.method(globalThis, 'fetch', () => { network++; throw Error(syntheticSecret); });
    for (const value of [env().ACTIONS_ID_TOKEN_REQUEST_URL, 'https://u:sk_test_SYNTHETIC@invalid/']) {
        const result = oidcTargetDiagnostic({ ...diagnosticEnv(), ACTIONS_ID_TOKEN_REQUEST_URL: value });
        assert.equal(result.stage, 'DIAGNOSTIC_STOP_BEFORE_REQUEST');
        for (const field of ['oidcRequestSent', 'clerkStarted', 'browserStarted', 'fixtureWriteStarted']) assert.equal(result[field], false);
        assert.ok(['OIDC_TARGET_GUARD_MATCH', 'OIDC_REQUEST_TARGET_REFUSED'].includes(result.code));
        assert.ok(!JSON.stringify(result).includes('SYNTHETIC'));
    }
    for (const change of [{ ISSUE118_APPLY: 'true' }, { ISSUE118_TEST_CLERK_SECRET_KEY: syntheticSecret },
        { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_REF: 'wrong' }, { GITHUB_WORKFLOW_REF: 'wrong' },
        { ISSUE118_GITHUB_ENVIRONMENT: 'wrong' }, { ISSUE118_EXPECTED_RUNNER_SHA: 'wrong' },
        { ISSUE118_DIAGNOSTIC_MODE: 'LIVE' }, { NODE_OPTIONS: 'secret-like preload' }, { ACTIONS_STEP_DEBUG: 'true' }])
        assert.throws(() => oidcTargetDiagnostic({ ...diagnosticEnv(), ...change }), code('OIDC_DIAGNOSTIC_CONTEXT_REFUSED'));
    assert.equal(network, 0);
});

test('actual diagnose-only CLI emits booleans/fixed codes, never raw URL, and cannot run apply or overwrite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'issue118-oidc-target-test-'));
    const configuration = { SystemRoot: process.env.SystemRoot, ...diagnosticEnv(), RUNNER_TEMP: directory,
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://u:sk_test_SYNTHETIC@wrong.invalid/private/idtoken?token=secret#fragment' };
    const child = args => spawnSync(process.execPath, ['scripts/check-issue118-oidc-target.mjs', ...args], {
        env: configuration, encoding: 'utf8', windowsHide: true });
    try {
        const result = child(['--diagnose-only']); assert.equal(result.status, 0); assert.equal(result.stderr, '');
        const report = JSON.parse(result.stdout);
        assert.equal(report.stage, 'DIAGNOSTIC_STOP_BEFORE_REQUEST'); assert.equal(report.predicates.userinfoAbsent, false);
        assert.ok(!/SYNTHETIC|wrong.invalid|private|token=|fragment#/.test(result.stdout));
        const path = join(directory, 'issue118-oidc-target', 'result.json'); const prior = readFileSync(path, 'utf8');
        for (const args of [['--apply'], ['--diagnose-only', '--ci-apply'], ['--diagnose-only']]) {
            const refused = child(args); assert.equal(refused.status, 1); assert.equal(refused.stdout, '');
            assert.equal(refused.stderr.trim(), 'OIDC_DIAGNOSTIC_REFUSED_NO_RAW_ERROR'); assert.equal(readFileSync(path, 'utf8'), prior);
        }
    } finally {
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert.ok(basename(directory).startsWith('issue118-oidc-target-test-'));
        rmSync(directory, { recursive: true });
    }
});

test('access setup reports fixed stages, never secrets, with no auth or retry on failure', async () => {
    const cases = [
        [{ ...env(), GITHUB_REF: 'wrong' }, response({}), ['CI_ENV_VALIDATE'], 'CI_IDENTITY_REFUSED', 0],
        [{ ...env(), ACTIONS_ID_TOKEN_REQUEST_URL: 'https://other.invalid/' }, response({}), ['CI_ENV_VALIDATE', 'OIDC_TARGET_VALIDATE'], 'OIDC_REQUEST_TARGET_REFUSED', 0],
        [{ ...env(), ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' }, response({}), ['CI_ENV_VALIDATE', 'OIDC_TARGET_VALIDATE'], 'OIDC_REQUEST_AUTH_REQUIRED', 0],
        [env(), null, ['CI_ENV_VALIDATE', 'OIDC_TARGET_VALIDATE', 'OIDC_REQUEST'], 'OIDC_REQUEST_FAILED', 1],
        [env(), response({ value: 'secret-like-invalid-jwt' }), ['CI_ENV_VALIDATE', 'OIDC_TARGET_VALIDATE', 'OIDC_REQUEST', 'OIDC_CLAIMS_VALIDATE'], 'OIDC_CLAIMS_INVALID', 1],
        [env(), response({ value: jwt({ ...claims(), ref: 'wrong' }) }), ['CI_ENV_VALIDATE', 'OIDC_TARGET_VALIDATE', 'OIDC_REQUEST', 'OIDC_CLAIMS_VALIDATE'], 'OIDC_CLAIMS_REFUSED', 1],
    ];
    for (const [configuration, result, expected, category, count] of cases) {
        const observed = []; let calls = 0;
        await assert.rejects(createCiAccess(configuration, async () => { calls++; if (!result) throw Error(syntheticSecret + ' https://u:p@invalid/ 秘密'); return result; }, stage => observed.push(stage)),
            error => classifyLiveError(error) === category);
        assert.equal(calls, count); assert.deepEqual(observed, expected);
        assert.ok(!JSON.stringify(observed).includes(syntheticSecret));
    }
    const observed = []; let calls = 0;
    const access = await createCiAccess(env(), async () => { calls++; return response({ value: jwt(claims()) }); }, stage => observed.push(stage));
    assert.deepEqual(observed, ['CI_ENV_VALIDATE', 'OIDC_TARGET_VALIDATE', 'OIDC_REQUEST', 'OIDC_CLAIMS_VALIDATE', 'CI_ACCESS_READY']);
    assert.equal(calls, 1); assert.equal(access.isAuthenticated(), false);
});

test('CI guards reject wrong event/repo/ref/workflow/environment/SHA and absent apply before I/O', async () => {
    assertCiEnvironment(env());
    for (const key of ['GITHUB_ACTIONS', 'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY', 'GITHUB_REPOSITORY_ID',
        'GITHUB_REF', 'GITHUB_WORKFLOW_REF', 'ISSUE118_GITHUB_ENVIRONMENT', 'ISSUE118_APPLY', 'ISSUE118_EXPECTED_RUNNER_SHA']) {
        let calls = 0;
        await assert.rejects(createCiAccess({ ...env(), [key]: 'wrong' }, async () => { calls++; }), code('CI_IDENTITY_REFUSED'));
        assert.equal(calls, 0);
    }
    for (const key of ['DEBUG', 'PWDEBUG', 'NODE_OPTIONS', 'NODE_DEBUG', 'CLERK_API_URL', 'CLERK_FAPI', 'CLERK_TESTING_TOKEN',
        'CLERK_TESTING_DEBUG', 'DATABASE_URL', 'DIRECT_URL']) assert.throws(() => assertCiEnvironment({ ...env(), [key]: 'synthetic' }), code('CI_AMBIENT_CONFIGURATION_REFUSED'));
    assert.throws(() => assertCiEnvironment({ ...env(), ACTIONS_STEP_DEBUG: 'true' }), code('CI_DEBUG_REFUSED'));
    for (const secret of ['', 'sk_live_SYNTHETIC', syntheticSecret + '\n']) assert.throws(() => assertCiEnvironment({ ...env(), ISSUE118_TEST_CLERK_SECRET_KEY: secret }), code('TEST_CLERK_KEY_REQUIRED'));
});

test('same-run rerun or missing attempt is refused before OIDC, Clerk or new fixture work', async () => {
    for (const attempt of ['2', '3', '0', '', undefined]) {
        let calls = 0;
        await assert.rejects(createCiAccess({ ...env(), GITHUB_RUN_ATTEMPT: attempt }, async () => { calls++; }), code('CI_IDENTITY_REFUSED'));
        assert.equal(calls, 0);
    }
});

test('local JWT deny guard requires all exact claims/time but does not claim signature verification', () => {
    assert.equal(assertOidcClaims(jwt(claims())).split('.').length, 3);
    for (const field of ['iss', 'aud', 'sub', 'repository', 'repository_id', 'ref', 'workflow_ref', 'environment']) {
        assert.throws(() => assertOidcClaims(jwt({ ...claims(), [field]: 'wrong' })), code('OIDC_CLAIMS_REFUSED'));
    }
    for (const change of [{ exp: 0 }, { iat: Date.now() / 1000 + 60 }, { iat: 0 }]) assert.throws(() => assertOidcClaims(jwt({ ...claims(), ...change })), code('OIDC_TIME_REFUSED'));
    for (const body of [null, [], 'synthetic']) assert.throws(() => assertOidcClaims(jwt(body)), code('OIDC_CLAIMS_INVALID'));
});

test('OIDC request target refuses credentials, HTTP, host suffix spoof, ports and fragments', () => {
    assert.equal(new URL(oidcRequestUrl(env().ACTIONS_ID_TOKEN_REQUEST_URL)).searchParams.get('audience'), ciIdentity.audience);
    for (const url of ['https://actions.githubusercontent.com.attacker.invalid/idtoken', 'http://run.actions.githubusercontent.com/idtoken',
        'https://user:fake@run.actions.githubusercontent.com/idtoken', 'https://run.actions.githubusercontent.com/idtoken#fragment',
        'https://run.actions.githubusercontent.com:123/idtoken']) assert.throws(() => oidcRequestUrl(url), code('OIDC_REQUEST_TARGET_REFUSED'));
});

test('candidate accepts opaque and suspicious same-host paths; this is an explicit destination-path expansion', () => {
    for (const path of ['/', '/other', '/idToken', '/idtoken/', '/admin/delete', '/a/../anything',
        '//other.invalid/path', '/%2e%2e/other', '/path?next=https%3A%2F%2Fevil.invalid%2F']) {
        const value = 'https://run.actions.githubusercontent.com' + path;
        const url = new URL(oidcRequestUrl(value));
        assert.equal(url.origin, 'https://run.actions.githubusercontent.com');
        assert.equal(url.searchParams.get('audience'), ciIdentity.audience);
        assert.equal(inspectOidcRequestTarget(value).guardAccepts, true);
    }
    for (const value of ['https://evil.invalid/anything', 'https://actions.githubusercontent.com/anything',
        'https://run.actions.githubusercontent.com.evil.invalid/anything', 'http://run.actions.githubusercontent.com/anything',
        'https://u:p@run.actions.githubusercontent.com/anything', 'https://run.actions.githubusercontent.com:444/anything',
        'https://run.actions.githubusercontent.com/anything#fragment'])
        assert.throws(() => oidcRequestUrl(value), code('OIDC_REQUEST_TARGET_REFUSED'));
});

test('candidate still sends one request only, never Clerk key, and rejects redirect or wrong claims after sending', async () => {
    for (const redirected of [true, false]) {
        let calls = 0;
        const configuration = { ...env(), ACTIONS_ID_TOKEN_REQUEST_URL: 'https://run.actions.githubusercontent.com/unrelated?next=https://evil.invalid/' };
        await assert.rejects(createCiAccess(configuration, async (url, options) => {
            calls++;
            assert.equal(new URL(url).origin, 'https://run.actions.githubusercontent.com');
            assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
            assert.deepEqual(options.headers, { Authorization: 'bearer SYNTHETIC_REQUEST_CREDENTIAL' });
            assert.ok(!JSON.stringify(options).includes(syntheticSecret));
            return redirected ? { ok: false } : response({ value: jwt({ ...claims(), ref: 'wrong' }) });
        }), code(redirected ? 'OIDC_REQUEST_FAILED' : 'OIDC_CLAIMS_REFUSED'));
        assert.equal(calls, 1); // A wrong-claims response cannot undo transmission to this allowed-host path.
    }
});

test('one OIDC fetch uses redirect error and bounded signal; raw errors never leave boundary', async () => {
    let calls = 0;
    const access = await createCiAccess(env(), async (url, options) => {
        calls++; assert.match(url, /audience=/); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
        return response({ value: jwt(claims()) });
    });
    assert.equal(calls, 1); assert.equal(access.isAuthenticated(), false);
    let failures = 0;
    await assert.rejects(createCiAccess(env(), async () => { failures++; throw Error('秘密 ' + syntheticSecret + ' https://u:p@invalid/'); }), code('OIDC_REQUEST_FAILED'));
    assert.equal(failures, 1);
});

test('expired OIDC is not silently refreshed or sent to the Preview', async t => {
    const now = Date.now();
    const issued = { ...claims(), exp: Math.floor(now / 1000) + 20 };
    let tokenCalls = 0, previewCalls = 0;
    const access = await createCiAccess(env(), async () => { tokenCalls++; return response({ value: jwt(issued) }); });
    t.mock.method(Date, 'now', () => now + 30000);
    await assert.rejects(async () => access.read({ fetch: async () => { previewCalls++; } }, target.origin + '/api/admin/shop'), code('OIDC_TIME_REFUSED'));
    assert.equal(tokenCalls, 1); assert.equal(previewCalls, 0);
});

test('public frontend must be exact test instance before any Backend API call', async () => {
    assertClerkPublishableKey(publicKey);
    for (const key of ['pk_live_' + publicKey.slice(8), 'pk_test_' + Buffer.from('other.clerk.accounts.dev$').toString('base64'), '']) assert.throws(() => assertClerkPublishableKey(key), code('CLERK_FRONTEND_REFUSED'));
    let calls = 0;
    const access = await createCiAccess(env(), async () => { calls++; return response({ value: jwt(claims()) }); });
    const page = { goto: async () => {}, waitForFunction: async () => {}, evaluate: async () => 'pk_live_SYNTHETIC' };
    await assert.rejects(authenticate(access, page), code('CI_AUTHENTICATION_FAILED'));
    assert.equal(calls, 1);
    await assert.rejects(authenticate(access, page), code('CI_AUTH_RETRY_REFUSED'));
});

function authFixture({ userId = ciIdentity.ownerId, owner = ciIdentity.ownerId, backendFailure, signoutFailure = false,
    setActiveFailure = false, createResponseLost = false, activationAckLost = false } = {}) {
    const calls = []; const visits = [];
    let providerSession = false; let signOutCalls = 0;
    const fetcher = async (url, options) => {
        calls.push({ url, method: options.method || 'GET', body: options.body, redirect: options.redirect });
        if (url.includes('actions.githubusercontent.com')) return response({ value: jwt(claims()) });
        assert.equal(new URL(url).origin, 'https://api.clerk.com');
        assert.equal(options.headers.Authorization, 'Bearer ' + syntheticSecret);
        if (backendFailure && url.endsWith(backendFailure)) throw Error('raw ' + syntheticSecret);
        if (url.endsWith('/users/' + ciIdentity.ownerId)) return response({ id: userId, email_addresses: [{ email_address: ciIdentity.ownerEmail }] });
        if (url.endsWith('/testing_tokens')) return response({ token: 'SYNTHETIC_TESTING_TOKEN' });
        if (url.endsWith('/sign_in_tokens')) { assert.deepEqual(JSON.parse(options.body), { user_id: ciIdentity.ownerId, expires_in_seconds: 120 }); return response({ token: 'SYNTHETIC_TICKET' }); }
        throw Error('unexpected test seam');
    };
    const clerk = { loaded: true, publishableKey: publicKey, user: null, session: null,
        client: { signIn: { create: async value => {
            assert.deepEqual({ ...value }, { strategy: 'ticket', ticket: 'SYNTHETIC_TICKET' }); providerSession = true;
            if (createResponseLost) throw Error('lost create response ' + syntheticSecret);
            return { status: 'complete', createdSessionId: 'SYNTHETIC_SESSION' };
        } } },
        setActive: async ({ session }) => {
            assert.equal(session, 'SYNTHETIC_SESSION');
            if (setActiveFailure) throw Error('activation failure ' + syntheticSecret);
            clerk.user = { id: owner }; clerk.session = { id: session };
            if (activationAckLost) throw Error('lost activation acknowledgement ' + syntheticSecret);
        },
        signOut: async () => { signOutCalls++; if (signoutFailure) throw Error(syntheticSecret); clerk.user = null; clerk.session = null; providerSession = false; } };
    const page = { goto: async url => visits.push(url), waitForFunction: async () => {},
        evaluate: async (fn, arg) => runInNewContext('(' + fn.toString() + ')(__arg)', { window: { Clerk: clerk }, __arg: arg }) };
    return { calls, visits, page, fetcher, providerSession: () => providerSession, signOutCalls: () => signOutCalls };
}

test('authentication progress is boolean-only, monotone and distinguishes no token request from unacknowledged issuance', async () => {
    const navigation = authFixture(); navigation.page.goto = async () => { throw Error(syntheticSecret); };
    const notStarted = await createCiAccess(env(), navigation.fetcher);
    await assert.rejects(authenticate(notStarted, navigation.page), code('CI_AUTHENTICATION_FAILED'));
    assert.equal(notStarted.authenticationProgress().loginNavigationStarted, true);
    assert.equal(notStarted.authenticationProgress().loginNavigationCompleted, false);
    assert.equal(notStarted.authenticationProgress().testingTokenRequestStarted, false);
    assert.equal(navigation.calls.length, 1); // OIDC only; no Backend API.
    for (const endpoint of ['testing_tokens', 'sign_in_tokens']) {
        const fixture = authFixture(); let providerIssued = false;
        const snapshots = [];
        const fetcher = async (url, options) => {
            if (url.endsWith('/' + endpoint)) { providerIssued = true; throw Error(syntheticSecret + ' lost acknowledgement'); }
            return fixture.fetcher(url, options);
        };
        const access = await createCiAccess(env(), fetcher, () => {}, { authentication: value => snapshots.push(value) });
        await assert.rejects(authenticate(access, fixture.page), code('CI_AUTHENTICATION_FAILED'));
        const progress = access.authenticationProgress();
        assert.equal(providerIssued, true); assert.equal(progress.ownerMatched, true);
        assert.equal(progress.testingTokenRequestStarted, true);
        assert.equal(progress.testingTokenReceived, endpoint === 'sign_in_tokens');
        assert.equal(progress.signInTokenRequestStarted, endpoint === 'sign_in_tokens');
        assert.equal(progress.signInTokenReceived, false); assert.equal(progress.sessionCreationAttempted, false);
        assert.equal(await access.signOut(fixture.page), 'SESSION_CREATION_NOT_ATTEMPTED');
        assert.ok(snapshots.every(value => Object.values(value).every(flag => typeof flag === 'boolean')));
        assert.ok(!JSON.stringify(snapshots).includes('SYNTHETIC'));
    }
});

test('successful and partial authentication keep existing session cleanup semantics with new progress fields', async () => {
    for (const failed of [false, true]) {
        const fixture = authFixture({ setActiveFailure: failed }); const snapshots = [];
        const access = await createCiAccess(env(), fixture.fetcher, () => {}, { authentication: value => snapshots.push(value) });
        if (failed) await assert.rejects(authenticate(access, fixture.page), code('CI_AUTHENTICATION_FAILED'));
        else await authenticate(access, fixture.page);
        const progress = access.authenticationProgress();
        assert.equal(progress.testingTokenReceived, true); assert.equal(progress.signInTokenReceived, true);
        assert.equal(progress.sessionCreationAttempted, true); assert.equal(progress.activationAcknowledged, !failed);
        assert.equal(progress.adminNavigationCompleted, !failed);
        progress.ownerMatched = false; assert.equal(access.authenticationProgress().ownerMatched, true);
        assert.equal(await access.signOut(fixture.page), failed ? 'SIGNOUT_UNVERIFIED' : 'SIGNOUT_CONFIRMED');
        assert.ok(!JSON.stringify(snapshots).includes('SYNTHETIC'));
    }
});

test('diagnostic observer failures cannot leak raw exceptions or be mistaken for successful authentication', async () => {
    const fixture = authFixture();
    const access = await createCiAccess(env(), fixture.fetcher, () => {}, { authentication: () => { throw Error(syntheticSecret); } });
    await assert.rejects(authenticate(access, fixture.page), code('CI_AUTHENTICATION_FAILED'));
    assert.equal(fixture.calls.length, 1); assert.equal(access.authenticationProgress().testingTokenRequestStarted, false);
    const route = { request: () => ({ url: () => target.origin, method: () => 'GET', allHeaders: async () => ({}) }),
        fetch: async () => ({ status: () => 200 }), fulfill: async () => {}, abort: async () => {} };
    await assert.rejects(routePreviewRequest(route, 'synthetic.payload.signature', () => { throw Error(syntheticSecret); }),
        code('TRANSPORT_DIAGNOSTIC_FAILED'));
});

test('official temporary ticket flow is fixed owner A only, no session export, signout separate', async () => {
    const fixture = authFixture(); const access = await createCiAccess(env(), fixture.fetcher);
    await authenticate(access, fixture.page);
    assert.equal(access.isAuthenticated(), true);
    assert.deepEqual(fixture.visits, [target.origin + '/admin/login', target.origin + '/admin/shop']);
    assert.equal(fixture.calls.length, 4); // OIDC, fixed-user GET, testing token, one 120s sign-in token.
    assert.equal(await access.signOut(fixture.page), 'SIGNOUT_CONFIRMED');
    assert.equal(access.isAuthenticated(), false);
});

test('wrong backend user, failed token issuance and wrong returned session owner fail closed without retry', async () => {
    for (const [options, expectedCalls] of [[{ userId: 'user_other' }, 2], [{ backendFailure: '/testing_tokens' }, 3], [{ backendFailure: '/sign_in_tokens' }, 4], [{ owner: 'user_other' }, 4]]) {
        const fixture = authFixture(options); const access = await createCiAccess(env(), fixture.fetcher);
        await assert.rejects(authenticate(access, fixture.page), code('CI_AUTHENTICATION_FAILED'));
        assert.equal(fixture.calls.length, expectedCalls); assert.equal(access.isAuthenticated(), false);
        assert.ok(!fixture.visits.includes(target.origin + '/admin/shop'));
    }
});

test('signout failure stays unverified; no raw secret-bearing exception is retained', async () => {
    const fixture = authFixture({ signoutFailure: true }); const access = await createCiAccess(env(), fixture.fetcher);
    await authenticate(access, fixture.page);
    assert.equal(await access.signOut(fixture.page), 'SIGNOUT_UNVERIFIED');
});

test('partial session creation or lost activation is UNVERIFIED even with no current local session', async () => {
    for (const options of [{ setActiveFailure: true }, { createResponseLost: true }, { activationAckLost: true }]) {
        const fixture = authFixture(options); const access = await createCiAccess(env(), fixture.fetcher);
        await assert.rejects(authenticate(access, fixture.page), code('CI_AUTHENTICATION_FAILED'));
        assert.equal(fixture.providerSession(), true); assert.equal(fixture.calls.length, 4);
        assert.equal(await access.signOut(fixture.page), 'SIGNOUT_UNVERIFIED');
        if (options.activationAckLost) {
            assert.equal(fixture.signOutCalls(), 1); assert.equal(fixture.providerSession(), false);
        } else {
            assert.equal(fixture.signOutCalls(), 0); assert.equal(fixture.providerSession(), true);
        }
        await assert.rejects(authenticate(access, fixture.page), code('CI_AUTH_RETRY_REFUSED'));
        assert.equal(fixture.calls.length, 4);
    }
});

test('Clerk/Blob forwarding strips Vercel header and forbids redirects/repeated sign-in POST', async () => {
    const fixture = authFixture(); const access = await createCiAccess(env(), fixture.fetcher); await authenticate(access, fixture.page);
    let forwarded = 0, aborted = 0; const tokenHeader = 'x-vercel-trusted-oidc-idp-token';
    const route = { request: () => ({ url: () => 'https://' + ciIdentity.clerkDomain + '/v1/client/sign_ins', method: () => 'POST', allHeaders: async () => ({ [tokenHeader]: 'SYNTHETIC_OIDC' }) }),
        fetch: async options => { forwarded++; assert.equal(options.maxRetries, 0); assert.equal(options.maxRedirects, 0); assert.ok(!Object.hasOwn(options.headers, tokenHeader)); assert.equal(new URL(options.url).searchParams.get('__clerk_testing_token'), 'SYNTHETIC_TESTING_TOKEN'); return { status: () => 200 }; },
        fulfill: async () => {}, abort: async () => { aborted++; } };
    await access.route(route); await assert.rejects(access.route(route), code('CI_ROUTE_FAILED'));
    assert.equal(forwarded, 1); assert.equal(aborted, 1);
    const redirect = { ...route, request: () => ({ url: () => 'https://' + ciIdentity.clerkDomain + '/v1/client', method: () => 'GET', allHeaders: async () => ({}) }), fetch: async () => ({ status: () => 302 }) };
    await assert.rejects(access.route(redirect), code('CI_ROUTE_FAILED'));
    let unknownFetch = 0;
    await access.route({ ...route, request: () => ({ url: () => 'https://other.invalid/' }), fetch: async () => { unknownFetch++; } });
    assert.equal(unknownFetch, 0);
});

test('readonly API interface refuses mutation before transport, provider URL/secret excluded', async () => {
    const access = await createCiAccess(env(), async () => response({ value: jwt(claims()) }));
    await assert.rejects(access.read({ fetch: async () => { throw Error(syntheticSecret); } }, target.origin + '/api/admin/shop'), code('PROTECTED_TRANSPORT_FAILED'));
    let calls = 0;
    await assert.rejects(access.read({ fetch: async () => { calls++; } }, 'https://other.invalid/'), code('API_TARGET_REFUSED'));
    assert.equal(calls, 0);
});

test('dedicated workflow is manual/one job/branch+SHA guarded, no DB secret, no normal CI privilege expansion', () => {
    const yaml = readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml', import.meta.url), 'utf8');
    const parsed = createRequire(import.meta.url)('js-yaml').load(yaml);
    assert.deepEqual(Object.keys(parsed.on), ['workflow_dispatch']);
    assert.deepEqual(parsed.permissions, { contents: 'read' });
    assert.deepEqual(Object.keys(parsed.jobs), ['live-t1']);
    assert.deepEqual(parsed.jobs['live-t1'].permissions, { contents: 'read', 'id-token': 'write' });
    const secretSteps = parsed.jobs['live-t1'].steps.filter(step => Object.values(step.env || {}).some(value => String(value).includes('secrets.')));
    assert.equal(secretSteps.length, 1); assert.equal(secretSteps[0].run, 'node scripts/check-issue118-live-t1-browser.mjs --ci-apply');
    assert.equal(secretSteps[0].if, "inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1'");
    const diagnostic = parsed.jobs['live-t1'].steps.find(step => step.run === 'node scripts/check-issue118-oidc-target.mjs --diagnose-only');
    assert.equal(diagnostic.if, "inputs.confirmation == 'DIAGNOSE_OIDC_TARGET_ONLY'");
    assert.ok(!JSON.stringify(diagnostic).includes('secrets.')); assert.ok(!Object.hasOwn(diagnostic.env, 'ISSUE118_APPLY'));
    assert.equal(parsed.jobs['live-t1'].steps.find(step => step.name === 'Check the external receipt before dependency install or secret delivery').if,
        "inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1' || inputs.confirmation == 'DIAGNOSE_PREVIEW_REDIRECT_ONLY' || inputs.confirmation == 'DIAGNOSE_HANDSHAKE_CALLBACK_ONLY' || inputs.confirmation == 'DIAGNOSE_HANDSHAKE_CLEAN_TARGET_ONLY' || inputs.confirmation == 'DIAGNOSE_DEPLOYED_SERVER_CALLBACK_ONLY'");
    assert.equal(parsed.jobs['live-t1'].steps.find(step => step.name === 'Prepare the existing isolated Playwright version (no app secrets)').if,
        "inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1' || inputs.confirmation == 'DIAGNOSE_HANDSHAKE_CALLBACK_ONLY' || inputs.confirmation == 'DIAGNOSE_HANDSHAKE_CLEAN_TARGET_ONLY' || inputs.confirmation == 'DIAGNOSE_DEPLOYED_SERVER_CALLBACK_ONLY'");
    const redirectDiagnostic = parsed.jobs['live-t1'].steps.find(step => step.run === 'node scripts/check-issue118-preview-redirect.mjs --redirect-only');
    assert.equal(redirectDiagnostic.if, "inputs.confirmation == 'DIAGNOSE_PREVIEW_REDIRECT_ONLY'");
    assert.ok(!JSON.stringify(redirectDiagnostic).includes('secrets.')); assert.ok(!Object.hasOwn(redirectDiagnostic.env, 'ISSUE118_APPLY'));
    assert.match(yaml, /workflow_dispatch:/); assert.ok(!/\n  (push|pull_request|schedule|workflow_call):/.test(yaml));
    assert.equal((yaml.match(/id-token: write/g) || []).length, 1);
    assert.match(yaml, /environment: clearallergy-e2e-test/); assert.match(yaml, /cancel-in-progress: false/);
    assert.match(yaml, /inputs.expected_runner_sha == github.sha/);
    assert.match(parsed.jobs['live-t1'].if, /github\.run_attempt == 1/);
    assert.equal((yaml.match(/secrets\./g) || []).length, 1);
    assert.ok(!yaml.includes('DATABASE_URL')); assert.ok(!yaml.includes('DIRECT_URL'));
    assert.ok(!yaml.includes('storageState')); assert.ok(!yaml.includes('continue-on-error'));
    const runner = readFileSync(new URL('../scripts/check-issue118-live-t1-browser.mjs', import.meta.url), 'utf8');
    assert.match(runner, /if \(ciTransportFailed\) throw Error\("CI_TRANSPORT_HELD"\)/);
    assert.match(runner, /else if \(menuId && ciTransportFailed\)/);
    assert.match(runner, /authenticationCleanup !== "SIGNOUT_UNVERIFIED"/);
});

test('actual CI entry refuses absent context and missing external receipt before browser/auth setup', () => {
    for (const fakeEnv of [{}, env()]) {
        const child = spawnSync(process.execPath, ['scripts/check-issue118-live-t1-browser.mjs', '--ci-apply'], {
            env: { SystemRoot: process.env.SystemRoot, ...fakeEnv }, encoding: 'utf8', windowsHide: true,
        });
        assert.equal(child.status, 1);
        assert.equal(child.stdout, '');
        assert.equal(child.stderr.trim(), 'ISSUE118_PREFLIGHT_FAILED_NO_RAW_ERROR');
        assert.ok(!child.stderr.includes(syntheticSecret));
    }
});
