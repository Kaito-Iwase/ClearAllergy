// Fixed SDK/driver contract tests. Provider, cookie delivery and document are
// synthetic; these tests cannot establish live authentication or a T1 result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInitialHandshakeCandidate, initialHandshakeContract as contract } from '../scripts/issue118-initial-handshake-candidate.mjs';

const require = createRequire(import.meta.url);
const sdkEntry = require.resolve('@clerk/backend');
const sdkDirectory = dirname(sdkEntry);
const signatureMessage = 'Clerk: Handshake token verification failed due to an invalid signature. If you have switched Clerk keys locally, clear your cookies and try again.';
const malformedMessage = "Cannot read properties of null (reading 'split')";
const oidcHeader = 'x-vercel-trusted-oidc-idp-token';
const syntheticOidc = 'SYNTHETIC.OIDC.ONLY';
const syntheticApi = 'https://api.synthetic.invalid';
const syntheticKey = 'sk_test_SYNTHETIC_ONLY_NOT_A_SERVICE_KEY';
const syntheticCookie = '__clerk_db_jwt=SYNTHETIC_DB';

// Only fixed, expected errors can count as an expected failure. No raw error,
// stack, URL, cookie, JWT, directive or message is returned to the test reporter.
function errorCode(error) {
    if (error instanceof Error && Array.isArray(error.errors) && error.errors.length === 1 &&
        error.errors[0].code === 'unexpected_error' && error.errors[0].message === 'SYNTHETIC_FETCH_FAILURE') return 'MOCK_BAPI_FETCH_FAILURE';
    if (error?.constructor === Error && error.message === signatureMessage) return 'SIGNATURE_INVALID';
    if (error?.constructor === TypeError && error.message === 'SYNTHETIC_FETCH_FAILURE') return 'MOCK_FETCH_FAILURE';
    if (error?.constructor === SyntaxError && error.message === 'SYNTHETIC_JSON_FAILURE') return 'MOCK_JSON_FAILURE';
    if (error?.constructor === TypeError && error.message === malformedMessage) return 'DIRECTIVE_NULL_SPLIT';
    for (const status of [401, 503]) {
        const message = `Clerk: Handshake token verification failed: Error loading Clerk JWKS from ${syntheticApi}/v1/jwks with code=${status} Contact support@clerk.com (reason=jwk-remote-failed-to-load, token-carrier=undefined).`;
        if (error?.constructor === Error && error.message === message) return `MOCK_JWKS_HTTP_${status}`;
    }
    return 'UNKNOWN';
}

