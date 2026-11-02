import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ciIdentity, assertOidcClaims } from '../scripts/issue118-ci-auth.mjs';
import { createInitialHandshakeCandidate, initialHandshakeContract as c } from '../scripts/issue118-initial-handshake-candidate.mjs';
import { routePreviewRequest } from '../scripts/issue118-preview-transport.mjs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createClerkClient } from '@clerk/backend';
import { inspectHandshakeLocation } from '../scripts/issue118-handshake-observation.mjs';

const secret = 'SYNTHETIC_NONCE_OR_JWT_NOT_REAL';
const jwt = (extra = {}) => 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({
    iss:'https://token.actions.githubusercontent.com',aud:ciIdentity.audience,
    sub:`repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`,
    repository:ciIdentity.repository,repository_id:ciIdentity.repositoryId,ref:ciIdentity.ref,
    workflow_ref:ciIdentity.workflowRef,environment:ciIdentity.environment,
    iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,...extra })).toString('base64url') + '.synthetic';
const outbound = () => {
    const url = new URL(c.clerkOrigin + c.clerkPath);
    for(const [key,value] of Object.entries({redirect_url:c.appLogin,__clerk_api_version:c.apiVersion,
        suffixed_cookies:'true',__clerk_hs_reason:c.reason,format:c.format})) url.searchParams.set(key,value);
    return url.href;
};
const callback = () => c.appLogin + '?__clerk_handshake_nonce=' + secret + '&__clerk_db_jwt=' + secret;
const response = (status,location) => ({status:()=>status,headers:()=>({'location':location}),
    text:()=>assert.fail('No response body inspection'),json:()=>assert.fail('No response body inspection')});
