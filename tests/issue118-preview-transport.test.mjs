import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { previewOrigin, scopedOidcHeaders, protectedPreviewFetch, routePreviewRequest, clerkFrontendRedirectObservation, resolveClerkSdkCanonicalScript } from '../scripts/issue118-preview-transport.mjs';
import { target, transportLifecycleSnapshot, recordTransportDiagnostic, createReadCloseAuthPolicyCandidate,
    readCloseDirectFetch, readCloseFixtureId } from '../scripts/check-issue118-live-t1-browser.mjs';
import { closeIsolatedBrowser } from '../scripts/issue118-close-browser.mjs';

const token = 'synthetic.payload.signature';
const header = 'x-vercel-trusted-oidc-idp-token';
const assertCode = code => error => error.message === code && !error.cause;
test('fixed installed SDK admits only its JS/UI major URL to same-package same-major canonical version URL', async () => {
    const origin = 'https://one-dolphin-7936.clerk.accounts.dev';
    for (const [pkg,major,file,version,flag] of [['clerk-js','6','clerk.browser.js','6.24.0','sourceIsJs'],['ui','1','ui.browser.js','1.24.2','sourceIsUi']]) {
        const source = `${origin}/npm/@clerk/${pkg}@${major}/dist/${file}`;
        const destination = `${origin}/npm/@clerk/${pkg}@${version}/dist/${file}`;
        const allowed = await resolveClerkSdkCanonicalScript(source, { location: destination });
        assert.equal(allowed.url, destination); assert.equal(allowed.observation.targetAllowed, true);
        assert.equal(allowed.observation[flag], true); assert.ok(Object.values(allowed.observation).every(v => typeof v === 'boolean'));
        const invalid = [source, destination.replace(origin,'https://cdn.clerk.com'), destination.replace('https:','http:'),
            destination.replace(origin,origin+':444'), destination.replace('https://','https://u:SYNTHETIC_PRIVATE@'),
            destination+'?',destination+'?SYNTHETIC_PRIVATE',destination+'#',destination+'#SYNTHETIC_PRIVATE',destination+'\n',
            destination.replace('@'+version,'@'+(Number(major)+1)+'.24.0'),destination.replace('@'+version,'@'+major+'.024.0'),
            destination.replace('@'+version,'@'+version+'-snapshot.x'),destination.replace('/dist/','/private/'),
            destination.replace('/dist/','/dist/../dist/'),destination.replace('@'+version,'@'+version.replaceAll('.','%2E')),
            destination.replace(pkg+'@','other@'),'/npm/@clerk/'+pkg+'@'+version+'/dist/'+file,
            '//'+new URL(origin).hostname+'/npm/@clerk/'+pkg+'@'+version+'/dist/'+file];
        for (const value of invalid) {
            const r = await resolveClerkSdkCanonicalScript(source, { location:value });
            assert.equal(r.url, undefined); assert.equal(r.observation.targetAllowed, false);
            assert.doesNotMatch(JSON.stringify(r.observation), /SYNTHETIC|https:|clerk\.browser|ui\.browser/);
        }
        for (const changed of [source+'?',source+'#x',source.replace('/dist/','/%64ist/'),source.replace(origin,'https://other.invalid')])
            assert.equal((await resolveClerkSdkCanonicalScript(changed,{location:destination})).observation.sourceMatched,false);
        const duplicate = await resolveClerkSdkCanonicalScript(source,{location:destination,Location:destination});
        assert.equal(duplicate.url,undefined);assert.equal(duplicate.observation.singleLocationProperty,false);
        const throwing = {};Object.defineProperty(throwing,'location',{enumerable:true,get(){throw Error('SYNTHETIC_PRIVATE');}});
        assert.equal((await resolveClerkSdkCanonicalScript(source,throwing)).url,undefined);
    }
});
test('Clerk frontend Location classifier returns only booleans across valid, hostile, missing and throwing inputs', () => {
    const clerkOrigin = 'https://one-dolphin-7936.clerk.accounts.dev', secret = 'SYNTHETIC_PRIVATE_VALUE';
    const options = { requestUrl: clerkOrigin + '/npm/@clerk/clerk-js@6/dist/clerk.browser.js', method: 'GET', resourceType: 'script', clerkOrigin };
    for (const location of [undefined, null, '', [], '/relative?'+secret, 'https://[', 'x'.repeat(16385),
        'https://user:'+secret+'@cdn.jsdelivr.net/a?'+secret+'#'+secret, 'http://cdn.clerk.com:444/a',
        clerkOrigin+'/npm/@clerk/clerk-js@6.24.0/dist/clerk.browser.js', previewOrigin+'/admin/login',
        'https://cdn.jsdelivr.net/a', 'https://cdn.clerk.com/a', 'https://vercel.com/a', 'https://unknown.invalid/'+secret, 'https://x.invalid/\n'+secret]) {
        const p = clerkFrontendRedirectObservation({ ...options, readHeaders: () => ({ location }) });
        assert.ok(Object.values(p).every(v => typeof v === 'boolean'));
        assert.doesNotMatch(JSON.stringify(p), /SYNTHETIC|https:|unknown\.invalid|clerk\.browser/);
        assert.equal(p.requestIsClerkJsBundle, true); assert.equal(p.resourceIsScript, true);
    }
    const missing = clerkFrontendRedirectObservation({ ...options, readHeaders: () => ({}) });
    assert.equal(missing.headersReadCompleted, true); assert.equal(missing.singleLocationProperty, false);
    const duplicate = clerkFrontendRedirectObservation({ ...options, readHeaders: () => ({ location: '/a', Location: '/b' }) });
    assert.equal(duplicate.singleLocationProperty, false); assert.equal(duplicate.parseable, false);
    const throwing = clerkFrontendRedirectObservation({ ...options, readHeaders: () => { const e = {}; Object.defineProperty(e,'message',{get(){assert.fail('never inspect exception');}}); throw e; } });
    assert.equal(throwing.headersReadCompleted, false); assert.equal(throwing.parseable, false);
    assert.equal(clerkFrontendRedirectObservation({ ...options, requestUrl: 'https://[', readHeaders: () => assert.fail('bad request must not read headers') }).parseable, false);
});

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

