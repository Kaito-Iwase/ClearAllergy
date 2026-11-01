import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyLegacyCallback, serverCallbackDiagnostic, callbackDiagnosticHeader,
    keyClassDiagnosticMarker, inspectSecretKeyClass } from '../lib/verification/issue118-callback-diagnostic.mjs';

const root = process.env.ISSUE118_SDK_MODULE_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jwtEntry = createRequire(join(root, 'package.json')).resolve('@clerk/backend/jwt');
const { decodeJwt, hasValidSignature } = await import(pathToFileURL(join(dirname(jwtEntry), 'index.mjs')).href);
const keysEntry = createRequire(join(root, 'package.json')).resolve('@clerk/shared/keys');
const { isDevelopmentFromSecretKey } = await import(pathToFileURL(join(dirname(keysEntry), 'keys.mjs')).href);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'SYNTHETIC_KID', alg: 'RS256', use: 'sig' };
const sentinel = 'SYNTHETIC_SENSITIVE_VALUE_NOT_A_CREDENTIAL';
const makeToken = (payload = { handshake: ['__clerk_db_jwt=' + sentinel + '; Path=/; Secure'] }, header = {}) => {
    const h = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: jwk.kid, ...header })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = h + '.' + p;
    return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
};
const cases = [
    { id: 'valid signature and dev directive only', code: 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH' },
    { id: 'missing carrier', carrier: '', code: 'CARRIER_SHAPE_HELD', loads: 0 },
    { id: 'malformed carrier', carrier: sentinel, code: 'CARRIER_SHAPE_HELD', loads: 0 },
    { id: 'unknown decoder exception', decodeFail: true, code: 'DECODE_EXCEPTION_HELD', loads: 0 },
    { id: 'unexpected header algorithm', header: { alg: 'HS256' }, code: 'HEADER_CONTRACT_HELD', loads: 0 },
    { id: 'unknown JWKS fetch exception', fetchFail: true, code: 'JWKS_FETCH_EXCEPTION_HELD' },
    { id: 'provider HTTP failure', status: 401, code: 'JWKS_HTTP_HELD' },
    { id: 'unknown provider accessor exception', statusGetFail: true, code: 'DIAGNOSTIC_EXCEPTION_HELD' },
    { id: 'unknown JSON exception', jsonFail: true, code: 'JWKS_JSON_EXCEPTION_HELD' },
    { id: 'malformed JWKS', keys: null, code: 'JWKS_SHAPE_HELD' },
    { id: 'no matching key', keys: [{ ...jwk, kid: 'OTHER_SYNTHETIC' }], code: 'JWKS_KEY_MATCH_HELD' },
    { id: 'duplicate matching keys', keys: [jwk, jwk], code: 'JWKS_KEY_MATCH_HELD' },
    { id: 'invalid signature', corrupt: true, code: 'SIGNATURE_INVALID_HELD' },
    { id: 'unknown crypto exception', signatureFail: true, code: 'SIGNATURE_EXCEPTION_HELD' },
    { id: 'signed null directive', payload: { handshake: [null] }, code: 'DIRECTIVE_SHAPE_HELD' },
    { id: 'signed CRLF directive', payload: { handshake: ['x=' + sentinel + '\r\nHeader: value'] }, code: 'DIRECTIVE_SHAPE_HELD' },
    { id: 'signed empty directive array is not authentication', payload: { handshake: [] }, code: 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH' },
];
for (const c of cases) test(c.id, async () => {
    let loads = 0, signatures = 0;
    let carrier = c.carrier ?? makeToken(c.payload, c.header);
    if (c.corrupt) { const parts = carrier.split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1); carrier = parts.join('.'); }
    const r = await classifyLegacyCallback(carrier, {
        decode: input => { if (c.decodeFail) throw Error(sentinel); return decodeJwt(input); },
        loadJwks: async () => {
            loads++; if (c.fetchFail) throw Error(sentinel);
            if (c.statusGetFail) return { get status() { throw Error(sentinel); } };
            return { status: c.status || 200, ok: !c.status, json: async () => {
                if (c.jsonFail) throw Error(sentinel); return { keys: Object.hasOwn(c, 'keys') ? c.keys : [jwk] };
            } };
        },
        verifySignature: async (jwt, key) => { signatures++; if (c.signatureFail) throw Error(sentinel); return hasValidSignature(jwt, key); },
    });
    assert.equal(r.code, c.code);
    assert.equal(loads, c.loads ?? 1);
    assert.ok(signatures <= 1);
    const serialized = JSON.stringify(r);
    assert.equal(serialized.includes(sentinel), false);
    assert.equal(serialized.includes(carrier) && !!carrier, false);
    assert.equal(serialized.includes(jwk.kid), false);
    for (const [key, value] of Object.entries(r)) assert.ok(['stage', 'code'].includes(key) || typeof value === 'boolean');
});

const host = 'ca-synthetic.vercel.app';
const meta = { projectId: 'prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK', environment: 'preview',
    branch: 'test/staging', sourceSha: 'a'.repeat(40), deploymentHost: host };
const requestFor = (options = {}) => {
    const url = new URL('https://' + host + '/admin/login');
    url.searchParams.set('__clerk_handshake', options.carrier ?? makeToken());
    if (options.url) return new Request(options.url, { headers: { [callbackDiagnosticHeader]: 'signature-shape-only-v1' } });
    if (options.mixed) url.searchParams.set('__clerk_handshake_nonce', sentinel);
    if (options.duplicate) url.searchParams.append('__clerk_handshake', sentinel);
    return new Request(url, { method: options.method || 'GET', headers:
        options.noHeader ? {} : { [callbackDiagnosticHeader]: options.header || 'signature-shape-only-v1' } });
};
const exercise = async (options = {}) => {
    let secretReads = 0, fetches = 0, signatures = 0, bodyCancels = 0, seamFailure = false;
    const response = await serverCallbackDiagnostic(requestFor(options), { ...meta, ...options.meta }, {
        getSecretKey: () => { secretReads++; return options.key || 'sk_test_' + sentinel; },
        decode: decodeJwt,
        verifySignature: async (jwt, key) => { signatures++; return hasValidSignature(jwt, key); },
        fetch: async (url, init) => {
            fetches++;
            // Assertions survive wrapper catches: count this seam's failure
            // independently, and fail exercise outside the wrapped call below.
            if (url !== 'https://api.clerk.com/v1/jwks' || init.method !== 'GET' || init.redirect !== 'manual' ||
                init.cache !== 'no-store' || init.headers.Authorization !== 'Bearer sk_test_' + sentinel ||
                Object.keys(init.headers).length !== 2 || !init.signal) { seamFailure = true; return {}; }
            if (options.fetchFail) throw Error(sentinel);
            if (options.redirect) return new Response(null, { status: 307, headers: { location: 'https://unapproved.invalid/' + sentinel } });
            if (options.oversize) return new Response('{}', { headers: { 'content-length': '1048577' } });
            if (options.chunkedOversize) return { status: 200, ok: true, headers: new Headers(), body: {
                getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(1048577) }),
                    cancel: async () => { bodyCancels++; }, releaseLock: () => {} }) } };
            return Response.json({ keys: [jwk] });
        },
    });
    const body = await response.json();
    // A failed fetch seam cannot be mistaken for an expected provider HOLD.
    assert.equal(seamFailure, false);
    assert.notEqual(body.code, 'DIAGNOSTIC_WRAPPER_EXCEPTION_HELD');
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes(sentinel), false);
    assert.equal(serialized.includes(jwk.kid), false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body, secretReads, fetches, signatures, bodyCancels };
};
test('server guard rejection precedes all Secret lookups and fetches', async (t) => {
    const rejected = [
        { meta: { projectId: 'another-project' } }, { meta: { environment: 'production' } },
        { meta: { branch: 'main' } }, { meta: { branch: 'test/another' } },
        { meta: { sourceSha: '' } }, { meta: { deploymentHost: 'unknown.invalid' } },
        { url: 'https://an-alias.vercel.app/admin/login' }, { url: 'http://' + host + '/admin/login' },
        { method: 'POST' }, { noHeader: true }, { header: 'different' }, { mixed: true }, { duplicate: true },
    ];
    for (let i = 0; i < rejected.length; i++) await t.test('target/query negative ' + i, async () => {
        const r = await exercise(rejected[i]);
        assert.equal(r.status, 409); assert.equal(r.secretReads, 0); assert.equal(r.fetches, 0); assert.equal(r.signatures, 0);
    });
});
test('valid server comparison: one fixed authenticated JWKS GET, no auth/session/directive application', async () => {
    const r = await exercise();
    assert.equal(r.status, 200); assert.equal(r.body.code, 'SIGNATURE_AND_SHAPE_ONLY_NOT_AUTH');
    assert.equal(r.secretReads, 1); assert.equal(r.fetches, 1); assert.equal(r.signatures, 1);
});
test('malformed carrier never reads a Secret or fetches', async () => {
    const r = await exercise({ carrier: sentinel });
    assert.equal(r.body.code, 'CARRIER_SHAPE_HELD'); assert.equal(r.secretReads, 0); assert.equal(r.fetches, 0);
});
test('Production key class never leaves the runtime', async () => {
    const r = await exercise({ key: 'sk_live_' + sentinel });
    assert.equal(r.body.code, 'TEST_KEY_CLASS_HELD'); assert.equal(r.fetches, 0);
});
for (const [name, options, code] of [
    ['provider redirect', { redirect: true }, 'JWKS_HTTP_HELD'],
    ['unknown fetch exception', { fetchFail: true }, 'JWKS_FETCH_EXCEPTION_HELD'],
    ['declared body limit', { oversize: true }, 'JWKS_JSON_EXCEPTION_HELD'],
    ['streamed body limit', { chunkedOversize: true }, 'JWKS_JSON_EXCEPTION_HELD'],
]) test(name + ' holds after one fetch without leaking values', async () => {
    const r = await exercise(options);
    assert.equal(r.status, 409); assert.equal(r.body.code, code); assert.equal(r.fetches, 1); assert.equal(r.signatures, 0);
    if (options.chunkedOversize) assert.equal(r.bodyCancels, 1);
});

