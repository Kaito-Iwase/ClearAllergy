import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ciIdentity } from '../scripts/issue118-ci-auth.mjs';
import { target } from '../scripts/check-issue118-live-t1-browser.mjs';
import { classifyLocationOnly } from '../scripts/issue118-redirect-location.mjs';
import { previewRedirectDiagnostic } from '../scripts/check-issue118-preview-redirect.mjs';

const secret = 'SYNTHETIC_SECRET_NOT_REAL';
const env = () => ({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_REPOSITORY: ciIdentity.repository, GITHUB_REPOSITORY_ID: ciIdentity.repositoryId,
    GITHUB_REF: ciIdentity.ref, GITHUB_WORKFLOW_REF: ciIdentity.workflowRef,
    ISSUE118_GITHUB_ENVIRONMENT: ciIdentity.environment, ISSUE118_DIAGNOSTIC_MODE: 'PREVIEW_REDIRECT_ONLY',
    GITHUB_SHA: 'a'.repeat(40), ISSUE118_EXPECTED_RUNNER_SHA: 'a'.repeat(40),
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://synthetic.actions.githubusercontent.com/opaque?credential=' + secret,
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: secret });
const receipt = () => ({ ...target, environment: 'Preview', status: 'Ready', verifiedBy: 'human',
    observedUtc: new Date().toISOString(), evidenceReference: 'Synthetic offline receipt' });
const claims = () => ({ iss: 'https://token.actions.githubusercontent.com', aud: ciIdentity.audience,
    sub: `repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`, repository: ciIdentity.repository,
    repository_id: ciIdentity.repositoryId, ref: ciIdentity.ref, workflow_ref: ciIdentity.workflowRef,
    environment: ciIdentity.environment, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 });
const token = body => 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify(body)).toString('base64url') + '.synthetic';
const oidcResponse = () => ({ ok: true, json: async () => ({ value: token(claims()) }) });
const appResponse = (status, location) => ({ status, headers: { get: key => { assert.equal(key, 'location'); return location; } },
    json: () => assert.fail('Never read app body'), text: () => assert.fail('Never read app body') });
function assertStopped(result) {
    assert.equal(result.stopBeforeFollow, true); assert.equal(result.redirectFollowed, false);
    for (const key of ['browserStarted','clerkStarted','sessionStarted','fixtureWriteStarted']) assert.equal(result[key], false);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC|https:|\/admin|handshake|Authorization|bearer|sk_test_/);
}