const happy = (status=302) => [response(307,outbound()),response(status,callback()),response(307,c.appLogin),response(200)];
function fixture(responses=happy(), requestChange={}, options={}) {
    const frame = {}; const calls=[]; let fulfills=0,aborts=0,getters=0;
    const token=jwt();
    const context={request:{fetch:async (url,settings)=>{
        calls.push({url,settings}); const index=calls.length-1;
        assert.equal(settings.method,'GET'); assert.equal(settings.maxRedirects,0); assert.equal(settings.maxRetries,0);
        assert.equal(settings.timeout,20000); assert.equal(settings.ignoreHTTPSErrors,undefined);
        for(const key of Object.keys(settings.headers)) assert.ok(!/^(cookie|authorization|referer|origin|x-vercel-protection-bypass)$/i.test(key));
        if(new URL(url).origin===c.clerkOrigin) assert.ok(!Object.keys(settings.headers).some(k=>k.toLowerCase()==='x-vercel-trusted-oidc-idp-token'));
        else assert.equal(settings.headers['x-vercel-trusted-oidc-idp-token'],token);
        if(options.networkFailure===index+1) throw Error(secret+' https://user:password@other.invalid/private');
        assert.ok(index<responses.length,'No extra fetch/retry permitted'); return responses[index];
    }},cookies:()=>assert.fail('Never read cookies'),storageState:()=>assert.fail('Never export session')};
    const page={context:()=>context,mainFrame:()=>frame};
    const request={method:()=>'GET',resourceType:()=>'document',isNavigationRequest:()=>true,frame:()=>frame,url:()=>c.appLogin,
        allHeaders:()=>assert.fail('Never copy original Cookie/OIDC/bypass headers'),...requestChange};
    const route={request:()=>request,fulfill:async ({response:r})=>{fulfills++;assert.equal(r.status(),200);if(options.fulfillFailure)throw Error(secret);},
        abort:async()=>{aborts++;if(options.abortFailure)throw Error(secret);}};
    const policy=createInitialHandshakeCandidate(page,()=>{getters++;return assertOidcClaims(options.expireOnGetter===getters?jwt({exp:0}):token);},
        {allowLegacyCandidate:options.allowLegacyCandidate});
    return {policy,route,calls,get fulfills(){return fulfills;},get aborts(){return aborts;},get getters(){return getters;}};
}
function safeReport(f) {
    const r=f.policy.diagnostics();
    assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC|https:|__clerk|redirect_url|bearer|password/);
    assert.ok(r.requests<=4);assert.ok(r.redirects<=3);return r;
}
async function held(f,count) {
    await assert.rejects(f.policy.run(f.route),error=>error.message==='CI_INITIAL_HANDSHAKE_HELD'&&!error.cause&&!error.stack.includes(secret));
    const r=safeReport(f);assert.equal(r.held,true);assert.equal(r.complete,false);assert.equal(f.calls.length,count);
    assert.equal(r.contextDisposalRequired,count>0);return r;
}
test('pinned SDK contract is sourced from exact deployed lock and supported nonce query names',()=>{
    const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
    assert.equal(lock.packages['node_modules/@clerk/nextjs'].version,'7.5.13');
    assert.equal(lock.packages['node_modules/@clerk/backend'].version,'3.11.0');
    assert.equal(c.clerkOrigin,'https://'+ciIdentity.clerkDomain);
    const sdk=readFileSync(new URL('../node_modules/@clerk/backend/dist/chunk-EXSW62UK.mjs',import.meta.url),'utf8');
    for(const literal of ['"v1/client/handshake"','"2026-05-12"','"dev-browser-missing"','"__clerk_handshake_nonce"','"__clerk_db_jwt"']) assert.ok(sdk.includes(literal));
});
test('one bounded handshake shares only context-managed cookies; OIDC is app-only, no raw report',async()=>{
    for(const status of [302,303,307]){
        const f=fixture(happy(status));await f.policy.run(f.route);
        assert.deepEqual(f.calls.map(x=>x.url),[c.appLogin,outbound(),callback(),c.appLogin]);
        assert.equal(f.calls.length,4);assert.equal(f.getters,3);assert.equal(f.fulfills,1);assert.equal(f.aborts,0);
        const r=safeReport(f);assert.equal(r.complete,true);assert.equal(r.held,false);assert.equal(r.redirects,3);
        assert.equal(r.code,'DOCUMENT_READY_AUTH_NOT_VERIFIED');
    }
});
test('already-ready initial document needs one GET and duplicate use cannot start another request',async()=>{
    const f=fixture([response(200)]);await f.policy.run(f.route);assert.equal(f.calls.length,1);assert.equal(f.getters,1);
    assert.equal(safeReport(f).handshakeUsed,false);await held(f,1);assert.equal(f.fulfills,1);
});
test('a previous successful abort is never reused as confirmation when a prohibited reuse abort fails',async()=>{
    const options={};const f=fixture([response(500)],{},options);
    await held(f,1);assert.equal(safeReport(f).abortConfirmed,true);assert.equal(safeReport(f).lastHttpStatus,500);
    options.abortFailure=true;
    await held(f,1);assert.equal(safeReport(f).abortConfirmed,false);
    assert.equal(f.calls.length,1);assert.equal(f.aborts,2);
});
test('wrong method/resource/frame/path/query refuses before any request',async()=>{
    for(const change of [{method:()=>'PUT'},{method:()=>'POST'},{resourceType:()=>'xhr'},
        {isNavigationRequest:()=>false},{frame:()=>({})},{url:()=>c.appLogin+'?x=1'},
        {url:()=>c.appLogin.replace('/admin/login','/api/admin/menus')},{url:()=>c.appLogin+'/'}]) await held(fixture(happy(),change),0);
});
test('outbound handshake requires exact host/path/SDK query and nested fixed return URL',async()=>{
    const bad=[];
    for(const transform of [u=>u.protocol='http:',u=>u.username='user',u=>u.password=secret,u=>u.port='444',u=>u.hash=secret,
        u=>u.hostname+='.'+'invalid',u=>u.pathname='/v1/client/sign_ins',u=>u.searchParams.set('redirect_url','https://other.invalid/'),
        u=>u.searchParams.set('__clerk_api_version','other'),u=>u.searchParams.set('__clerk_hs_reason','session-token-expired'),
        u=>u.searchParams.set('format','token'),u=>u.searchParams.set('suffixed_cookies','other'),u=>u.searchParams.set('__session',secret),
        u=>u.searchParams.append('redirect_url',c.appLogin),u=>u.searchParams.delete('format')]){const u=new URL(outbound());transform(u);bad.push(u.href);}
    bad.push('/v1/client/handshake','https://[',outbound()+'\n');
    for(const value of bad) await held(fixture([response(307,value)]),1);
});
test('Clerk callback permits only exact app login with nonce and optional dev token; all other paths/query fail',async()=>{
    const values=[c.clerkOrigin+c.clerkPath,'https://other.invalid/admin/login?__clerk_handshake_nonce='+secret,
        c.appLogin.replace('/admin/login','/api/admin/menus')+'?__clerk_handshake_nonce='+secret,
        c.appLogin+'?__clerk_handshake='+secret,c.appLogin+'?__clerk_db_jwt='+secret,
        callback()+'&redirect_url=https://other.invalid/',callback()+'&__clerk_handshake_nonce=duplicate',
        callback()+'&__clerk_help=1',callback()+'#fragment',callback().replace('https://','http://')];
    for(const value of values) await held(fixture([response(307,outbound()),response(302,value)]),2);
});
test('cleanup URL and status are exact; loops or a fourth redirect never start another request',async()=>{
    for(const value of [outbound(),callback(),c.appLogin+'?leftover='+secret,'https://other.invalid/',
        '//'+new URL(c.appLogin).host+'/admin/login','admin/login','/admin/./login','/admin/login/','/admin/login?',
        '/admin/login#','/admin/login?token='+secret,'/admin/login\n','/%61dmin/login','/admin/login#'+secret])
        await held(fixture([response(307,outbound()),response(302,callback()),response(307,value)]),3);
    await held(fixture([response(308,outbound())]),1);
    await held(fixture([response(307,outbound()),response(200)]),2);
    await held(fixture([response(307,outbound()),response(302,callback()),response(200)]),3);
    await held(fixture([...happy().slice(0,3),response(307,outbound())]),4);
});
test('only the third response accepts the exact relative clean path, canonicalized to the fixed app',async()=>{
    for(const legacy of [false,true]) {
        const carrier=legacy?c.appLogin+'?__clerk_handshake=synthetic.payload.signature':callback();
        const f=fixture([response(307,outbound()),response(307,carrier),response(307,'/admin/login'),response(200)],{}, {allowLegacyCandidate:legacy});
        await f.policy.run(f.route);
        assert.equal(f.calls.length,4); assert.equal(f.calls[3].url,c.appLogin);
        assert.equal(f.fulfills,1); assert.equal(f.getters,3);
        const r=safeReport(f);assert.equal(r.complete,true);assert.equal(r.locations.APP_CLEAN_TARGET.contractMatches,true);
        assert.equal(r.locations.APP_CLEAN_TARGET.absoluteParseable,false);
        assert.equal(r.locations.APP_CLEAN_TARGET.relativeWouldResolveExactCleanApp,true);
    }
    await held(fixture(happy(),{url:()=>'/admin/login'}),0);
    await held(fixture([response(307,'/admin/login')]),1);
    await held(fixture([response(307,outbound()),response(307,'/admin/login')]),2);
});

