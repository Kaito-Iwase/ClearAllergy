import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { ciIdentity } from '../scripts/issue118-ci-auth.mjs';
import { target } from '../scripts/check-issue118-live-t1-browser.mjs';
import { initialHandshakeContract as contract, createInitialHandshakeCandidate } from '../scripts/issue118-initial-handshake-candidate.mjs';
import { callbackPredicates, handshakeCallbackDiagnostic, handshakeCleanTargetDiagnostic } from '../scripts/check-issue118-handshake-callback.mjs';
import { closeIsolatedBrowser } from '../scripts/issue118-close-browser.mjs';

const secret='SYNTHETIC_PRIVATE_VALUE';
const callback=contract.appLogin+'?__clerk_handshake_nonce='+secret+'&__clerk_db_jwt='+secret;
const outbound=contract.clerkOrigin+contract.clerkPath+'?'+new URLSearchParams({redirect_url:contract.appLogin,
    __clerk_api_version:contract.apiVersion,suffixed_cookies:'true',__clerk_hs_reason:contract.reason,format:contract.format});
const response=(location,status=307)=>({headers:()=>({location}),status:()=>status});
const predicates=value=>callbackPredicates(response(value),outbound);
const env=()=>({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',
    GITHUB_REPOSITORY:ciIdentity.repository,GITHUB_REPOSITORY_ID:ciIdentity.repositoryId,GITHUB_REF:ciIdentity.ref,
    GITHUB_WORKFLOW_REF:ciIdentity.workflowRef,ISSUE118_GITHUB_ENVIRONMENT:ciIdentity.environment,
    ISSUE118_DIAGNOSTIC_MODE:'HANDSHAKE_CALLBACK_ONLY',GITHUB_SHA:'a'.repeat(40),ISSUE118_EXPECTED_RUNNER_SHA:'a'.repeat(40),
    ACTIONS_ID_TOKEN_REQUEST_URL:'https://synthetic.actions.githubusercontent.com/opaque?private='+secret,
    ACTIONS_ID_TOKEN_REQUEST_TOKEN:secret});
const receipt=()=>({...target,environment:'Preview',status:'Ready',verifiedBy:'human',observedUtc:new Date().toISOString(),evidenceReference:'Offline synthetic'});
const oidc=()=>({ok:true,json:async()=>({value:'eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({
    iss:'https://token.actions.githubusercontent.com',aud:ciIdentity.audience,sub:`repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`,
    repository:ciIdentity.repository,repository_id:ciIdentity.repositoryId,ref:ciIdentity.ref,workflow_ref:ciIdentity.workflowRef,
    environment:ciIdentity.environment,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300})).toString('base64url')+'.synthetic'})});
function safe(r){assert.ok(Object.values(r).every(v=>typeof v==='boolean'));assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC|https:|\/admin|__clerk|bearer|Authorization/);}
function harness(changes={}){
    const calls=[],closes=[];let oidcCalls=0;
    const context={request:{fetch:async(url,options)=>{
        calls.push({url,options});assert.ok(calls.length<=(changes.cleanMode?3:2),'An extra GET is forbidden');
        assert.equal(options.method,'GET');assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);assert.equal(options.timeout,20000);
        assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);
        if(calls.length===1){assert.equal(url,contract.appLogin);assert.ok(options.headers['x-vercel-trusted-oidc-idp-token']);return changes.first?.()??response(outbound);}
        if(calls.length===2){assert.equal(url,outbound);assert.equal(options.headers['x-vercel-trusted-oidc-idp-token'],undefined);
            return changes.second?.()??response(callback);}
        assert.ok(options.headers['x-vercel-trusted-oidc-idp-token']);assert.ok(url.startsWith(contract.appLogin+'?'));
        return changes.third?.()??response(contract.appLogin);
    }},close:async()=>{closes.push('context');if(changes.close)throw Error(secret);}};
    const browser={newContext:async options=>{assert.deepEqual(options,{acceptDownloads:false,serviceWorkers:'block'});if(changes.context)throw Error(secret);return context;},
        close:async()=>{closes.push('browser');}};
    return {calls,closes,get oidcCalls(){return oidcCalls;},run:async(e={...env(),...(changes.cleanMode?{ISSUE118_DIAGNOSTIC_MODE:'HANDSHAKE_CLEAN_TARGET_ONLY'}:{})},r=receipt())=>(changes.cleanMode?handshakeCleanTargetDiagnostic:handshakeCallbackDiagnostic)(e,r,async(u,o)=>{
        oidcCalls++;assert.equal(oidcCalls,1);assert.equal(o.redirect,'error');assert.equal(o.method,'GET');
        if(changes.oidc)throw Error(secret);return oidc();
    },async()=>{if(changes.launch)throw Error(secret);return browser;})};
}