test('installed Clerk activation/signout hooks exercise real offline POST/refresh transport and fixed direct reads', {timeout:45000}, async t => {
    const require=createRequire(import.meta.url);
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
    const sdk=readFileSync(new URL('../node_modules/@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js',import.meta.url),'utf8');
    const effect=sdk.match(/useSafeLayoutEffect\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1];
    assert.ok(effect); // Execute this installed hook body, rather than a memory-only setActive mock.
    const nextVersion=require('next/package.json').version;
    assert.equal(nextVersion,'16.4.1');
    assert.equal(JSON.parse(readFileSync(new URL('../node_modules/@clerk/nextjs/package.json',import.meta.url),'utf8')).version,'7.5.13');
    const emptyArgs=await require('next/dist/compiled/react-server-dom-webpack/client.edge').encodeReply([]);
    assert.equal(emptyArgs,'[]');
    const action='a'.repeat(40), telemetryPath='/_vercel/insights/view'; // Synthetic verified-pin fixture, not a deployed identifier.
    const policy=createReadCloseAuthPolicyCandidate({actionReference:action,telemetryPaths:[telemetryPath]});
    let phase='AUTHENTICATION', cachePosts=0, documentGets=0, shopReads=0, fixtureReads=0, unexpected=0;
    let suppressed=0, allowedActions=0, refusedAudit=0, refusedMenu=0, cacheBodyEmpty=false, cacheHeaderMatched=false;
    const report={};
    const fixture={id:readCloseFixtureId,shopId:target.shop,isPublished:false,version:96,foodVersion:87,
        publicationConfirmedFoodVersion:87,reviewedFoodVersion:null,priceYen:1000,allergens:[{slug:'milk',status:'CONTAINS'}]};
    const server=createServer((req,res)=>{
        if(req.method==='POST'&&req.url==='/admin/login'){
            cachePosts++;cacheHeaderMatched=req.headers['next-action']===action;
            let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{cacheBodyEmpty=body==='[]';res.writeHead(200);res.end('offline RPC response fixture');});return;
        }
        if(req.method==='GET'&&req.url==='/admin/login'){documentGets++;res.writeHead(200,{'Content-Type':'text/html'});res.end('<link rel="icon" href="data:,">offline SDK hooks');return;}
        if(req.method==='GET'&&req.url==='/api/admin/shop'){shopReads++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({shop:{id:target.shop}}));return;}
        if(req.method==='GET'&&req.url==='/api/admin/menus/'+readCloseFixtureId){fixtureReads++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({menu:fixture}));return;}
        unexpected++;res.writeHead(500);res.end();
    });
    const local=await listen(server);
    let browser,context,closed;
    const deadline=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_yes,no)=>{timer=setTimeout(()=>no(Error('OFFLINE_LIFECYCLE_DEADLINE')),10000);})]);}finally{clearTimeout(timer);}};
    try{
        browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'chromium'})});context=await browser.newContext({serviceWorkers:'block'});
        await context.route('**/*',async route=>{
            const result=await policy(route.request(),()=>phase);
            if(result.decision==='SUPPRESS_PINNED_TELEMETRY'){suppressed++;await route.fulfill({status:204,body:''});return;}
            if(result.decision==='REFUSE'){
                if(result.observation.authAuditApi)refusedAudit++;
                if(result.observation.menuApi)refusedMenu++;
                await route.abort('blockedbyclient');return;
            }
            if(result.decision==='ALLOW_PINNED_AUTH_CACHE_ACTION')allowedActions++;
            const url=new URL(route.request().url());
            assert.equal(url.origin,target.origin);
            await routePreviewRequest({request:()=>route.request(),
                fetch:options=>route.fetch({...options,url:local+url.pathname}),
                fulfill:options=>route.fulfill(options),abort:code=>route.abort(code)},token,
            observation=>recordTransportDiagnostic(report,observation,transportLifecycleSnapshot(phase)));
        });
        const page=await context.newPage();await page.goto(target.origin+'/admin/login');
        await page.evaluate(({effect,emptyArgs,action,nextVersion})=>{
            window.next={version:nextVersion};window.offlineRefreshes=[];
            const invalidateCacheAction=async()=>{const response=await fetch(location.href,{method:'POST',headers:{'Next-Action':action,'Content-Type':'text/plain;charset=UTF-8',Accept:'text/x-component','Next-Router-State-Tree':encodeURIComponent(JSON.stringify(['',{}]))},body:emptyArgs});if(!response.ok)throw Error('OFFLINE_RPC_REFUSED');};
            const router={refresh:()=>{window.offlineRefreshes.push(fetch(location.href,{headers:{RSC:'1'}}).then(response=>{if(!response.ok)throw Error('OFFLINE_REFRESH_REFUSED');}));}};
            new Function('invalidateCacheAction','router','__internal_invokeMiddlewareOnAuthStateChange',effect)(invalidateCacheAction,router,true);
        },{effect,emptyArgs,action,nextVersion});
        const lifecycle=intent=>deadline(page.evaluate(async intent=>{
            await window.__internal_onBeforeSetActive(intent);
            await window.__internal_onAfterSetActive();
            await Promise.all(window.offlineRefreshes);
        },intent));
        await lifecycle('sign-in');assert.equal(cachePosts,1);assert.equal(allowedActions,1);assert.equal(cacheBodyEmpty,true);assert.equal(cacheHeaderMatched,true);
        phase='APP_FLOW';
        const direct=[];const mappedApi={fetch:(url,options)=>{direct.push(url);return context.request.fetch(local+new URL(url).pathname,options);}};
        for(const path of ['/api/admin/shop','/api/admin/menus/'+readCloseFixtureId])assert.equal((await readCloseDirectFetch(mappedApi,target.origin+path,token)).status(),200);
        await assert.rejects(readCloseDirectFetch(mappedApi,target.origin+'/api/admin/menus/other',token));assert.equal(direct.length,2);
        await page.evaluate(path=>fetch(path,{method:'POST',body:'synthetic telemetry'}),telemetryPath);
        phase='SIGNOUT';await lifecycle('sign-out'); // Next16 original hook skips the cache POST, but still refreshes.
        assert.equal(cachePosts,1);assert.equal(documentGets,3);
        await page.evaluate(path=>fetch(path,{method:'POST',body:'synthetic telemetry'}),telemetryPath);
        for(const path of ['/api/admin/auth/login','/api/admin/menus'])await page.evaluate(async path=>{try{await fetch(path,{method:'POST',body:'synthetic'});}catch{/* expected pre-send refusal */}},path);
        assert.equal(suppressed,2);assert.equal(refusedAudit,1);assert.equal(refusedMenu,1);assert.equal(unexpected,0);
        assert.equal(shopReads,1);assert.equal(fixtureReads,1);assert.equal(report.firstTransportFailure,undefined);
        closed=await closeIsolatedBrowser(context,browser,{contextCreateAttempted:true,browserLaunchAttempted:true},value=>{phase=value;});
        assert.equal(closed.allLocalClosed,true);
        t.diagnostic(JSON.stringify({sdkHookNetworkFixture:{actualProviderSession:false,actualDeploymentPinsVerified:false,
            activationCachePosts:cachePosts,signoutAdditionalCachePosts:0,refreshGets:documentGets-1,telemetrySuppressed:suppressed,
            authAuditForwarded:0,menuWritesForwarded:0,directShopReads:shopReads,directFixtureReads:fixtureReads,allLocalClosed:closed.allLocalClosed}}));
    }finally{if(!closed)await closeIsolatedBrowser(context,browser,{contextCreateAttempted:!!context,browserLaunchAttempted:!!browser});await close(server);}
});