const secretClassCases = [
    ['absent', undefined], ['null', null], ['number', 42], ['boolean', false], ['bigint', 42n],
    ['symbol', Symbol(sentinel)], ['function', () => sentinel],
    ['unknown object never coerced', { toString() { throw Error(sentinel); }, valueOf() { throw Error(sentinel); } }],
    ['empty', ''], ['modern', 'sk_test_' + sentinel], ['legacy', 'test_' + sentinel],
    ['short modern', 'sk_test_a'], ['production modern', 'sk_live_' + sentinel],
    ['production legacy', 'live_' + sentinel], ['publishable', 'pk_test_' + sentinel],
    ['leading whitespace', ' sk_test_' + sentinel], ['trailing whitespace', 'sk_test_' + sentinel + ' '],
    ['CR', 'sk_test_' + sentinel + '\r'], ['LF', 'sk_test_' + sentinel + '\n'],
    ['NUL', 'sk_test_' + sentinel + '\0'], ['tab', 'sk_test_' + sentinel + '\t'],
    ['other ASCII control', 'sk_test_' + sentinel + '\u0001'],
    ['unicode trim difference', 'sk_test_' + sentinel + '\u00a0'],
];
const secretClassFields = [
    'keyReadAttempted', 'keyReadCompleted', 'keyPresent', 'typeUndefined', 'typeNull', 'typeString',
    'typeNumber', 'typeBoolean', 'typeObject', 'typeFunction', 'typeSymbol', 'typeBigInt',
    'nonEmptyString', 'modernTestPrefix', 'legacyTestPrefix', 'productionPrefix', 'publishablePrefix',
    'minimumLength16', 'hasCr', 'hasLf', 'hasNul', 'hasOtherAsciiControl', 'trimWouldChange',
    'sdkDevelopmentCheckAttempted', 'sdkDevelopmentCheckCompleted', 'sdkDevelopmentClassified',
    'existingDiagnosticGuardWouldAllow',
];
function assertSecretClassShape(body) {
    assert.deepEqual(Object.keys(body).sort(), [...secretClassFields].sort());
    for (const value of Object.values(body)) assert.equal(typeof value, 'boolean');
    assert.equal(JSON.stringify(body).includes(sentinel), false);
}
for (const [name, value] of secretClassCases) test('one-GET key class observes every predicate: ' + name, async () => {
    let reads = 0, sdkCalls = 0, fetches = 0, decodes = 0, signatures = 0;
    const dependencies = { getSecretKey: () => { reads++; return value; },
        isDevelopmentFromSecretKey: input => { sdkCalls++; assert.equal(input, value); return isDevelopmentFromSecretKey(input); },
        decode: () => { decodes++; throw Error(sentinel); },
        verifySignature: () => { signatures++; throw Error(sentinel); },
        fetch: () => { fetches++; throw Error(sentinel); },
    };
    const response = await serverCallbackDiagnostic(new Request('https://' + host + '/admin/login',
        { headers: { [callbackDiagnosticHeader]: keyClassDiagnosticMarker } }), meta, dependencies);
    const body = await response.json(); assertSecretClassShape(body);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('location'), null); assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(reads, 1); assert.equal(fetches, 0); assert.equal(decodes, 0); assert.equal(signatures, 0);
    const string = typeof value === 'string';
    assert.equal(body.keyReadCompleted, true); assert.equal(body.typeString, string);
    assert.equal(body.keyPresent, value !== null && value !== undefined);
    assert.equal(Object.entries(body).filter(([k, v]) => k.startsWith('type') && v).length, 1);
    const typeFields = { undefined: 'typeUndefined', string: 'typeString', number: 'typeNumber',
        boolean: 'typeBoolean', object: 'typeObject', function: 'typeFunction', symbol: 'typeSymbol', bigint: 'typeBigInt' };
    assert.equal(body[value === null ? 'typeNull' : typeFields[typeof value]], true);
    assert.equal(body.nonEmptyString, string && value.length > 0);
    assert.equal(body.modernTestPrefix, string && value.startsWith('sk_test_'));
    assert.equal(body.legacyTestPrefix, string && value.startsWith('test_'));
    assert.equal(body.productionPrefix, string && (value.startsWith('sk_live_') || value.startsWith('live_')));
    assert.equal(body.publishablePrefix, string && (value.startsWith('pk_test_') || value.startsWith('pk_live_')));
    assert.equal(body.minimumLength16, string && value.length >= 16);
    for (const [flag, char] of [['hasCr', '\r'], ['hasLf', '\n'], ['hasNul', '\0']]) assert.equal(body[flag], string && value.includes(char));
    assert.equal(body.hasOtherAsciiControl, string && /[\u0001-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(value));
    assert.equal(body.trimWouldChange, string && value.trim() !== value);
    assert.equal(sdkCalls, string ? 1 : 0);
    assert.equal(body.sdkDevelopmentCheckCompleted, string);
    assert.equal(body.sdkDevelopmentCheckAttempted, string);
    assert.equal(body.sdkDevelopmentClassified, string && isDevelopmentFromSecretKey(value));
    // Comparison only: the old transmission guard is unchanged and is not used here.
    assert.equal(body.existingDiagnosticGuardWouldAllow,
        string && value.startsWith('sk_test_') && value.length >= 16 && !/[\r\n\0]/.test(value));
});

