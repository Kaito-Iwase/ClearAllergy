// Pure local attestation/API-shape tests. No SQL, browser, authentication or HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {verifyManagedT1ResumeProof,assertManagedT1ResumeProofMetadata,readManagedResumeBeforePublish,target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity} from '../scripts/issue118-ci-auth.mjs';

const {ALLERGEN_MASTER}=createRequire(import.meta.url)('tsx/cjs/api').require('../lib/constants/allergen-master.ts',import.meta.url);
const observedUtc='2026-11-02T17:30:00.000Z',now=Date.parse(observedUtc)+60000;
function fixture(){
    const proof={githubRunId:'41489714874',applicationSha:target.source,deployment:target.deployment,origin:target.origin,
        fixtureId:'cmvziwd1k0001js07pqfoctkr',creationOperationId:'58f43e90-d322-4558-b9c0-c54586104249',
        requestId:'d73feda8-00e9-43a4-b984-4f85dc57b2e5',ownerId:ciIdentity.ownerId,shopId:target.shop,
        name:'【架空・Issue118 runner】ひよこ豆サラダ 8d40b351',version:29,foodVersion:29,priceYen:1000,isPublished:false,imageUrl:null,
        allergenCount:29,freeCount:29,publicationConfirmationCount:0,foodReviewCount:0,issueResolutionCount:0,
        createAuditCount:1,uniqueCreationCount:1,successfulCreateAuditRequestCount:1,source:'INDEPENDENT_READ_ONLY',verifiedBy:'cli_metadata_observer',
        observedUtc,evidenceReference:'https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/41489714874',knownTerminal:true,sessionsEnded:true,
        pendingRequests:0,sourceWindow:{startedUtc:'2026-11-02T17:17:58.614Z',finishedUtc:'2026-11-02T17:19:07.788Z'}};
    const menu={id:proof.fixtureId,name:proof.name,description:'Issue118専用の架空検証。実食品ではありません。',priceYen:1000,
        category:null,ingredients:'ひよこ豆、共通ドレッシング',precaution:null,imageUrl:null,
        imageFrame:'square',imageFit:'cover',imagePosition:'center',imageZoom:100,imagePositionX:50,imagePositionY:50,
        version:29,foodVersion:29,reviewedFoodVersion:null,publicationConfirmedFoodVersion:null,isPublished:false,foodReviews:[],
        allergens:ALLERGEN_MASTER.map(a=>({...a,status:'FREE'}))};
    return {proof,menu,shop:{id:target.shop},now};
}
const refused=error=>error.message==='MANAGED_T1_RESUME_PROOF_REFUSED'&&!error.cause&&!String(error.stack).includes('sk_test_SYNTHETIC');

test('metadata preflight requires no API stand-in and cannot replace the later current owner API verification',()=>{
    const input=fixture(),metadata=assertManagedT1ResumeProofMetadata(input.proof,input.now);
    assert.equal(metadata.fixtureId,input.menu.id);assert.equal(metadata.attestationFormatMatched,true);
    assert.equal(metadata.independentDatabase,'EXTERNAL_ATTESTER_REQUIRED');assert.ok(Object.isFrozen(metadata));
    assert.equal(Object.hasOwn(metadata,'confirmedCreate'),false);
    assert.throws(()=>verifyManagedT1ResumeProof({proof:input.proof,now:input.now}),refused);
    assert.throws(()=>verifyManagedT1ResumeProof({...input,menu:{id:input.menu.id}}),refused);
    assert.throws(()=>verifyManagedT1ResumeProof({...input,shop:undefined}),refused);
});
test('every missing metadata field and missing source-window boundary refuses before any API data is needed',()=>{
    const input=fixture();
    for(const key of Object.keys(input.proof)){
        const proof=structuredClone(input.proof);delete proof[key];
        assert.throws(()=>assertManagedT1ResumeProofMetadata(proof,input.now),refused);
    }
    for(const key of ['startedUtc','finishedUtc']){
        const proof=structuredClone(input.proof);delete proof.sourceWindow[key];
        assert.throws(()=>assertManagedT1ResumeProofMetadata(proof,input.now),refused);
    }
    for(const proof of [undefined,null,{},'sk_test_SYNTHETIC'])assert.throws(()=>assertManagedT1ResumeProofMetadata(proof,input.now),refused);
});

