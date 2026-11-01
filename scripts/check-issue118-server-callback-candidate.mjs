// Disabled preparation only. CLI and workflow cannot start this protocol.
// Dependencies are mandatory synthetic seams; there is no fetch/browser default.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ciIdentity, assertOidcClaims } from './issue118-ci-auth.mjs';
import { initialHandshakeContract } from './issue118-initial-handshake-candidate.mjs';
import { closeIsolatedBrowser } from './issue118-close-browser.mjs';

export const disabledMode = 'PREPARE_SERVER_CALLBACK_DISABLED';
export const candidateSource = 'aa92dbba35088f807b8f54a7548556ab4009a37b';
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
function contextGuard(env) {
    const fields = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
        GITHUB_REPOSITORY: ciIdentity.repository, GITHUB_REPOSITORY_ID: ciIdentity.repositoryId,
        GITHUB_REF: ciIdentity.ref, GITHUB_WORKFLOW_REF: ciIdentity.workflowRef,
        ISSUE118_GITHUB_ENVIRONMENT: ciIdentity.environment, ISSUE118_DIAGNOSTIC_MODE: disabledMode,
        ISSUE118_OFFLINE_SYNTHETIC_ONLY: 'true' };
    for (const [key, value] of Object.entries(fields)) if (env[key] !== value) fail('CONTEXT_HELD');
    if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') || env.GITHUB_SHA !== env.ISSUE118_EXPECTED_RUNNER_SHA ||
        env.ACTIONS_STEP_DEBUG === 'true' || env.ACTIONS_RUNNER_DEBUG === 'true') fail('CONTEXT_HELD');
    for (const key of ['ISSUE118_APPLY', 'ISSUE118_TEST_CLERK_SECRET_KEY', 'CLERK_SECRET_KEY', 'CLERK_API_URL', 'CLERK_FAPI',
        'CLERK_TESTING_TOKEN', 'CLERK_TESTING_DEBUG', 'DATABASE_URL', 'DIRECT_URL', 'DEBUG', 'PWDEBUG', 'NODE_OPTIONS',
        'NODE_DEBUG', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) if (env[key]) fail('CONTEXT_HELD');
}
function outbound(value) {
    const u = absolute(value), base = initialHandshakeContract;
    const expected = { redirect_url: syntheticTarget.origin + '/admin/login', __clerk_api_version: base.apiVersion,
        __clerk_hs_reason: base.reason, format: base.format };
    if (u.origin !== base.clerkOrigin || u.pathname !== base.clerkPath || [...u.searchParams.keys()].length !== 5) fail('OUTBOUND_HELD');
    for (const [key, val] of Object.entries(expected)) if (u.searchParams.getAll(key).length !== 1 || u.searchParams.get(key) !== val) fail('OUTBOUND_HELD');
    if (u.searchParams.getAll('suffixed_cookies').length !== 1 || !['true', 'false'].includes(u.searchParams.get('suffixed_cookies'))) fail('OUTBOUND_HELD');
    return u.href;
}
function callback(value) {
    const u = absolute(value), q = u.searchParams;
    if (u.origin !== syntheticTarget.origin || u.pathname !== '/admin/login' || [...q.keys()].length !== 1 ||
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
async function serverResult(response) {
    if (response.status() !== 200) fail('SERVER_HOLD_OR_HTTP_HELD');
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
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length !== serverFlags.length + 2 ||
        Object.keys(body).some(key => !['stage', 'code', ...serverFlags].includes(key)) ||
        body.stage !== 'COMPLETE' || body.code !== 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH' ||
        serverFlags.some(key => typeof body[key] !== 'boolean') || serverFlags.slice(0, 15).some(key => body[key] !== true)) fail('SERVER_SCHEMA_OR_SIGNATURE_HELD');
    return true;
}
const deadlineError = () => Error('DEADLINE_HELD');
async function deadline(operation, milliseconds) {
    let timer;
    try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timer = setTimeout(() => reject(deadlineError()), milliseconds);
    })]); } finally { clearTimeout(timer); }
}

