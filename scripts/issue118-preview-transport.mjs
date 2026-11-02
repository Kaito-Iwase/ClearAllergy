// Used only by the explicitly guarded CI path; the manual-login path has no OIDC token.
// No global extraHTTPHeaders: the token belongs to one fixed Preview origin only.
export const previewOrigin = 'https://clear-allergy-e2e-nv6akym6f-kaitoexe00-9350s-projects.vercel.app';
const oidcHeader = 'x-vercel-trusted-oidc-idp-token';

// Local SDK URL builders are loaded lazily: external-receipt guards run before npm install.
// Public host encoding is used only by the URL builders, never issued/configured as a credential.
export async function resolveClerkSdkCanonicalScript(source, headers) {
    const names = ['sdkBuildersLoaded', 'sourceIsJs', 'sourceIsUi', 'sourceMatched', 'singleLocationProperty',
        'locationIsString', 'locationBounded', 'locationControlAbsent', 'absoluteParseable', 'https',
        'userinfoAbsent', 'defaultPort', 'queryAbsent', 'fragmentAbsent', 'sameConfiguredClerk',
        'samePackagePath', 'canonicalVersion', 'sameMajor', 'matchesSdkUrl', 'targetAllowed'];
    const observation = Object.fromEntries(names.map(key => [key, false]));
    const result = { observation, url: undefined };
    try {
        const origin = 'https://one-dolphin-7936.clerk.accounts.dev';
        if (typeof source !== 'string' || !source.startsWith(origin + '/npm/@clerk/')) return result;
        const { clerkJSScriptUrl, clerkUIScriptUrl } = await import('@clerk/shared/loadClerkJsScript');
        observation.sdkBuildersLoaded = true;
        const publishableKey = 'pk_test_' + Buffer.from(new URL(origin).hostname + '$').toString('base64');
        const entries = [{ flag: 'sourceIsJs', build: clerkJSScriptUrl, option: '__internal_clerkJSVersion' },
            { flag: 'sourceIsUi', build: clerkUIScriptUrl, option: '__internal_clerkUIVersion' }];
        const entry = entries.find(e => e.build({ publishableKey }) === source);
        if (!entry) return result;
        observation[entry.flag] = true; observation.sourceMatched = true;
        const locations = Object.entries(headers).filter(([key]) => key.toLowerCase() === 'location');
        observation.singleLocationProperty = locations.length === 1;
        const location = locations.length === 1 ? locations[0][1] : undefined;
        observation.locationIsString = typeof location === 'string';
        observation.locationBounded = observation.locationIsString && location.length > 0 && location.length <= 16384;
        observation.locationControlAbsent = observation.locationIsString && !/[\u0000-\u0020\u007f]/.test(location);
        if (!observation.locationBounded || !observation.locationControlAbsent) return result;
        const target = new URL(location); observation.absoluteParseable = true;
        observation.https = target.protocol === 'https:'; observation.userinfoAbsent = !target.username && !target.password;
        observation.defaultPort = !target.port; observation.queryAbsent = !target.search && !location.includes('?');
        observation.fragmentAbsent = !target.hash && !location.includes('#'); observation.sameConfiguredClerk = target.origin === origin;
        const path = new URL(source).pathname, start = path.lastIndexOf('@') + 1, end = path.indexOf('/dist/', start);
        const prefix = path.slice(0, start), suffix = path.slice(end), major = path.slice(start, end);
        observation.samePackagePath = end > start && target.pathname.startsWith(prefix) && target.pathname.endsWith(suffix);
        if (!observation.samePackagePath) return result;
        const version = target.pathname.slice(prefix.length, -suffix.length);
        observation.canonicalVersion = /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/.test(version);
        observation.sameMajor = version.split('.')[0] === major;
        if (!observation.canonicalVersion || !observation.sameMajor) return result;
        const expected = entry.build({ publishableKey, [entry.option]: version });
        observation.matchesSdkUrl = location === expected && target.href === expected;
        observation.targetAllowed = names.filter(key => !['sourceIsJs','sourceIsUi','targetAllowed'].includes(key)).every(key => observation[key]);
        if (observation.targetAllowed) result.url = expected;
    } catch { /* Unknown provider/SDK errors are a refusal with fixed booleans, never success. */ }
    return result;
}