test('valid callback yields boolean predicates; optional absence is distinct from a contract failure',()=>{
    const r=predicates(callback);safe(r);assert.equal(r.callbackContractMatches,true);
    for(const k of ['locationReadSucceeded','singleLocationHeader','locationPresent','locationString','locationLengthAllowed','controlCharactersAbsent',
        'absoluteParseable','parseable','https','userinfoAbsent','defaultPort','fragmentAbsent','returnOriginMatches','returnPathMatches',
        'nonceKeyPresent','nonceNonEmpty','nonceExactlyOnce','devBrowserKeyPresent','devBrowserNonEmpty','devBrowserExactlyOnce',
        'allQueryKeysKnown','queryKeysUnique','queryValuesNonEmpty'])assert.equal(r[k],true,k);
    const nonceOnly=predicates(contract.appLogin+'?__clerk_handshake_nonce='+secret);
    assert.equal(nonceOnly.callbackContractMatches,true);assert.equal(nonceOnly.devBrowserKeyPresent,false);
});

test('Location read, number, shape, length, parse and control predicates never expose values',()=>{
    for(const [r,key] of [[callbackPredicates({headers:()=>{throw Error(secret);}},outbound),'locationReadSucceeded'],
        [callbackPredicates({headers:()=>({})},outbound),'singleLocationHeader'],
        [callbackPredicates({headers:()=>({Location:callback,location:callback})},outbound),'singleLocationHeader']]){safe(r);assert.equal(r[key],false);}
    for(const [value,key] of [[null,'locationString'],[{},'locationString'],['','locationPresent'],['x'.repeat(16385),'locationLengthAllowed'],
        ['https://[','parseable'],[callback+'\n','controlCharactersAbsent']]){const r=predicates(value);safe(r);assert.equal(r[key],false);assert.equal(r.callbackContractMatches,false);}
    const relative=predicates('/admin/login?__clerk_handshake_nonce='+secret);safe(relative);
    assert.equal(relative.parseable,true);assert.equal(relative.absoluteParseable,false);assert.equal(relative.returnOriginMatches,false);
    assert.equal(relative.destinationIsConfiguredClerk,true);assert.equal(relative.callbackContractMatches,false);
});

test('each safety and return-target predicate discriminates without following any target',()=>{
    for(const [value,key] of [[callback.replace('https:','http:'),'https'],[callback.replace('https://','https://user:'+secret+'@'),'userinfoAbsent'],
        [callback.replace('/admin/login',':444/admin/login'),'defaultPort'],[callback+'#'+secret,'fragmentAbsent'],
        [callback.replace(target.origin,'https://other.invalid'),'returnOriginMatches'],[callback.replace('/admin/login','/other'),'returnPathMatches']]){
        const r=predicates(value);safe(r);assert.equal(r[key],false);assert.equal(r.callbackContractMatches,false);
    }
    assert.equal(predicates('https://vercel.com/?value='+secret).destinationIsKnownVercel,true);
    assert.equal(predicates('https://other.invalid/?value='+secret).destinationIsOther,true);
});

test('query presence, empty, duplicate, legacy and unknown additions are separate boolean observations',()=>{
    for(const [value,key] of [[contract.appLogin,'nonceKeyPresent'],[contract.appLogin+'?__clerk_handshake_nonce=','nonceNonEmpty'],
        [callback+'&__clerk_handshake_nonce='+secret,'nonceExactlyOnce'],[callback+'&__clerk_db_jwt='+secret,'devBrowserExactlyOnce'],
        [callback.replace('__clerk_db_jwt='+secret,'__clerk_db_jwt='),'devBrowserNonEmpty'],[callback+'&private_unknown_'+secret+'='+secret,'allQueryKeysKnown']]){
        const r=predicates(value);safe(r);assert.equal(r[key],false);assert.equal(r.callbackContractMatches,false);
    }
    const mapping={__clerk_handshake:'hasLegacyHandshakeKey',__clerk_help:'hasHandshakeHelpKey',__clerk_synced:'hasClerkSyncedKey',__session:'hasSessionKey',redirect_url:'hasRedirectUrlKey'};
    for(const [q,k] of Object.entries(mapping)){const r=predicates(callback+'&'+q+'='+secret);safe(r);assert.equal(r[k],true);assert.equal(r.hasAdditionalQuery,true);assert.equal(r.callbackContractMatches,false);}
    assert.equal(predicates(callback+'&__clerk_db_jwt='+secret).queryKeysUnique,false);
    assert.equal(predicates(callback+'&__clerk_db_jwt=').queryValuesNonEmpty,false);
});

