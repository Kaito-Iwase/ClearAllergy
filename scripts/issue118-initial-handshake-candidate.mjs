// Approved test-driver exception: initial main-frame document only, never API writes.
// Requires the runner's newly created nonpersistent page/context with NO global
// extraHTTPHeaders, imported cookies or storageState. Context.request owns cookies.
import { previewOrigin, scopedOidcHeaders } from './issue118-preview-transport.mjs';

export const initialHandshakeContract = Object.freeze({
    appLogin: previewOrigin + '/admin/login', clerkOrigin: 'https://one-dolphin-7936.clerk.accounts.dev',
    clerkPath: '/v1/client/handshake', apiVersion: '2026-05-12', reason: 'dev-browser-missing',
    format: 'nonce', maxRedirects: 3, maxRequests: 4,
});
const refuse = () => { throw Error('REFUSED'); };
function safeAbsolute(value) {
    if (typeof value !== 'string' || !value || value.length > 16384 || /[\u0000-\u0020\u007f]/.test(value)) refuse();
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) refuse();
    return url;
}
function query(url, required, optional = []) {
    const allowed = new Set([...required, ...optional]);
    for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key)) refuse();
    for (const key of required) if (!url.searchParams.get(key)) refuse();
}
function handshakeUrl(value) {
    const url = safeAbsolute(value);
    if (url.origin !== initialHandshakeContract.clerkOrigin || url.pathname !== initialHandshakeContract.clerkPath) refuse();
    query(url, ['redirect_url','__clerk_api_version','suffixed_cookies','__clerk_hs_reason','format']);
    if (url.searchParams.get('redirect_url') !== initialHandshakeContract.appLogin ||
        url.searchParams.get('__clerk_api_version') !== initialHandshakeContract.apiVersion ||
        url.searchParams.get('__clerk_hs_reason') !== initialHandshakeContract.reason ||
        url.searchParams.get('format') !== initialHandshakeContract.format ||
        !['true','false'].includes(url.searchParams.get('suffixed_cookies'))) refuse();
    return url.href;
}
// The callback-only diagnostic shares the SAME outbound contract, without following a callback.
export { handshakeUrl as validateInitialHandshakeTarget };
function callbackUrl(value, allowLegacyCandidate = false) {
    const url = safeAbsolute(value);
    if (url.origin !== previewOrigin || url.pathname !== '/admin/login') refuse();
    if (allowLegacyCandidate === true && url.searchParams.has('__clerk_handshake')) {
        // LOCAL candidate, opt-in only. Exactly one legacy carrier, never mixed
        // with nonce/dev-browser or other query. Shape is NOT JWT verification.
        query(url, ['__clerk_handshake']);
        if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url.searchParams.get('__clerk_handshake'))) refuse();
        // The fixed app's unchanged Clerk SDK must verify typ/alg/signature and
        // consume signed directives. The driver never decodes or trusts payload.
    } else {
        query(url, ['__clerk_handshake_nonce'], ['__clerk_db_jwt']);
    }
    return url.href;
}
function cleanUrl(value) {
    const url = safeAbsolute(value);
    if (url.href !== initialHandshakeContract.appLogin) refuse();
    return url.href;
}
function locationOnly(response) {
    const values = Object.entries(response.headers()).filter(([name]) => name.toLowerCase() === 'location');
    if (values.length !== 1) refuse();
    return values[0][1];
}

// The supplier must be createCiAccess's existing token() (which validates exact
// claims/expiry on every app use), matching the current normal transport contract.
export function createInitialHandshakeCandidate(page, getValidatedOidcToken, { allowLegacyCandidate = false } = {}) {
    let used = false;
    const report = { stage: 'NOT_STARTED', complete: false, held: false, requests: 0, redirects: 0, lastHttpStatus: null,
        handshakeUsed: false, cookieOrProviderStateMayExist: false, contextDisposalRequired: false,
        finalDocumentFulfilled: false, abortConfirmed: false, code: 'NOT_STARTED' };
    return {
        diagnostics: () => Object.freeze({ ...report }),
        async run(route) {
            try {
                report.stage = 'INITIAL_DOCUMENT_VALIDATE';
                if (used) refuse(); used = true;
                const request = route.request();
                if (request.method() !== 'GET' || request.resourceType() !== 'document' ||
                    !request.isNavigationRequest() || request.frame() !== page.mainFrame() ||
                    cleanUrl(request.url()) !== initialHandshakeContract.appLogin) refuse();
                // Shared, origin-scoped cookie storage; never read/copy/export cookies.
                const api = page.context().request;
                let url = initialHandshakeContract.appLogin;
                const phases = ['APP_INITIAL','CLERK_HANDSHAKE','APP_CALLBACK','APP_CLEAN'];
                for (let index = 0; index < initialHandshakeContract.maxRequests; index++) {
                    const phase = phases[index]; report.stage = phase + '_FETCH'; report.lastHttpStatus = null;
                    const headers = scopedOidcHeaders(url, { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' },
                        index === 1 ? undefined : getValidatedOidcToken());
                    // No initial headers, Cookie, Authorization, Referer, Origin or bypass
                    // header is forwarded. No OIDC getter is even called on the Clerk hop.
                    report.requests++; report.cookieOrProviderStateMayExist = true;
                    const response = await api.fetch(url, { method: 'GET', headers, timeout: 20000,
                        maxRedirects: 0, maxRetries: 0, failOnStatusCode: false });
                    report.stage = phase + '_RESPONSE';
                    const status = response.status();
                    if (Number.isInteger(status) && status >= 100 && status <= 599) report.lastHttpStatus = status;
                    if ((index === 0 || index === 3) && status === 200) {
                        report.stage = 'FINAL_DOCUMENT_FULFILL';
                        await route.fulfill({ response });
                        report.finalDocumentFulfilled = true; report.complete = true;
                        report.stage = 'DOCUMENT_READY'; report.code = 'DOCUMENT_READY_AUTH_NOT_VERIFIED';
                        return;
                    }
                    if (index === 0 && status === 307) { report.stage = 'APP_TO_CLERK_VALIDATE'; url = handshakeUrl(locationOnly(response)); report.handshakeUsed = true; }
                    else if (index === 1 && [302,303,307].includes(status)) { report.stage = 'CLERK_TO_APP_VALIDATE'; url = callbackUrl(locationOnly(response), allowLegacyCandidate); }
                    else if (index === 2 && status === 307) { report.stage = 'APP_CLEAN_TARGET_VALIDATE'; url = cleanUrl(locationOnly(response)); }
                    else refuse();
                    report.redirects++;
                    if (report.redirects > initialHandshakeContract.maxRedirects) refuse();
                }
                refuse();
            } catch {
                report.complete = false; report.held = true; report.code = report.stage + '_HELD';
                report.contextDisposalRequired = report.cookieOrProviderStateMayExist;
                report.abortConfirmed = false;
                try { await route.abort('blockedbyclient'); report.abortConfirmed = true; } catch { /* keep HOLD, never claim cancellation */ }
                throw Error('CI_INITIAL_HANDSHAKE_HELD');
            }
        },
    };
}