test('fixed external creation confirmation returns a new CREATE reference and never changes the old HOLD ledger',()=>{
    const input=fixture(),before=structuredClone(input);
    const oldLedger={held:true,operations:[{phase:'CREATE',state:'INDETERMINATE',createdId:input.menu.id}]};
    const original=structuredClone(oldLedger),result=verifyManagedT1ResumeProof(input);
    assert.equal(result.nextPhase,'INITIAL_PUBLISH');assert.equal(result.fixtureId,input.menu.id);
    assert.equal(result.attestationFormatMatched,true);assert.equal(result.independentDatabase,'EXTERNAL_ATTESTER_REQUIRED');
    assert.equal(result.confirmedCreate.state,'CONFIRMED_SUCCESS');assert.equal(result.confirmedCreate.httpStatus,201);
    assert.equal(result.confirmedCreate.creationOperationId,input.proof.creationOperationId);assert.equal(result.confirmedCreate.requestId,input.proof.requestId);
    assert.equal(result.confirmedCreate.externalConfirmation.sourceRunId,'41489714874');
    const nextLedger={held:false,operations:[structuredClone(result.confirmedCreate)]};
    assert.equal(nextLedger.operations.length,1);assert.deepEqual(oldLedger,original);assert.deepEqual(input,before);
    assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.confirmedCreate)&&Object.isFrozen(result.confirmedCreate.externalConfirmation));
    // Image-style fields remain schema-checked; metadata extraction adds no new food constraint.
    input.menu.imageFrame='wide';input.menu.imageFit='contain';input.menu.imagePosition='top';input.menu.imageZoom=120;
    assert.equal(verifyManagedT1ResumeProof(input).attestationFormatMatched,true);
});
test('changed fixed binding, missing SQL observation, nonterminal session, wrong window and stale proof refuse without fallback',()=>{
    const changes=[i=>{i.proof.githubRunId='41484324047';},i=>{i.proof.applicationSha='0'.repeat(40);},
        i=>{i.proof.deployment='dpl_OTHER';},i=>{i.proof.origin='https://other.invalid';},i=>{i.proof.fixtureId='cother';},
        i=>{i.proof.creationOperationId='00000000-0000-4000-8000-000000000001';},i=>{i.proof.requestId='00000000-0000-4000-8000-000000000002';},
        i=>{i.proof.ownerId='user_OTHER';},i=>{i.proof.shopId='cother';},i=>{i.proof.knownTerminal=false;},i=>{i.proof.sessionsEnded=false;},
        i=>{i.proof.pendingRequests=1;},i=>{i.proof.version=30;},i=>{i.proof.foodVersion=30;},i=>{i.proof.freeCount=28;},
        i=>{i.proof.publicationConfirmationCount=1;},i=>{i.proof.foodReviewCount=1;},i=>{i.proof.issueResolutionCount=1;},
        i=>{i.proof.createAuditCount=2;},i=>{i.proof.uniqueCreationCount=2;},i=>{i.proof.successfulCreateAuditRequestCount=0;},
        i=>{delete i.proof.issueResolutionCount;},i=>{i.proof.rawError='sk_test_SYNTHETIC';},
        i=>{i.proof.sourceWindow.finishedUtc='2026-11-02T17:19:08.000Z';},i=>{i.proof.sourceWindow.extra=true;},
        i=>{i.proof.observedUtc='2026-11-02T17:18:00.000Z';},i=>{i.now=now+3600001;},i=>{i.now=0;}];
    for(const mutate of changes){const input=fixture();mutate(input);assert.throws(()=>verifyManagedT1ResumeProof(input),refused);}
});
test('current owner SavedMenu must match fixed initial food, all29 actual master slugs and untouched confirmation/review state',()=>{
    const changes=[i=>{i.menu.id='cother';},i=>{i.menu.name='sk_test_SYNTHETIC';},i=>{i.menu.priceYen=999;},
        i=>{i.menu.ingredients='changed';},i=>{i.menu.description=null;},i=>{i.menu.version=30;},i=>{i.menu.foodVersion=30;},
        i=>{i.menu.isPublished=true;},i=>{i.menu.publicationConfirmedFoodVersion=29;},i=>{i.menu.reviewedFoodVersion=29;},
        i=>{i.menu.foodReviews=[{}];},i=>{i.menu.imageUrl='https://other.invalid/image.png';},
        i=>{i.menu.allergens[6].status='UNKNOWN';},i=>{i.menu.allergens[6].status='CONTAINS';},
        i=>{i.menu.allergens[0].slug='not_a_master_slug';},i=>{i.menu.allergens[0]={...i.menu.allergens[1]};},
        i=>{i.menu.allergens.pop();},i=>{i.shop.id='cother';},i=>{i.menu.shopId='cother';},i=>{delete i.menu.imageFit;}];
    for(const mutate of changes){const input=fixture();mutate(input);assert.throws(()=>verifyManagedT1ResumeProof(input),refused);}
});

test('second read publication/food/owner conflict and unknown read latch refusal before any publish or cleanup',async()=>{
    for(const change of [i=>{i.menu.isPublished=true;},i=>{i.menu.name='changed';},i=>{i.menu.foodVersion=30;},
        i=>{i.menu.priceYen=1001;},i=>{i.shop.id='cother';},i=>{i.readError=true;}]){
        const input=fixture();verifyManagedT1ResumeProof(input);change(input);
        let refused=false,writes=0,reads=0;
        try{
            await readManagedResumeBeforePublish({...input,onRefusal:()=>{refused=true;},read:async id=>{
                reads++;assert.equal(id,input.proof.fixtureId);if(input.readError)throw Error('SYNTHETIC_SECRET');return input.menu;}});
            writes++;
        }catch(error){assert.equal(error.message,'MANAGED_T1_RESUME_PROOF_REFUSED');}
        // The live finally branch checks this refusal before any ordinary cleanup.
        if(!refused)writes++;
        assert.equal(refused,true);assert.equal(reads,1);assert.equal(writes,0);
    }
});
