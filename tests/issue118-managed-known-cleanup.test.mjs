import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {assertManagedCleanupProof,executeManagedKnownFixtureCleanup,target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity} from '../scripts/issue118-ci-auth.mjs';
const ts=createRequire(import.meta.url)('tsx/cjs/api');
const {fixturePayload}=ts.require('../scripts/issue118-batch-stop.ts',import.meta.url);
const {ALLERGEN_MASTER}=ts.require('../lib/constants/allergen-master.ts',import.meta.url);
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const foodHash=menu=>createHash('sha256').update(canonical(fixturePayload(menu))).digest('hex');
const ids=['cmvziwd1k0001js07pqfoctkr','cmvzk8bru0001l608a2gjmewc','cmvzk905d0009l608790fkj9u',
    'cmvzk9mbm000hl6085xpcrgm6','cmvzka8kt000pl608yugd9vi3','cmvzkk6r9002pl608yc64yz0m','cmvzkkvde002xl608mxvyjpda'];
function fixture(fault='NONE'){
    const menus=new Map(ids.map((id,i)=>[id,{id,name:'SYNTHETIC_FIXED_TARGET_'+i,description:null,category:null,priceYen:800,
        ingredients:'米、水',precaution:null,imageUrl:null,imageFrame:'square',imageFit:'cover',imagePosition:'center',imageZoom:100,
        imagePositionX:50,imagePositionY:50,version:29,foodVersion:29,isPublished:i>=1&&i<=5,reviewedFoodVersion:null,
        publicationConfirmedFoodVersion:i>=1&&i<=5?29:null,foodReviews:[],allergens:ALLERGEN_MASTER.map(a=>({...a,status:'FREE'}))}]));
    const proof={source:'INDEPENDENT_READ_ONLY',verifiedBy:'cli_metadata_observer',sourceRunId:'41495319922',status:'completed',
        evidenceReference:'https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/41495319922',applicationSha:target.source,
        deployment:target.deployment,origin:target.origin,ownerId:ciIdentity.ownerId,shopId:target.shop,knownTerminal:true,sessionsEnded:true,
        pendingRequests:0,unknownResolved:true,observedUtc:new Date().toISOString(),fixtures:[...menus.values()].map(m=>({id:m.id,
            version:m.version,foodVersion:m.foodVersion,isPublished:m.isPublished,foodSha256:foodHash(m)}))};
    const seen={posts:[],gets:[],events:[],ensure:0,signout:0};
    let failed=false;
    const actor={binding:{owner:'S1',shopId:target.shop},expectedUserId:ciIdentity.ownerId,
        access:{sessionLifecycleMode:()=>'TRACKED_OWNER_SESSION',sessionObservation:()=>({ownerId:ciIdentity.ownerId,ownerVerified:true,eligibleForCleanup:true}),
            ensureToken:async()=>{seen.ensure++;},token:()=> 'synthetic.payload.signature',signOut:async()=>{seen.signout++;}},
        context:{request:{fetch:async(url,options)=>{
            assert.equal(new URL(url).origin,target.origin);assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);
            assert.equal(options.timeout,20000);const path=new URL(url).pathname;
            const id=path.split('/')[4];assert.ok(ids.includes(id));
            if(options.method==='GET'){
                seen.gets.push(id);const m=structuredClone(menus.get(id));
                if(fault==='PRE_HASH'&&id===ids[1])m.ingredients='changed';
                if(fault==='READBACK'&&failed&&id===ids[1])m.isPublished=true;
                if(fault==='CONFIRMATION'&&failed&&id===ids[1])m.publicationConfirmedFoodVersion=null;
                if(fault==='GET_PLUS_TWO'&&failed&&id===ids[1])m.version++;
                return {status:()=>200,json:async()=>({menu:m})};
            }
            assert.equal(options.method,'POST');assert.equal(path,'/api/admin/menus/'+id+'/stop');
            assert.equal(Object.hasOwn(options,'data'),false);assert.equal(Object.hasOwn(options,'body'),false);
            assert.equal(Object.keys(options.headers).some(k=>k.toLowerCase()==='x-vercel-trusted-oidc-idp-token'),true);
            seen.posts.push(id);failed=true;
            if(fault==='NETWORK')throw Error('sk_test_SYNTHETIC https://secret.invalid/?token=x');
            const m=menus.get(id);m.isPublished=false;m.version+=fault==='ACK_PLUS_TWO'?2:1;
            return {status:()=>fault==='REDIRECT'?302:200,headers:()=>({'x-request-id':fault==='RAW_HEADER'?'sk_test_SYNTHETIC':'00000000-0000-4000-8000-000000000001'}),
                json:async()=>({ok:fault!=='RESPONSE',menu:{id,isPublished:false,version:m.version}})};
        }}}};
    return {proof,actor,seen,record:value=>seen.events.push(value)};
}
test('metadata checks the exact seven targets, fixed owner/run and all terminal facts before any actor is needed',()=>{
    const f=fixture();assert.equal(assertManagedCleanupProof(f.proof).fixtures.length,7);assert.equal(f.seen.ensure,0);
    const mutations=[p=>{p.sessionsEnded=false;},p=>{p.unknownResolved=false;},p=>{p.pendingRequests=1;},p=>{p.sourceRunId='41489714874';},
        p=>{p.ownerId='user_OTHER';},p=>{p.fixtures.pop();},p=>{p.fixtures[1]={...p.fixtures[0]};},p=>{p.fixtures[0].id='cother';},
        p=>{p.fixtures[0].foodVersion=30;},p=>{p.fixtures[0].foodSha256='invalid';},p=>{p.observedUtc='2000-01-01T00:00:00.000Z';},
        p=>{delete p.knownTerminal;},p=>{p.fixtures[0].isPublished=true;},p=>{p.fixtures[6].isPublished=true;},p=>{p.rawError='sk_test_SYNTHETIC';}];
    for(const mutate of mutations){const proof=structuredClone(f.proof);mutate(proof);
        assert.throws(()=>assertManagedCleanupProof(proof),{message:'MANAGED_CLEANUP_PROOF_REFUSED'});}
});
test('known private fixtures send nothing; each public target gets exactly one empty stop and owner readback',async()=>{
    const f=fixture(),oldProof=structuredClone(f.proof),result=await executeManagedKnownFixtureCleanup(f);
    assert.equal(result.status,'KNOWN_FIXTURES_PRIVATE_API_CONFIRMED');assert.equal(result.stopAttempts,5);
    assert.deepEqual(f.seen.posts,ids.slice(1,6));assert.equal(new Set(f.seen.posts).size,5);assert.equal(f.seen.signout,0);
    assert.equal(result.fixtures.filter(x=>x.state==='NO_WRITE_ALREADY_PRIVATE').length,2);
    assert.equal(result.fixtures.filter(x=>x.state==='PRIVATE_API_CONFIRMED').length,5);assert.deepEqual(f.proof,oldProof);
    assert.equal(result.automaticRetry,false);assert.equal(result.independentDatabase,'EXTERNAL_ATTESTER_REQUIRED');
    assert.ok(f.seen.events.every(e=>Object.keys(e).every(k=>['stage','id','status','requestId'].includes(k))));
});
test('proof, owner or fresh API food mismatch refuses before a stop',async()=>{
    for(const fault of ['PROOF','OWNER','PRE_HASH']){const f=fixture(fault);
        if(fault==='PROOF')f.proof.sessionsEnded=false;if(fault==='OWNER')f.actor.binding.owner='S2';
        const result=await executeManagedKnownFixtureCleanup(f);assert.equal(result.status,'HOLD_KNOWN_FIXTURE_CLEANUP');assert.equal(f.seen.posts.length,0);
        assert.equal(result.errorClass,'MANAGED_KNOWN_FIXTURE_CLEANUP_HELD');assert.equal(f.seen.signout,0);
    }
});
test('stop uncertainty, minimal-response mismatch and changed readback latch HOLD before any following write',async()=>{
    for(const fault of ['NETWORK','REDIRECT','RESPONSE','READBACK','CONFIRMATION']){
        const f=fixture(fault),result=await executeManagedKnownFixtureCleanup(f);
        assert.equal(result.status,'HOLD_KNOWN_FIXTURE_CLEANUP',fault);assert.equal(result.stopAttempts,1);assert.deepEqual(f.seen.posts,[ids[1]]);
        assert.equal(f.seen.signout,0);assert.equal(JSON.stringify([result,f.seen.events]).includes('sk_test_SYNTHETIC'),false);
        assert.equal(result.automaticRetry,false);assert.equal(result.automaticCleanup,false);
    }
});
test('ACK or fresh GET version plus two is a conflict: HOLD after one STOP with no later target write',async()=>{
    for(const fault of ['ACK_PLUS_TWO','GET_PLUS_TWO']){
        const f=fixture(fault),result=await executeManagedKnownFixtureCleanup(f);
        assert.equal(result.status,'HOLD_KNOWN_FIXTURE_CLEANUP');
        assert.equal(result.errorClass,'MANAGED_KNOWN_FIXTURE_CLEANUP_HELD');
        assert.equal(result.failureStage,fault==='ACK_PLUS_TWO'?'STOP':'STOP_READBACK');
        assert.equal(result.stopAttempts,1);assert.deepEqual(f.seen.posts,[ids[1]]);
        assert.equal(result.fixtures.some(entry=>entry.state==='PRIVATE_API_CONFIRMED'),false);
        assert.equal(f.seen.events.some(event=>event.stage==='CLEANUP_PRIVATE_API_CONFIRMED'),false);
        assert.equal(result.automaticRetry,false);assert.equal(result.automaticCleanup,false);
        assert.equal(f.seen.signout,0);
    }
});

test('raw header values and failing diagnostic observers never enter the report or trigger further writes',async()=>{
    const f=fixture('RAW_HEADER'),result=await executeManagedKnownFixtureCleanup(f);
    assert.equal(result.status,'KNOWN_FIXTURES_PRIVATE_API_CONFIRMED');assert.equal(JSON.stringify(f.seen.events).includes('sk_test_SYNTHETIC'),false);
    const other=fixture();other.record=()=>{throw Error('sk_test_SYNTHETIC');};
    const held=await executeManagedKnownFixtureCleanup(other);assert.equal(held.status,'HOLD_KNOWN_FIXTURE_CLEANUP');assert.equal(other.seen.posts.length,0);
    assert.equal(JSON.stringify(held).includes('sk_test_SYNTHETIC'),false);
});
