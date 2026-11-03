// Local candidate seams only. No provider authentication, HTTP or fixture I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {assertManagedBCleanupProof,executeManagedKnownBFixtureCleanup,assertManagedSessionBudget,target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';
const ts=createRequire(import.meta.url)('tsx/cjs/api');
const {fixturePayload}=ts.require('../scripts/issue118-batch-stop.ts',import.meta.url);
const {ALLERGEN_MASTER}=ts.require('../lib/constants/allergen-master.ts',import.meta.url);
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const foodHash=menu=>createHash('sha256').update(canonical(fixturePayload(menu))).digest('hex');
const expected=[['cmvzkaueq000xl6086shu6i7o',95,88],['cmvzkbgd80015l6089s4spnqg',95,88],
    ['cmvzkc2u5001dl6089rwngm8c',32,29],['cmvzkcoq3001ll608iv8ekwxk',32,29]];
const first=expected[0][0];
function fixture(fault='NONE'){
    const menus=new Map(expected.map(([id,version,foodVersion],i)=>[id,{id,name:'SYNTHETIC_B_'+i,description:null,category:null,priceYen:800,
        ingredients:'米、水',precaution:null,imageUrl:null,imageFrame:'square',imageFit:'cover',imagePosition:'center',imageZoom:100,
        imagePositionX:50,imagePositionY:50,version,foodVersion,isPublished:true,publicationConfirmedFoodVersion:foodVersion,
        reviewedFoodVersion:null,foodReviews:[],allergens:ALLERGEN_MASTER.map(a=>({...a,status:'FREE'}))}]));
    const identity=managedActorIdentity.S2,observedUtc=new Date().toISOString();
    const proof={source:'INDEPENDENT_READ_ONLY',verifiedBy:'cli_metadata_observer',sourceRunId:'41495319922',checkpointRunId:'41501320828',
        checkpointSqlObservedUtc:'2026-11-02T18:42:53.901Z',sqlObservedUtc:observedUtc,status:'completed',evidenceReference:'https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/41501320828',
        applicationSha:target.source,deployment:target.deployment,origin:target.origin,ownerId:identity.ownerId,shopId:identity.shopId,
        knownTerminal:true,sessionsEnded:true,pendingRequests:0,unknownResolved:true,observedUtc,
        candidateBudget:{priorSessions:7,priorMenuWrites:42,proposedSessionMaximum:8,neededSessions:1,maximumMenuWrites:103},
        fixtures:[...menus.values()].map(m=>({id:m.id,version:m.version,foodVersion:m.foodVersion,isPublished:m.isPublished,
            publicationConfirmedFoodVersion:m.publicationConfirmedFoodVersion,foodSha256:foodHash(m)}))};
    const seen={posts:[],gets:[],events:[],ensure:0,auth:0,finalize:0};let sent=false;
    const actor={binding:{owner:'S2',shopId:identity.shopId},expectedUserId:identity.ownerId,
        access:{sessionLifecycleMode:()=>'TRACKED_OWNER_SESSION',sessionObservation:()=>({ownerId:identity.ownerId,ownerVerified:true,eligibleForCleanup:true}),
            ensureToken:async()=>{seen.ensure++;},token:()=> 'synthetic.payload.signature',authenticate:async()=>{seen.auth++;},signOut:async()=>{seen.finalize++;}},
        context:{request:{fetch:async(url,options)=>{
            const parsed=new URL(url);assert.equal(parsed.origin,target.origin);assert.equal(parsed.search,'');assert.equal(parsed.hash,'');
            assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);assert.equal(options.timeout,20000);
            const id=parsed.pathname.split('/')[4];assert.ok(menus.has(id));
            if(options.method==='GET'){
                seen.gets.push(id);const menu=structuredClone(menus.get(id));
                if(id===first&&fault==='PRE_VERSION')menu.version++;
                if(id===first&&fault==='PRE_FOOD')menu.foodVersion++;
                if(id===first&&fault==='PRE_HASH')menu.ingredients='changed';
                if(id===first&&fault==='PRE_CONFIRM')menu.publicationConfirmedFoodVersion=null;
                if(id===first&&sent&&fault==='GET_PLUS_TWO')menu.version++;
                if(id===first&&sent&&fault==='AFTER_HASH')menu.ingredients='changed';
                if(id===first&&sent&&fault==='AFTER_FOOD')menu.foodVersion++;
                if(id===first&&sent&&fault==='AFTER_CONFIRM')menu.publicationConfirmedFoodVersion=null;
                if(id===first&&sent&&fault==='AFTER_REVIEW')menu.reviewedFoodVersion=menu.foodVersion;
                return {status:()=>200,json:async()=>({menu})};
            }
            assert.equal(options.method,'POST');assert.equal(parsed.pathname,'/api/admin/menus/'+id+'/stop');
            assert.equal(Object.hasOwn(options,'data'),false);assert.equal(Object.hasOwn(options,'body'),false);
            seen.posts.push(id);sent=true;if(fault==='NETWORK')throw Error('sk_test_SYNTHETIC https://private.invalid/?token=secret');
            const menu=menus.get(id);menu.isPublished=false;menu.version+=fault==='ACK_PLUS_TWO'?2:1;
            return {status:()=>fault==='REDIRECT'?307:200,headers:()=>({'x-request-id':fault==='RAW_HEADER'?'sk_test_SYNTHETIC':'00000000-0000-4000-8000-000000000001'}),
                json:async()=>({ok:fault!=='BAD_ACK',menu:{id,isPublished:false,version:menu.version}})};
        }}}};
    return {actor,proof,seen,record:event=>seen.events.push(event)};
}
test('B candidate validates exactly four fixed public checkpoints and proposed metadata without raising the active session7 cap',()=>{
    const f=fixture(),original=structuredClone(f.proof),result=assertManagedBCleanupProof(f.proof);
    assert.deepEqual(result.fixtures.map(x=>x.id),expected.map(([id])=>id));assert.equal(f.seen.ensure,0);assert.deepEqual(f.proof,original);
    assert.equal(result.candidateBudget.proposedSessionMaximum,8);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.fixtures));
    assert.throws(()=>assertManagedSessionBudget({managedPriorSessionConsumption:7},1),{message:'MANAGED_GLOBAL_SESSION_BUDGET_REFUSED'});
    const changes=[p=>{p.sourceRunId='41501320828';},p=>{p.checkpointRunId='41495319922';},p=>{p.checkpointSqlObservedUtc='2026-11-02T18:42:54.000Z';},
        p=>{p.ownerId=managedActorIdentity.S1.ownerId;},p=>{p.shopId=target.shop;},p=>{p.sessionsEnded=false;},p=>{p.pendingRequests=1;},
        p=>{p.unknownResolved=false;},p=>{p.fixtures.pop();},p=>{p.fixtures[0]={...p.fixtures[1]};},p=>{p.fixtures[0].id='cother';},
        p=>{p.fixtures[0].version++;},p=>{p.fixtures[0].foodVersion++;},p=>{p.fixtures[0].isPublished=false;},
        p=>{p.fixtures[0].publicationConfirmedFoodVersion=null;},p=>{p.fixtures[0].foodSha256='wrong';},
        p=>{p.candidateBudget.priorSessions=6;},p=>{p.candidateBudget.priorMenuWrites=41;},p=>{p.candidateBudget.proposedSessionMaximum=9;},
        p=>{p.observedUtc='2000-01-01T00:00:00.000Z';},p=>{delete p.sqlObservedUtc;},p=>{p.sqlObservedUtc='not-a-date';},p=>{p.rawError='sk_test_SYNTHETIC';}];
    for(const change of changes){const proof=structuredClone(f.proof);change(proof);
        assert.throws(()=>assertManagedBCleanupProof(proof),error=>error.message==='MANAGED_B_CLEANUP_PROOF_REFUSED'&&!error.cause);}
    const now=Date.parse('2026-11-02T20:00:00.000Z');
    for(const [sqlObservedUtc,observedUtc] of [
        // Refreshing the outer proof time cannot refresh this historical SQL measurement.
        ['2026-11-02T18:42:53.901Z','2026-11-02T20:00:00.000Z'],
        ['2026-11-02T20:00:00.001Z','2026-11-02T20:00:00.000Z'], // Future SQL.
        ['2026-11-02T19:30:00.000Z','2026-11-02T19:29:59.999Z'], // SQL after the proof observation.
        ['2026-11-02T19:30:00.000Z','2026-11-02T20:00:00.001Z'], // Future proof observation.
        ['2026-11-02T18:42:53.900Z','2026-11-02T19:00:00.000Z'], // Before historical anchor.
        ['2026-11-02T18:59:59.999Z','2026-11-02T20:00:00.000Z'], // One millisecond beyond SQL freshness.
    ])assert.throws(()=>assertManagedBCleanupProof({...f.proof,sqlObservedUtc,observedUtc},now),{message:'MANAGED_B_CLEANUP_PROOF_REFUSED'});
    const boundary=assertManagedBCleanupProof({...f.proof,sqlObservedUtc:'2026-11-02T19:00:00.000Z',observedUtc:'2026-11-02T20:00:00.000Z'},now);
    assert.equal(boundary.sqlObservedUtc,'2026-11-02T19:00:00.000Z');assert.equal(boundary.checkpointSqlObservedUtc,'2026-11-02T18:42:53.901Z');
});
test('B candidate stops only four B fixtures once, preserves food/confirmation/review state and never authenticates/finalizes actors',async()=>{
    const f=fixture(),original=structuredClone(f.proof),result=await executeManagedKnownBFixtureCleanup(f);
    assert.equal(result.status,'KNOWN_FIXTURES_PRIVATE_API_CONFIRMED');assert.equal(result.candidateOnly,true);assert.equal(result.activeSessionMaximum,7);
    assert.equal(result.stopAttempts,4);assert.deepEqual(f.seen.posts,expected.map(([id])=>id));assert.equal(new Set(f.seen.posts).size,4);
    assert.ok(result.fixtures.every(x=>x.state==='PRIVATE_API_CONFIRMED'));assert.equal(f.seen.auth,0);assert.equal(f.seen.finalize,0);assert.deepEqual(f.proof,original);
    assert.equal(result.automaticRetry,false);assert.equal(result.automaticCleanup,false);assert.equal(result.independentDatabase,'EXTERNAL_ATTESTER_REQUIRED');
    assert.ok(f.seen.events.every(e=>Object.keys(e).every(k=>['stage','id','status','requestId'].includes(k))));
    assert.throws(()=>assertManagedSessionBudget({managedPriorSessionConsumption:7},1),{message:'MANAGED_GLOBAL_SESSION_BUDGET_REFUSED'});
});
test('S1 actor, A/unregistered fixture or current B version/food/hash/confirmation mismatch cannot receive a stop',async()=>{
    for(const fault of ['ACTOR_A','PROOF_A','PRE_VERSION','PRE_FOOD','PRE_HASH','PRE_CONFIRM']){
        const f=fixture(fault);if(fault==='ACTOR_A')f.actor.binding.owner='S1';
        if(fault==='PROOF_A')f.proof.fixtures[0].id='cmvziwd1k0001js07pqfoctkr';
        const result=await executeManagedKnownBFixtureCleanup(f);assert.equal(result.status,'HOLD_KNOWN_FIXTURE_CLEANUP',fault);
        assert.equal(f.seen.posts.length,0);assert.equal(f.seen.auth,0);assert.equal(f.seen.finalize,0);
    }
});
test('B uncertainty, ACK/GET+2, food/confirmation/review conflict stop after one send with no following write',async()=>{
    for(const fault of ['NETWORK','REDIRECT','BAD_ACK','ACK_PLUS_TWO','GET_PLUS_TWO','AFTER_HASH','AFTER_FOOD','AFTER_CONFIRM','AFTER_REVIEW']){
        const f=fixture(fault),result=await executeManagedKnownBFixtureCleanup(f);
        assert.equal(result.status,'HOLD_KNOWN_FIXTURE_CLEANUP',fault);assert.equal(result.stopAttempts,1);assert.deepEqual(f.seen.posts,[first]);
        assert.equal(result.errorClass,'MANAGED_KNOWN_FIXTURE_CLEANUP_HELD');assert.equal(result.fixtures.some(x=>x.state==='PRIVATE_API_CONFIRMED'),false);
        assert.equal(result.automaticRetry,false);assert.equal(f.seen.auth,0);assert.equal(f.seen.finalize,0);
        assert.equal(JSON.stringify([result,f.seen.events]).includes('sk_test_SYNTHETIC'),false);
    }
});
test('B record failures are held before further writes and raw request headers/errors never enter diagnostics',async()=>{
    for(const afterSend of [false,true]){const f=fixture();f.record=event=>{f.seen.events.push(event);
        if(!afterSend||event.stage==='CLEANUP_STOP_STATUS')throw Error('sk_test_SYNTHETIC');};
        const result=await executeManagedKnownBFixtureCleanup(f);assert.equal(result.status,'HOLD_KNOWN_FIXTURE_CLEANUP');
        assert.equal(f.seen.posts.length,afterSend?1:0);assert.equal(JSON.stringify([result,f.seen.events]).includes('sk_test_SYNTHETIC'),false);}
    const f=fixture('RAW_HEADER'),result=await executeManagedKnownBFixtureCleanup(f);
    assert.equal(result.status,'KNOWN_FIXTURES_PRIVATE_API_CONFIRMED');assert.equal(JSON.stringify(f.seen.events).includes('sk_test_SYNTHETIC'),false);
});