export async function simulateServerCallbackCandidate(env, receipt, seams) {
    const r = { stage: 'CONTEXT', code: 'HOLD', offlineOnly: true, completed: false,
        receiptAccepted: false, ownerReceiptMatched: false, liveOwnerVerified: false, tokenLocallyGuarded: false,
        browserLaunchAttempted: false, contextCreateAttempted: false, appInitialSent: false, clerkSent: false,
        callbackSent: false, requestCount: 0, providerStateMayExist: false, serverSignatureShapeObserved: false,
        stoppedBeforeFourthGet: true, clerkJsStarted: false, explicitSessionApiStarted: false, fixtureWriteStarted: false };
    let browser, context;
    let now = Date.now, timeout = 20000;
    try {
        now = seams?.now || Date.now; timeout = seams?.timeoutMs ?? 20000;
        contextGuard(env);
        if (seams?.kind !== 'SYNTHETIC_OFFLINE_ONLY' || typeof seams.browserFactory !== 'function' ||
            typeof seams.token !== 'string' || seams.token.split('.')[2] !== 'OFFLINE_SIGNATURE' ||
            !Number.isInteger(timeout) || timeout < 1 || timeout > 20000) fail('OFFLINE_SEAM_HELD');
        r.stage = 'RECEIPT'; assertSyntheticCandidateReceipt(receipt, now()); r.receiptAccepted = true; r.ownerReceiptMatched = true;
        r.stage = 'TOKEN'; assertOidcClaims(seams.token, now()); r.tokenLocallyGuarded = true;
        r.stage = 'BROWSER'; r.browserLaunchAttempted = true; browser = await deadline(seams.browserFactory, timeout);
        r.stage = 'CONTEXT_CREATE'; r.contextCreateAttempted = true;
        context = await deadline(() => browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' }), timeout);
        const get = async (url, index) => {
            assertSyntheticCandidateReceipt(receipt, now());
            const u = absolute(url), isApp = u.origin === syntheticTarget.origin;
            if (index > 2 || (index === 1 ? u.origin !== initialHandshakeContract.clerkOrigin : !isApp)) fail('TARGET_HELD');
            const headers = { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' };
            if (isApp) headers['x-vercel-trusted-oidc-idp-token'] = assertOidcClaims(seams.token, now());
            if (index === 2) headers[callbackHeader] = 'signature-shape-only-v1';
            r.requestCount++; r.providerStateMayExist = true;
            if (index === 0) r.appInitialSent = true; else if (index === 1) r.clerkSent = true; else r.callbackSent = true;
            return deadline(() => context.request.fetch(url, { method: 'GET', headers, maxRedirects: 0,
                maxRetries: 0, failOnStatusCode: false, timeout: 20000 }), timeout);
        };
        r.stage = 'APP_INITIAL'; const first = await get(syntheticTarget.origin + '/admin/login', 0);
        if (first.status() !== 307) fail('INITIAL_STATUS_HELD');
        r.stage = 'OUTBOUND'; const clerkUrl = outbound(location(first));
        r.stage = 'CLERK'; const second = await get(clerkUrl, 1);
        if (![302, 303, 307].includes(second.status())) fail('CLERK_STATUS_HELD');
        r.stage = 'CALLBACK_TARGET'; const callbackUrl = callback(location(second));
        r.stage = 'CALLBACK'; const third = await get(callbackUrl, 2);
        r.stage = 'SERVER_RESULT'; await deadline(() => serverResult(third), timeout); r.serverSignatureShapeObserved = true;
        r.stage = 'STOP'; r.completed = true; r.code = 'SYNTHETIC_SIGNATURE_SHAPE_OBSERVED_NOT_AUTH';
    } catch (error) {
        const known = new Set(['URL_HELD', 'CONTEXT_HELD', 'RECEIPT_HELD', 'OFFLINE_SEAM_HELD', 'OUTBOUND_HELD',
            'CALLBACK_HELD', 'LOCATION_HELD', 'INITIAL_STATUS_HELD', 'CLERK_STATUS_HELD', 'SERVER_HOLD_OR_HTTP_HELD',
            'SERVER_REDIRECT_HELD', 'SERVER_HEADERS_HELD', 'SERVER_SIZE_HELD', 'SERVER_JSON_HELD',
            'SERVER_SCHEMA_OR_SIGNATURE_HELD', 'TARGET_HELD', 'DEADLINE_HELD', 'OIDC_CLAIMS_INVALID', 'OIDC_CLAIMS_REFUSED', 'OIDC_TIME_REFUSED']);
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    console.error('SERVER_CALLBACK_CANDIDATE_DISABLED_NO_NETWORK'); process.exitCode = 1;
}
