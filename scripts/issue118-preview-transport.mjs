// Used only by the explicitly guarded CI path; the manual-login path has no OIDC token.
// No global extraHTTPHeaders: the token belongs to one fixed Preview origin only.
export const previewOrigin = 'https://clear-allergy-e2e-kzfhilgul-kaitoexe00-9350s-projects.vercel.app';
const oidcHeader = 'x-vercel-trusted-oidc-idp-token';

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
export async function routePreviewRequest(route, token, observer = () => {}) {
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
            stage = 'CONTINUE'; flags.continueStarted = true;
            const result = await route.continue({ headers });
            observeTransport(observer, transportObservation(role, method, status, 'NONE', flags));
            return result;
        }
        flags.tokenValidated = true;
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