// Observation only: none of these predicates grants permission to follow.
// Unknown header/URL/resource strings and provider exceptions never leave this function.
export function clerkFrontendRedirectObservation({ requestUrl: rawRequest, method, resourceType, readHeaders, clerkOrigin }) {
    const names = ['requestIsConfiguredClerk', 'requestIsGet', 'resourceIsScript', 'resourceIsDocument', 'resourceIsFetch',
        'resourceIsXhr', 'requestIsClerkJsBundle', 'requestHasQuery', 'headersReadCompleted', 'singleLocationProperty',
        'locationIsString', 'locationPresent', 'locationLengthAllowed', 'locationControlAbsent', 'absoluteParseable',
        'relativeReference', 'parseable', 'https', 'userinfoAbsent', 'defaultPort', 'fragmentAbsent', 'queryAbsent',
        'targetSameConfiguredClerk', 'targetSamePinnedApp', 'targetIsJsDelivr', 'targetIsClerkCdn', 'targetIsVercel',
        'targetOtherOrigin', 'targetSamePath', 'targetIsClerkJsBundle'];
    const p = Object.fromEntries(names.map(key => [key, false]));
    p.requestIsGet = method === 'GET';
    p.resourceIsScript = resourceType === 'script'; p.resourceIsDocument = resourceType === 'document';
    p.resourceIsFetch = resourceType === 'fetch'; p.resourceIsXhr = resourceType === 'xhr';
    const bundle = path => /^\/npm\/@clerk\/clerk-js@[0-9]+(?:\.[0-9]+){0,2}\/dist\/clerk\.browser\.js$/.test(path);
    try {
        const request = new URL(rawRequest);
        p.requestIsConfiguredClerk = request.origin === clerkOrigin;
        p.requestIsClerkJsBundle = bundle(request.pathname); p.requestHasQuery = !!request.search;
        let entries;
        try { entries = Object.entries(readHeaders()).filter(([key]) => key.toLowerCase() === 'location'); p.headersReadCompleted = true; }
        catch { return p; }
        p.singleLocationProperty = entries.length === 1;
        const value = p.singleLocationProperty ? entries[0][1] : undefined;
        p.locationIsString = typeof value === 'string'; p.locationPresent = p.locationIsString && value.length > 0;
        p.locationLengthAllowed = p.locationIsString && value.length <= 16384;
        p.locationControlAbsent = p.locationIsString && !/[\u0000-\u0020\u007f]/.test(value);
        if (!p.locationPresent || !p.locationLengthAllowed || !p.locationControlAbsent) return p;
        let target;
        try { target = new URL(value); p.absoluteParseable = true; }
        catch { try { target = new URL(value, request); p.relativeReference = true; } catch { return p; } }
        p.parseable = true; p.https = target.protocol === 'https:'; p.userinfoAbsent = !target.username && !target.password;
        p.defaultPort = !target.port; p.fragmentAbsent = !target.hash; p.queryAbsent = !target.search;
        p.targetSameConfiguredClerk = target.origin === clerkOrigin; p.targetSamePinnedApp = target.origin === previewOrigin;
        // Named comparison categories, not an allowlist. Redirects to ALL categories remain refused.
        p.targetIsJsDelivr = target.origin === 'https://cdn.jsdelivr.net'; p.targetIsClerkCdn = target.origin === 'https://cdn.clerk.com';
        p.targetIsVercel = target.origin === 'https://vercel.com';
        p.targetOtherOrigin = ![p.targetSameConfiguredClerk, p.targetSamePinnedApp, p.targetIsJsDelivr, p.targetIsClerkCdn, p.targetIsVercel].some(Boolean);
        p.targetSamePath = target.pathname === request.pathname; p.targetIsClerkJsBundle = bundle(target.pathname);
    } catch { /* Fixed booleans only, never provider text or attacker strings. */ }
    return p;
}

export function transportObservation(role, method, status, exception, flags = {}) {
    const allowedExceptions = ['NONE', 'REDIRECT_REFUSED', 'TIMEOUT_EXCEPTION', 'TARGET_EXCEPTION',
        'TOKEN_EXCEPTION', 'HEADERS_EXCEPTION', 'FETCH_EXCEPTION', 'STATUS_EXCEPTION', 'FULFILL_EXCEPTION',
        'CONTINUE_EXCEPTION', 'ABORT_EXCEPTION', 'POLICY_REFUSED', 'DIAGNOSTIC_EXCEPTION'];
    return {
        originRole: ['APP', 'CLERK', 'OTHER'].includes(role) ? role : 'OTHER',
        method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method) ? method : 'OTHER',
        status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
        exception: allowedExceptions.includes(exception) ? exception : 'DIAGNOSTIC_EXCEPTION',
        stages: Object.fromEntries(['targetValidated', 'tokenValidated', 'headersRead', 'fetchStarted',
            'responseObserved', 'redirectRejected', 'fulfillStarted', 'continueStarted', 'abortAttempted',
            'abortCompleted', 'backendRequest'].map(key => [key, flags[key] === true])),
    };
}
export function transportException(error, stage) {
    // Inspect only exact local codes/name; never retain provider text or nested causes.
    try {
        const message = Object.getOwnPropertyDescriptor(error, 'message')?.value;
        if (['PROTECTED_REDIRECT_BLOCKED', 'CI_EXTERNAL_REDIRECT_REFUSED'].includes(message)) return 'REDIRECT_REFUSED';
        if (message === 'TRANSPORT_DIAGNOSTIC_FAILED') return 'DIAGNOSTIC_EXCEPTION';
        if (Object.getOwnPropertyDescriptor(error, 'name')?.value === 'TimeoutError') return 'TIMEOUT_EXCEPTION';
    } catch { /* unknown error shape stays a fixed category */ }
    return ['TARGET', 'TOKEN', 'HEADERS', 'FETCH', 'STATUS', 'FULFILL', 'CONTINUE', 'ABORT'].includes(stage)
        ? stage + '_EXCEPTION' : 'DIAGNOSTIC_EXCEPTION';
}
export function observeTransport(observer, observation) {
    try { observer(observation); } catch { throw Error('TRANSPORT_DIAGNOSTIC_FAILED'); }
}