test('diagnostic callback-contract boolean matches the existing normal live callback guard',async()=>{
    for(const value of [callback,contract.appLogin+'?__clerk_handshake_nonce='+secret,contract.appLogin,callback+'&extra='+secret,
        callback+'&__clerk_handshake_nonce='+secret,'/admin/login?__clerk_handshake_nonce='+secret,callback+'#x',callback.replace('https:','http:')]){
        let calls=0;const frame={};const page={mainFrame:()=>frame,context:()=>({request:{fetch:async()=>{
            calls++;if(calls===1)return response(outbound);if(calls===2)return response(value);throw Error('STOP_AFTER_CALLBACK_VALIDATION');
        }}})};
        const helper=createInitialHandshakeCandidate(page,()=> 'synthetic.payload.signature');
        await assert.rejects(helper.run({request:()=>({method:()=> 'GET',resourceType:()=> 'document',isNavigationRequest:()=>true,frame:()=>frame,url:()=>contract.appLogin}),abort:async()=>{}}),/^Error: CI_INITIAL_HANDSHAKE_HELD$/);
        assert.equal(calls===3,predicates(value).callbackContractMatches);
    }
});

test('all callback outcomes stop at two isolated GETs, even every predicate true; no page, cookie export, auth, callback or fixture',async()=>{
    for(const value of [callback,contract.appLogin,callback+'&extra='+secret,'/relative',null]){
        const h=harness({second:()=>response(value)}),r=await h.run();safe(r);
        assert.equal(h.oidcCalls,1);assert.equal(h.calls.length,2);assert.equal(r.diagnosticCompleted,true);assert.equal(r.diagnosticFailed,false);
        assert.equal(r.callbackResponseObserved,true);assert.equal(r.stoppedBeforeCallback,true);assert.equal(r.callbackGetSent,false);
        for(const k of ['clerkAuthenticationStarted','sessionStarted','fixtureWriteStarted'])assert.equal(r[k],false);
        assert.equal(r.localCloseConfirmed,true);assert.deepEqual(h.closes.sort(),['browser','context']);
    }
});

test('environment and receipt refusal happen before OIDC or browser creation',async()=>{
    for(const change of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REF:'refs/heads/main'},{ISSUE118_DIAGNOSTIC_MODE:'PREVIEW_REDIRECT_ONLY'},
        {ISSUE118_APPLY:'true'},{ISSUE118_TEST_CLERK_SECRET_KEY:secret},{CLERK_SECRET_KEY:secret},{DATABASE_URL:secret},{DIRECT_URL:secret},
        {NODE_OPTIONS:secret},{GITHUB_SHA:'b'.repeat(40)}]){
        const h=harness(),r=await h.run({...env(),...change});safe(r);assert.equal(h.oidcCalls,0);assert.equal(h.calls.length,0);assert.equal(r.diagnosticFailed,true);
    }
    for(const change of [{observedUtc:'2000-01-01T00:00:00Z'},{environment:'Production'},{origin:'https://other.invalid'}]){
        const h=harness(),r=await h.run(env(),{...receipt(),...change});safe(r);assert.equal(h.oidcCalls,0);assert.equal(r.diagnosticFailed,true);
    }
});

test('transport/provider/close failures keep progress booleans and no raw exception or retry',async()=>{
    for(const changes of [{oidc:true},{launch:true},{context:true},{first:()=>{throw Error(secret);}},{first:()=>response('https://other.invalid/')},
        {second:()=>{throw Error(secret);}},{second:()=>({status:()=>307,headers:()=>{throw Error(secret);}})},{close:true}]){
        const h=harness(changes),r=await h.run();safe(r);assert.ok(h.calls.length<=2);assert.equal(r.callbackGetSent,false);
        if(changes.second&&r.callbackResponseObserved){assert.equal(r.locationReadSucceeded,false);}
        else assert.equal(r.diagnosticFailed,true);
        if(changes.launch||changes.context||changes.close)assert.equal(r.localCloseConfirmed,false);
    }
    const h=harness({first:()=>response(null,200)}),r=await h.run();assert.equal(h.calls.length,1);assert.equal(r.diagnosticCompleted,true);assert.equal(r.clerkGetSent,false);
});

