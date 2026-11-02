// The synthetic preparation stays disabled. The distinct approved diagnostic
// binds one deployed candidate and stops after its third GET, without auth.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ciIdentity, assertOidcClaims, oidcRequestUrl } from './issue118-ci-auth.mjs';
import { initialHandshakeContract } from './issue118-initial-handshake-candidate.mjs';
import { closeIsolatedBrowser } from './issue118-close-browser.mjs';
import { previewOrigin, protectedPreviewFetch } from './issue118-preview-transport.mjs';

export const disabledMode = 'PREPARE_SERVER_CALLBACK_DISABLED';
export const candidateSource = 'aa92dbba35088f807b8f54a7548556ab4009a37b';
export const deployedMode = 'DIAGNOSE_DEPLOYED_SERVER_CALLBACK_ONLY';
export const keyClassMode = 'DIAGNOSE_DEPLOYED_KEY_CLASS_ONLY';
export const deployedTarget = Object.freeze({
    project: 'clear-allergy-e2e', projectId: 'prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK',
    origin: 'https://clear-allergy-e2e-96jt03000-kaitoexe00-9350s-projects.vercel.app',
    deployment: 'dpl_3eX9TYFPF4JyCTTJoBpkwpy1hq3C', source: candidateSource,
    branch: 'test/staging', clerkDomain: ciIdentity.clerkDomain,
    owner: ciIdentity.ownerId, shop: 'cmvs4x80y000twn0wbxkwzbt6',
});
export const keyClassTarget = Object.freeze({ ...deployedTarget,
    origin: 'https://clear-allergy-e2e-9ctj3mff4-kaitoexe00-9350s-projects.vercel.app',
    deployment: 'dpl_DpA39uCzNqcbJgcoUKdfdXNgAzZq', source: 'ea9f28b14b7741276115abb8a33b331339526f5e',
});
// Not a real deployment. Replace only after an approved deployment and review.
export const syntheticTarget = Object.freeze({
    project: 'clear-allergy-e2e', projectId: 'prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK',
    origin: 'https://candidate-preview.issue118.invalid', deployment: 'dpl_SYNTHETIC_ONLY',
    source: candidateSource, branch: 'test/staging', clerkDomain: ciIdentity.clerkDomain,
    owner: ciIdentity.ownerId, shop: 'cmvs4x80y000twn0wbxkwzbt6',
});
const callbackHeader = 'x-issue118-callback-diagnostic';
const fail = code => { throw Error(code); };
function absolute(value) {
    if (typeof value !== 'string' || !value || value.length > 16384 || /[\u0000-\u0020\u007f]/.test(value)) fail('URL_HELD');
    let url; try { url = new URL(value); } catch { fail('URL_HELD'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) fail('URL_HELD');
    return url;
}
export function assertSyntheticCandidateReceipt(receipt, now = Date.now()) {
    for (const [key, value] of Object.entries(syntheticTarget)) if (receipt?.[key] !== value) fail('RECEIPT_HELD');
    if (receipt.syntheticFixtureOnly !== true || receipt.environment !== 'Preview' || receipt.status !== 'Ready' ||
        !['human', 'browser_metadata_observer'].includes(receipt.verifiedBy) ||
        typeof receipt.evidenceReference !== 'string' || !receipt.evidenceReference) fail('RECEIPT_HELD');
    const age = now - Date.parse(receipt.observedUtc);
    if (!Number.isFinite(age) || age < 0 || age > 600000 || absolute(receipt.origin).href !== receipt.origin + '/') fail('RECEIPT_HELD');
}
function assertPinnedReceipt(receipt, target, now) {
    for (const [key, value] of Object.entries(target)) if (receipt?.[key] !== value) fail('RECEIPT_HELD');
    if (receipt.syntheticFixtureOnly !== false || receipt.environment !== 'Preview' || receipt.status !== 'Ready' ||
        receipt.protection !== 'All Deployments' || receipt.sourceManifestVerified !== true ||
        receipt.branchSecretScopeVerified !== true || receipt.verifiedBy !== 'cli_metadata_observer' ||
        typeof receipt.evidenceReference !== 'string' || !receipt.evidenceReference) fail('RECEIPT_HELD');
    const age = now - Date.parse(receipt.observedUtc);
    if (!Number.isFinite(age) || age < 0 || age > 600000 || absolute(receipt.origin).href !== receipt.origin + '/') fail('RECEIPT_HELD');
}
export const assertDeployedCandidateReceipt = (receipt, now = Date.now()) => assertPinnedReceipt(receipt, deployedTarget, now);
export const assertKeyClassReceipt = (receipt, now = Date.now()) => assertPinnedReceipt(receipt, keyClassTarget, now);
function contextGuard(env, live = false, keyClassOnly = false) {
    const fields = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
        GITHUB_REPOSITORY: ciIdentity.repository, GITHUB_REPOSITORY_ID: ciIdentity.repositoryId,
        GITHUB_REF: ciIdentity.ref, GITHUB_WORKFLOW_REF: ciIdentity.workflowRef,
        ISSUE118_GITHUB_ENVIRONMENT: ciIdentity.environment,
        ISSUE118_DIAGNOSTIC_MODE: live ? keyClassOnly ? keyClassMode : deployedMode : disabledMode };
    for (const [key, value] of Object.entries(fields)) if (env[key] !== value) fail('CONTEXT_HELD');
    if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') || env.GITHUB_SHA !== env.ISSUE118_EXPECTED_RUNNER_SHA ||
        env.ACTIONS_STEP_DEBUG === 'true' || env.ACTIONS_RUNNER_DEBUG === 'true') fail('CONTEXT_HELD');
    for (const key of ['ISSUE118_APPLY', 'ISSUE118_TEST_CLERK_SECRET_KEY', 'CLERK_SECRET_KEY', 'CLERK_API_URL', 'CLERK_FAPI',
        'CLERK_TESTING_TOKEN', 'CLERK_TESTING_DEBUG', 'DATABASE_URL', 'DIRECT_URL', 'DEBUG', 'PWDEBUG', 'NODE_OPTIONS',
        'NODE_DEBUG']) if (env[key]) fail('CONTEXT_HELD');
    if (live ? !!env.ISSUE118_OFFLINE_SYNTHETIC_ONLY : env.ISSUE118_OFFLINE_SYNTHETIC_ONLY !== 'true' ||
        env.ACTIONS_ID_TOKEN_REQUEST_URL || env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) fail('CONTEXT_HELD');
}
function outbound(value, target = syntheticTarget) {
    const u = absolute(value), base = initialHandshakeContract;
    const expected = { redirect_url: target.origin + '/admin/login', __clerk_api_version: base.apiVersion,
        __clerk_hs_reason: base.reason, format: base.format };
    if (u.origin !== base.clerkOrigin || u.pathname !== base.clerkPath || [...u.searchParams.keys()].length !== 5) fail('OUTBOUND_HELD');
    for (const [key, val] of Object.entries(expected)) if (u.searchParams.getAll(key).length !== 1 || u.searchParams.get(key) !== val) fail('OUTBOUND_HELD');
    if (u.searchParams.getAll('suffixed_cookies').length !== 1 || !['true', 'false'].includes(u.searchParams.get('suffixed_cookies'))) fail('OUTBOUND_HELD');
    return u.href;
}
function callback(value, target = syntheticTarget) {
    const u = absolute(value), q = u.searchParams;
    if (u.origin !== target.origin || u.pathname !== '/admin/login' || [...q.keys()].length !== 1 ||
        q.getAll('__clerk_handshake').length !== 1 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(q.get('__clerk_handshake') || '')) fail('CALLBACK_HELD');
    return u.href;
}
function location(response) {
    const entries = Object.entries(response.headers()).filter(([key]) => key.toLowerCase() === 'location');
    if (entries.length !== 1) fail('LOCATION_HELD');
    return entries[0][1];
}
const serverFlags = ['carrierPresent', 'carrierShape', 'decoded', 'headerTypeAllowed', 'algorithmAllowed', 'kidPresent',
    'jwksAttempted', 'jwksHttpOk', 'jwksParsed', 'kidMatched', 'signatureChecked', 'signatureValid',
    'directiveArray', 'directivesString', 'directiveBounds', 'sessionDirectivePresent', 'devBrowserDirectivePresent'];