test('Location produces mutually exclusive origin booleans only; lookalike origins are OTHER', () => {
    for (const [input, key] of [[target.origin + '/admin/shop','samePinnedApp'], ['/admin/shop','samePinnedApp'],
        ['https://' + ciIdentity.clerkDomain + '/v1/client/handshake?secret=' + secret,'knownClerk'],
        ['https://vercel.com/sso-api?secret=' + secret,'knownVercel'],
        ['https://' + ciIdentity.clerkDomain + '.invalid/','other'], ['https://vercel.com.invalid/','other']]) {
        const r = classifyLocationOnly(input); assert.equal(r[key], true); assert.equal(r.stopBeforeFollow, true);
        assert.equal(['samePinnedApp','knownClerk','knownVercel','other'].filter(k => r[k]).length, 1);
        assert.ok(Object.values(r).every(v => typeof v === 'boolean'));
        assert.doesNotMatch(JSON.stringify(r), /SYNTHETIC|https:|\/admin|handshake|sso-api/);
    }
});
test('unsafe components and malformed/missing input remain booleans; origin match is never follow permission', () => {
    for (const [input, flag] of [['https://user:' + secret + '@vercel.com/','userinfoAbsent'],
        ['http://vercel.com/','https'], ['https://vercel.com:444/','defaultPort'], [target.origin + '/#' + secret,'fragmentAbsent']]) {
        const r = classifyLocationOnly(input); assert.equal(r[flag], false); assert.equal(r.stopBeforeFollow, true);
        assert.ok(Object.values(r).every(v => typeof v === 'boolean'));
    }
    for (const value of [undefined, null, {}, '', ' ', 'https://[', 'x'.repeat(16385)]) {
        const r = classifyLocationOnly(value); assert.equal(r.parseable, false); assert.equal(r.stopBeforeFollow, true);
    }
});
test('every redirect class stops after one fixed app GET, without a follow, body read, browser or Clerk request', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
        for (const location of ['/admin/shop','https://' + ciIdentity.clerkDomain + '/v1/client/handshake?secret=' + secret,
            'https://vercel.com/sso-api?secret=' + secret,'https://other.invalid/?secret=' + secret,null,'https://[']) {
            let calls = 0;
            const r = await previewRedirectDiagnostic(env(), receipt(), async (url, options) => {
                calls++;
                if (calls === 1) { assert.equal(options.redirect, 'error'); return oidcResponse(); }
                assert.equal(calls, 2); assert.equal(url, target.origin + '/admin/login'); assert.equal(options.method, 'GET');
                assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit');
                assert.equal(options.headers.Accept, 'text/html'); assert.equal(options.headers['Sec-Fetch-Dest'], 'document');
                assert.ok(options.headers['x-vercel-trusted-oidc-idp-token']); assert.equal(options.headers.Cookie, undefined);
                return appResponse(status, location);
            });
            assert.equal(calls, 2); assert.equal(r.completed, true); assert.equal(r.status, status);
            assert.equal(r.code, 'APP_REDIRECT_CLASSIFIED_STOP'); assertStopped(r);
        }
    }
});
test('nonredirect responses stop without reading app body or loading Clerk', async () => {
    for (const status of [200, 204, 401, 403, 404, 500]) {
        let calls = 0;
        const r = await previewRedirectDiagnostic(env(), receipt(), async () => ++calls === 1 ? oidcResponse() : appResponse(status));
        assert.equal(calls, 2); assert.equal(r.code, 'APP_NON_REDIRECT_STOP'); assert.equal(r.completed, true); assertStopped(r);
    }
});
test('wrong context, secret delivery, attempt two and stale receipt refuse before any OIDC request', async () => {
    for (const change of [{GITHUB_RUN_ATTEMPT:'2'}, {GITHUB_REF:'refs/heads/main'}, {GITHUB_EVENT_NAME:'push'},
        {GITHUB_WORKFLOW_REF:'other'}, {ISSUE118_GITHUB_ENVIRONMENT:'other'}, {ISSUE118_EXPECTED_RUNNER_SHA:'b'.repeat(40)},
        {ISSUE118_DIAGNOSTIC_MODE:'OIDC_TARGET_ONLY'}, {ISSUE118_APPLY:'true'}, {ISSUE118_TEST_CLERK_SECRET_KEY:secret},
        {CLERK_SECRET_KEY:secret}, {DATABASE_URL:secret}, {NODE_OPTIONS:secret}, {ACTIONS_STEP_DEBUG:'true'}]) {
        let calls = 0; const r = await previewRedirectDiagnostic({...env(), ...change}, receipt(), async () => { calls++; });
        assert.equal(calls, 0); assert.equal(r.completed, false); assert.equal(r.code, 'CONTEXT_FAILED'); assertStopped(r);
    }
    for (const change of [{source:'b'.repeat(40)}, {environment:'Production'}, {origin:'https://other.invalid'},
        {observedUtc:'2000-01-01T00:00:00Z'}]) {
        let calls = 0; const r = await previewRedirectDiagnostic(env(), {...receipt(), ...change}, async () => { calls++; });
        assert.equal(calls, 0); assert.equal(r.code, 'IDENTITY_RECEIPT_FAILED'); assertStopped(r);
    }
});
test('OIDC target, request and claim failures prevent the app GET and expose only fixed stage codes', async () => {
    for (const scenario of ['target','credential','fetch','http','json','claim']) {
        let calls = 0; const context = env();
        if (scenario === 'target') context.ACTIONS_ID_TOKEN_REQUEST_URL = 'https://other.invalid/?secret=' + secret;
        if (scenario === 'credential') delete context.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
        const r = await previewRedirectDiagnostic(context, receipt(), async () => {
            calls++; assert.equal(calls, 1);
            if (scenario === 'fetch') throw Error(secret);
            if (scenario === 'http') return {ok:false};
            if (scenario === 'json') return {ok:true,json:async () => {throw Error(secret);}};
            return {ok:true,json:async () => ({value:token({...claims(),ref:'refs/heads/main'})})};
        });
        assert.equal(calls, ['target','credential'].includes(scenario) ? 0 : 1);
        assert.equal(r.appGetSent, false); assert.equal(r.completed, false); assertStopped(r);
    }
});
test('app fetch, status and Location failures are fixed and never retry or follow', async () => {
    for (const scenario of ['fetch','status','location']) {
        let calls = 0;
        const r = await previewRedirectDiagnostic(env(), receipt(), async () => {
            calls++; if(calls === 1) return oidcResponse(); assert.equal(calls,2);
            if (scenario === 'fetch') throw Error(secret + ' https://user:password@other.invalid/private');
            if (scenario === 'status') return {status:secret};
            return {status:307,headers:{get:() => {throw Error(secret);}}};
        });
        assert.equal(calls, 2); assert.equal(r.completed, false);
        assert.equal(r.code, {fetch:'APP_GET_FAILED',status:'APP_STATUS_FAILED',location:'APP_LOCATION_FAILED'}[scenario]); assertStopped(r);
    }
});
test('workflow diagnostic step receives no Clerk key and cannot select the live step', () => {
    const w = readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml', import.meta.url),'utf8');
    const d = w.split('- name: ONE fixed Preview GET;')[1].split('- name: Retain')[0];
    assert.match(d, /if: inputs.confirmation == 'DIAGNOSE_PREVIEW_REDIRECT_ONLY'/);
    assert.doesNotMatch(d, /secrets\.|ISSUE118_APPLY|CLERK_SECRET|--ci-apply/);
    const live = w.split('- name: ONE guarded T1;')[1].split('- name: ONE fixed Preview GET;')[0];
    assert.match(live, /if: inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1'/);
    const deps = w.split('- name: Prepare the existing isolated Playwright version')[1].split('- name: OIDC target')[0];
    assert.match(deps, /if: inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1'/);
    assert.match(w, /if: inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1' \|\| inputs.confirmation == 'DIAGNOSE_PREVIEW_REDIRECT_ONLY'/);
    assert.match(readFileSync(new URL('../scripts/browser-runner.mjs',import.meta.url),'utf8'), /tests\/issue118-redirect-diagnostic.test.mjs/);
});
test('CLI refuses absent context with fixed output and no raw filename or exception', () => {
    const r = spawnSync(process.execPath, ['scripts/check-issue118-preview-redirect.mjs','--wrong'],
        {env:{SystemRoot:process.env.SystemRoot},encoding:'utf8'});
    assert.equal(r.status, 1); assert.equal(r.stdout, '');
    assert.match(r.stderr, /^PREVIEW_REDIRECT_DIAGNOSTIC_REFUSED_NO_RAW_ERROR\s*$/);
});