test('LOCAL legacy candidate is opt-in, exact carrier only; nonce remains separate and all hop/header constraints stay',async()=>{
    const legacy=c.appLogin+'?__clerk_handshake=synthetic.payload.signature';
    await held(fixture([response(307,outbound()),response(307,legacy)]),2);
    for(const status of [302,303,307]){
        const f=fixture([response(307,outbound()),response(status,legacy),response(307,c.appLogin),response(200)],{}, {allowLegacyCandidate:true});
        await f.policy.run(f.route);assert.equal(safeReport(f).complete,true);assert.equal(f.calls.length,4);assert.equal(f.getters,3);
    }
    const nonce=fixture(happy(),{}, {allowLegacyCandidate:true});await nonce.policy.run(nonce.route);assert.equal(nonce.fulfills,1);
    for(const value of [legacy+'&__clerk_handshake_nonce='+secret,legacy+'&__clerk_db_jwt='+secret,legacy+'&__clerk_handshake=duplicate',
        legacy+'&__clerk_help=1',legacy+'&other='+secret,legacy.replace('synthetic.payload.signature',''),
        legacy.replace('synthetic.payload.signature','not-jwt'),legacy.replace('synthetic.payload.signature','a.b.'),
        legacy.replace('https:','http:'),legacy.replace('/admin/login','/api/admin/menus'),
        legacy.replace(c.appLogin,'https://other.invalid/admin/login'),legacy+'#fragment','/admin/login?__clerk_handshake=a.b.c']){
        await held(fixture([response(307,outbound()),response(307,value)],{}, {allowLegacyCandidate:true}),2);
    }
});

