import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {executeManagedServiceResume,target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity,managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const sequence=['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].map(k=>k+'_WITHHOLD_AFTER_RESPONSE');
const image={buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))};
function fixture({previous=0,verification=true,serviceUnknown=false,closeFailed=false}={}){
    const directory=mkdtempSync(join(tmpdir(),'issue118-resume-test-'));
    const seen={factory:0,runtime:0,service:0,close:0,signout:0,verified:0,events:[],saved:[],order:[]};
    const suiteId='80000000-0000-4000-8000-000000000001',armId='SERVICE_ARM_'+(previous+1);
    const claim={id:'OLD_PRIMARY',kind:'MENU_CREATE',owner:'S1',mode:'WITHHOLD_AFTER_RESPONSE',resource:{method:'POST',path:'/api/admin/menus',purpose:'PRIMARY'}};
    const snapshot={suiteId,applicationSha:target.source,status:'HOLD_NO_FURTHER_WRITES',t1:{fixtureId:'ct1synthetic'},
        counts:{menus:22,menuWrites:80,sessions:3},fixtures:[{id:'ct1synthetic',owner:'S1'}],claims:[claim],
        arms:[{id:'CORE',zone:'CORE',status:'CORE_API_SEQUENCE_COMPLETE'},...Array.from({length:previous+1},(_,i)=>({id:'SERVICE_ARM_'+(i+1),zone:'SERVICE',
            status:'HOLD',terminalVerified:i<previous,currentCell:sequence[i],operationIds:i===previous?[claim.id]:[]}))],
        service:['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].flatMap(kind=>[
            {id:kind+'_DELIVER',status:'OBSERVED_NOT_INDEPENDENTLY_ATTESTED'},
            {id:kind+'_BLOCK_BEFORE_FORWARD',status:'NO_FORWARD_PROVEN_CLIENT_UNKNOWN'},
            {id:kind+'_WITHHOLD_AFTER_RESPONSE',status:sequence.indexOf(kind+'_WITHHOLD_AFTER_RESPONSE')<=previous?'HOLD':'NOT_RUN'}])};
    const bindings=[{operationId:claim.id,kind:claim.kind,mode:claim.mode,owner:claim.owner,resource:claim.resource}];
    const resourcesSha256=hash(canonical(bindings));
    const checkpointReceipt={snapshotSha256:hash(JSON.stringify(snapshot)),applicationSha:target.source,suiteId,terminalArmId:armId,resourcesSha256,
        terminalMetadataReceipt:{verifiedBy:'cli_metadata_observer',evidenceReference:'SYNTHETIC_OFFLINE_TERMINAL_ONLY',observedUtc:new Date().toISOString(),
            githubRunId:'123456',status:'completed',authSessionsClosed:true,pendingRequests:0,artifactSha256:'a'.repeat(64)}};
    const terminalProof={source:'INDEPENDENT_READ_ONLY',originalTerminal:true,unknownResolved:true,sessionsClosed:true,pendingRequests:0,
        operationIds:[claim.id],resourcesSha256};
    const identity=managedActorIdentity.S1,browser={},pk='pk_test_'+Buffer.from(ciIdentity.clerkDomain+'$').toString('base64');
    const context={browser:()=>browser,pages:()=>[page],request:{}};
    const page={context:()=>context,isClosed:()=>false,url:()=>target.origin+'/admin/shop',evaluate:async()=>({id:identity.ownerId,pk})};
    const actor={owner:'S1',expectedUserId:identity.ownerId,binding:{owner:'S1',shopId:identity.shopId,contextRef:'synthetic_resume'},page,context,
        lifecycle:{browser,tracker:{snapshot:()=>({pending:0,started:0,settled:0}),drain:async()=>({status:'QUIET_CONFIRMED',pending:0})}},
        access:{sessionLifecycleMode:()=>'TRACKED_OWNER_SESSION',sessionObservation:()=>({id:'sess_SYNTHETIC',ownerId:identity.ownerId,ownerVerified:true,
            eligibleForCleanup:true,providerCreatedUtc:new Date().toISOString()}),signOut:async()=>{seen.signout++;},
            read:async()=>({status:()=>200,json:async()=>({shop:{id:identity.shopId}})})}};
    const api=Object.fromEntries(['readMenu','readShop','readCreationBaseline','createMenu','menuWrite','shopWrite','observeKnownBlob',
        'verifyPublicImage','verifyActor','readOwner','claimPrivate'].map(name=>[name,async()=>true]));
    let ports,state=structuredClone(snapshot),boundary;
    const dependencies={
        createSuite(input){ports=input.ports;return {snapshot:()=>structuredClone(state),reconcileTerminalArm:async proof=>{
            seen.order.push('VERIFY');assert.equal(await ports.verifyCheckpoint({snapshot:input.initialSnapshot,receipt:input.checkpointReceipt,
                suiteId,applicationSha:target.source}),true);
            const got=await ports.verifyTerminalReadOnly({armId,operationIds:[claim.id],resourceBindings:bindings,resourcesSha256,receipt:proof});
            assert.deepEqual(got,terminalProof);assert.equal(seen.factory,0);state.arms.at(-1).terminalVerified=true;state.status='CORE_COMPLETE_SUITE_INCOMPLETE';},
        executeServiceArm:async plan=>{
            assert.equal(state.arms.at(-1).terminalVerified,true);seen.order.push('ARM');
            const guard=await ports.installSendGuard({authorize:async()=>{},consumeSendPermission:()=>{},recordCreated:()=>{}});
            const permit={id:plan.armId+'_SESSION',allowedForward:true,resource:{method:'NONE',path:'',purpose:'SESSION',shopId:target.shop}};
            state.claims.push({id:permit.id,kind:'SESSION',owner:'S1',state:'FORWARD_CONSUMED'});
            assert.equal(await ports.claimOperation({...state.claims.at(-1),resource:permit.resource}),true);
            try{await ports.prepareServiceActor({existingActor:false,permit});
                seen.cells=plan.cellIds;for(const id of plan.cellIds)await ports.runServiceCell({cell:{id}});
                state.status='HOLD_NO_FURTHER_WRITES';state.arms.push({id:plan.armId,zone:'SERVICE',status:'HOLD',terminalVerified:false});
            }finally{assert.equal(await guard.remove(),true);}
        }};},
        createRuntimePorts(input){seen.runtime++;seen.runtimeInput=input;assert.ok(boundary===undefined);
            return {ports:{installSendGuard:async value=>{boundary=value;return {beforeSend:true,remove:async()=>{boundary=undefined;return true;}};}},
                serviceApi:api,snapshot:()=>({held:serviceUnknown,operations:[]})};},
        createServicePreparation(input){assert.equal(input.runId,suiteId);assert.equal(input.menuTemplate.priceYen,800);
            assert.equal(input.menuTemplate.ingredients,'米、水');assert.equal(input.allergens.length,29);seen.prep=input.state;
            return {prepareCell:async()=>{},finishCell:async()=>{},recordSetupObject:async()=>{},retainHeldCell:()=>{},restorePriorShop:async()=>{}};},
        prepareServiceBrowser(input){seen.browserInput=input;return {runServiceCell:async({cell})=>{seen.service++;seen.prep.cells[cell.id]={status:'HOLD'};
            if(serviceUnknown)throw Error('secret://provider-error');return {status:'HOLD',clientUnknown:true};},
            close:async()=>{seen.close++;if(closeFailed)throw Error('secret close');return {ownedPageClosed:true,routesDrained:true};}};},
    };
    const input={initialSnapshot:snapshot,preparationState:{version:1,runId:suiteId,cells:{}},checkpointReceipt,terminalProof,
        nextCellId:previous===5?null:sequence[previous+1],claimDirectory:directory,identityReceipt:{...Object.fromEntries(
            ['project','projectId','origin','deployment','source','alias'].map(k=>[k,target[k]])),environment:'Preview',status:'Ready',
            verifiedBy:'cli_metadata_observer',evidenceReference:'SYNTHETIC_PREVIEW_METADATA',observedUtc:new Date().toISOString()},image,
        actorFactory:async()=>{seen.factory++;seen.order.push('AUTH');return actor;},
        verifyCheckpoint:async()=>{seen.verified++;if(verification==='THROW')throw Error('secret verification');return verification;},
        record:value=>seen.events.push(value),outputRecord:value=>seen.saved.push(value),dependencies};
    const cleanup=()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('issue118-resume-test-'));
        rmSync(directory,{recursive:true});};
    return {input,seen,actor,cleanup};
}

