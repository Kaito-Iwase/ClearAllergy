// One fixed GET then STOP. No browser, Clerk API, session, fixture or app body read.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ciIdentity, oidcRequestUrl, assertOidcClaims } from './issue118-ci-auth.mjs';
import { target, assertIdentityReceipt } from './check-issue118-live-t1-browser.mjs';
import { classifyLocationOnly } from './issue118-redirect-location.mjs';

export function assertRedirectDiagnosticEnvironment(env) {
    if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
        env.GITHUB_RUN_ATTEMPT !== '1' || env.GITHUB_REPOSITORY !== ciIdentity.repository ||
        env.GITHUB_REPOSITORY_ID !== ciIdentity.repositoryId || env.GITHUB_REF !== ciIdentity.ref ||
        env.GITHUB_WORKFLOW_REF !== ciIdentity.workflowRef || env.ISSUE118_GITHUB_ENVIRONMENT !== ciIdentity.environment ||
        env.ISSUE118_DIAGNOSTIC_MODE !== 'PREVIEW_REDIRECT_ONLY' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ||
        env.GITHUB_SHA !== env.ISSUE118_EXPECTED_RUNNER_SHA || env.ISSUE118_APPLY ||
        env.ACTIONS_STEP_DEBUG === 'true' || env.ACTIONS_RUNNER_DEBUG === 'true') throw Error('DIAGNOSTIC_CONTEXT_REFUSED');
    for (const key of ['ISSUE118_TEST_CLERK_SECRET_KEY', 'CLERK_SECRET_KEY', 'CLERK_API_URL', 'CLERK_FAPI',
        'CLERK_TESTING_TOKEN', 'CLERK_TESTING_DEBUG', 'DATABASE_URL', 'DIRECT_URL', 'DEBUG', 'PWDEBUG', 'NODE_OPTIONS', 'NODE_DEBUG']) {
        if (env[key]) throw Error('DIAGNOSTIC_CONTEXT_REFUSED');
    }
}

export async function previewRedirectDiagnostic(env, receipt, fetcher = fetch) {
    const result = { stage: 'CONTEXT', code: 'DIAGNOSTIC_INCOMPLETE', completed: false, status: null,
        oidcRequestSent: false, oidcClaimsValidated: false, appGetSent: false,
        stopBeforeFollow: true, redirectFollowed: false, browserStarted: false,
        clerkStarted: false, sessionStarted: false, fixtureWriteStarted: false };
    try {
        assertRedirectDiagnosticEnvironment(env);
        result.stage = 'IDENTITY_RECEIPT'; assertIdentityReceipt(receipt);
        result.stage = 'OIDC_TARGET';
        const requestUrl = oidcRequestUrl(env.ACTIONS_ID_TOKEN_REQUEST_URL);
        if (!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw Error('REFUSED');
        result.stage = 'OIDC_REQUEST'; result.oidcRequestSent = true;
        const issued = await fetcher(requestUrl, { method: 'GET',
            headers: { Authorization: `bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
            redirect: 'error', signal: AbortSignal.timeout(20000) });
        if (!issued.ok) throw Error('REFUSED');
        result.stage = 'OIDC_CLAIMS';
        const token = assertOidcClaims((await issued.json()).value);
        result.oidcClaimsValidated = true;
        result.stage = 'APP_GET'; result.appGetSent = true;
        const response = await fetcher(target.origin + '/admin/login', { method: 'GET',
            headers: { 'x-vercel-trusted-oidc-idp-token': token, Accept: 'text/html', 'Sec-Fetch-Dest': 'document' },
            redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000) });
        result.stage = 'APP_STATUS';
        const status = response.status;
        if (!Number.isInteger(status) || status < 100 || status > 599) throw Error('REFUSED');
        result.status = status;
        if (status >= 300 && status < 400) {
            result.stage = 'APP_LOCATION';
            result.location = classifyLocationOnly(response.headers.get('location'));
            result.code = 'APP_REDIRECT_CLASSIFIED_STOP';
        } else result.code = 'APP_NON_REDIRECT_STOP';
        // This function never visits the destination or reads the app response body.
        result.stage = 'STOP_BEFORE_FOLLOW'; result.completed = true;
    } catch { result.code = result.stage + '_FAILED'; }
    return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.slice(2).join(' ') !== '--redirect-only' || !process.env.RUNNER_TEMP ||
            !process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT) throw Error('REFUSED');
        const receipt = JSON.parse(readFileSync(process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT, 'utf8'));
        const result = await previewRedirectDiagnostic(process.env, receipt);
        const directory = join(process.env.RUNNER_TEMP, 'issue118-preview-redirect');
        mkdirSync(directory, { recursive: false });
        writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
        console.log(JSON.stringify(result));
        if (!result.completed) process.exitCode = 1;
    } catch { console.error('PREVIEW_REDIRECT_DIAGNOSTIC_REFUSED_NO_RAW_ERROR'); process.exitCode = 1; }
}