const serverCodes = new Set(['CARRIER_SHAPE_HELD', 'DECODE_EXCEPTION_HELD', 'HEADER_CONTRACT_HELD',
    'JWKS_FETCH_EXCEPTION_HELD', 'JWKS_HTTP_HELD', 'JWKS_JSON_EXCEPTION_HELD', 'JWKS_SHAPE_HELD',
    'JWKS_KEY_MATCH_HELD', 'SIGNATURE_EXCEPTION_HELD', 'SIGNATURE_INVALID_HELD', 'DIRECTIVE_SHAPE_HELD',
    'TEST_KEY_CLASS_HELD', 'DIAGNOSTIC_EXCEPTION_HELD', 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH']);
const serverGuardCodes = new Set(['RUNTIME_TARGET_HELD', 'CALLBACK_QUERY_HELD', 'DIAGNOSTIC_WRAPPER_EXCEPTION_HELD']);
const keyClassFlags = ['keyReadAttempted', 'keyReadCompleted', 'keyPresent', 'typeUndefined', 'typeNull', 'typeString',
    'typeNumber', 'typeBoolean', 'typeObject', 'typeFunction', 'typeSymbol', 'typeBigInt', 'nonEmptyString',
    'modernTestPrefix', 'legacyTestPrefix', 'productionPrefix', 'publishablePrefix', 'minimumLength16',
    'hasCr', 'hasLf', 'hasNul', 'hasOtherAsciiControl', 'trimWouldChange', 'sdkDevelopmentCheckAttempted',
    'sdkDevelopmentCheckCompleted', 'sdkDevelopmentClassified', 'existingDiagnosticGuardWouldAllow'];
function keyClassSchema(body, status) {
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length !== keyClassFlags.length ||
        Object.keys(body).some(key => !keyClassFlags.includes(key)) || keyClassFlags.some(key => typeof body[key] !== 'boolean') ||
        body.keyReadAttempted !== true) fail('KEY_CLASS_SCHEMA_HELD');
    const types = keyClassFlags.filter(key => key.startsWith('type'));
    const stringFlags = ['nonEmptyString', 'modernTestPrefix', 'legacyTestPrefix', 'productionPrefix', 'publishablePrefix',
        'minimumLength16', 'hasCr', 'hasLf', 'hasNul', 'hasOtherAsciiControl', 'trimWouldChange',
        'sdkDevelopmentCheckAttempted', 'sdkDevelopmentCheckCompleted', 'sdkDevelopmentClassified', 'existingDiagnosticGuardWouldAllow'];
    if (body.keyReadCompleted) {
        if (types.filter(key => body[key]).length !== 1 || body.keyPresent !== (!body.typeUndefined && !body.typeNull)) fail('KEY_CLASS_SCHEMA_HELD');
    } else if (keyClassFlags.some(key => key !== 'keyReadAttempted' && body[key])) fail('KEY_CLASS_SCHEMA_HELD');
    if (!body.typeString && stringFlags.some(key => body[key])) fail('KEY_CLASS_SCHEMA_HELD');
    if (body.typeString && (!body.sdkDevelopmentCheckAttempted ||
        body.existingDiagnosticGuardWouldAllow !== (body.modernTestPrefix && body.minimumLength16 && !body.hasCr && !body.hasLf && !body.hasNul) ||
        (!body.sdkDevelopmentCheckCompleted && body.sdkDevelopmentClassified))) fail('KEY_CLASS_SCHEMA_HELD');
    const prefixes = ['modernTestPrefix', 'legacyTestPrefix', 'productionPrefix', 'publishablePrefix'];
    const contentFlags = [...prefixes, 'minimumLength16', 'hasCr', 'hasLf', 'hasNul', 'hasOtherAsciiControl', 'trimWouldChange'];
    if (prefixes.filter(key => body[key]).length > 1 ||
        (!body.nonEmptyString && contentFlags.some(key => body[key])) ||
        (body.sdkDevelopmentCheckCompleted && body.sdkDevelopmentClassified !== (body.modernTestPrefix || body.legacyTestPrefix))) fail('KEY_CLASS_SCHEMA_HELD');
    const complete = body.keyReadCompleted && (!body.typeString || body.sdkDevelopmentCheckCompleted);
    if (status !== (complete ? 200 : 409)) fail('KEY_CLASS_SCHEMA_HELD');
    return body;
}
async function serverResult(response, observeHeld = false, keyClassOnly = false) {
    const status = response.status();
    if (status !== 200 && !(observeHeld && status === 409)) fail('SERVER_HOLD_OR_HTTP_HELD');
    const headers = response.headers();
    for (const name of Object.keys(headers)) if (name.toLowerCase() === 'location') fail('SERVER_REDIRECT_HELD');
    if (!/^application\/json(?:;|$)/i.test(headers['content-type'] || '') || headers['cache-control'] !== 'no-store') fail('SERVER_HEADERS_HELD');
    const declared = headers['content-length'];
    if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > 16384)) fail('SERVER_SIZE_HELD');
    // APIResponse already buffers transport data: this is an acceptance bound,
    // NOT a claim of streaming/pre-allocation memory enforcement.
    const bytes = await response.body();
    if (!Buffer.isBuffer(bytes) || bytes.length > 16384) fail('SERVER_SIZE_HELD');
    let body; try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('SERVER_JSON_HELD'); }
    if (keyClassOnly) return keyClassSchema(body, status);
    if (observeHeld && status === 409 && body?.stage === 'GUARD' && Object.keys(body).length === 2 && serverGuardCodes.has(body.code))
        return body;
    if (observeHeld && status === 409 && body && !Array.isArray(body) && Object.keys(body).length === serverFlags.length + 2 &&
        Object.keys(body).every(key => ['stage', 'code', ...serverFlags].includes(key)) &&
        ['INPUT', 'JWKS', 'SIGNATURE', 'DIRECTIVES'].includes(body.stage) && serverCodes.has(body.code) &&
        body.code !== 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH' && serverFlags.every(key => typeof body[key] === 'boolean')) return body;
    if (status !== 200 || !body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length !== serverFlags.length + 2 ||
        Object.keys(body).some(key => !['stage', 'code', ...serverFlags].includes(key)) ||
        body.stage !== 'COMPLETE' || body.code !== 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH' ||
        serverFlags.some(key => typeof body[key] !== 'boolean') || serverFlags.slice(0, 15).some(key => body[key] !== true)) fail('SERVER_SCHEMA_OR_SIGNATURE_HELD');
    return body;
}
const deadlineError = () => Error('DEADLINE_HELD');
// Same runtime as the subsequent T1. This reads only the existing boolean marker;
// no Clerk request or authentication is started by this preflight.
export async function readT1KeyClassPreflight(api, token) {
    try {
        const response = await protectedPreviewFetch(api, previewOrigin + '/admin/login',
            { headers: { 'x-issue118-callback-diagnostic': 'key-class-only-v1' } }, token);
        return await serverResult(response, true, true);
    } catch { fail('T1_KEY_CLASS_READ_HELD'); }
}
export function assertT1KeyClassReady(observation) {
    try {
        keyClassSchema(observation, 200);
        for (const key of ['keyReadCompleted', 'keyPresent', 'typeString', 'nonEmptyString',
            'modernTestPrefix', 'minimumLength16', 'sdkDevelopmentCheckCompleted',
            'sdkDevelopmentClassified', 'existingDiagnosticGuardWouldAllow']) {
            if (observation[key] !== true) fail('T1_KEY_CLASS_NOT_READY');
        }
        for (const key of ['legacyTestPrefix', 'productionPrefix', 'publishablePrefix',
            'hasCr', 'hasLf', 'hasNul', 'hasOtherAsciiControl', 'trimWouldChange']) {
            if (observation[key] !== false) fail('T1_KEY_CLASS_NOT_READY');
        }
    } catch { fail('T1_KEY_CLASS_NOT_READY'); }
    return true; // Format only; credential validity is established later, if at all.
}
async function deadline(operation, milliseconds) {
    let timer;
    try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timer = setTimeout(() => reject(deadlineError()), milliseconds);
    })]); } finally { clearTimeout(timer); }
}