test('real Chromium loopback controls separate normal completion, context interruption and independent socket failure', { timeout: 60000 }, async t => {
    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
    const results = [];
    const category = error => {
        try {
            const code = Object.getOwnPropertyDescriptor(error, 'code')?.value;
            const message = Object.getOwnPropertyDescriptor(error, 'message')?.value;
            for (const known of ['EACCES','EPERM','ECONNRESET','ECONNREFUSED','ETIMEDOUT','SPAWN_UNKNOWN'])
                if (code === known || typeof message === 'string' && message.includes(known)) return known;
        } catch { /* fixed unknown category */ }
        return 'UNCLASSIFIED_LOCAL_ERROR';
    };
    for (const scenario of ['NORMAL', 'CONTEXT_INTERRUPT', 'INDEPENDENT_SOCKET_FAILURE']) {
        const result = { scenario, stage: 'SERVER_START', status: 'NOT_RUN', loopbackHits: 0,
            blockedOtherRequests: 0, handlerStarts: 0, navigationCompleted: false, navigationRejected: false };
        results.push(result);
        let browser, context, server, phase = 'APP_FLOW', pendingResolve, enteredResolve;
        let closed = false, browserLaunchAttempted = false, contextCreateAttempted = false;
        const entered = new Promise(resolve => { enteredResolve = resolve; });
        const handled = new Promise(resolve => { pendingResolve = resolve; });
        const report = {};
        const stages = [];
        const deadline = async promise => {
            let timer;
            try { return await Promise.race([promise, new Promise((_resolve,reject) => { timer=setTimeout(()=>reject(Error('CONTROL_DEADLINE')),10000); })]); }
            finally { clearTimeout(timer); }
        };
        const observeClose = value => { phase = value; stages.push(transportLifecycleSnapshot(value)); };
        try {
            server = createServer((req,res) => {
                result.loopbackHits++;
                result.serverSawGet = req.method === 'GET';
                // Only this synthetic marker is sent to loopback. No real OIDC or app request occurs.
                result.syntheticHeaderPresent = req.headers[header] === token;
                enteredResolve();
                if (scenario === 'NORMAL') { result.serverResponseSent = true; res.writeHead(200, {'Content-Type':'text/html'}); res.end('<link rel="icon" href="data:,"><title>offline control</title>'); }
                else if (scenario === 'INDEPENDENT_SOCKET_FAILURE') { result.serverSocketDestroyed = true; req.socket.destroy(); }
                else result.serverResponseHeld = true;
                // CONTEXT_INTERRUPT deliberately leaves one response pending until context.close().
            });
            const local = await listen(server);
            const probeUrl = local + '/offline-readonly-control';
            result.stage = 'BROWSER_LAUNCH';
            browserLaunchAttempted = true;
            browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'chromium'}) });
            contextCreateAttempted = true;
            context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
            await context.route('**/*', async route => {
                if (route.request().url() !== probeUrl) { result.blockedOtherRequests++; await route.abort(); return; }
                result.handlerStarts++;
                result.requestStarted = transportLifecycleSnapshot(phase);
                try {
                    // Real browser route/fetch/fulfill/abort. Only the guard's URL-reading seam maps
                    // the loopback request to the fixed app identity; network URL remains loopback.
                    await routePreviewRequest({
                        request: () => ({ url: () => previewOrigin + '/admin', method: () => route.request().method(),
                            allHeaders: () => route.request().allHeaders() }),
                        fetch: async options => { try { return await route.fetch(options); }
                            catch (error) { result.fetchFailureCategory = category(error); throw error; } },
                        fulfill: options => route.fulfill(options), abort: code => route.abort(code),
                    }, token, observation => recordTransportDiagnostic(report, observation, transportLifecycleSnapshot(phase)));
                    result.handlerOutcome = 'COMPLETED';
                } catch { result.handlerOutcome = 'FIXED_TRANSPORT_REFUSAL'; }
                finally { result.handlerObserved = transportLifecycleSnapshot(phase); pendingResolve(); }
            });
            const page = await context.newPage();
            result.stage = 'LOOPBACK_GET';
            const navigation = page.goto(probeUrl, { waitUntil:'load',timeout:10000 }).then(response => {
                result.navigationCompleted = true; result.navigationStatus = response.status();
            }, () => { result.navigationRejected = true; });
            await deadline(Promise.race([entered, handled]));
            assert.equal(result.loopbackHits,1); assert.equal(result.serverSawGet,true); assert.equal(result.syntheticHeaderPresent,true);
            if (scenario === 'CONTEXT_INTERRUPT') {
                result.stage = 'INTENTIONAL_CONTEXT_CLOSE';
                result.close = await closeIsolatedBrowser(context,browser,{contextCreateAttempted:true,browserLaunchAttempted:true},observeClose);
                closed = true;
                await deadline(handled); await deadline(navigation);
                assert.ok(report.firstTransportFailure);
                assert.equal(result.serverResponseHeld,true); assert.equal(result.handlerOutcome,'FIXED_TRANSPORT_REFUSAL');
                assert.equal(result.navigationRejected,true); assert.equal(report.firstTransportFailure.status,null);
                assert.equal(report.firstTransportFailure.stages.fetchStarted,true);
                assert.equal(report.firstTransportFailure.stages.responseObserved,false);
                assert.ok(['FETCH_EXCEPTION','ABORT_EXCEPTION'].includes(report.firstTransportFailure.exception));
                assert.ok(['CONTEXT_CLOSE_START','CONTEXT_CLOSE_END','BROWSER_CLOSE_START','BROWSER_CLOSE_END'].includes(report.firstTransportFailure.lifecycle.phase));
                assert.ok(Date.parse(report.firstTransportFailure.lifecycle.observedUtc) >= Date.parse(stages[0].observedUtc));
            } else {
                await deadline(handled); await deadline(navigation);
                if (scenario === 'NORMAL') {
                    assert.equal(result.serverResponseSent,true);
                    assert.equal(result.handlerOutcome,'COMPLETED'); assert.equal(result.navigationCompleted,true); assert.equal(result.navigationStatus,200);
                    assert.equal(report.firstTransportFailure,undefined);
                } else {
                    assert.equal(result.serverSocketDestroyed,true);
                    assert.equal(result.navigationRejected,true); assert.equal(result.handlerOutcome,'FIXED_TRANSPORT_REFUSAL');
                    assert.equal(report.firstTransportFailure.exception,'FETCH_EXCEPTION');
                    assert.equal(report.firstTransportFailure.lifecycle.phase,'APP_FLOW');
                }
                result.stage = 'LOCAL_CLOSE';
                result.close = await closeIsolatedBrowser(context,browser,{contextCreateAttempted:true,browserLaunchAttempted:true},observeClose);
                closed = true;
            }
            assert.equal(result.handlerStarts,1); assert.equal(result.loopbackHits,1); assert.equal(result.blockedOtherRequests,0);
            assert.equal(result.close.allLocalClosed,true); assert.equal(result.close.lifecycleObservationFailed,false);
            result.firstTransportFailure = report.firstTransportFailure ?? null;
            result.closeStages = stages;
            result.stage = 'COMPLETE'; result.status = 'PASS_OBSERVER_CONTROL';
        } catch (error) {
            result.status = 'FAIL_OR_NOT_RUN'; result.infrastructureCategory = category(error);
            throw Error('OFFLINE_CHROMIUM_CONTROL_FAILED');
        } finally {
            if (!closed) result.cleanup = await closeIsolatedBrowser(context,browser,{contextCreateAttempted,browserLaunchAttempted},observeClose);
            if (server?.listening) await close(server);
            t.diagnostic(JSON.stringify({ offlineLifecycleControl:result }));
        }
    }
    assert.equal(results.length,3);
    // These controls validate measurement, not the cause or success of any previous live run.
});