test('workflow selects callback-only without secret, APPLY or normal live step, and CI includes these tests',()=>{
    const yaml=readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml',import.meta.url),'utf8');
    const w=createRequire(import.meta.url)('js-yaml').load(yaml),steps=w.jobs['live-t1'].steps;
    const d=steps.find(s=>s.run==='node scripts/check-issue118-handshake-callback.mjs --callback-only');
    assert.equal(d.if,"inputs.confirmation == 'DIAGNOSE_HANDSHAKE_CALLBACK_ONLY'");assert.equal(d.env.ISSUE118_DIAGNOSTIC_MODE,'HANDSHAKE_CALLBACK_ONLY');
    assert.doesNotMatch(JSON.stringify(d),/secrets\.|ISSUE118_APPLY|CLERK_SECRET|--ci-apply/);
    const secrets=steps.filter(s=>JSON.stringify(s.env||{}).includes('secrets.'));assert.equal(secrets.length,1);assert.equal(secrets[0].if,"inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1'");
    assert.equal(steps.find(s=>s.name==='Prepare the existing isolated Playwright version (no app secrets)').if,
        "inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1' || inputs.confirmation == 'DIAGNOSE_HANDSHAKE_CALLBACK_ONLY' || inputs.confirmation == 'DIAGNOSE_HANDSHAKE_CLEAN_TARGET_ONLY'");
    const artifact=steps.find(s=>s.with?.name==='issue118-handshake-callback-${{ github.run_id }}');
    assert.equal(artifact.with.path,'${{ runner.temp }}/issue118-handshake-callback/result.json');
    assert.match(readFileSync(new URL('../scripts/browser-runner.mjs',import.meta.url),'utf8'),/tests\/issue118-handshake-callback.test.mjs/);
});

test('CLI wrong arguments refuse with fixed non-secret output',()=>{
    const r=spawnSync(process.execPath,['scripts/check-issue118-handshake-callback.mjs','--wrong'],{env:{SystemRoot:process.env.SystemRoot},encoding:'utf8'});
    assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/^HANDSHAKE_CALLBACK_DIAGNOSTIC_REFUSED_NO_RAW_ERROR\s*$/);
});

test('context close completes before browser close, with independent booleans and no raw error',async()=>{
    for(const contextFails of [false,true])for(const browserFails of [false,true]){
        const order=[];
        const context={close:async()=>{order.push('context-start');await Promise.resolve();order.push('context-end');if(contextFails)throw Error(secret);}};
        const browser={close:async()=>{assert.deepEqual(order,['context-start','context-end']);order.push('browser');if(browserFails)throw Error(secret);}};
        const r=await closeIsolatedBrowser(context,browser,{contextCreateAttempted:true,browserLaunchAttempted:true});safe(r);
        assert.equal(r.contextCloseConfirmed,!contextFails);assert.equal(r.browserCloseConfirmed,!browserFails);
        assert.equal(r.allLocalClosed,!contextFails&&!browserFails);assert.equal(r.contextCloseAttempted,true);assert.equal(r.browserCloseAttempted,true);
    }
    for(const attempts of [{browserLaunchAttempted:true},{browserLaunchAttempted:true,contextCreateAttempted:true}]){
        const r=await closeIsolatedBrowser(undefined,undefined,attempts);safe(r);assert.equal(r.allLocalClosed,false);
        assert.equal(r.browserCloseConfirmed,false);assert.equal(r.contextCloseConfirmed,false);
    }
    const none=await closeIsolatedBrowser(undefined,undefined);assert.equal(none.allLocalClosed,true);assert.equal(none.contextCloseConfirmed,false);assert.equal(none.browserCloseConfirmed,false);
    const sync=await closeIsolatedBrowser({close:()=>{throw Error(secret);}},{close:()=>{}},{browserLaunchAttempted:true,contextCreateAttempted:true});safe(sync);
    assert.equal(sync.contextCloseConfirmed,false);assert.equal(sync.browserCloseConfirmed,true);assert.equal(sync.allLocalClosed,false);
});