test('pinned REAL SDK verifies legacy signature offline before applying directives; driver format check is not validation',async()=>{
    // Ephemeral synthetic cryptographic fixture only, never a Clerk service key.
    const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
    const publicPem=publicKey.export({format:'pem',type:'spki'});
    const client=createClerkClient({publishableKey:'pk_test_'+Buffer.from('synthetic.clerk.accounts.dev$').toString('base64'),
        secretKey:'sk_test_synthetic_not_real',jwtKey:publicPem,telemetry:{disabled:true}});
    const jwtHeader=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'synthetic'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({handshake:['synthetic_offline_directive=verified; Path=/; Secure; SameSite=Lax']})).toString('base64url');
    const data=jwtHeader+'.'+payload,signature=sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
    const signed=data+'.'+signature;
    const originalFetch=globalThis.fetch;let network=0;
    globalThis.fetch=async()=>{network++;throw Error('OFFLINE_NETWORK_FORBIDDEN');};
    try {
        const request=token=>new Request(c.appLogin+'?__clerk_handshake='+token,{headers:{'Sec-Fetch-Dest':'document'}});
        const valid=await client.authenticateRequest(request(signed));
        assert.match(valid.headers.get('set-cookie'),/synthetic_offline_directive=verified/);
        assert.equal(valid.headers.get('location'),c.appLogin);assert.equal(valid.isAuthenticated,false);
        // SDK's clean URL is derived from forwarded headers, not the driver's
        // immutable target constant. Synthetic evidence only, NOT the live cause.
        const forwarded=new Request(request(signed),{headers:{'Sec-Fetch-Dest':'document','x-forwarded-host':'forwarded.synthetic.invalid','x-forwarded-proto':'https'}});
        const forwardedResult=await client.authenticateRequest(forwarded);
        assert.equal(forwardedResult.headers.get('location'),'https://forwarded.synthetic.invalid/admin/login');
        assert.equal(inspectHandshakeLocation(forwardedResult.headers.get('location'),'APP_CLEAN_TARGET',c,true).samePinnedApp,false);
        const corrupt=data+'.'+(signature[0]==='A'?'B':'A')+signature.slice(1);
        await assert.rejects(client.authenticateRequest(request(corrupt)),/invalid signature/i);
        assert.equal(network,0);
    } finally {globalThis.fetch=originalFetch;}
});

test('all clean-target predicates are boolean-only and match candidate acceptance, including exact relative/empty delimiter cases',async()=>{
    const entries=[[c.appLogin,true,'exactCleanApp'],[undefined,false,'valueIsString'],['',false,'valuePresent'],
        ['x'.repeat(16385),false,'lengthAllowed'],[c.appLogin+'\n',false,'controlCharactersAbsent'],['https://[',false,'absoluteParseable'],
        ['/admin/login',true,'relativeWouldResolveExactCleanApp'],[c.appLogin.replace('https:','http:'),false,'https'],
        [c.appLogin.replace('https://','https://user:'+secret+'@'),false,'userinfoAbsent'],
        [c.appLogin.replace('/admin/login',':444/admin/login'),false,'defaultPort'],[c.appLogin+'#'+secret,false,'fragmentAbsent'],
        ['https://other.invalid/admin/login',false,'samePinnedApp'],[c.appLogin+'/other',false,'pathMatchesLogin'],
        [c.appLogin+'?unknown_'+secret+'='+secret,false,'queryAbsent'],[c.appLogin+'?',false,'exactCleanApp'],[c.appLogin+'#',false,'exactCleanApp'],
        [c.appLogin.replace('/admin/login',':443/admin/login'),true,'exactCleanApp']];
    for(const [value,accepted,flag]of entries){
        const p=inspectHandshakeLocation(value,'APP_CLEAN_TARGET',c,true,undefined,true);
        assert.ok(Object.values(p).every(v=>typeof v==='boolean'));assert.doesNotMatch(JSON.stringify(p),/SYNTHETIC|https:|__clerk|unknown_/);
        assert.equal(p.contractMatches,accepted);assert.equal(p[flag],accepted);
        const f=fixture([response(307,outbound()),response(307,callback()),response(307,value),response(200)],{}, {allowLegacyCandidate:true});
        if(accepted){await f.policy.run(f.route);assert.equal(f.calls.length,4);assert.equal(f.fulfills,1);}
        else await held(f,3);
        const observed=safeReport(f).locations.APP_CLEAN_TARGET;
        assert.equal(observed.observed,true);assert.equal(observed.singleLocation,true);assert.equal(observed.contractMatches,accepted);
        assert.equal(safeReport(f).responses.APP_CALLBACK.expectedForPhase,true);
    }
    const relative=inspectHandshakeLocation('/admin/login','APP_CLEAN_TARGET',c,true);
    assert.equal(relative.relativeWouldResolveExactCleanApp,true);assert.equal(relative.contractMatches,false);
    const emptyQuery=inspectHandshakeLocation(c.appLogin+'?','APP_CLEAN_TARGET',c,true);
    assert.equal(emptyQuery.queryAbsent,true);assert.equal(emptyQuery.queryDelimiterPresent,true);assert.equal(emptyQuery.exactCleanApp,false);
});

