import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {executeManagedContinuation,target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity,managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';

const image={buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))};
function fixture({coreHeld=false,closeFailed=false,missingApi=false}={}){
    const seen={read:[],runtime:0,core:0,service:0,close:0,signout:0,cells:[],saved:[],events:[]};
    const pk='pk_test_'+Buffer.from(ciIdentity.clerkDomain+'$').toString('base64');
    const actors=['S1','S2'].map(owner=>{
        const identity=managedActorIdentity[owner],browser={};
        const context={browser:()=>browser,pages:()=>[page],request:{}};
        const page={context:()=>context,url:()=>target.origin+'/admin/shop',isClosed:()=>false,
            evaluate:async()=>({id:identity.ownerId,pk})};
        const access={sessionLifecycleMode:()=>'TRACKED_OWNER_SESSION',sessionObservation:()=>({id:'sess_'+owner,
            ownerId:identity.ownerId,ownerVerified:true,eligibleForCleanup:true,providerCreatedUtc:new Date().toISOString()}),
            signOut:async()=>{seen.signout++;},read:async(_api,url)=>{seen.read.push({owner,url});return {status:()=>200,json:async()=>({shop:{id:identity.shopId}})};}};
        return {owner,binding:{owner,shopId:identity.shopId,contextRef:'synthetic_'+owner},expectedUserId:identity.ownerId,
            page,context,access,lifecycle:{browser,tracker:{snapshot:()=>({pending:0,started:0,settled:0}),drain:async()=>({status:'QUIET_CONFIRMED',pending:0})}}};
    });
    let state={status:'NOT_COMPLETE'},suitePorts,preparationState;
    const api=Object.fromEntries(['readMenu','readShop','readCreationBaseline','createMenu','menuWrite','shopWrite','observeKnownBlob',
        'verifyPublicImage','verifyActor','readOwner','claimPrivate'].map(name=>[name,async()=>true]));
    const dependencies={
        createRuntimePorts(input){seen.runtime++;seen.batch=input.batchInput;
            return {ports:{},serviceApi:missingApi?undefined:api,snapshot:()=>({held:false,operations:[]})};},
        createServicePreparation(input){preparationState=input.state;
            assert.equal(input.menuTemplate.ingredients,'米、水');assert.equal(input.menuTemplate.priceYen,800);
            assert.equal(input.allergens.length,29);assert.equal(Object.values(input.menuTemplate.allergenStatusBySlug).every(s=>s==='FREE'),true);
            input.state.version=1;input.state.runId=input.runId;input.state.cells={};
            return {prepareCell:async()=>{},finishCell:async()=>{},recordSetupObject:async()=>true,retainHeldCell:()=>{}};},
        prepareServiceBrowser(input){seen.browserInput=input;return {runServiceCell:async({cell})=>{
            seen.cells.push(cell.id);preparationState.cells[cell.id]={status:'SYNTHETIC_NOT_LIVE'};
        },close:async()=>{seen.close++;if(closeFailed)throw Error('secret raw close error');return {ownedPageClosed:true,routesDrained:true,managedHeld:true};}};},
        createSuite(input){suitePorts=input.ports;return {
            executeCore:async()=>{seen.core++;state=coreHeld?{status:'HOLD_NO_FURTHER_WRITES',livePass:false}
                :{status:'CORE_COMPLETE_SUITE_INCOMPLETE',arms:[{status:'CORE_API_SEQUENCE_COMPLETE'}],livePass:false};return state;},
            executeServiceArm:async arm=>{seen.service++;seen.arm=arm;
                assert.deepEqual(await suitePorts.prepareServiceActor({existingActor:true,permit:null}),{owner:'S1',identityVerified:true,separateFromClosedActors:true});
                for(const id of arm.cellIds)await suitePorts.runServiceCell({cell:{id}});
                state={status:'HOLD_NO_FURTHER_WRITES',livePass:false};return state;},snapshot:()=>structuredClone(state)};},
    };
    const input={actors,t1:{flow:'PASS_APP_BROWSER_API',cleanup:'PRIVATE_VERIFIED',protection:'PASS_API_REPRESENTATION',
        unknownWrite:false,fixtureId:'cnewt1synthetic',menuWrites:6,sessions:2},identityReceipt:{...Object.fromEntries(
            ['project','projectId','origin','deployment','source','alias'].map(key=>[key,target[key]])),environment:'Preview',status:'Ready',
            verifiedBy:'browser_metadata_observer',evidenceReference:'SYNTHETIC_METADATA_ONLY',observedUtc:new Date().toISOString()},
        claimDirectory:'SYNTHETIC_NO_FACTORY_IO',image,dependencies,record:e=>seen.events.push(e),outputRecord:r=>seen.saved.push(r)};
    return {input,seen};
}
test('continuation wires unique managed UUIDs, original M04, core then13 ordered cells; only service pages are closed',async()=>{
    const {input,seen}=fixture(),result=await executeManagedContinuation(input);
    assert.equal(seen.runtime,1);assert.equal(seen.core,1);assert.equal(seen.service,1);assert.equal(seen.read.length,2);
    const cfg=seen.batch.managed;assert.equal(cfg.mode,'APPROVED_MANAGED_LIVE');assert.equal(cfg.finalizeActors,false);
    assert.equal(cfg.t4EvidenceLevel,'APP_BROWSER_READS_ONLY');assert.equal(cfg.ownerEvidence.length,2);
    const ids=Object.values(cfg.operationIds).flatMap(m=>Object.values(m));assert.equal(ids.length,17);assert.equal(new Set(ids).size,17);
    assert.equal(new Set([seen.batch.runId,...Object.values(cfg.runIds)]).size,4);
    assert.equal(cfg.ownerEvidence.every(e=>e.source===target.source&&e.origin===target.origin&&e.deployment===target.deployment),true);
    assert.equal(seen.cells.length,13);assert.equal(seen.cells.at(-1),'MENU_CREATE_WITHHOLD_AFTER_RESPONSE');
    assert.equal(seen.cells.indexOf('SHOP_SAVE_DELIVER'),seen.cells.indexOf('SHOP_UPLOAD_DELIVER')+1);
    assert.equal(seen.close,1);assert.equal(seen.signout,0);assert.equal(result.browserAdapterClose.routesDrained,true);
    assert.equal(result.browserAdapterClose.preexistingPagesPreserved,true);assert.equal(result.runtimeSnapshot.continuationEvidence,'INJECTED_FACTORY_TEST');
    assert.equal(result.suiteSnapshot.status,'HOLD_NO_FURTHER_WRITES');assert.equal(seen.saved.length,1);
});
test('core HOLD never starts any service operation or creates a new session',async()=>{
    const {input,seen}=fixture({coreHeld:true}),result=await executeManagedContinuation(input);
    assert.equal(seen.core,1);assert.equal(seen.service,0);assert.equal(seen.cells.length,0);assert.equal(seen.close,1);
    assert.equal(seen.signout,0);assert.equal(result.suiteSnapshot.status,'HOLD_NO_FURTHER_WRITES');
});
test('wrong owner, stale receipt, invalid image and missing serviceApi stop before core/fixture operations',async()=>{
    for(const kind of ['owner','receipt','image','api']){
        const {input,seen}=fixture({missingApi:kind==='api'});
        if(kind==='owner')input.actors[1].page.evaluate=async()=>({id:'user_other',pk:'DO_NOT_OUTPUT_THIS'});
        if(kind==='receipt')input.identityReceipt.observedUtc=new Date(Date.now()-7200000).toISOString();
        if(kind==='image')input.image={buffer:Buffer.alloc(1904984)};
        const result=await executeManagedContinuation(input);assert.equal(seen.core,0);assert.equal(seen.service,0);assert.equal(seen.signout,0);
        assert.match(result.runtimeSnapshot.continuationStatus,/^HOLD_CONTINUATION_/);assert.equal(JSON.stringify(result).includes('DO_NOT_OUTPUT_THIS'),false);
    }
});
test('service close/drain uncertainty is explicit, never closes parent-owned actors or logs provider error',async()=>{
    const {input,seen}=fixture({closeFailed:true}),result=await executeManagedContinuation(input);
    assert.equal(result.runtimeSnapshot.continuationStatus,'HOLD_SERVICE_PAGE_CLOSE_UNVERIFIED');
    assert.equal(result.browserAdapterClose.ownedPageClosed,false);assert.equal(seen.signout,0);
    assert.equal(input.actors.every(a=>!a.page.isClosed()),true);assert.equal(JSON.stringify(result).includes('secret raw'),false);
});
test('checkpoint persistence failure is held once, without a service retry or session cleanup attempt',async()=>{
    const {input,seen}=fixture();let saves=0;input.outputRecord=()=>{saves++;throw Error('secret save failure');};
    const result=await executeManagedContinuation(input);assert.equal(saves,1);assert.equal(seen.service,1);assert.equal(seen.close,1);
    assert.equal(seen.signout,0);assert.equal(result.runtimeSnapshot.continuationStatus,'HOLD_CHECKPOINT_WRITE_UNVERIFIED');
    assert.equal(JSON.stringify(result).includes('secret save'),false);
});
