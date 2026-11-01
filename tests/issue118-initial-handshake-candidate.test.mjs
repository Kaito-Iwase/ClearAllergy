import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ciIdentity, assertOidcClaims } from '../scripts/issue118-ci-auth.mjs';
import { createInitialHandshakeCandidate, initialHandshakeContract as c } from '../scripts/issue118-initial-handshake-candidate.mjs';
import { routePreviewRequest } from '../scripts/issue118-preview-transport.mjs';

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
    const policy=createInitialHandshakeCandidate(page,()=>{getters++;return assertOidcClaims(options.expireOnGetter===getters?jwt({exp:0}):token);});
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
    for(const value of [outbound(),callback(),c.appLogin+'?leftover='+secret,'https://other.invalid/','/admin/login'])
        await held(fixture([response(307,outbound()),response(302,callback()),response(307,value)]),3);
    await held(fixture([response(308,outbound())]),1);
    await held(fixture([response(307,outbound()),response(200)]),2);
    await held(fixture([response(307,outbound()),response(302,callback()),response(200)]),3);
    await held(fixture([...happy().slice(0,3),response(307,outbound())]),4);
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
    assert.match(live,/createInitialHandshakeCandidate\(page, token\)/);
    assert.match(live,/finally \{ initialDocumentWindow = false; \}/);
    const runner=readFileSync(new URL('../scripts/check-issue118-live-t1-browser.mjs',import.meta.url),'utf8');
    const contextCreation=runner.slice(runner.indexOf('browser.newContext('),runner.indexOf('const ciRoute ='));
    assert.doesNotMatch(contextCreation,/extraHTTPHeaders|storageState|httpCredentials|proxy:/);
    assert.match(contextCreation,/serviceWorkers: "block"/);
    assert.match(contextCreation,/acceptDownloads: false/);
    const workflow=readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml',import.meta.url),'utf8');
    assert.ok(!workflow.includes('initial-handshake-candidate'));
});