test('outbound and both callback carrier observations retain parity; observations never authorize an otherwise refused hop',async()=>{
    for(const [kind,value,allow,accepted]of [['APP_TO_CLERK',outbound(),true,true],
        ['APP_TO_CLERK',outbound().replace('format=nonce','format=token'),true,false],
        ['APP_TO_CLERK',outbound()+'&unknown_'+secret+'=x',true,false],
        ['CLERK_TO_APP',callback(),true,true],['CLERK_TO_APP',c.appLogin+'?__clerk_handshake=a.b.c',true,true],
        ['CLERK_TO_APP',c.appLogin+'?__clerk_handshake=a.b.c',false,false],
        ['CLERK_TO_APP',callback()+'&__clerk_handshake=a.b.c',true,false],['CLERK_TO_APP',callback()+'&__clerk_handshake_nonce=x',true,false],
        ['CLERK_TO_APP',c.appLogin+'?__clerk_handshake=not-jwt',true,false]]){
        const p=inspectHandshakeLocation(value,kind,c,allow);
        assert.ok(Object.values(p).every(v=>typeof v==='boolean'));assert.doesNotMatch(JSON.stringify(p),/SYNTHETIC|https:|__clerk|unknown_/);assert.equal(p.contractMatches,accepted);
        const responses=kind==='APP_TO_CLERK'?[response(307,value),...happy().slice(1)]:[response(307,outbound()),response(307,value),...happy().slice(2)];
        const f=fixture(responses,{}, {allowLegacyCandidate:allow});if(accepted)await f.policy.run(f.route);else await held(f,kind==='APP_TO_CLERK'?1:2);
        assert.equal(safeReport(f).locations[kind].contractMatches,accepted);
    }
});

test('missing/duplicate/unreadable Location is distinguished at each hop without another GET or raw exception',async()=>{
    for(const [index,kind]of [[0,'APP_TO_CLERK'],[1,'CLERK_TO_APP'],[2,'APP_CLEAN_TARGET']]){
        for(const scenario of ['missing','duplicate','throw']){
            const responses=happy();responses[index]={status:()=>307,headers:()=>{
                if(scenario==='throw')throw Error(secret);return scenario==='missing'?{}:{Location:c.appLogin,location:c.appLogin};
            }};
            const f=fixture(responses);await held(f,index+1);const p=safeReport(f).locations[kind];
            assert.equal(p.observed,true);assert.equal(p.headerReadSucceeded,scenario!=='throw');assert.equal(p.singleLocation,false);assert.equal(p.contractMatches,false);
        }
    }
});

