// Used only by the explicitly guarded CI path; the manual-login path has no OIDC token.
// No global extraHTTPHeaders: the token belongs to one fixed Preview origin only.
export const previewOrigin = 'https://clear-allergy-e2e-kzfhilgul-kaitoexe00-9350s-projects.vercel.app';
const oidcHeader = 'x-vercel-trusted-oidc-idp-token';

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
export async function routePreviewRequest(route, token) {
    try {
        const request = route.request();
        const url = request.url();
        const headers = scopedOidcHeaders(url, await request.allHeaders(), token);
        if (requestUrl(url).origin !== previewOrigin) return await route.continue({ headers });
        const response = await route.fetch({ headers, maxRedirects: 0, maxRetries: 0, timeout: 20000 });
        rejectRedirect(response);
        return await route.fulfill({ response });
    } catch (error) {
        let aborted = false;
        try { await route.abort('blockedbyclient'); aborted = true; } catch { /* fixed code below; never retain the provider exception */ }
        if (!aborted) throw Error('PROTECTED_ABORT_FAILED');
        // Do not pass provider messages/headers/URLs or nested exceptions to evidence.
        throw Error(error?.message === 'PROTECTED_REDIRECT_BLOCKED' ? 'PROTECTED_REDIRECT_BLOCKED' : 'PROTECTED_TRANSPORT_FAILED');
    }
}
