// LOCAL, UNDEPLOYED candidate: the pure classifier is wired below to an opt-in
// callback branch in proxy.ts. No new URL or global logger/fetch interception.
// The caller enforces deployment/target guards; CI must enforce one-run use.
// It does NOT replace authenticateRequest, authorize a user or apply directives.
export async function classifyLegacyCallback(carrier, { decode, loadJwks, verifySignature }) {
    const r = { stage: 'INPUT', code: 'HOLD', carrierPresent: typeof carrier === 'string' && !!carrier,
        carrierShape: false, decoded: false, headerTypeAllowed: false, algorithmAllowed: false, kidPresent: false,
        jwksAttempted: false, jwksHttpOk: false, jwksParsed: false, kidMatched: false,
        signatureChecked: false, signatureValid: false, directiveArray: false, directivesString: false,
        directiveBounds: false, sessionDirectivePresent: false, devBrowserDirectivePresent: false };
    try {
    if (!r.carrierPresent || carrier.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(carrier)) {
        r.code = 'CARRIER_SHAPE_HELD'; return r;
    }
    r.carrierShape = true;
    let jwt;
    try { jwt = decode(carrier); } catch { r.code = 'DECODE_EXCEPTION_HELD'; return r; }
    r.decoded = !!jwt && typeof jwt === 'object';
    r.headerTypeAllowed = jwt?.header?.typ === 'JWT';
    // Diagnostic candidate is intentionally narrower than general JWT support;
    // unsupported alg is HOLD, never a declaration of app/SDK invalidity.
    r.algorithmAllowed = jwt?.header?.alg === 'RS256';
    r.kidPresent = typeof jwt?.header?.kid === 'string' && jwt.header.kid.length > 0 && jwt.header.kid.length <= 256;
    if (!r.decoded || !r.headerTypeAllowed || !r.algorithmAllowed || !r.kidPresent) {
        r.code = 'HEADER_CONTRACT_HELD'; return r;
    }
    r.stage = 'JWKS'; r.jwksAttempted = true;
    let response;
    try { response = await loadJwks(); } catch { r.code = 'JWKS_FETCH_EXCEPTION_HELD'; return r; }
    r.jwksHttpOk = response?.status === 200 && response?.ok === true;
    if (!r.jwksHttpOk) { r.code = 'JWKS_HTTP_HELD'; return r; }
    let document;
    try { document = await response.json(); } catch { r.code = 'JWKS_JSON_EXCEPTION_HELD'; return r; }
    r.jwksParsed = !!document && Array.isArray(document.keys) && document.keys.length > 0 && document.keys.length <= 100;
    if (!r.jwksParsed) { r.code = 'JWKS_SHAPE_HELD'; return r; }
    const matches = document.keys.filter(k => k && typeof k === 'object' && k.kid === jwt.header.kid &&
        k.kty === 'RSA' && (k.alg === undefined || k.alg === 'RS256') && (k.use === undefined || k.use === 'sig'));
    r.kidMatched = matches.length === 1;
    if (!r.kidMatched) { r.code = 'JWKS_KEY_MATCH_HELD'; return r; }
    r.stage = 'SIGNATURE'; r.signatureChecked = true;
    try { r.signatureValid = await verifySignature(jwt, matches[0]) === true; }
    catch { r.code = 'SIGNATURE_EXCEPTION_HELD'; return r; }
    if (!r.signatureValid) { r.code = 'SIGNATURE_INVALID_HELD'; return r; }
    r.stage = 'DIRECTIVES';
    const directives = jwt.payload?.handshake;
    r.directiveArray = Array.isArray(directives);
    r.directivesString = r.directiveArray && directives.every(x => typeof x === 'string');
    r.directiveBounds = r.directivesString && directives.length <= 20 &&
        directives.every(x => x.length <= 16384 && !/[\r\n\0]/.test(x));
    if (!r.directiveArray || !r.directivesString || !r.directiveBounds) {
        r.code = 'DIRECTIVE_SHAPE_HELD'; return r;
    }
    // Inspect names only for fixed booleans, never return any directive/value.
    r.sessionDirectivePresent = directives.some(x => x.split(';')[0].split('=')[0].startsWith('__session'));
    r.devBrowserDirectivePresent = directives.some(x => x.split(';')[0].split('=')[0].startsWith('__clerk_db_jwt'));
    r.stage = 'COMPLETE'; r.code = 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH';
    return r;
    } catch {
        r.code = 'DIAGNOSTIC_EXCEPTION_HELD'; return r;
    }
}