async function candidateProtocol(env, receipt, seams, live, keyClassOnly = false) {
    const target = live ? keyClassOnly ? keyClassTarget : deployedTarget : syntheticTarget;
    const assertReceipt = live ? keyClassOnly ? assertKeyClassReceipt : assertDeployedCandidateReceipt : assertSyntheticCandidateReceipt;
    const r = { stage: 'CONTEXT', code: 'HOLD', offlineOnly: !live, completed: false,
        oidcRequestSent: false, oidcClaimsAccepted: false,
        receiptAccepted: false, ownerReceiptMatched: false, liveOwnerVerified: false, tokenLocallyGuarded: false,
        browserLaunchAttempted: false, contextCreateAttempted: false, appInitialSent: false, clerkSent: false,
        callbackSent: false, requestCount: 0, providerStateMayExist: false, serverSignatureShapeObserved: false,
        stoppedBeforeFourthGet: true, clerkJsStarted: false, explicitSessionApiStarted: false, fixtureWriteStarted: false };
    let browser, context;
    if (keyClassOnly) r.stoppedBeforeSecondGet = true;
    let now = Date.now, timeout = 20000;
    try {
        now = seams?.now || Date.now; timeout = seams?.timeoutMs ?? 20000;
        contextGuard(env, live, keyClassOnly);
        if ((!live && (seams?.kind !== 'SYNTHETIC_OFFLINE_ONLY' ||
            typeof seams.token !== 'string' || seams.token.split('.')[2] !== 'OFFLINE_SIGNATURE')) ||
            typeof seams?.browserFactory !== 'function' ||
            !Number.isInteger(timeout) || timeout < 1 || timeout > 20000) fail('OFFLINE_SEAM_HELD');
        r.stage = 'RECEIPT'; assertReceipt(receipt, now()); r.receiptAccepted = true; r.ownerReceiptMatched = true;
        let token = seams.token;
        if (live) {
            r.stage = 'OIDC_TARGET'; const requestUrl = oidcRequestUrl(env.ACTIONS_ID_TOKEN_REQUEST_URL);
            if (!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || typeof seams.fetcher !== 'function') fail('OIDC_REQUEST_AUTH_HELD');
            r.stage = 'OIDC_REQUEST'; r.oidcRequestSent = true;
            const issued = await deadline(() => seams.fetcher(requestUrl, { method: 'GET',
                headers: { Authorization: 'bearer ' + env.ACTIONS_ID_TOKEN_REQUEST_TOKEN },
                redirect: 'error', signal: AbortSignal.timeout(20000) }), timeout);
            if (issued?.ok !== true) fail('OIDC_REQUEST_HELD');
            const document = await deadline(() => issued.json(), timeout); token = document?.value;
        }
        r.stage = 'TOKEN'; assertOidcClaims(token, now()); r.tokenLocallyGuarded = true; r.oidcClaimsAccepted = true;
        r.stage = 'BROWSER'; r.browserLaunchAttempted = true; browser = await deadline(seams.browserFactory, timeout);
        r.stage = 'CONTEXT_CREATE'; r.contextCreateAttempted = true;
        context = await deadline(() => browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' }), timeout);
        const get = async (url, index) => {
            assertReceipt(receipt, now());
            const u = absolute(url), isApp = u.origin === target.origin;
            if (index > (keyClassOnly ? 0 : 2) || (index === 1 ? u.origin !== initialHandshakeContract.clerkOrigin : !isApp)) fail('TARGET_HELD');
            const headers = { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' };
            if (isApp) headers['x-vercel-trusted-oidc-idp-token'] = assertOidcClaims(token, now());
            if (keyClassOnly) headers[callbackHeader] = 'key-class-only-v1';
            else if (index === 2) headers[callbackHeader] = 'signature-shape-only-v1';
            r.requestCount++; r.providerStateMayExist = true;
            if (index === 0) r.appInitialSent = true; else if (index === 1) r.clerkSent = true; else r.callbackSent = true;
            return deadline(() => context.request.fetch(url, { method: 'GET', headers, maxRedirects: 0,
                maxRetries: 0, failOnStatusCode: false, timeout: 20000 }), timeout);
        };
        r.stage = 'APP_INITIAL'; const first = await get(target.origin + '/admin/login', 0);
        if (keyClassOnly) {
            r.stage = 'KEY_CLASS_RESPONSE';
            r.keyClassObservation = await deadline(() => serverResult(first, true, true), timeout);
            r.stage = 'STOP'; r.completed = true; r.code = 'KEY_CLASS_OBSERVED_NOT_KEY_VALIDITY';
            return r; // finally closes both handles. No redirect/Clerk/callback/second request.
        }
        if (first.status() !== 307) fail('INITIAL_STATUS_HELD');
        r.stage = 'OUTBOUND'; const clerkUrl = outbound(location(first), target);
        r.stage = 'CLERK'; const second = await get(clerkUrl, 1);
        if (![302, 303, 307].includes(second.status())) fail('CLERK_STATUS_HELD');
        r.stage = 'CALLBACK_TARGET'; const callbackUrl = callback(location(second), target);
        r.stage = 'CALLBACK'; const third = await get(callbackUrl, 2);
        r.stage = 'SERVER_RESULT'; const observation = await deadline(() => serverResult(third, live), timeout);
        r.serverSignatureShapeObserved = observation.code === 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH';
        if (live) r.serverObservation = observation; // Exact closed schema, no arbitrary provider data.
        r.stage = 'STOP'; r.completed = true;
        r.code = live ? 'SERVER_DIAGNOSTIC_OBSERVED_NOT_AUTH' : 'SYNTHETIC_SIGNATURE_SHAPE_OBSERVED_NOT_AUTH';
    } catch (error) {
        const known = new Set(['URL_HELD', 'CONTEXT_HELD', 'RECEIPT_HELD', 'OFFLINE_SEAM_HELD', 'OUTBOUND_HELD',
            'CALLBACK_HELD', 'LOCATION_HELD', 'INITIAL_STATUS_HELD', 'CLERK_STATUS_HELD', 'SERVER_HOLD_OR_HTTP_HELD',
            'SERVER_REDIRECT_HELD', 'SERVER_HEADERS_HELD', 'SERVER_SIZE_HELD', 'SERVER_JSON_HELD',
            'SERVER_SCHEMA_OR_SIGNATURE_HELD', 'TARGET_HELD', 'DEADLINE_HELD', 'OIDC_CLAIMS_INVALID', 'OIDC_CLAIMS_REFUSED', 'OIDC_TIME_REFUSED',
            'OIDC_REQUEST_TARGET_REFUSED', 'OIDC_REQUEST_AUTH_HELD', 'OIDC_REQUEST_HELD', 'KEY_CLASS_SCHEMA_HELD']);
        let message; try { message = error?.message; } catch { /* fixed UNKNOWN */ }
        r.code = known.has(message) ? message : 'UNKNOWN_EXCEPTION_HELD';
    } finally {
        const closes = await closeIsolatedBrowser(context && { close: () => deadline(() => context.close(), timeout) },
            browser && { close: () => deadline(() => browser.close(), timeout) }, r);
        Object.assign(r, closes);
        if (!closes.allLocalClosed) { r.completed = false; r.code = 'LOCAL_CLOSE_UNVERIFIED'; }
    }
    return r;
}
export const simulateServerCallbackCandidate = (env, receipt, seams) => candidateProtocol(env, receipt, seams, false);
export const diagnoseDeployedServerCallback = (env, receipt, fetcher, browserFactory) =>
    candidateProtocol(env, receipt, { fetcher, browserFactory }, true);
export const diagnoseKeyClassOnly = (env, receipt, fetcher, browserFactory) =>
    candidateProtocol(env, receipt, { fetcher, browserFactory }, true, true);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const argument = process.argv.slice(2).join(' ');
    if (!['--deployed-diagnostic-only', '--key-class-only'].includes(argument)) {
        console.error('SERVER_CALLBACK_CANDIDATE_DISABLED_NO_NETWORK'); process.exitCode = 1;
    } else {
        try {
            const keyClassOnly = argument === '--key-class-only';
            contextGuard(process.env, true, keyClassOnly);
            if (!process.env.RUNNER_TEMP || !process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT) fail('CONTEXT_HELD');
            const receipt = JSON.parse(readFileSync(process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT, 'utf8'));
            (keyClassOnly ? assertKeyClassReceipt : assertDeployedCandidateReceipt)(receipt);
            const directory = join(process.env.RUNNER_TEMP, keyClassOnly ? 'issue118-key-class' : 'issue118-server-callback');
            mkdirSync(directory, { recursive: false });
            writeFileSync(join(directory, 'attempt.claim'), 'ONE_DIAGNOSTIC_NO_AUTH', { flag: 'wx' });
            const require = createRequire(import.meta.url);
            const result = await (keyClassOnly ? diagnoseKeyClassOnly : diagnoseDeployedServerCallback)(process.env, receipt, fetch, async () => {
                const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
                return chromium.launch({ headless: true, channel: 'chromium' });
            });
            writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
            console.log(JSON.stringify(result));
            const observed = keyClassOnly ? result.keyClassObservation?.keyReadCompleted &&
                (!result.keyClassObservation.typeString || result.keyClassObservation.sdkDevelopmentCheckCompleted) : result.serverSignatureShapeObserved;
            if (!result.completed || !result.allLocalClosed || !observed) process.exitCode = 1;
        } catch { console.error('SERVER_CALLBACK_DIAGNOSTIC_REFUSED_NO_RAW_ERROR'); process.exitCode = 1; }
    }
}
