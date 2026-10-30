import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { previewOrigin, scopedOidcHeaders, protectedPreviewFetch, routePreviewRequest } from '../scripts/issue118-preview-transport.mjs';
import { target } from '../scripts/check-issue118-live-t1-browser.mjs';

const token = 'synthetic.payload.signature';
const header = 'x-vercel-trusted-oidc-idp-token';
const assertCode = code => error => error.message === code && !error.cause;

test('transport and live target agree; credentials never enter other origin header maps', () => {
    assert.equal(previewOrigin, target.origin);
    assert.equal(scopedOidcHeaders(previewOrigin + '/admin/login', {}, token)[header], token);
    for (const url of ['https://one-dolphin-7936.clerk.accounts.dev/', 'https://api.github.com/',
        'https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com/', previewOrigin + '.attacker.invalid/',
        previewOrigin.replace('https:', 'http:'), 'https://clear-allergy-e2e-co7nvr7xf-kaitoexe00-9350s-projects.vercel.app/']) {
        assert.deepEqual(scopedOidcHeaders(url, { 'X-Vercel-Trusted-Oidc-Idp-Token': token, Accept: 'text/html' }, token), { Accept: 'text/html' });
    }
    for (const value of ['', undefined, 'synthetic-private']) assert.throws(() => scopedOidcHeaders(previewOrigin, {}, value), assertCode('OIDC_TOKEN_REQUIRED'));
    assert.throws(() => scopedOidcHeaders('https://synthetic:private@' + new URL(previewOrigin).host, {}, token), assertCode('REQUEST_URL_CREDENTIALS_REFUSED'));
});

test('API helper refuses wrong origin and writes before calling the transport', async () => {
    let calls = 0;
    const api = { fetch: async () => { calls++; throw Error('must not execute'); } };
    await assert.rejects(protectedPreviewFetch(api, 'https://other.invalid/api', {}, token), assertCode('API_TARGET_REFUSED'));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) await assert.rejects(protectedPreviewFetch(api, previewOrigin, { method }, token), assertCode('READONLY_API_METHOD_REQUIRED'));
    assert.equal(calls, 0);
});

test('browser route aborts redirects, never fulfills or continues with the token', async () => {
    let fetches = 0, aborted = 0, fulfilled = 0, continued = 0;
    const route = {
        request: () => ({ url: () => previewOrigin + '/admin', allHeaders: async () => ({ Accept: 'text/html' }) }),
        fetch: async options => { fetches++; assert.equal(options.maxRedirects, 0); assert.equal(options.maxRetries, 0); assert.equal(options.timeout, 20000); return { status: () => 307 }; },
        abort: async code => { assert.equal(code, 'blockedbyclient'); aborted++; },
        fulfill: async () => { fulfilled++; }, continue: async () => { continued++; },
    };
    await assert.rejects(routePreviewRequest(route, token), assertCode('PROTECTED_REDIRECT_BLOCKED'));
    assert.deepEqual({ fetches, aborted, fulfilled, continued }, { fetches: 1, aborted: 1, fulfilled: 0, continued: 0 });
});

test('non-target browser route removes old headers; provider exceptions become fixed codes', async () => {
    let clean;
    await routePreviewRequest({ request: () => ({ url: () => 'https://one-dolphin-7936.clerk.accounts.dev/', allHeaders: async () => ({ [header]: token }) }), continue: async options => { clean = options.headers; } }, token);
    assert.deepEqual(clean, {});
    const api = { fetch: async () => { throw Error('synthetic-secret https://user:synthetic@invalid/'); } };
    await assert.rejects(protectedPreviewFetch(api, previewOrigin, {}, token), assertCode('PROTECTED_TRANSPORT_FAILED'));
});

test('failed browser abort remains a fixed failure, never a success', async () => {
    const route = {
        request: () => ({ url: () => previewOrigin, allHeaders: async () => ({}) }),
        fetch: async () => { throw Error('synthetic-private'); },
        abort: async () => { throw Error('another synthetic-private'); },
    };
    await assert.rejects(routePreviewRequest(route, token), assertCode('PROTECTED_ABORT_FAILED'));
});