test('clean-target mode observes all conditions after at most three GETs and NEVER sends a fourth even for a valid clean target',async()=>{
    const legacy=contract.appLogin+'?__clerk_handshake=synthetic.payload.signature';
    for(const value of [contract.appLogin,'/admin/login',contract.appLogin+'?',contract.appLogin+'#',legacy,
        contract.appLogin+'?unknown_'+secret+'='+secret,'https://other.invalid/admin/login',null,'https://[']){
        const h=harness({cleanMode:true,second:()=>response(legacy),third:()=>response(value)}),r=await h.run();safe(r);
        assert.equal(h.calls.length,3);assert.equal(h.oidcCalls,1);assert.equal(r.callbackTargetValidated,true);assert.equal(r.callbackGetSent,true);
        assert.equal(r.cleanGetSent,false);assert.equal(r.stoppedBeforeCleanGet,true);assert.equal(r.cleanTargetResponseObserved,true);
        assert.equal(r.clerkAuthenticationStarted,false);assert.equal(r.sessionStarted,false);assert.equal(r.fixtureWriteStarted,false);
        assert.equal(r.diagnosticCompleted,true);assert.equal(r.localCloseConfirmed,true);
        assert.equal(r.cleanLocationContractMatches,value===contract.appLogin);
        if(value==='/admin/login'){assert.equal(r.cleanLocationRelativeWouldResolveExactCleanApp,true);assert.equal(r.cleanLocationAbsoluteParseable,false);}
        if(value===legacy)assert.equal(r.cleanLocationMatchesOriginalCallback,true);
        if(typeof value==='string'&&value.includes('unknown_'))assert.equal(r.cleanLocationUnknownQueryPresent,true);
    }
});

test('three-GET mode retains header and transport failure predicates, refuses changed context, and stops before unsafe callback',async()=>{
    for(const third of [()=>({status:()=>307,headers:()=>{throw Error(secret);}}),()=>({status:()=>307,headers:()=>({})}),
        ()=>({status:()=>307,headers:()=>({Location:contract.appLogin,location:contract.appLogin})})]){
        const h=harness({cleanMode:true,third}),r=await h.run();safe(r);assert.equal(h.calls.length,3);
        assert.equal(r.cleanLocationSingleLocation,false);assert.equal(r.cleanLocationContractMatches,false);assert.equal(r.cleanGetSent,false);
    }
    for(const change of [{third:()=>{throw Error(secret);}},{third:()=>({status:()=>{throw Error(secret);}})}]){
        const h=harness({cleanMode:true,...change}),r=await h.run();safe(r);assert.equal(h.calls.length,3);assert.equal(r.diagnosticFailed,true);assert.equal(r.cleanGetSent,false);
    }
    const invalid=harness({cleanMode:true,second:()=>response('https://other.invalid/admin/login?__clerk_handshake=a.b.c')});
    const stopped=await invalid.run();safe(stopped);assert.equal(invalid.calls.length,2);assert.equal(stopped.callbackGetSent,false);assert.equal(stopped.diagnosticFailed,true);
    const wrong=harness({cleanMode:true}),refused=await wrong.run(env());assert.equal(wrong.oidcCalls,0);assert.equal(refused.diagnosticFailed,true);
    const key=harness({cleanMode:true}),withKey=await key.run({...env(),ISSUE118_DIAGNOSTIC_MODE:'HANDSHAKE_CLEAN_TARGET_ONLY',ISSUE118_TEST_CLERK_SECRET_KEY:secret});
    assert.equal(key.oidcCalls,0);assert.equal(withKey.diagnosticFailed,true);
});

test('workflow clean-target selection never delivers Clerk Secret or chooses live auth; artifacts contain only the fixed boolean result',()=>{
    const w=createRequire(import.meta.url)('js-yaml').load(readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml',import.meta.url),'utf8'));
    const steps=w.jobs['live-t1'].steps,d=steps.find(s=>s.run==='node scripts/check-issue118-handshake-callback.mjs --clean-target-only');
    assert.equal(d.if,"inputs.confirmation == 'DIAGNOSE_HANDSHAKE_CLEAN_TARGET_ONLY'");
    assert.equal(d.env.ISSUE118_DIAGNOSTIC_MODE,'HANDSHAKE_CLEAN_TARGET_ONLY');assert.doesNotMatch(JSON.stringify(d),/secrets\.|ISSUE118_APPLY|CLERK_SECRET|--ci-apply/);
    const secrets=steps.filter(s=>JSON.stringify(s.env||{}).includes('secrets.'));assert.equal(secrets.length,1);assert.equal(secrets[0].if,"inputs.confirmation == 'APPROVE_NEW_FIXTURE_T1'");
    const a=steps.find(s=>s.with?.name==='issue118-handshake-clean-target-${{ github.run_id }}');
    assert.equal(a.with.path,'${{ runner.temp }}/issue118-handshake-clean-target/result.json');
});