test('one-GET key class guards every target/query/header before key access', async t => {
    const negatives = [
        { meta: { projectId: 'other' } }, { meta: { environment: 'production' } }, { meta: { branch: 'main' } },
        { meta: { branch: 'another' } }, { meta: { sourceSha: '' } }, { meta: { deploymentHost: 'other.invalid' } },
        { url: 'https://alias.vercel.app/admin/login' }, { url: 'http://' + host + '/admin/login' },
        { url: 'https://' + host + ':444/admin/login' }, { url: 'https://user:pass@' + host + '/admin/login' },
        { url: 'https://' + host + '/admin/login#fragment' }, { url: 'https://' + host + '/api/admin/menus' },
        { url: 'https://' + host + '/admin/login?__clerk_handshake=' + sentinel },
        { url: 'https://' + host + '/admin/login?unknown=' + sentinel },
        { method: 'POST' }, { method: 'HEAD' }, { marker: 'unknown' }, { marker: null },
    ];
    for (let i = 0; i < negatives.length; i++) await t.test('key class input guard ' + i, async () => {
        const change = negatives[i]; let reads = 0, sdkCalls = 0, forbiddenCalls = 0;
        const fail = () => { forbiddenCalls++; throw Error(sentinel); };
        // Structural request seam also reaches userinfo rejection; the real
        // Request constructor itself refuses credential-bearing URLs earlier.
        const response = await serverCallbackDiagnostic({ url: change.url || 'https://' + host + '/admin/login',
            method: change.method || 'GET', headers: new Headers(change.marker === null ? {} :
                { [callbackDiagnosticHeader]: change.marker || keyClassDiagnosticMarker }) }, { ...meta, ...change.meta },
        { getSecretKey: () => { reads++; return sentinel; }, isDevelopmentFromSecretKey: () => { sdkCalls++; return false; },
            decode: fail, verifySignature: fail, fetch: fail });
        assert.equal(response.status, 409); assert.equal(reads, 0); assert.equal(sdkCalls, 0); assert.equal(forbiddenCalls, 0);
        const body = await response.json(); assert.ok(['RUNTIME_TARGET_HELD', 'KEY_CLASS_QUERY_HELD'].includes(body.code));
        assert.equal(JSON.stringify(body).includes(sentinel), false);
    });
});

