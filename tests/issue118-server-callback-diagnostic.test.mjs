import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyLegacyCallback, serverCallbackDiagnostic, callbackDiagnosticHeader } from '../lib/verification/issue118-callback-diagnostic.mjs';

const root = process.env.ISSUE118_SDK_MODULE_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jwtEntry = createRequire(join(root, 'package.json')).resolve('@clerk/backend/jwt');
const { decodeJwt, hasValidSignature } = await import(pathToFileURL(join(dirname(jwtEntry), 'index.mjs')).href);
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