test('all response phases, final fulfill, cookie-interface limits and snapshot isolation remain separate observations',async()=>{
    const f=fixture(happy());await f.policy.run(f.route);const r=safeReport(f);
    for(const phase of ['APP_INITIAL','CLERK_HANDSHAKE','APP_CALLBACK','APP_CLEAN']){
        assert.equal(r.responses[phase].expectedForPhase,true);assert.equal(r.responses[phase].statusReadSucceeded,true);
        assert.ok(Object.values(r.responses[phase]).every(v=>typeof v==='boolean'));
    }
    assert.equal(r.finalDocumentFulfilled,true);assert.equal(r.cookieTransfer.contextRequestInterfaceSelected,true);
    assert.equal(r.cookieTransfer.sameRequestInterfaceForAllGets,true);assert.equal(r.cookieTransfer.cookieContentsObserved,false);
    assert.equal(r.cookieTransfer.actualCookieDeliveryVerified,false);
    r.locations.APP_CLEAN_TARGET.exactCleanApp=false;assert.equal(f.policy.diagnostics().locations.APP_CLEAN_TARGET.exactCleanApp,true);
    for(const index of [0,1,2,3]){
        const responses=happy();responses[index]={status:()=>{throw Error(secret);}};
        const broken=fixture(responses);await held(broken,index+1);
        const p=Object.values(safeReport(broken).responses).at(-1);assert.equal(p.statusReadSucceeded,false);assert.equal(p.expectedForPhase,false);
    }
    const failed=fixture(happy(),{}, {fulfillFailure:true});await held(failed,4);
    assert.equal(safeReport(failed).responses.APP_CLEAN.expectedForPhase,true);assert.equal(safeReport(failed).finalDocumentFulfilled,false);
});
test('provider failures and expired OIDC are HOLD, never retry; cookie/provider state is not claimed cleared',async()=>{
    for(const hop of [1,2,3,4]) {const f=fixture(happy(),{}, {networkFailure:hop});await held(f,hop);assert.equal(safeReport(f).lastHttpStatus,null);}
    await held(fixture(happy(),{}, {expireOnGetter:1}),0);
    await held(fixture(happy(),{}, {expireOnGetter:2}),2);
    const f=fixture(happy(),{}, {fulfillFailure:true,abortFailure:true});const r=await held(f,4);
    assert.equal(r.abortConfirmed,false);assert.equal(r.finalDocumentFulfilled,false);assert.equal(r.cookieOrProviderStateMayExist,true);
    const bad=fixture([{status:()=>307,headers:()=>{throw Error(secret);}}]);await held(bad,1);
});
test('existing normal API-write redirect refusal remains intact; callsite is initial-document gated',async()=>{
    let fetched=0,aborted=0;
    const route={request:()=>({url:()=>c.appLogin.replace('/admin/login','/api/admin/menus'),method:()=>'PUT',allHeaders:async()=>({})}),
        fetch:async()=>{fetched++;return response(307,outbound());},fulfill:async()=>assert.fail('No write redirect follow'),abort:async()=>{aborted++;}};
    await assert.rejects(routePreviewRequest(route,'a.b.c'),/PROTECTED_REDIRECT_BLOCKED/);assert.equal(fetched,1);assert.equal(aborted,1);
    const live=readFileSync(new URL('../scripts/issue118-ci-auth.mjs',import.meta.url),'utf8');
    assert.ok(live.includes('createInitialHandshakeCandidate'));
    assert.match(live,/initialDocumentWindow && request\.isNavigationRequest\(\) && request\.resourceType\(\) === 'document'/);
    assert.match(live,/request\.frame\(\) === initialPage\.mainFrame\(\)/);
    assert.match(live,/createInitialHandshakeCandidate\(page, token, \{ allowLegacyCandidate: true \}\)/);
    assert.match(live,/finally \{ initialDocumentWindow = false; \}/);
    const runner=readFileSync(new URL('../scripts/check-issue118-live-t1-browser.mjs',import.meta.url),'utf8');
    const contextCreation=runner.slice(runner.indexOf('browser.newContext('),runner.indexOf('const ciRoute ='));
    assert.doesNotMatch(contextCreation,/extraHTTPHeaders|storageState|httpCredentials|proxy:/);
    assert.match(contextCreation,/serviceWorkers: "block"/);
    assert.match(contextCreation,/acceptDownloads: false/);
    const workflow=readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml',import.meta.url),'utf8');
    assert.ok(!workflow.includes('initial-handshake-candidate'));
});