export const callbackDiagnosticHeader = 'x-issue118-callback-diagnostic';
const projectId = 'prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK';
const jwksUrl = 'https://api.clerk.com/v1/jwks';
const maximumBodyBytes = 1024 * 1024;

// Not a public endpoint or auth substitute. Only an explicitly marked callback
// on the new test Preview's immutable host takes this diagnostic-only branch.
// The ordinary middleware response is never passed through this classifier.
export async function serverCallbackDiagnostic(request, metadata, dependencies) {
    const held = code => Response.json({ stage: 'GUARD', code }, { status: 409,
        headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
    try {
        const url = new URL(request.url);
        const uniqueHost = metadata.deploymentHost;
        if (metadata.projectId !== projectId || metadata.environment !== 'preview' || metadata.branch !== 'test/staging' ||
            !/^[a-f0-9]{40}$/.test(metadata.sourceSha || '') ||
            typeof uniqueHost !== 'string' || !/^[a-z0-9-]+\.vercel\.app$/.test(uniqueHost) ||
            url.origin !== 'https://' + uniqueHost || url.username || url.password || url.port || url.hash ||
            url.pathname !== '/admin/login' || request.method !== 'GET' ||
            request.headers.get(callbackDiagnosticHeader) !== 'signature-shape-only-v1') return held('RUNTIME_TARGET_HELD');
        const keys = [...url.searchParams.keys()];
        if (keys.length !== 1 || keys[0] !== '__clerk_handshake' ||
            url.searchParams.getAll('__clerk_handshake').length !== 1) return held('CALLBACK_QUERY_HELD');
        // Lazy access: input/metadata/header checks precede any Secret lookup.
        let networkCalls = 0, keyClassHeld = false;
        const result = await classifyLegacyCallback(url.searchParams.get('__clerk_handshake'), {
            decode: dependencies.decode,
            verifySignature: dependencies.verifySignature,
            loadJwks: async () => {
                if (networkCalls !== 0) throw Error('SINGLE_REQUEST_HELD');
                const secret = dependencies.getSecretKey();
                if (typeof secret !== 'string' || !secret.startsWith('sk_test_') || secret.length < 16 ||
                    /[\r\n\0]/.test(secret)) { keyClassHeld = true; throw Error('TEST_KEY_CLASS_HELD'); }
                networkCalls++;
                const response = await dependencies.fetch(jwksUrl, { method: 'GET', redirect: 'manual', cache: 'no-store',
                    headers: { Authorization: 'Bearer ' + secret, Accept: 'application/json' },
                    signal: AbortSignal.timeout(8000) });
                return { status: response.status, ok: response.ok, json: async () => {
                    const length = response.headers.get('content-length');
                    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximumBodyBytes)) throw Error('BODY_LIMIT_HELD');
                    if (!response.body) throw Error('BODY_MISSING_HELD');
                    const reader = response.body.getReader();
                    const chunks = []; let size = 0;
                    try {
                        for (;;) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            size += value.byteLength;
                            if (size > maximumBodyBytes) { await reader.cancel(); throw Error('BODY_LIMIT_HELD'); }
                            chunks.push(value);
                        }
                    } finally { reader.releaseLock(); }
                    const buffer = new Uint8Array(size); let offset = 0;
                    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
                    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
                } };
            },
        });
        if (keyClassHeld) result.code = 'TEST_KEY_CLASS_HELD';
        return Response.json(result, { status: result.code === 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH' ? 200 : 409,
            headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
    } catch { return held('DIAGNOSTIC_WRAPPER_EXCEPTION_HELD'); }
}
