// Test infrastructure only. Importing this module performs no I/O or authentication.
import { routePreviewRequest, protectedPreviewFetch, previewOrigin, transportObservation,
    transportException, observeTransport } from './issue118-preview-transport.mjs';
import { createInitialHandshakeCandidate } from './issue118-initial-handshake-candidate.mjs';

export const ciIdentity = Object.freeze({
    repository: 'Kaito-Iwase/ClearAllergy', repositoryId: '1144262510',
    ref: 'refs/heads/test/issue118-live-t1-20261030',
    workflowRef: 'Kaito-Iwase/ClearAllergy/.github/workflows/issue118-live-e2e.yml@refs/heads/test/issue118-live-t1-20261030',
    environment: 'clearallergy-e2e-test', audience: 'https://github.com/Kaito-Iwase',
    clerkDomain: 'one-dolphin-7936.clerk.accounts.dev',
    ownerId: 'user_3LFy4E2hco0VpC63CbjjMjOznIx', ownerEmail: 'ca-owner-a+clerk_test@example.com',
});
const fail = code => { throw Error(code); };
const jwtPart = value => { try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { fail('OIDC_CLAIMS_INVALID'); } };
export function assertCiEnvironment(env) {
    if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1' ||
        env.GITHUB_REPOSITORY !== ciIdentity.repository || env.GITHUB_REPOSITORY_ID !== ciIdentity.repositoryId ||
        env.GITHUB_REF !== ciIdentity.ref || env.GITHUB_WORKFLOW_REF !== ciIdentity.workflowRef ||
        env.ISSUE118_GITHUB_ENVIRONMENT !== ciIdentity.environment || env.ISSUE118_APPLY !== 'true' ||
        !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') || env.GITHUB_SHA !== env.ISSUE118_EXPECTED_RUNNER_SHA) fail('CI_IDENTITY_REFUSED');
    for (const key of ['DEBUG', 'PWDEBUG', 'NODE_OPTIONS', 'NODE_DEBUG', 'CLERK_API_URL', 'CLERK_FAPI',
        'CLERK_TESTING_TOKEN', 'CLERK_TESTING_DEBUG', 'DATABASE_URL', 'DIRECT_URL']) {
        if (env[key]) fail('CI_AMBIENT_CONFIGURATION_REFUSED');
    }
    if (env.ACTIONS_STEP_DEBUG === 'true' || env.ACTIONS_RUNNER_DEBUG === 'true') fail('CI_DEBUG_REFUSED');
    const key = env.ISSUE118_TEST_CLERK_SECRET_KEY || '';
    if (!/^sk_test_[A-Za-z0-9_-]+$/.test(key) || /\s/.test(key)) fail('TEST_CLERK_KEY_REQUIRED');
}
export function assertOidcClaims(token, now = Date.now()) {
    if (typeof token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) || /\s/.test(token)) fail('OIDC_CLAIMS_INVALID');
    const claims = jwtPart(token.split('.')[1]);
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) fail('OIDC_CLAIMS_INVALID');
    const expected = { iss: 'https://token.actions.githubusercontent.com', aud: ciIdentity.audience,
        sub: `repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`, repository: ciIdentity.repository,
        repository_id: ciIdentity.repositoryId, ref: ciIdentity.ref, workflow_ref: ciIdentity.workflowRef, environment: ciIdentity.environment };
    for (const [key, value] of Object.entries(expected)) if (claims[key] !== value) fail('OIDC_CLAIMS_REFUSED');
    const seconds = now / 1000;
    if (!Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) || claims.iat > seconds + 30 ||
        claims.iat < seconds - 3600 || claims.exp <= seconds + 10 || claims.exp <= claims.iat) fail('OIDC_TIME_REFUSED');
    // This is a local deny guard, NOT signature verification. Vercel verifies the JWT.
    return token;
}
export function oidcRequestUrl(value) {
    let url;
    try { url = new URL(value); } catch { fail('OIDC_REQUEST_TARGET_REFUSED'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        !url.hostname.endsWith('.actions.githubusercontent.com')) fail('OIDC_REQUEST_TARGET_REFUSED');
    url.searchParams.set('audience', ciIdentity.audience);
    return url.href;
}
// Predicate-only observation. Never return input, host, path, query, token or an exception.
// Local candidate: only the opaque path restriction is removed; tests require predicate parity.
export function inspectOidcRequestTarget(value) {
    const result = { present: typeof value === 'string' && value.length > 0, parseable: false,
        https: false, hostAllowed: false, pathAllowed: false, userinfoAbsent: false,
        portAbsent: false, fragmentAbsent: false, guardAccepts: false };
    let url;
    try { if (result.present) url = new URL(value); } catch { /* fixed booleans only */ }
    if (url) {
        result.parseable = true;
        result.https = url.protocol === 'https:';
        result.hostAllowed = url.hostname.endsWith('.actions.githubusercontent.com');
        result.pathAllowed = true; // Any parsed path; all origin/credential/fragment guards still apply.
        result.userinfoAbsent = !url.username && !url.password;
        result.portAbsent = !url.port;
        result.fragmentAbsent = !url.hash;
        result.guardAccepts = Object.values(result).slice(0, -1).every(value => value === true);
    }
    return result;
}
export function assertClerkPublishableKey(key) {
    if (typeof key !== 'string' || !key.startsWith('pk_test_')) fail('CLERK_FRONTEND_REFUSED');
    let decoded;
    try { decoded = Buffer.from(key.slice(8), 'base64').toString('utf8'); } catch { fail('CLERK_FRONTEND_REFUSED'); }
    if (decoded !== ciIdentity.clerkDomain + '$') fail('CLERK_FRONTEND_REFUSED');
}
async function jsonOnce(fetcher, url, options, code) {
    try {
        const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
        if (!response.ok) fail(code);
        return await response.json();
    } catch { fail(code); } // No provider message, response body, header, URL or stack leaves this boundary.
}
export async function createCiAccess(env, fetcher = fetch, onStage = () => {}, observers = {}) {
    onStage('CI_ENV_VALIDATE');
    assertCiEnvironment(env);
    onStage('OIDC_TARGET_VALIDATE');
    const requestUrl = oidcRequestUrl(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) fail('OIDC_REQUEST_AUTH_REQUIRED');
    onStage('OIDC_REQUEST');
    const issued = await jsonOnce(fetcher, requestUrl, { headers: { Authorization: `bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } }, 'OIDC_REQUEST_FAILED');
    onStage('OIDC_CLAIMS_VALIDATE');
    const oidc = assertOidcClaims(issued.value);
    onStage('CI_ACCESS_READY');
    const token = () => assertOidcClaims(oidc);
    let testingToken;
    let authenticated = false;
    let authenticationAttempted = false;
    let sessionCreationAttempted = false;
    let ticketRequests = 0;
    let initialHandshake, initialPage, initialDocumentWindow = false, handshakeObservationFailed = false, routeHeld = false;
    const progress = Object.fromEntries(['loginNavigationStarted', 'loginNavigationCompleted', 'clerkLoaded',
        'frontendMatched', 'ownerLookupStarted', 'ownerMatched', 'testingTokenRequestStarted', 'testingTokenReceived',
        'signInTokenRequestStarted', 'signInTokenReceived', 'sessionCreationAttempted', 'activationAcknowledged',
        'adminNavigationStarted', 'adminNavigationCompleted'].map(key => [key, false]));
    const transportObserver = observation => observeTransport(observers.transport || (() => {}), observation);
    const mark = key => {
        progress[key] = true;
        try { observers.authentication?.({ ...progress }); } catch { fail('AUTH_DIAGNOSTIC_FAILED'); }
    };
    const backend = (path, method, body, code) => jsonOnce(async (url, options) => {
        if (routeHeld) fail('CI_TRANSPORT_HELD');
        const flags = { targetValidated: true, backendRequest: true, fetchStarted: true };
        let status = null, stage = 'FETCH';
        try {
            const response = await fetcher(url, options);
            flags.responseObserved = true; stage = 'STATUS'; status = response.status;
            transportObserver(transportObservation('CLERK', method, status, 'NONE', flags));
            return response;
        } catch (error) {
            transportObserver(transportObservation('CLERK', method, status, transportException(error, stage), flags));
            throw error; // jsonOnce below converts this to its fixed code; never publishes the exception.
        }
    }, 'https://api.clerk.com/v1/' + path,
        { method, headers: { Authorization: `Bearer ${env.ISSUE118_TEST_CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}) }, code);
    return {
        token,
        read: (api, url) => protectedPreviewFetch(api, url, {}, token()),
        async route(route) {
            let role = 'OTHER', method = 'OTHER', status = null, stage = 'TARGET', delegated = false, handshakeDelegated = false;
            const flags = {};
            try {
                const request = route.request();
                const url = new URL(request.url());
                role = url.origin === previewOrigin ? 'APP' : url.origin === 'https://' + ciIdentity.clerkDomain ? 'CLERK' : 'OTHER';
                method = typeof request.method === 'function' ? request.method() : 'OTHER';
                if (url.username || url.password) fail('CI_EXTERNAL_TARGET_REFUSED');
                flags.targetValidated = true;
                if (initialDocumentWindow && request.isNavigationRequest() && request.resourceType() === 'document' &&
                    request.frame() === initialPage.mainFrame()) {
                    delegated = true; handshakeDelegated = true; stage = 'INITIAL_HANDSHAKE';
                    try { return await initialHandshake.run(route); }
                    finally {
                        initialDocumentWindow = false;
                        try { observers.handshake?.(initialHandshake.diagnostics()); }
                        catch { handshakeObservationFailed = true; fail('AUTH_DIAGNOSTIC_FAILED'); }
                    }
                }
                if (url.origin === previewOrigin) {
                    stage = 'TOKEN'; const value = token(); flags.tokenValidated = true;
                    delegated = true;
                    return await routePreviewRequest(route, value, transportObserver);
                }
                if (url.origin === 'https://' + ciIdentity.clerkDomain || url.origin === 'https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com') {
                    stage = 'HEADERS';
                    const headers = await route.request().allHeaders();
                    flags.headersRead = true;
                    for (const key of Object.keys(headers)) if (key.toLowerCase() === 'x-vercel-trusted-oidc-idp-token') delete headers[key];
                    if (url.hostname === ciIdentity.clerkDomain && testingToken && url.pathname.startsWith('/v1/')) url.searchParams.set('__clerk_testing_token', testingToken);
                    if (url.hostname === ciIdentity.clerkDomain && url.pathname === '/v1/client/sign_ins' && route.request().method() === 'POST' && ++ticketRequests > 1) fail('CLERK_TICKET_RETRY_REFUSED');
                    stage = 'FETCH'; flags.fetchStarted = true;
                    const response = await route.fetch({ url: url.href, headers, maxRedirects: 0, maxRetries: 0, timeout: 20000 });
                    flags.responseObserved = true; stage = 'STATUS'; status = response.status();
                    if (status >= 300 && status < 400) { flags.redirectRejected = true; fail('CI_EXTERNAL_REDIRECT_REFUSED'); }
                    stage = 'FULFILL'; flags.fulfillStarted = true;
                    const result = await route.fulfill({ response });
                    transportObserver(transportObservation(role, method, status, 'NONE', flags));
                    return result;
                }
                stage = 'ABORT'; flags.abortAttempted = true;
                const result = await route.abort('blockedbyclient'); flags.abortCompleted = true;
                transportObserver(transportObservation(role, method, status, 'POLICY_REFUSED', flags));
                return result;
            } catch (error) {
                routeHeld = true;
                if (!handshakeDelegated || !initialHandshake.diagnostics().held) {
                    flags.abortAttempted = true;
                    try { await route.abort('blockedbyclient'); flags.abortCompleted = true; } catch { /* fixed failure, no provider text */ }
                }
                if (!delegated) transportObserver(transportObservation(role, method, status,
                    flags.abortCompleted ? transportException(error, stage) : 'ABORT_EXCEPTION', flags));
                fail('CI_ROUTE_FAILED');
            }
        },
        async authenticate(page) {
            if (authenticationAttempted) fail('CI_AUTH_RETRY_REFUSED');
            authenticationAttempted = true;
            try {
                if (routeHeld) fail('CI_TRANSPORT_HELD');
                initialPage = page; initialHandshake = createInitialHandshakeCandidate(page, token);
                initialDocumentWindow = true;
                mark('loginNavigationStarted');
                await page.goto(previewOrigin + '/admin/login');
                initialDocumentWindow = false;
                if (!initialHandshake.diagnostics().complete || initialHandshake.diagnostics().held || handshakeObservationFailed)
                    fail('CI_INITIAL_HANDSHAKE_HELD');
                mark('loginNavigationCompleted');
                await page.waitForFunction(() => Boolean(window.Clerk?.loaded));
                mark('clerkLoaded');
                assertClerkPublishableKey(await page.evaluate(() => window.Clerk.publishableKey));
                mark('frontendMatched');
                // Existing fixed user lookup before creating any token/session; no email search or account creation.
                mark('ownerLookupStarted');
                const user = await backend('users/' + ciIdentity.ownerId, 'GET', undefined, 'CLERK_OWNER_LOOKUP_FAILED');
                if (user.id !== ciIdentity.ownerId || !user.email_addresses?.some(email => email.email_address === ciIdentity.ownerEmail)) fail('CLERK_OWNER_REFUSED');
                mark('ownerMatched'); mark('testingTokenRequestStarted');
                const testing = await backend('testing_tokens', 'POST', {}, 'CLERK_TESTING_TOKEN_FAILED');
                if (typeof testing.token !== 'string' || !testing.token) fail('CLERK_TESTING_TOKEN_FAILED');
                testingToken = testing.token;
                mark('testingTokenReceived'); mark('signInTokenRequestStarted');
                const ticket = await backend('sign_in_tokens', 'POST', { user_id: ciIdentity.ownerId, expires_in_seconds: 120 }, 'CLERK_SIGNIN_TOKEN_FAILED');
                if (typeof ticket.token !== 'string' || !ticket.token) fail('CLERK_SIGNIN_TOKEN_FAILED');
                mark('signInTokenReceived');
                if (routeHeld) fail('CI_TRANSPORT_HELD');
                // A provider session can exist even when this evaluate/activation acknowledgement is lost.
                sessionCreationAttempted = true;
                mark('sessionCreationAttempted');
                const owner = await page.evaluate(async ticketValue => {
                    const result = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: ticketValue });
                    if (result.status !== 'complete' || !result.createdSessionId) throw Error('TICKET_NOT_COMPLETE');
                    await window.Clerk.setActive({ session: result.createdSessionId });
                    return window.Clerk.user?.id;
                }, ticket.token);
                if (owner !== ciIdentity.ownerId) fail('CLERK_SESSION_OWNER_REFUSED');
                authenticated = true;
                mark('activationAcknowledged'); mark('adminNavigationStarted');
                await page.goto(previewOrigin + '/admin/shop');
                mark('adminNavigationCompleted');
            } catch { fail('CI_AUTHENTICATION_FAILED'); }
            finally { initialDocumentWindow = false; }
        },
        async signOut(page) {
            if (!authenticationAttempted) return 'NOT_STARTED';
            if (!sessionCreationAttempted) { testingToken = undefined; return 'SESSION_CREATION_NOT_ATTEMPTED'; }
            const activationAcknowledged = authenticated;
            try {
                const outcome = await page.evaluate(async owner => {
                    if (!window.Clerk?.loaded) throw Error('CLERK_UNAVAILABLE');
                    if (window.Clerk?.user && window.Clerk.user.id !== owner) throw Error('OWNER_REFUSED');
                    if (!window.Clerk.session) return 'NO_LOCAL_SESSION';
                    await window.Clerk.signOut();
                    if (window.Clerk.session) throw Error('SIGNOUT_UNCONFIRMED');
                    return 'SIGNED_OUT';
                }, ciIdentity.ownerId);
                authenticated = false;
                testingToken = undefined;
                // No local session is NOT evidence that a possibly created provider session was terminated.
                return activationAcknowledged && outcome === 'SIGNED_OUT' ? 'SIGNOUT_CONFIRMED' : 'SIGNOUT_UNVERIFIED';
            } catch { testingToken = undefined; return 'SIGNOUT_UNVERIFIED'; }
        },
        isAuthenticated: () => authenticated,
        authenticationProgress: () => ({ ...progress }),
        handshakeProgress: () => initialHandshake ? initialHandshake.diagnostics() : { stage: 'NOT_STARTED', complete: false, held: false },
    };
}