test('key getter and SDK helper exceptions never inspect or serialize unknown values', async () => {
    const hostile = { get message() { throw Error(sentinel); }, get stack() { throw Error(sentinel); },
        toString() { throw Error(sentinel); } };
    const getterFailure = inspectSecretKeyClass(() => { throw hostile; }, isDevelopmentFromSecretKey);
    assertSecretClassShape(getterFailure); assert.equal(getterFailure.keyReadAttempted, true);
    assert.equal(getterFailure.keyReadCompleted, false);
    assert.equal(Object.entries(getterFailure).some(([k, v]) => k.startsWith('type') && v), false);
    for (const classifier of [undefined, () => { throw hostile; }, () => hostile]) {
        const body = inspectSecretKeyClass(() => 'sk_test_' + sentinel, classifier);
        assertSecretClassShape(body); assert.equal(body.keyReadCompleted, true);
        assert.equal(body.sdkDevelopmentCheckAttempted, true); assert.equal(body.sdkDevelopmentCheckCompleted, false);
        assert.equal(body.sdkDevelopmentClassified, false);
    }
});

test('key getter/SDK observation failure is explicit HTTP409 with no callback or network', async () => {
    for (const source of ['getter', 'sdk']) {
        let forbiddenCalls = 0;
        const fail = () => { forbiddenCalls++; throw Error(sentinel); };
        const response = await serverCallbackDiagnostic(new Request('https://' + host + '/admin/login',
            { headers: { [callbackDiagnosticHeader]: keyClassDiagnosticMarker } }), meta,
        { getSecretKey: () => { if (source === 'getter') throw Error(sentinel); return 'sk_test_' + sentinel; },
            isDevelopmentFromSecretKey: () => { throw Error(sentinel); }, decode: fail, verifySignature: fail, fetch: fail });
        assert.equal(response.status, 409); const body = await response.json(); assertSecretClassShape(body);
        assert.equal(body.keyReadCompleted, source !== 'getter');
        assert.equal(body.sdkDevelopmentCheckCompleted, false); assert.equal(forbiddenCalls, 0);
    }
});

test('dependency accessors also stay inside the separate key/SDK boolean error boundaries', async () => {
    for (const source of ['keyAccessor', 'sdkAccessor']) {
        const dependencies = { get getSecretKey() { if (source === 'keyAccessor') throw Error(sentinel);
            return () => 'sk_test_' + sentinel; },
        get isDevelopmentFromSecretKey() { throw Error(sentinel); } };
        const response = await serverCallbackDiagnostic(new Request('https://' + host + '/admin/login',
            { headers: { [callbackDiagnosticHeader]: keyClassDiagnosticMarker } }), meta, dependencies);
        assert.equal(response.status, 409); const body = await response.json(); assertSecretClassShape(body);
        assert.equal(body.keyReadCompleted, source !== 'keyAccessor');
        assert.equal(body.sdkDevelopmentCheckAttempted, source === 'sdkAccessor');
        assert.equal(body.sdkDevelopmentCheckCompleted, false);
    }
});