test('allHeaders asynchronous rejection is sanitized before any forwarding', async () => {
    for (const url of [previewOrigin, 'https://one-dolphin-7936.clerk.accounts.dev/']) {
        let aborted = 0, forwarded = 0;
        const route = {
            request: () => ({ url: () => url, allHeaders: async () => { await Promise.resolve(); throw Error('synthetic-private-header https://user:fake@invalid/'); } }),
            fetch: async () => { forwarded++; }, continue: async () => { forwarded++; },
            abort: async () => { aborted++; },
        };
        await assert.rejects(routePreviewRequest(route, token), assertCode('PROTECTED_TRANSPORT_FAILED'));
        assert.equal(aborted, 1); assert.equal(forwarded, 0);
    }
});

test('non-target continue asynchronous rejection is awaited and sanitized', async () => {
    let aborted = 0, continued = 0;
    const route = {
        request: () => ({ url: () => 'https://one-dolphin-7936.clerk.accounts.dev/', allHeaders: async () => ({ [header]: token }) }),
        continue: async options => {
            continued++; assert.deepEqual(options.headers, {});
            await Promise.resolve(); throw Error('synthetic-private-provider https://user:fake@invalid/');
        },
        abort: async () => { aborted++; },
    };
    await assert.rejects(routePreviewRequest(route, token), assertCode('PROTECTED_TRANSPORT_FAILED'));
    assert.equal(continued, 1); assert.equal(aborted, 1);
});

async function listen(server) {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}

test('real Playwright HTTP engine does not follow any redirect (loopback-mapped seam only)', async () => {
    const { request } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
    let destinationHits = 0, sourceHits = 0;
    let status = 302;
    const observedTokenPresence = [];
    const destination = createServer((_req, res) => { destinationHits++; res.end('wrong redirect followed'); });
    const destinationUrl = await listen(destination);
    const source = createServer((req, res) => {
        sourceHits++;
        observedTokenPresence.push(Boolean(req.headers[header]));
        res.writeHead(status, { Location: destinationUrl }); res.end();
    });
    const sourceUrl = await listen(source);
    const api = await request.newContext();
    const failures = [];
    try {
        // Preserve the production guard; map the actual fetch seam to this test's loopback server.
        const mapped = { fetch: async (url, options) => {
            assert.equal(new URL(url).origin, previewOrigin);
            try { return await api.fetch(sourceUrl, options); }
            catch (error) {
                failures.push(['EACCES', 'ECONNREFUSED', 'ECONNRESET', 'EPERM', 'ETIMEDOUT', 'ENOTFOUND'].find(code => String(error.message).includes(code)) || 'UNCLASSIFIED_LOOPBACK_ERROR');
                throw error;
            }
        } };
        for (status of [301, 302, 303, 307, 308]) {
            let caught;
            try { await protectedPreviewFetch(mapped, previewOrigin + '/api/admin/shop', {}, token); } catch (error) { caught = error; }
            assert.equal(caught?.message, 'PROTECTED_REDIRECT_BLOCKED', 'loopback categories=' + failures.join(','));
        }
        assert.equal(sourceHits, 5); assert.equal(destinationHits, 0);
        assert.deepEqual(observedTokenPresence, [true, true, true, true, true]);
        status = 307;
        let aborted = 0, fulfilled = 0;
        const route = {
            request: () => ({ url: () => previewOrigin + '/admin', allHeaders: async () => ({}) }),
            fetch: options => api.fetch(sourceUrl, options),
            abort: async () => { aborted++; }, fulfill: async () => { fulfilled++; },
        };
        await assert.rejects(routePreviewRequest(route, token), assertCode('PROTECTED_REDIRECT_BLOCKED'));
        assert.equal(sourceHits, 6); assert.equal(destinationHits, 0);
        assert.equal(observedTokenPresence[5], true);
        assert.equal(aborted, 1); assert.equal(fulfilled, 0);
    } finally { await api.dispose(); await close(source); await close(destination); }
});

test('successful one-hop response remains unmodified and errors never retry', async () => {
    const response = { status: () => 200, json: async () => ({ fictional: true }) };
    let calls = 0;
    const api = { fetch: async (_url, options) => { calls++; assert.equal(options.maxRedirects, 0); assert.equal(options.maxRetries, 0); return response; } };
    assert.equal(await protectedPreviewFetch(api, previewOrigin, { timeout: 0, maxRetries: 5, maxRedirects: 20 }, token), response);
    assert.equal(calls, 1);
});