test('B SQL proof expiry during token or intent-record awaits is rechecked immediately before fetch: POST zero',async t=>{
    for(const waiting of ['TOKEN','INTENT']){
        const f=fixture(),sqlTime=Date.parse(f.proof.sqlObservedUtc);let clock=sqlTime+1000;
        t.mock.method(Date,'now',()=>clock);
        try{
            const originalEnsure=f.actor.access.ensureToken;let tokenCalls=0;
            f.actor.access.ensureToken=async()=>{await Promise.resolve();await originalEnsure();
                if(waiting==='TOKEN'&&++tokenCalls===2)clock=sqlTime+3600001;};
            f.record=async event=>{f.seen.events.push(event);await Promise.resolve();
                if(waiting==='INTENT'&&event.stage==='CLEANUP_STOP_INTENT')clock=sqlTime+3600001;};
            const result=await executeManagedKnownBFixtureCleanup(f);
            assert.equal(result.status,'HOLD_KNOWN_FIXTURE_CLEANUP');assert.equal(result.failureStage,'STOP_PRE_SEND');
            assert.equal(result.errorClass,'MANAGED_KNOWN_FIXTURE_CLEANUP_HELD');assert.equal(f.seen.posts.length,0);
            assert.deepEqual(f.seen.gets,[first]);assert.equal(f.seen.events.some(e=>e.stage==='CLEANUP_STOP_STATUS'),false);
            assert.equal(f.seen.events.some(e=>e.stage==='CLEANUP_PRIVATE_API_CONFIRMED'),false);
            assert.equal(f.seen.auth,0);assert.equal(f.seen.finalize,0);assert.equal(result.automaticRetry,false);
        }finally{t.mock.restoreAll();}
    }
});