function requestUrl(value) {
    let url;
    try { url = new URL(value); } catch { throw Error('REQUEST_URL_INVALID'); }
    if (url.username || url.password) throw Error('REQUEST_URL_CREDENTIALS_REFUSED');
    return url;
}

export function scopedOidcHeaders(url, existingHeaders, token) {
    const clean = Object.fromEntries(Object.entries(existingHeaders).filter(([key]) => key.toLowerCase() !== oidcHeader));
    if (requestUrl(url).origin !== previewOrigin) return clean;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error('OIDC_TOKEN_REQUIRED');
    // This is format checking only. Vercel checks signature, expiry and trusted claims.
    return { ...clean, [oidcHeader]: token };
}

function rejectRedirect(response) {
    if (response.status() >= 300 && response.status() < 400) throw Error('PROTECTED_REDIRECT_BLOCKED');
}

// A redirect is a HOLD, including same-origin redirects. Never automatically follow/retry.
export async function protectedPreviewFetch(api, url, options = {}, token) {
    if (requestUrl(url).origin !== previewOrigin) throw Error('API_TARGET_REFUSED');
    const method = options.method || 'GET';
    if (!['GET', 'HEAD'].includes(method)) throw Error('READONLY_API_METHOD_REQUIRED');
    const headers = scopedOidcHeaders(url, options.headers || {}, token);
    try {
        const response = await api.fetch(url, { ...options, method, headers, maxRedirects: 0, maxRetries: 0, timeout: 20000 });
        rejectRedirect(response);
        return response;
    } catch (error) {
        throw Error(error?.message === 'PROTECTED_REDIRECT_BLOCKED' ? 'PROTECTED_REDIRECT_BLOCKED' : 'PROTECTED_TRANSPORT_FAILED');
    }
}

// Fetch without redirects and fulfill only a non-redirect response. In particular, do
// not continue a token-bearing request: Playwright carries overridden headers on redirects.
export async function routePreviewRequest(route, token, observer = () => {}, assertBeforeSend = () => {}) {
    let role = 'OTHER', method = 'OTHER', status = null, stage = 'TARGET';
    const flags = {};
    try {
        const request = route.request();
        const url = request.url();
        role = requestUrl(url).origin === previewOrigin ? 'APP' : 'OTHER';
        method = typeof request.method === 'function' ? request.method() : 'OTHER';
        flags.targetValidated = true;
        stage = 'HEADERS';
        const existingHeaders = await request.allHeaders();
        flags.headersRead = true;
        stage = 'TOKEN';
        const headers = scopedOidcHeaders(url, existingHeaders, token);
        if (requestUrl(url).origin !== previewOrigin) {
            if (assertBeforeSend() !== undefined) throw Error('PROTECTED_PRE_SEND_REFUSED');
            stage = 'CONTINUE'; flags.continueStarted = true;
            const result = await route.continue({ headers });
            observeTransport(observer, transportObservation(role, method, status, 'NONE', flags));
            return result;
        }
        flags.tokenValidated = true;
        if (assertBeforeSend() !== undefined) throw Error('PROTECTED_PRE_SEND_REFUSED');
        stage = 'FETCH'; flags.fetchStarted = true;
        const response = await route.fetch({ headers, maxRedirects: 0, maxRetries: 0, timeout: 20000 });
        flags.responseObserved = true; stage = 'STATUS'; status = response.status();
        if (status >= 300 && status < 400) flags.redirectRejected = true;
        rejectRedirect(response);
        stage = 'FULFILL'; flags.fulfillStarted = true;
        const result = await route.fulfill({ response });
        observeTransport(observer, transportObservation(role, method, status, 'NONE', flags));
        return result;
    } catch (error) {
        const category = transportException(error, stage);
        let aborted = false;
        flags.abortAttempted = true;
        try { await route.abort('blockedbyclient'); aborted = true; } catch { /* fixed code below; never retain the provider exception */ }
        flags.abortCompleted = aborted;
        observeTransport(observer, transportObservation(role, method, status, aborted ? category : 'ABORT_EXCEPTION', flags));
        if (!aborted) throw Error('PROTECTED_ABORT_FAILED');
        // Do not pass provider messages/headers/URLs or nested exceptions to evidence.
        throw Error(category === 'REDIRECT_REFUSED' ? 'PROTECTED_REDIRECT_BLOCKED' : 'PROTECTED_TRANSPORT_FAILED');
    }
}