test('resume verifies terminal before one lazy actor, reuses suite resources and runs exactly the next WH cell',async()=>{
    const f=fixture();try{const {result,actorHandle}=await executeManagedServiceResume(f.input);
        assert.equal(f.seen.verified,1);assert.deepEqual(f.seen.order,['VERIFY','ARM','AUTH']);assert.equal(f.seen.factory,1);
        assert.equal(f.seen.runtime,1);assert.equal(f.seen.runtimeInput.operation,'SERVICE_ARM');assert.deepEqual(f.seen.runtimeInput.actors,[f.actor]);
        assert.deepEqual(f.seen.runtimeInput.checkpointFixtures,f.input.initialSnapshot.fixtures);
        assert.deepEqual(f.seen.cells,['MENU_SAVE_WITHHOLD_AFTER_RESPONSE']);assert.equal(f.seen.service,1);assert.equal(f.seen.close,1);
        assert.equal(f.seen.signout,0);assert.equal(actorHandle,f.actor);assert.equal(result.suiteSnapshot.arms[1].status,'HOLD');
        assert.equal(result.suiteSnapshot.arms[1].terminalVerified,true);assert.equal(f.input.initialSnapshot.arms[1].terminalVerified,false);
        assert.equal(result.runtimeSnapshot.resumeStatus,'RETURNED_SUITE_STATE');assert.equal(result.browserAdapterClose.preexistingPagesPreserved,true);
        assert.equal(f.seen.saved.length,1);assert.equal(Object.hasOwn(f.seen.saved[0],'actorHandle'),false);
    }finally{f.cleanup();}
});
test('invalid checkpoint/terminal proof refuses before actor, runtime and any claim file',async()=>{
    const mutations=[i=>{i.terminalProof.unknownResolved=false;},i=>{i.terminalProof.sessionsClosed=false;},
        i=>{i.terminalProof.pendingRequests=1;},i=>{i.terminalProof.operationIds=['wrong'];},i=>{i.terminalProof.resourcesSha256='0'.repeat(64);},
        i=>{i.checkpointReceipt.snapshotSha256='0'.repeat(64);},i=>{i.checkpointReceipt.applicationSha='0'.repeat(40);},
        i=>{i.checkpointReceipt.terminalMetadataReceipt.authSessionsClosed=false;},i=>{i.nextCellId='SHOP_UPLOAD_WITHHOLD_AFTER_RESPONSE';}];
    for(const mutate of mutations){const f=fixture();try{mutate(f.input);const {result,actorHandle}=await executeManagedServiceResume(f.input);
        assert.equal(f.seen.factory,0);assert.equal(f.seen.runtime,0);assert.equal(f.seen.verified,0);assert.equal(actorHandle,undefined);
        assert.equal(result.runtimeSnapshot.resumeStatus,'HOLD_RESUME_PREFLIGHT');assert.deepEqual(result.preparationState,{});
    }finally{f.cleanup();}}
});
test('checkpoint attestation is strict true; refusal and provider exceptions never authenticate or retry',async()=>{
    for(const verification of [false,{},'true','THROW']){const f=fixture({verification});try{
        const {result}=await executeManagedServiceResume(f.input);assert.equal(f.seen.verified,1);assert.equal(f.seen.factory,0);assert.equal(f.seen.runtime,0);
        assert.equal(result.runtimeSnapshot.resumeStatus,'HOLD_RESUME_CHECKPOINT_AND_TERMINAL');assert.equal(JSON.stringify(result).includes('secret verification'),false);
    }finally{f.cleanup();}}
});
test('unknown service response stops once; returned actor remains private for root finalization',async()=>{
    const f=fixture({serviceUnknown:true});try{const {result,actorHandle}=await executeManagedServiceResume(f.input);
        assert.equal(f.seen.factory,1);assert.equal(f.seen.service,1);assert.equal(f.seen.close,1);assert.equal(f.seen.signout,0);assert.equal(actorHandle,f.actor);
        assert.equal(result.runtimeSnapshot.resumeStatus,'HOLD_RESUME_SERVICE_ARM');assert.equal(JSON.stringify(result).includes('secret://'),false);
    }finally{f.cleanup();}
});
test('final reconcile-only requires all18 cells and performs no actor creation or service request',async()=>{
    const f=fixture({previous:5});try{const {result,actorHandle}=await executeManagedServiceResume(f.input);
        assert.equal(f.seen.verified,1);assert.equal(f.seen.factory,0);assert.equal(f.seen.runtime,0);assert.equal(f.seen.service,0);assert.equal(actorHandle,undefined);
        assert.equal(result.runtimeSnapshot.resumeStatus,'TERMINAL_RECONCILED_NO_AUTH');assert.equal(result.suiteSnapshot.arms.at(-1).status,'HOLD');
        assert.equal(result.suiteSnapshot.arms.at(-1).terminalVerified,true);
    }finally{f.cleanup();}
});
test('service page close uncertainty holds without closing the parent actor or exposing error text',async()=>{
    const f=fixture({closeFailed:true});try{const {result,actorHandle}=await executeManagedServiceResume(f.input);
        assert.equal(result.runtimeSnapshot.resumeStatus,'HOLD_SERVICE_PAGE_CLOSE_UNVERIFIED');assert.equal(f.seen.signout,0);assert.equal(actorHandle,f.actor);
        assert.equal(JSON.stringify(result).includes('secret close'),false);
    }finally{f.cleanup();}
});