test('pinned SDK and runner: synthetic bootstrap, unknown errors never count as expected failures', async (t) => {
    const original = { fetch: globalThis.fetch, error: console.error, warn: console.warn,
        nodeEnv: process.env.NODE_ENV, telemetry: process.env.CLERK_TELEMETRY_DISABLED };
    let active, fetchCount = 0, unsafeFetch = false, logCodes = [], unknownLog = false;
    let jwk;
    process.env.NODE_ENV = 'test';
    process.env.CLERK_TELEMETRY_DISABLED = '1';
    // Installed SDK captures fetch at import. This function NEVER delegates to
    // the original fetch, even for a refused input. No server/socket/browser.
    globalThis.fetch = async (input, options = {}) => {
        fetchCount++;
        let url;
        try { url = new URL(String(input)); } catch { unsafeFetch = true; throw Error('MOCK_TARGET_REFUSED'); }
        if (url.origin !== syntheticApi || (options.method || 'GET') !== 'GET') {
            unsafeFetch = true; throw Error('MOCK_TARGET_REFUSED');
        }
        const jwks = url.pathname === '/v1/jwks';
        const nonce = url.pathname === '/v1/clients/handshake_payload';
        if (!jwks && !nonce) { unsafeFetch = true; throw Error('MOCK_PATH_REFUSED'); }
        if (active.remote === 'unknown') throw Error('SYNTHETIC_UNEXPECTED_EXCEPTION');
        if (active.remote === 'throw') throw new TypeError('SYNTHETIC_FETCH_FAILURE');
        if (active.remote === 'json') return { ok: true, json: async () => { throw new SyntaxError('SYNTHETIC_JSON_FAILURE'); } };
        if (active.remote === '401' || active.remote === '503') return Response.json({ errors: [] }, { status: Number(active.remote) });
        return jwks ? Response.json({ keys: [{ ...jwk, kid: active.id, alg: 'RS256', use: 'sig' }] }) :
            Response.json({ directives: [syntheticCookie + '; Path=/; Secure; SameSite=Lax'] });
    };
    console.error = (...args) => {
        const knownPrefix = args.length === 2 && (args[0] === 'Clerk: unable to resolve handshake:' ||
            args[0] === 'Clerk: HandshakeService: error getting handshake payload:');
        const code = knownPrefix ? errorCode(args[1]) : 'UNKNOWN';
        logCodes.push(code);
        if (code === 'UNKNOWN') unknownLog = true;
    };
    console.warn = () => { logCodes.push('UNKNOWN'); unknownLog = true; };
    try {
        const { createClerkClient } = await import(pathToFileURL(join(sdkDirectory, 'index.mjs')).href);
        const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const pem = publicKey.export({ type: 'spki', format: 'pem' }); jwk = publicKey.export({ format: 'jwk' });
        const pk = 'pk_test_' + Buffer.from(new URL(contract.clerkOrigin).hostname + '$').toString('base64');
        const reset = (c) => { active = c; fetchCount = 0; unsafeFetch = false; logCodes = []; unknownLog = false; };
        const token = (c) => {
            const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: c.id })).toString('base64url');
            const payload = Buffer.from(JSON.stringify({ handshake: c.malformed ? [null] :
                [syntheticCookie + '; Path=/; Secure; SameSite=Lax'] })).toString('base64url');
            const content = header + '.' + payload;
            let signature = sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url');
            if (c.corrupt) signature = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
            return content + '.' + signature;
        };
        const clientFor = (c) => createClerkClient({ publishableKey: pk, secretKey: syntheticKey,
            apiUrl: syntheticApi, telemetry: { disabled: true }, ...(c.remote ? {} : { jwtKey: pem }) });
        const cases = [
            { id: 'L0_VALID_LEGACY_NO_COOKIE', expected: 'CLEAN' },
            { id: 'L1_INVALID_SIGNATURE', corrupt: true, expected: 'THROW', error: 'SIGNATURE_INVALID' },
            { id: 'L2_MISSING_CARRIER_NO_COOKIE', carrier: 'none', expected: 'HANDSHAKE' },
            { id: 'L3_MISSING_CARRIER_DB_COOKIE', carrier: 'none', cookie: true, expected: 'NONE' },
            { id: 'L4_VALID_LEGACY_DB_COOKIE', cookie: true, expected: 'CLEAN' },
            { id: 'L5_MALFORMED_SIGNED_DIRECTIVE', malformed: true, expected: 'HANDSHAKE', log: 'DIRECTIVE_NULL_SPLIT' },
            { id: 'L6_JWKS_FETCH_THROW_NO_COOKIE', remote: 'throw', expected: 'HANDSHAKE', log: 'MOCK_FETCH_FAILURE', fetches: 5 },
            { id: 'L7_JWKS_FETCH_THROW_DB_COOKIE', remote: 'throw', cookie: true, expected: 'NONE', log: 'MOCK_FETCH_FAILURE', fetches: 5 },
            { id: 'L8_JWKS_HTTP401', remote: '401', expected: 'THROW', error: 'MOCK_JWKS_HTTP_401', fetches: 5 },
            { id: 'L9_JWKS_HTTP503', remote: '503', expected: 'THROW', error: 'MOCK_JWKS_HTTP_503', fetches: 5 },
            { id: 'L10_JWKS_JSON_THROW', remote: 'json', expected: 'HANDSHAKE', log: 'MOCK_JSON_FAILURE', fetches: 5 },
            { id: 'L11_JWKS_SUCCESS', remote: 'ok', expected: 'CLEAN', fetches: 1 },
            { id: 'N0_NONCE_SUCCESS', carrier: 'nonce', remote: 'ok', expected: 'CLEAN', fetches: 1 },
            { id: 'N1_NONCE_FETCH_THROW', carrier: 'nonce', remote: 'throw', expected: 'CLEAN', log: 'MOCK_BAPI_FETCH_FAILURE', fetches: 1 },
            { id: 'H0_MISSING_CARRIER_NON_DOCUMENT', carrier: 'none', dest: 'empty', expected: 'NONE' },
            { id: 'U0_FORWARDED_HOST', forwarded: true, expected: 'OTHER' },
            { id: 'G0_CLEAN_GET_COOKIE_DROPPED', carrier: 'none', expected: 'HANDSHAKE' },
            { id: 'G1_CLEAN_GET_COOKIE_PRESENT', carrier: 'none', cookie: true, expected: 'NONE' },
        ];
        const sdkObservation = async (c) => {
            reset(c);
            const url = new URL(contract.appLogin), headers = { 'Sec-Fetch-Dest': c.dest || 'document', Accept: 'text/html' };
            if (c.carrier === 'nonce') url.searchParams.set('__clerk_handshake_nonce', 'SYNTHETIC_NONCE');
            else if (c.carrier !== 'none') url.searchParams.set('__clerk_handshake', token(c));
            if (c.cookie) headers.Cookie = syntheticCookie;
            if (c.forwarded) { headers['x-forwarded-host'] = 'forwarded.synthetic.invalid'; headers['x-forwarded-proto'] = 'https'; }
            let actual = 'NONE', thrown = 'NONE', authenticated = false;
            try {
                if (c.injectUnknown) throw Error('SYNTHETIC_UNEXPECTED_EXCEPTION');
                const state = await clientFor(c).authenticateRequest(new Request(url, { headers }), { skipJwksCache: true });
                authenticated = state.isAuthenticated === true;
                const location = state.headers.get('location');
                if (location) {
                    const next = new URL(location);
                    actual = next.href === contract.appLogin ? 'CLEAN' :
                        next.origin === contract.clerkOrigin && next.pathname === contract.clerkPath ? 'HANDSHAKE' : 'OTHER';
                }
            } catch (error) { actual = 'THROW'; thrown = errorCode(error); }
            const accepted = !unsafeFetch && !unknownLog && !authenticated && actual === c.expected &&
                thrown === (c.error || 'NONE') && fetchCount === (c.fetches || 0) &&
                logCodes.length === (c.log ? 1 : 0) && (!c.log || logCodes[0] === c.log);
            return { accepted, actual, thrown, unknownLog };
        };
        for (const c of cases) await t.test(c.id, async () => {
            const observed = await sdkObservation(c);
            assert.equal(observed.accepted, true, 'SDK contract/exception classification did not match');
        });
        await t.test('UNKNOWN SDK throw cannot satisfy expected signature failure', async () => {
            const observed = await sdkObservation({ id: 'I0', expected: 'THROW', error: 'SIGNATURE_INVALID', injectUnknown: true });
            assert.equal(observed.thrown, 'UNKNOWN'); assert.equal(observed.accepted, false);
        });
        await t.test('UNKNOWN SDK swallowed exception cannot satisfy expected re-handshake', async () => {
            const observed = await sdkObservation({ id: 'I1', remote: 'unknown', expected: 'HANDSHAKE', log: 'MOCK_FETCH_FAILURE', fetches: 5 });
            assert.equal(observed.actual, 'HANDSHAKE'); assert.equal(observed.unknownLog, true); assert.equal(observed.accepted, false);
        });
        await t.test('UNKNOWN wrapped nonce error cannot satisfy expected clean callback', async () => {
            const observed = await sdkObservation({ id: 'I2', carrier: 'nonce', remote: 'unknown', expected: 'CLEAN', log: 'MOCK_BAPI_FETCH_FAILURE', fetches: 1 });
            assert.equal(observed.actual, 'CLEAN'); assert.equal(observed.unknownLog, true); assert.equal(observed.accepted, false);
        });

        const runnerCases = [
            { id: 'R0_VALID_SHARED_COOKIE_MODEL', complete: true, requests: 4 },
            { id: 'R1_JWKS_FETCH_THROW', remote: 'throw', stage: 'APP_CLEAN_TARGET_VALIDATE', requests: 3, log: 'MOCK_FETCH_FAILURE', fetches: 5 },
            { id: 'R2_MALFORMED_DIRECTIVE', malformed: true, stage: 'APP_CLEAN_TARGET_VALIDATE', requests: 3, log: 'DIRECTIVE_NULL_SPLIT' },
            { id: 'R3_COOKIE_DROPPED_AT_GET4', dropCookie: true, stage: 'APP_CLEAN_RESPONSE', requests: 4 },
            { id: 'R4_INVALID_SIGNATURE', corrupt: true, stage: 'APP_CALLBACK_FETCH', requests: 3, error: 'SIGNATURE_INVALID' },
        ];
        const runnerObservation = async (c) => {
            reset(c);
            const jwt = token(c), client = clientFor(c);
            let requests = 0, appOidc = 0, clerkOidc = 0, authenticated = false;
            let cookie = false, fulfilled = false, aborted = false, fixtureFailure = false, unknownSdk = false, sdkThrow = 'NONE';
            const api = { fetch: async (url, options) => {
                requests++;
                // Independent inner flag survives the driver's wrapping catch.
                try {
                    assert.equal(options.method, 'GET'); assert.equal(options.maxRedirects, 0); assert.equal(options.maxRetries, 0);
                    assert.equal(options.failOnStatusCode, false);
                    if (c.injectFixture && requests === 3) assert.fail('SYNTHETIC_FIXTURE_FAILURE');
                    const target = new URL(url), headers = new Headers(options.headers);
                    const app = target.origin === new URL(contract.appLogin).origin;
                    if (headers.has(oidcHeader)) {
                        assert.equal(headers.get(oidcHeader), syntheticOidc);
                        if (app) appOidc++; else clerkOidc++;
                    }
                    if (!app) {
                        assert.equal(target.origin, contract.clerkOrigin); assert.equal(target.pathname, contract.clerkPath); assert.equal(requests, 2);
                        const callback = new URL(contract.appLogin); callback.searchParams.set('__clerk_handshake', jwt);
                        return { status: () => 307, headers: () => ({ location: callback.href }) };
                    }
                    assert.equal(target.pathname, '/admin/login');
                    if (cookie && !(c.dropCookie && requests === 4)) headers.set('Cookie', syntheticCookie);
                    headers.delete(oidcHeader);
                    let state;
                    try {
                        if (c.injectSdk && requests === 3) throw Error('SYNTHETIC_UNEXPECTED_EXCEPTION');
                        state = await client.authenticateRequest(new Request(url, { headers }), { skipJwksCache: true });
                    } catch (error) {
                        sdkThrow = errorCode(error); unknownSdk = sdkThrow === 'UNKNOWN';
                        // Throw only a fixed local sentinel, no SDK payload.
                        throw Error('CLASSIFIED_SDK_THROW');
                    }
                    authenticated ||= state.isAuthenticated === true;
                    if ((state.headers.get('set-cookie') || '').includes(syntheticCookie)) cookie = true;
                    const location = state.headers.get('location');
                    // Synthetic signed-out document, not Next/React or real auth.
                    return { status: () => location ? 307 : 200, headers: () => location ? { location } : {} };
                } catch (error) {
                    if (error?.message !== 'CLASSIFIED_SDK_THROW') fixtureFailure = true;
                    throw Error('SYNTHETIC_ENDPOINT_FAILED');
                }
            } };
            const frame = {}, page = { mainFrame: () => frame, context: () => ({ request: api }) };
            const route = { request: () => ({ method: () => 'GET', resourceType: () => 'document',
                isNavigationRequest: () => true, frame: () => frame, url: () => contract.appLogin }),
                fulfill: async () => { fulfilled = true; }, abort: async () => { aborted = true; } };
            const driver = createInitialHandshakeCandidate(page, () => syntheticOidc, { allowLegacyCandidate: true });
            let unknownOuter = false;
            try { await driver.run(route); } catch (error) { unknownOuter = error?.message !== 'CI_INITIAL_HANDSHAKE_HELD'; }
            const observed = driver.diagnostics();
            const accepted = !fixtureFailure && !unknownSdk && !unknownOuter && !unsafeFetch && !unknownLog && !authenticated &&
                requests === c.requests && observed.requests === c.requests && clerkOidc === 0 && appOidc === requests - 1 &&
                sdkThrow === (c.error || 'NONE') && fetchCount === (c.fetches || 0) &&
                logCodes.length === (c.log ? 1 : 0) && (!c.log || logCodes[0] === c.log) &&
                (c.complete ? observed.complete && fulfilled && !aborted :
                    observed.held && !observed.complete && aborted && !fulfilled && observed.stage === c.stage);
            return { accepted, fixtureFailure, unknownSdk, unknownLog, stage: observed.stage, requests };
        };
        for (const c of runnerCases) await t.test(c.id, async () => {
            const observed = await runnerObservation(c);
            assert.equal(observed.accepted, true, 'runner contract/inner exception classification did not match');
        });
        for (const kind of ['injectFixture', 'injectSdk']) await t.test('wrapped ' + kind + ' cannot satisfy expected invalid-signature HOLD', async () => {
            const observed = await runnerObservation({ id: kind, [kind]: true, stage: 'APP_CALLBACK_FETCH', requests: 3, error: 'SIGNATURE_INVALID' });
            assert.equal(observed.stage, 'APP_CALLBACK_FETCH'); assert.equal(observed.requests, 3);
            assert.equal(observed.accepted, false); assert.equal(observed[kind === 'injectFixture' ? 'fixtureFailure' : 'unknownSdk'], true);
        });
        await t.test('wrapped swallowed UNKNOWN cannot satisfy expected re-handshake HOLD', async () => {
            const observed = await runnerObservation({ id: 'I4', remote: 'unknown', stage: 'APP_CLEAN_TARGET_VALIDATE', requests: 3, log: 'MOCK_FETCH_FAILURE', fetches: 5 });
            assert.equal(observed.stage, 'APP_CLEAN_TARGET_VALIDATE'); assert.equal(observed.unknownLog, true); assert.equal(observed.accepted, false);
        });
    } finally {
        globalThis.fetch = original.fetch; console.error = original.error; console.warn = original.warn;
        for (const [name, value] of [['NODE_ENV', original.nodeEnv], ['CLERK_TELEMETRY_DISABLED', original.telemetry]]) {
            if (value === undefined) delete process.env[name]; else process.env[name] = value;
        }
    }
});
