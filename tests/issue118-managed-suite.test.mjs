import test from 'node:test';
import {completionScope,completionLimits,prepareT2Reobservation,t2ExpectedFood,t2Hash} from '../scripts/issue118-t2-reobserve.mjs';
import assert from 'node:assert/strict';
import {prepareManagedSuite,serviceCells,suiteLimits,planManaged414953Recovery,prepareManaged414953Resume,validateManagedFullCheckpoint} from '../scripts/issue118-managed-suite.mjs';
import {createRequire} from 'node:module';
import {target,executeManagedApprovedResume,assertManagedResumeActivation} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity,managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';
import {finalizeOwnedCiActor} from '../scripts/issue118-close-browser.mjs';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {verifyManagedFullGithubProvenance,fullResumeHash,encodeManagedFullInput,decodeManagedFullInput} from '../scripts/issue118-managed-full-entry.mjs';
import {randomUUID,createHash} from 'node:crypto';

function fixture(overrides={},prefix='OP') {
    let n=0,step=0,guard,cleanupCalls=0,cellCalls=0,denials=0;
    const claimed=[],calls=[],created=[];
    const owners=new Map([['ct1fictional','S1']]);
    const shop={S1:target.shop,S2:'cmvs4x9h80011wn0w7s8abaie'};
    const resourceFor=(kind,extra={})=>{
        const owner=extra.owner||'S1',purpose=extra.purpose||(extra.cellId?'PRIMARY':'CORE');
        const id=[...owners].find(([,role])=>role===owner)?.[0];
        if(kind==='MENU_CREATE')return {method:'POST',path:'/api/admin/menus',shopId:shop[owner],creationOperationId:randomUUID(),purpose};
        if(kind==='MENU_WRITE')return {method:extra.cellId?.startsWith('STOP_')?'POST':'PUT',
            path:'/api/admin/menus/'+id+(extra.cellId?.startsWith('STOP_')?'/stop':''),menuId:id,beforeVersion:0,purpose};
        if(kind==='SHOP_WRITE')return {method:'PUT',path:'/api/admin/shop',shopId:shop.S1,beforeUpdatedAt:'2026-11-02T00:00:00.000Z',purpose};
        if(kind==='BLOB_UPLOAD')return {method:'POST',path:'/api/admin/upload-'+(extra.cellId?.startsWith('SHOP_')?'shop':'menu')+'-image',shopId:shop.S1,purpose};
        if(kind==='DENIAL'){
            const index=denials++,owner=index<4?'S1':index<8?'S2':index===8?'S1':'S2';
            const purpose=index<8?['CROSS_OWNER_GET','CROSS_OWNER_EDIT','CROSS_OWNER_STOP','CROSS_OWNER_PUBLISH'][index%4]:'STALE_STOP';
            const id=[...owners].find(([,role])=>purpose==='STALE_STOP'?role===owner:role!==owner)[0];
            const method=purpose==='CROSS_OWNER_GET'?'GET':['STALE_STOP','CROSS_OWNER_STOP'].includes(purpose)?'POST':'PUT';
            return {owner,resource:{method,path:'/api/admin/menus/'+id+(method==='POST'?'/stop':''),menuId:id,purpose,
                ...(method==='GET'?{}:{beforeVersion:0})}};
        }
    };
    const send=async(kind,extra={})=>{
        const denial=kind==='DENIAL'?resourceFor(kind):null;
        const owner=extra.owner||denial?.owner||'S1',resource=extra.resource||denial?.resource||resourceFor(kind,{...extra,owner});
        const id=prefix+'_'+(++n),permit=await guard.authorize({id,kind,owner,...extra,resource});
        if(permit.allowedForward)guard.consumeSendPermission({id:permit.id,resource:permit.resource});
        calls.push(kind);
        if(kind==='MENU_CREATE'&&permit.allowedForward){const menuId='c'+prefix.toLowerCase()+'fixture'+n;guard.recordCreated({operationId:id,id:menuId});created.push(menuId);owners.set(menuId,owner);}
        return permit;
    };
    const repeat=async(kind,count,extra)=>{for(let i=0;i<count;i++)await send(kind,extra);};
    const ports={
        claimSuite:async()=>true,
        claimOperation:async value=>{claimed.push(value.id);return true;},
        installSendGuard:async value=>{guard=value;return {beforeSend:true,remove:async()=>true};},
        prepareBatch:()=>({execute:async()=>{
            for(let i=0;i<17;i++)await send('MENU_CREATE',{owner:i<9?'S1':'S2'});await repeat('MENU_WRITE',32);
            return {status:'MANAGED_ADAPTER_SEQUENCE_CONFIRMED_NOT_LIVE_PASS',results:[
                {status:'SCENARIO_APP_RESPONSES_CONFIRMED_NOT_LIVE_PASS'},
                {status:'SCENARIO_STOP_CONFIRMED_LOT_HOLD_NOT_LIVE_PASS'},
                {status:'T4_STOP_API_AND_OBSERVATIONS_CONFIRMED_NOT_LIVE_PASS'}]};
        }}),
        runControls:async()=>{step++;for(const owner of ['S1','S2','S2'])await send('MENU_CREATE',{owner});await repeat('MENU_WRITE',7);
            return {priceFoodVersionUnchanged:true,stopFoodVersionUnchanged:true,noSignalAutomaticStops:0,noSignalRequiredStopDenominator:0};},
        runDenials:async()=>{step++;await repeat('DENIAL',10);return {crossOwnerRefusals:8,staleVersionConflicts:2,
            routeContractChecked:true,ownerStateUnchanged:true,historyUnchanged:true};},
        cleanupKnownPrivate:async({fixtures})=>{cleanupCalls++;await repeat('MENU_WRITE',14);
            return {verifiedPrivateIds:fixtures.map(x=>x.id),unknownWrite:false};},
        prepareServiceActor:async()=>({owner:'S1',identityVerified:true,separateFromClosedActors:true}),
        runServiceCell:async({cell})=>{cellCalls++;
            const kind=cell.kind==='MENU_CREATE'?'MENU_CREATE':['MENU_SAVE','STOP'].includes(cell.kind)?'MENU_WRITE':cell.kind==='SHOP_SAVE'?'SHOP_WRITE':'BLOB_UPLOAD';
            await send(kind,{mode:cell.mode,cellId:cell.id});
            return cell.mode==='WITHHOLD_AFTER_RESPONSE'?{status:'HOLD',clientUnknown:true,originalClaimRetained:true}
                :{status:'KNOWN_OBSERVATION',clientUnknown:false,followupWrites:0,forwardCalls:cell.mode==='BLOCK_BEFORE_FORWARD'?0:1,
                    bodyValidated:true,originalClaimRetained:true};
        },
        verifyTerminalReadOnly:async({operationIds,resourcesSha256})=>({source:'INDEPENDENT_READ_ONLY',originalTerminal:true,unknownResolved:true,
            sessionsClosed:true,pendingRequests:0,operationIds,resourcesSha256}),
        restorePriorShop:async({sources})=>{
            for(const {sourceClaimId} of sources)await send('SHOP_WRITE',{resource:{...resourceFor('SHOP_WRITE'),purpose:'RESTORE_PRIOR_SHOP',sourceClaimId,
                evidence:{knownOutcome:true,ownerStateMatches:true,freshUpdatedAt:true,ownChangeMatches:true,noConcurrentChange:true,independentTerminalVerified:true}}});
            return {unknownWrite:false,freshStateMatched:true,verifiedSourceClaimIds:sources.map(c=>c.sourceClaimId)};
        },
        verifyCheckpoint:async()=>true,
        ...overrides,
    };
    const input={suiteId:'SYNTHETIC_ONLY',batchInput:{managed:{mode:'PREPARATION_ONLY'}},
        t1:{flow:'PASS_APP_BROWSER_API',cleanup:'PRIVATE_VERIFIED',protection:'PASS_API_REPRESENTATION',
            unknownWrite:false,fixtureId:'ct1fictional',menuWrites:6,sessions:2},ports};
    return {ports,input,send,repeat,resourceFor,claimed,calls,created,get guard(){return guard;},get step(){return step;},
        get cleanupCalls(){return cleanupCalls;},get cellCalls(){return cellCalls;}};
}

test('import/preparation sends nothing; core budgets and all-private port converge without claiming live/DB pass',async()=>{
    const f=fixture(),suite=prepareManagedSuite(f.input);assert.equal(f.calls.length,0);
    const result=await suite.executeCore();
    assert.equal(result.status,'CORE_COMPLETE_SUITE_INCOMPLETE');assert.equal(result.livePass,false);
    assert.equal(result.independentDatabase,'NOT_ATTESTED');
    assert.equal(result.denialHistory,'VERIFIED_INDEPENDENT_SQL');
    assert.deepEqual(result.counts,{menus:21,createAttempts:21,menuWrites:79,shopWrites:0,blobUploads:0,sessions:2,denialRequests:10});
    assert.equal(result.arms[0].steps.length,4);assert.equal(result.service.length,18);
    assert.ok(result.service.every(cell=>cell.status==='NOT_RUN'));
    await assert.rejects(suite.executeCore(),/MANAGED_SUITE_REFUSED/);
});
test('missing controls/cleanup transport contracts hold before batch, never return success defaults',async()=>{
    for(const name of ['installSendGuard','runControls','runDenials','cleanupKnownPrivate']){
        const f=fixture({[name]:undefined});const result=await prepareManagedSuite(f.input).executeCore();
        assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');assert.equal(f.calls.length,0);assert.ok(result.missingPorts.includes(name));
    }
});
test('unknown batch write stops controls and cleanup; provider text is not retained',async()=>{
    const f=fixture();f.ports.prepareBatch=()=>({execute:async()=>{await f.send('MENU_CREATE');throw Error('secret://not-for-output');}});
    const suite=prepareManagedSuite(f.input),result=await suite.executeCore();
    assert.equal(f.calls.length,1);assert.equal(f.step,0);assert.equal(f.cleanupCalls,0);
    assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');assert.ok(!JSON.stringify(result).includes('secret://'));
    await assert.rejects(suite.executeServiceArm({armId:'NEXT',cellIds:['STOP_WITHHOLD_AFTER_RESPONSE']}));
});
test('duplicate operation claim fails before a second send and keeps the first claim',async()=>{
    const f=fixture();f.ports.prepareBatch=()=>({execute:async()=>{
        await f.guard.authorize({id:'ONCE',kind:'MENU_WRITE',owner:'S1',resource:f.resourceFor('MENU_WRITE')});
        await f.guard.authorize({id:'ONCE',kind:'MENU_WRITE',owner:'S1',resource:f.resourceFor('MENU_WRITE')});
    }});const result=await prepareManagedSuite(f.input).executeCore();
    assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');assert.deepEqual(f.claimed,['ONCE']);assert.equal(result.counts.menuWrites,7);
});
test('core79 hard cap holds before the next permit, no cleanup is attempted',async()=>{
    const f=fixture();f.ports.prepareBatch=()=>({execute:async()=>{await f.repeat('MENU_WRITE',74);}});
    const result=await prepareManagedSuite(f.input).executeCore();
    assert.equal(result.counts.menuWrites,79);assert.equal(f.calls.length,73);assert.equal(f.cleanupCalls,0);
    assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');
});
test('unmeasured denials or false all-private evidence cannot produce a core completion',async()=>{
    for(const field of ['history','private']){
        const f=fixture();
        if(field==='history')f.ports.runDenials=async()=>{await f.repeat('DENIAL',10);return {crossOwnerRefusals:8,staleVersionConflicts:2,
            routeContractChecked:true,ownerStateUnchanged:true,historyUnchanged:false};};
        else f.ports.cleanupKnownPrivate=async()=>{await f.repeat('MENU_WRITE',14);return {verifiedPrivateIds:Array(21).fill('ct1fictional'),unknownWrite:false};};
        const result=await prepareManagedSuite(f.input).executeCore();assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');
    }
});
test('API-only denials retain independent SQL pending without claiming audit-log invariance or live pass',async()=>{
    const f=fixture();f.ports.runDenials=async()=>{
        await f.repeat('DENIAL',10);return {crossOwnerRefusals:8,staleVersionConflicts:2,routeContractChecked:true,
            ownerStateUnchanged:true,historyObservation:'PENDING_INDEPENDENT_SQL',auditLogRejectedEntriesAdded:true};
    };
    const result=await prepareManagedSuite(f.input).executeCore();
    assert.equal(result.status,'CORE_COMPLETE_SUITE_INCOMPLETE');assert.equal(result.arms[0].status,'CORE_API_SEQUENCE_COMPLETE');
    assert.equal(result.denialHistory,'PENDING_INDEPENDENT_SQL');
    assert.equal(result.denialHistoryScope,'MENU_PUBLICATION_FOOD_ONLY_AUDIT_LOG_NOT_ATTESTED');
    assert.equal(result.independentDatabase,'NOT_ATTESTED');assert.equal(result.livePass,false);
});
test('unknown, false or contradictory history observations HOLD before cleanup',async()=>{
    const variants=[{}, {historyObservation:'UNKNOWN'}, {historyUnchanged:false},
        {historyUnchanged:false,historyObservation:'PENDING_INDEPENDENT_SQL'},
        {historyUnchanged:true,historyObservation:'PENDING_INDEPENDENT_SQL'},
        {historyUnchanged:'true',historyObservation:'PENDING_INDEPENDENT_SQL'},
        {historyUnchanged:true,historyObservation:'UNREVIEWED_SQL_PASS'}];
    for(const observation of variants){
        const f=fixture();f.ports.runDenials=async()=>{await f.repeat('DENIAL',10);return {crossOwnerRefusals:8,
            staleVersionConflicts:2,routeContractChecked:true,ownerStateUnchanged:true,...observation};};
        const result=await prepareManagedSuite(f.input).executeCore();
        assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');assert.equal(f.cleanupCalls,0);
        assert.equal(result.denialHistory,'NOT_RUN');assert.equal(result.livePass,false);
    }
});
test('missing service SHOP/fault ports remain explicitly NOT_IMPLEMENTED and send nothing',async()=>{
    const f=fixture({runServiceCell:undefined}),suite=prepareManagedSuite(f.input);await suite.executeCore();const before=f.calls.length;
    const result=await suite.executeServiceArm({armId:'FIRST',cellIds:['SHOP_SAVE_WITHHOLD_AFTER_RESPONSE']});
    assert.equal(result.service.find(x=>x.id==='SHOP_SAVE_WITHHOLD_AFTER_RESPONSE').status,'NOT_IMPLEMENTED');
    assert.equal(f.calls.length,before);assert.equal(result.livePass,false);
});
test('withheld arm remains HOLD; no next arm before independent terminal reconciliation and no claim reset',async()=>{
    const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();
    const first=await suite.executeServiceArm({armId:'FIRST',cellIds:['STOP_DELIVER','STOP_WITHHOLD_AFTER_RESPONSE']});
    assert.equal(first.status,'HOLD_NO_FURTHER_WRITES');assert.equal(f.cellCalls,2);const originalIds=first.arms.at(-1).operationIds;
    await assert.rejects(suite.executeServiceArm({armId:'SECOND',cellIds:['MENU_SAVE_WITHHOLD_AFTER_RESPONSE']}));
    f.ports.verifyTerminalReadOnly=async()=>({unknownResolved:false});await assert.rejects(suite.reconcileTerminalArm({}));
    assert.equal(suite.snapshot().status,'HOLD_NO_FURTHER_WRITES');
    f.ports.verifyTerminalReadOnly=async({operationIds,resourcesSha256})=>({source:'INDEPENDENT_READ_ONLY',originalTerminal:true,unknownResolved:true,
        sessionsClosed:true,pendingRequests:0,operationIds,resourcesSha256});
    await suite.reconcileTerminalArm({});
    const second=await suite.executeServiceArm({armId:'SECOND',cellIds:['MENU_SAVE_WITHHOLD_AFTER_RESPONSE']});
    assert.equal(second.counts.sessions,3);assert.equal(second.arms[1].status,'HOLD');assert.equal(second.arms[1].terminalVerified,true);
    assert.deepEqual(second.arms[1].operationIds,originalIds);assert.equal(second.arms[2].status,'HOLD');
});
test('service plan cannot put a terminal withholding fault before later operations',async()=>{
    const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();
    await assert.rejects(suite.executeServiceArm({armId:'BAD',cellIds:['STOP_WITHHOLD_AFTER_RESPONSE','STOP_DELIVER']}));
    assert.equal(f.cellCalls,0);
});
test('SHOP4 and Blob5 guards refuse excess before forwarding',async()=>{
    for(const [kind,cap,cell] of [['SHOP_WRITE',4,'SHOP_SAVE_WITHHOLD_AFTER_RESPONSE'],['BLOB_UPLOAD',5,'MENU_UPLOAD_WITHHOLD_AFTER_RESPONSE']]){
        const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();
        f.ports.runServiceCell=async({cell})=>{await f.repeat(kind,cap+1,{cellId:cell.id,mode:'DELIVER'});};
        const result=await suite.executeServiceArm({armId:'LIMIT',cellIds:[cell]});
        // Repeated PRIMARY now stops at its stricter per-cell limit, before the global cap.
        assert.ok(result.counts[kind==='SHOP_WRITE'?'shopWrites':'blobUploads']<=cap);assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');
    }
    assert.equal(suiteLimits.sessions,7);assert.equal(serviceCells.length,18);
});

test('service create slots bound possible commits to11 before send, total32; service writes cap24',async()=>{
    for(const [kind,cap,cell] of [['MENU_CREATE',11,'MENU_CREATE_WITHHOLD_AFTER_RESPONSE'],['MENU_WRITE',24,'STOP_WITHHOLD_AFTER_RESPONSE']]){
        const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();
        f.ports.runServiceCell=async({cell})=>{await f.repeat(kind,cap+1,{cellId:cell.id,mode:'DELIVER'});};
        const result=await suite.executeServiceArm({armId:'LIMIT',cellIds:[cell]});
        assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');
        if(kind==='MENU_CREATE')assert.ok(result.counts.menus<=32);
        else assert.ok(result.counts.menuWrites<=103);
    }
});
test('six terminal arms use at most initialA/B plus5 newA sessions, original holds retained',async()=>{
    const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();
    for(const [i,kind] of ['STOP','MENU_SAVE','MENU_CREATE','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].entries()){
        const result=await suite.executeServiceArm({armId:'ARM_'+i,cellIds:[kind+'_WITHHOLD_AFTER_RESPONSE']});
        assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');await suite.reconcileTerminalArm({});
    }
    assert.equal(suite.snapshot().counts.sessions,7);assert.ok(suite.snapshot().arms.slice(1).every(arm=>arm.status==='HOLD'&&arm.terminalVerified));
    await assert.rejects(suite.executeServiceArm({armId:'SEVENTH',cellIds:['STOP_DELIVER','MENU_SAVE_WITHHOLD_AFTER_RESPONSE']}));
});
test('late durable claim resolution never grants permission after the arm has stopped',async()=>{
    let release,permission;
    const f=fixture({claimOperation:()=>new Promise(resolve=>{release=resolve;})});
    f.ports.prepareBatch=()=>({execute:async()=>{
        permission=f.guard.authorize({id:'LATE',kind:'MENU_WRITE',owner:'S1',resource:f.resourceFor('MENU_WRITE')});
        permission.catch(()=>{});
        return {status:'MANAGED_ADAPTER_SEQUENCE_CONFIRMED_NOT_LIVE_PASS',results:[]};
    }});
    const suite=prepareManagedSuite(f.input),result=await suite.executeCore();
    assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');release(true);
    await assert.rejects(permission,/MANAGED_SUITE_REFUSED/);assert.equal(f.calls.length,0);
});
test('terminal read-only reconciliation is exclusive; rejected concurrent calls do not release its lock',async()=>{
    const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();
    await suite.executeServiceArm({armId:'FIRST',cellIds:['STOP_WITHHOLD_AFTER_RESPONSE']});
    let release,calls=0;
    f.ports.verifyTerminalReadOnly=({operationIds,resourcesSha256})=>new Promise(resolve=>{calls++;release=()=>resolve({source:'INDEPENDENT_READ_ONLY',
        originalTerminal:true,unknownResolved:true,sessionsClosed:true,pendingRequests:0,operationIds,resourcesSha256});});
    const first=suite.reconcileTerminalArm({});
    await assert.rejects(suite.reconcileTerminalArm({}));await assert.rejects(suite.reconcileTerminalArm({}));
    assert.equal(calls,1);release();await first;assert.equal(suite.snapshot().arms.at(-1).status,'HOLD');
});
test('snapshot retains safe claims/reservations; unknown checkpoint version refuses before any port call',async()=>{
    const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();
    await suite.executeServiceArm({armId:'FIRST',cellIds:['STOP_WITHHOLD_AFTER_RESPONSE']});
    const snapshot=suite.snapshot();assert.equal(snapshot.claims.length,84); // 73 core writes + 10 refusals + 1 service STOP.
    assert.equal(snapshot.creationReservations.CORE,21);assert.equal(snapshot.creationReservations.SERVICE,0);
    assert.ok(snapshot.claims.every(claim=>claim.state==='FORWARD_CONSUMED'));
    snapshot.claims[0].state='MUTATED_COPY';assert.equal(suite.snapshot().claims[0].state,'FORWARD_CONSUMED');
    let portCalls=0;
    const next=fixture({claimSuite:async()=>{portCalls++;return true;},verifyCheckpoint:async()=>{portCalls++;return true;},
        installSendGuard:async()=>{portCalls++;},prepareServiceActor:async()=>{portCalls++;}});
    for(const initialSnapshot of [{...snapshot,checkpointVersion:999},{},null])assert.throws(()=>prepareManagedSuite({...next.input,initialSnapshot}),/MANAGED_CHECKPOINT_REFUSED/);
    assert.equal(portCalls,0);assert.equal(suite.snapshot().arms.at(-1).status,'HOLD');
});

async function checkpointFixture(){
    const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();
    await suite.executeServiceArm({armId:'FIRST',cellIds:['STOP_WITHHOLD_AFTER_RESPONSE']});
    return {f,suite,snapshot:suite.snapshot()};
}
test('cross-run restore recomputes budgets and retains original HOLD; verifies checkpoint before terminal/auth and never repeats core',async()=>{
    const old=await checkpointFixture();let verified=0;
    const next=fixture({verifyCheckpoint:async({snapshot,receipt,applicationSha,suiteId})=>{
        verified++;assert.equal(snapshot.suiteId,suiteId);assert.equal(snapshot.applicationSha,applicationSha);
        assert.deepEqual(receipt,{checked:'root-GH-hash-metadata'});return true;
    }},'NEW');
    const suite=prepareManagedSuite({...next.input,initialSnapshot:old.snapshot,checkpointReceipt:{checked:'root-GH-hash-metadata'}});
    assert.equal(verified,0);assert.equal(suite.snapshot().checkpointState,'PENDING');
    assert.deepEqual(suite.snapshot().counts,old.snapshot.counts);
    await assert.rejects(suite.executeCore());
    await assert.rejects(suite.executeServiceArm({armId:'SECOND',cellIds:['MENU_SAVE_WITHHOLD_AFTER_RESPONSE']}));
    assert.equal(next.calls.length,0);assert.equal(verified,1);
    await suite.reconcileTerminalArm({checked:'root-independent-terminal'});
    const result=await suite.executeServiceArm({armId:'SECOND',cellIds:['MENU_SAVE_WITHHOLD_AFTER_RESPONSE']});
    assert.equal(result.counts.menuWrites,81);assert.equal(result.counts.sessions,3);assert.equal(verified,1);
    assert.equal(result.arms[1].status,'HOLD');assert.equal(result.arms[1].terminalVerified,true);
    assert.deepEqual(result.arms[1].operationIds,old.snapshot.arms[1].operationIds);
    assert.equal(result.claims.length,old.snapshot.claims.length+2);assert.equal(old.snapshot.counts.menuWrites,80);
});
test('tampered counts, missing claims, repeated cells, duplicate fixtures, reservation mismatch and oversize checkpoints reject before ports',async()=>{
    const {snapshot}=await checkpointFixture();
    const mutations=[s=>{s.counts.menuWrites++;},s=>{s.claims.pop();},s=>{s.service[1]={...s.service[0]};},
        s=>{s.fixtures.push({...s.fixtures[0]});},s=>{s.creationReservations.CORE++;},
        s=>{s.arms=Array.from({length:8},()=>structuredClone(s.arms[1]));},
        s=>{s.claims=Array.from({length:161},()=>structuredClone(s.claims[0]));},
        s=>{s.applicationSha='0'.repeat(40);},s=>{s.service.find(c=>c.id==='STOP_WITHHOLD_AFTER_RESPONSE').status='NOT_RUN';}];
    for(const mutate of mutations){
        const candidate=structuredClone(snapshot);mutate(candidate);let calls=0;
        const next=fixture({verifyCheckpoint:async()=>{calls++;return true;},claimSuite:async()=>{calls++;return true;}});
        assert.throws(()=>prepareManagedSuite({...next.input,initialSnapshot:candidate}),/MANAGED_CHECKPOINT_REFUSED/);
        assert.equal(calls,0);
    }
});
test('an unresolved earlier arm or repeated terminal cell cannot be restored even with a claimed verification port',async()=>{
    const {suite}=await checkpointFixture();await suite.reconcileTerminalArm({});
    await suite.executeServiceArm({armId:'SECOND',cellIds:['MENU_SAVE_WITHHOLD_AFTER_RESPONSE']});
    const original=suite.snapshot(),next=fixture();
    const unresolved=structuredClone(original);unresolved.arms[1].terminalVerified=false;
    assert.throws(()=>prepareManagedSuite({...next.input,initialSnapshot:unresolved}),/MANAGED_CHECKPOINT_REFUSED/);
    const repeated=structuredClone(original);repeated.arms[2].currentCell=repeated.arms[1].currentCell;
    assert.throws(()=>prepareManagedSuite({...next.input,initialSnapshot:repeated}),/MANAGED_CHECKPOINT_REFUSED/);
});
test('checkpoint verification must be strict true; rejection/provider failure never starts authentication or permits a retry',async()=>{
    const {snapshot}=await checkpointFixture();
    for(const outcome of [false,{},'true','THROW']){
        let verifications=0,authCalls=0;
        const next=fixture({verifyCheckpoint:async()=>{verifications++;if(outcome==='THROW')throw Error('secret provider data');return outcome;},
            prepareServiceActor:async()=>{authCalls++;return {};}});
        const suite=prepareManagedSuite({...next.input,initialSnapshot:snapshot});
        await assert.rejects(suite.reconcileTerminalArm({}),error=>!error.message.includes('secret'));
        next.ports.verifyCheckpoint=async()=>true;
        await assert.rejects(suite.executeServiceArm({armId:'SECOND',cellIds:['MENU_SAVE_WITHHOLD_AFTER_RESPONSE']}),/MANAGED_CHECKPOINT_REFUSED/);
        assert.equal(verifications,1);assert.equal(authCalls,0);assert.equal(next.calls.length,0);
        assert.equal(suite.snapshot().checkpointState,'REFUSED');
    }
});
test('all six terminal fault arms can carry budgets across separate controllers within session7',async()=>{
    let {snapshot}=await checkpointFixture();
    for(const [i,kind] of ['MENU_SAVE','MENU_CREATE','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].entries()){
        const next=fixture({},'RUN'+i),suite=prepareManagedSuite({...next.input,initialSnapshot:snapshot});
        await suite.reconcileTerminalArm({verified:'independent-terminal'});
        snapshot=await suite.executeServiceArm({armId:'NEXT_'+i,cellIds:[kind+'_WITHHOLD_AFTER_RESPONSE']});
        await assert.rejects(suite.executeCore());
        assert.equal(snapshot.counts.sessions,3+i);assert.equal(snapshot.arms.length,3+i);
    }
    assert.equal(snapshot.counts.sessions,7);
    assert.ok(snapshot.arms.slice(1,-1).every(arm=>arm.status==='HOLD'&&arm.terminalVerified));
    assert.equal(snapshot.arms.at(-1).status,'HOLD');assert.equal(snapshot.arms.at(-1).terminalVerified,false);
    const next=fixture({},'LAST'),suite=prepareManagedSuite({...next.input,initialSnapshot:snapshot});await suite.reconcileTerminalArm({});
    await assert.rejects(suite.executeServiceArm({armId:'SEVENTH',cellIds:['STOP_DELIVER','MENU_SAVE_WITHHOLD_AFTER_RESPONSE']}));
    assert.equal(next.calls.length,0);
});
test('BLOCK preserves clientUnknown but proven zero-forward server outcome permits the next cell',async()=>{
    const f=fixture();const fallback=f.ports.runServiceCell;
    f.ports.runServiceCell=async input=>{
        if(input.cell.mode!=='BLOCK_BEFORE_FORWARD')return fallback(input);
        await f.send('MENU_WRITE',{cellId:input.cell.id,mode:input.cell.mode});
        return {status:'KNOWN_OBSERVATION',originalClaimRetained:true,clientUnknown:true,serverOutcome:'NO_FORWARD_PROVEN',
            forwardCalls:0,retryCalls:0,fallbackCalls:0,followupWrites:0,successDisplayed:false,inputRetained:true,
            ownerApiUnchanged:true,soleSenderConfirmed:true};
    };
    const suite=prepareManagedSuite(f.input);await suite.executeCore();
    const result=await suite.executeServiceArm({armId:'FIRST',cellIds:['MENU_SAVE_BLOCK_BEFORE_FORWARD','STOP_WITHHOLD_AFTER_RESPONSE']});
    assert.equal(result.service.find(c=>c.id==='MENU_SAVE_BLOCK_BEFORE_FORWARD').status,'NO_FORWARD_PROVEN_CLIENT_UNKNOWN');
    assert.equal(result.service.find(c=>c.id==='STOP_WITHHOLD_AFTER_RESPONSE').status,'HOLD');
    assert.equal(result.counts.menuWrites,80);
    assert.equal(result.service.find(c=>c.id==='MENU_SAVE_BLOCK_BEFORE_FORWARD').blockEvidence.clientUnknown,true);
    const next=fixture({},'RESTORED'),restored=prepareManagedSuite({...next.input,initialSnapshot:result});
    assert.equal(restored.snapshot().service.find(c=>c.id==='MENU_SAVE_BLOCK_BEFORE_FORWARD').blockEvidence.forwardCalls,0);
    const tampered=structuredClone(result);tampered.service.find(c=>c.id==='MENU_SAVE_BLOCK_BEFORE_FORWARD').blockEvidence.forwardCalls=1;
    assert.throws(()=>prepareManagedSuite({...next.input,initialSnapshot:tampered}),/MANAGED_CHECKPOINT_REFUSED/);
    result.service.find(c=>c.id==='MENU_SAVE_BLOCK_BEFORE_FORWARD').blockEvidence.forwardCalls=99;
    assert.equal(suite.snapshot().service.find(c=>c.id==='MENU_SAVE_BLOCK_BEFORE_FORWARD').blockEvidence.forwardCalls,0);
});
test('BLOCK proof missing or contradictory fields stops before any later cell',async()=>{
    const badValues=[{serverOutcome:'UNKNOWN'},{clientUnknown:false},{forwardCalls:1},{retryCalls:1},{fallbackCalls:1},
        {followupWrites:1},{successDisplayed:true},{inputRetained:false},{ownerApiUnchanged:false},{soleSenderConfirmed:false}];
    for(const bad of badValues){
        const f=fixture();let cells=0;f.ports.runServiceCell=async({cell})=>{cells++;
            await f.send('MENU_WRITE',{cellId:cell.id,mode:cell.mode});
            return {status:'KNOWN_OBSERVATION',originalClaimRetained:true,clientUnknown:true,serverOutcome:'NO_FORWARD_PROVEN',
                forwardCalls:0,retryCalls:0,fallbackCalls:0,followupWrites:0,successDisplayed:false,inputRetained:true,
                ownerApiUnchanged:true,soleSenderConfirmed:true,...bad};
        };
        const suite=prepareManagedSuite(f.input);await suite.executeCore();
        const result=await suite.executeServiceArm({armId:'FIRST',cellIds:['MENU_SAVE_BLOCK_BEFORE_FORWARD','STOP_WITHHOLD_AFTER_RESPONSE']});
        assert.equal(cells,1);assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');
        assert.equal(result.service.find(c=>c.id==='STOP_WITHHOLD_AFTER_RESPONSE').status,'NOT_RUN');
    }
});
test('upload BLOCK additionally needs observed file retention, never infers it from retained text input',async()=>{
    for(const retained of [undefined,false,true]){
        const f=fixture();const fallback=f.ports.runServiceCell;
        f.ports.runServiceCell=async input=>{
            if(input.cell.mode!=='BLOCK_BEFORE_FORWARD')return fallback(input);
            await f.send('BLOB_UPLOAD',{cellId:input.cell.id,mode:input.cell.mode});
            return {status:'KNOWN_OBSERVATION',originalClaimRetained:true,clientUnknown:true,serverOutcome:'NO_FORWARD_PROVEN',
                forwardCalls:0,retryCalls:0,fallbackCalls:0,followupWrites:0,successDisplayed:false,inputRetained:true,
                ownerApiUnchanged:true,soleSenderConfirmed:true,...(retained===undefined?{}:{fileRetained:retained})};
        };
        const suite=prepareManagedSuite(f.input);await suite.executeCore();
        const result=await suite.executeServiceArm({armId:'FIRST',cellIds:['MENU_UPLOAD_BLOCK_BEFORE_FORWARD','STOP_WITHHOLD_AFTER_RESPONSE']});
        assert.equal(result.service.find(c=>c.id==='STOP_WITHHOLD_AFTER_RESPONSE').status,retained===true?'HOLD':'NOT_RUN');
    }
});
test('PRIMARY cannot disguise BLOCK as DELIVER, change operation kind, use S2, or switch upload subtype',async()=>{
    const variants=[{kind:'MENU_WRITE',mode:'DELIVER',owner:'S1'},
        {kind:'MENU_CREATE',mode:'BLOCK_BEFORE_FORWARD',owner:'S1'},
        {kind:'MENU_WRITE',mode:'BLOCK_BEFORE_FORWARD',owner:'S2'}];
    for(const bad of variants){
        const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();const before=f.calls.length;
        f.ports.runServiceCell=async({cell})=>{await f.send(bad.kind,{...bad,cellId:cell.id});};
        const result=await suite.executeServiceArm({armId:'BAD',cellIds:['STOP_BLOCK_BEFORE_FORWARD','MENU_SAVE_WITHHOLD_AFTER_RESPONSE']});
        assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');assert.equal(f.calls.length,before);assert.equal(result.counts.menuWrites,79);
    }
    const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();const before=f.calls.length;
    f.ports.runServiceCell=async({cell})=>{await f.send('BLOB_UPLOAD',{cellId:cell.id,mode:cell.mode,
        resource:{method:'POST',path:'/api/admin/upload-menu-image',shopId:target.shop,purpose:'PRIMARY'}});};
    const result=await suite.executeServiceArm({armId:'BAD_UPLOAD',cellIds:['SHOP_UPLOAD_WITHHOLD_AFTER_RESPONSE']});
    assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');assert.equal(f.calls.length,before);
});
test('resource refuses existing/unregistered/wrong-owner menus, unrelated routes/methods and invalid creation correlation',async()=>{
    const cases=[['MENU_WRITE',r=>({...r,menuId:'cmvs4x86o000vwn0w93c8ttez',path:'/api/admin/menus/cmvs4x86o000vwn0w93c8ttez'})],
        ['MENU_WRITE',r=>({...r,path:'/api/admin/shop'})],['MENU_WRITE',r=>({...r,method:'DELETE'})],
        ['MENU_WRITE',r=>({...r,path:r.path+'?override=true'})],['MENU_WRITE',r=>({...r,beforeVersion:undefined})],
        ['MENU_CREATE',r=>({...r,creationOperationId:'not-an-operation-uuid'})],['MENU_CREATE',r=>({...r,method:'PUT'})]];
    for(const [kind,mutate] of cases){
        const f=fixture();f.ports.prepareBatch=()=>({execute:async()=>{await f.send(kind,{resource:mutate(f.resourceFor(kind))});}});
        const result=await prepareManagedSuite(f.input).executeCore();assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');assert.equal(f.calls.length,0);
    }
    const f=fixture();f.ports.prepareBatch=()=>({execute:async()=>{
        await f.send('MENU_WRITE',{owner:'S2',resource:f.resourceFor('MENU_WRITE',{owner:'S1'})});
    }});assert.equal((await prepareManagedSuite(f.input).executeCore()).status,'HOLD_NO_FURTHER_WRITES');assert.equal(f.calls.length,0);
});
test('consuming a permit requires the exact CAS/resource and only one consume; BLOCK cannot consume',async()=>{
    for(const alter of [r=>({...r,beforeVersion:r.beforeVersion+1}),r=>({...r,path:'/api/admin/shop'}),null]){
        const f=fixture();f.ports.prepareBatch=()=>({execute:async()=>{
            const permit=await f.guard.authorize({id:'BOUND',kind:'MENU_WRITE',owner:'S1',resource:f.resourceFor('MENU_WRITE')});
            if(alter)f.guard.consumeSendPermission({id:permit.id,resource:alter(permit.resource)});
            else {f.guard.consumeSendPermission({id:permit.id,resource:permit.resource});f.guard.consumeSendPermission({id:permit.id,resource:permit.resource});}
        }});const result=await prepareManagedSuite(f.input).executeCore();assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');assert.equal(f.calls.length,0);
    }
    const f=fixture(),suite=prepareManagedSuite(f.input);await suite.executeCore();const before=f.calls.length;
    f.ports.runServiceCell=async({cell})=>{
        const permit=await f.guard.authorize({id:'BLOCK',kind:'MENU_WRITE',mode:cell.mode,owner:'S1',cellId:cell.id,
            resource:f.resourceFor('MENU_WRITE',{cellId:cell.id})});
        assert.equal(permit.allowedForward,false);f.guard.consumeSendPermission({id:permit.id,resource:permit.resource});
    };
    const result=await suite.executeServiceArm({armId:'BAD_BLOCK',cellIds:['STOP_BLOCK_BEFORE_FORWARD','MENU_SAVE_WITHHOLD_AFTER_RESPONSE']});
    assert.equal(result.status,'HOLD_NO_FURTHER_WRITES');assert.equal(f.calls.length,before);
});
test('resource tampering is rejected during restore and terminal verification must bind the full resource hash',async()=>{
    const {suite,snapshot}=await checkpointFixture();const next=fixture({},'RES');
    const mutations=[s=>{s.claims.find(c=>c.kind==='MENU_WRITE').resource.path='/api/admin/shop';},
        s=>{delete s.claims.find(c=>c.kind==='MENU_WRITE').resource.beforeVersion;},
        s=>{const creates=s.claims.filter(c=>c.kind==='MENU_CREATE');creates[1].resource.creationOperationId=creates[0].resource.creationOperationId;},
        s=>{s.claims.at(-1).mode='DELIVER';}];
    for(const change of mutations){const copy=structuredClone(snapshot);change(copy);
        assert.throws(()=>prepareManagedSuite({...next.input,initialSnapshot:copy}),/MANAGED_CHECKPOINT_REFUSED/);}
    const f=fixture(),current=prepareManagedSuite(f.input);await current.executeCore();
    await current.executeServiceArm({armId:'FIRST',cellIds:['STOP_WITHHOLD_AFTER_RESPONSE']});
    f.ports.verifyTerminalReadOnly=async({operationIds,resourceBindings,resourcesSha256})=>{
        assert.equal(resourceBindings[0].resource.path.startsWith('/api/admin/menus/'),true);assert.equal(resourcesSha256.length,64);
        return {source:'INDEPENDENT_READ_ONLY',originalTerminal:true,unknownResolved:true,sessionsClosed:true,pendingRequests:0,
            operationIds,resourcesSha256:'0'.repeat(64)};
    };
    await assert.rejects(current.reconcileTerminalArm({}));assert.equal(current.snapshot().status,'HOLD_NO_FURTHER_WRITES');
    assert.equal(suite.snapshot().arms.at(-1).terminalVerified,false);
});
test('STALE_EDIT permits only an own registered menu PUT with beforeVersion inside the same denial10 budget',async()=>{
    const f=fixture();f.ports.runDenials=async()=>{
        await f.repeat('DENIAL',8);
        for(const owner of ['S1','S2']){
            const own=f.resourceFor('MENU_WRITE',{owner});
            await f.send('DENIAL',{owner,resource:{...own,purpose:'STALE_EDIT'}});
        }
        return {crossOwnerRefusals:8,staleVersionConflicts:2,routeContractChecked:true,ownerStateUnchanged:true,historyObservation:'PENDING_INDEPENDENT_SQL'};
    };
    const result=await prepareManagedSuite(f.input).executeCore();assert.equal(result.arms[0].status,'CORE_API_SEQUENCE_COMPLETE');
    assert.equal(result.counts.denialRequests,10);
    const stale=result.claims.filter(c=>c.resource.purpose==='STALE_EDIT');assert.equal(stale.length,2);
    assert.ok(stale.every(c=>c.resource.method==='PUT'&&Number.isSafeInteger(c.resource.beforeVersion)));
    for(const alter of [r=>({...r,method:'POST',path:r.path+'/stop'}),r=>({...r,beforeVersion:undefined})]){
        const g=fixture();g.ports.runDenials=async()=>{
            const r={...g.resourceFor('MENU_WRITE'),purpose:'STALE_EDIT'};await g.send('DENIAL',{resource:alter(r)});
        };
        const held=await prepareManagedSuite(g.input).executeCore();assert.equal(held.status,'HOLD_NO_FURTHER_WRITES');assert.equal(g.cleanupCalls,0);
    }
});
test('normal CREATE/menu-upload followups use only their fixed phases and original created target',async()=>{
    for(const kind of ['MENU_CREATE','MENU_UPLOAD']){
        const f=fixture(),fallback=f.ports.runServiceCell,suite=prepareManagedSuite(f.input);await suite.executeCore();
        f.ports.runServiceCell=async({cell})=>{
            if(cell.kind!==kind)return fallback({cell});
            if(kind==='MENU_CREATE'){
                await f.send('BLOB_UPLOAD',{cellId:cell.id,resource:{method:'POST',path:'/api/admin/upload-menu-image',shopId:target.shop,purpose:'SETUP_UPLOAD'}});
                await f.send('MENU_CREATE',{cellId:cell.id,mode:cell.mode});
            }else{
                await f.send('MENU_CREATE',{cellId:cell.id,purpose:'SETUP_CREATE'});
                await f.send('BLOB_UPLOAD',{cellId:cell.id,mode:cell.mode});
            }
            const id=f.created.at(-1),evidence={knownOutcome:true,ownerStateMatches:true,freshVersion:true};
            if(kind==='MENU_UPLOAD')await f.send('MENU_WRITE',{cellId:cell.id,resource:{method:'PUT',path:'/api/admin/menus/'+id,
                menuId:id,beforeVersion:1,purpose:'FOLLOWUP_SAVE',evidence}});
            await f.send('MENU_WRITE',{cellId:cell.id,resource:{method:'PUT',path:'/api/admin/menus/'+id,menuId:id,
                beforeVersion:2,purpose:'FOLLOWUP_PUBLISH',evidence}});
            await f.send('MENU_WRITE',{cellId:cell.id,resource:{method:'POST',path:'/api/admin/menus/'+id+'/stop',menuId:id,
                beforeVersion:3,purpose:'CLEANUP',evidence}});
            return {status:'KNOWN_OBSERVATION',clientUnknown:false,followupWrites:0,forwardCalls:1,bodyValidated:true,originalClaimRetained:true};
        };
        const result=await suite.executeServiceArm({armId:'CHAIN',cellIds:[kind+'_DELIVER','STOP_WITHHOLD_AFTER_RESPONSE']});
        assert.equal(result.service.find(c=>c.id===kind+'_DELIVER').status,'OBSERVED_NOT_INDEPENDENTLY_ATTESTED');
        assert.equal(result.service.find(c=>c.id==='STOP_WITHHOLD_AFTER_RESPONSE').status,'HOLD');
        assert.equal(result.counts.menuWrites,kind==='MENU_CREATE'?83:84);assert.equal(result.counts.blobUploads,1);
    }
});
test('approved 18-cell offline chain reaches exact32 menus/103 writes/Shop4/Blob5/session7 without relaxing phase limits',async()=>{
    const build=(prefix)=>{
        const f=fixture({},prefix);
        f.ports.runServiceCell=async({cell})=>{
            let id;
            const extra={cellId:cell.id};
            const evidence={knownOutcome:true,ownerStateMatches:true,freshVersion:true};
            const write=async purpose=>f.send('MENU_WRITE',{...extra,resource:{method:purpose==='CLEANUP'||purpose==='PRIMARY'&&cell.kind==='STOP'?'POST':'PUT',
                path:'/api/admin/menus/'+id+(purpose==='CLEANUP'||purpose==='PRIMARY'&&cell.kind==='STOP'?'/stop':''),menuId:id,
                beforeVersion:0,purpose,...(purpose==='PRIMARY'?{}:{evidence:{...evidence,...(cell.mode==='BLOCK_BEFORE_FORWARD'?{noForwardProven:true}:{})}})},
                mode:purpose==='PRIMARY'?cell.mode:'DELIVER'});
            if(['MENU_SAVE','STOP','MENU_UPLOAD'].includes(cell.kind)){
                await f.send('MENU_CREATE',{...extra,purpose:'SETUP_CREATE'});id=f.created.at(-1);
                if(cell.kind==='STOP')await write('SETUP_PUBLISH');
            }
            if(cell.kind==='MENU_CREATE'){
                if(cell.mode==='DELIVER')await f.send('BLOB_UPLOAD',{...extra,resource:{method:'POST',path:'/api/admin/upload-menu-image',shopId:target.shop,purpose:'SETUP_UPLOAD'}});
                await f.send('MENU_CREATE',{...extra,mode:cell.mode});id=f.created.at(-1);
            }else if(['MENU_SAVE','STOP'].includes(cell.kind))await write('PRIMARY');
            else if(cell.kind==='SHOP_SAVE')await f.send('SHOP_WRITE',{...extra,mode:cell.mode});
            else await f.send('BLOB_UPLOAD',{...extra,mode:cell.mode});
            if(cell.mode==='DELIVER'){
                if(cell.kind==='MENU_UPLOAD')await write('FOLLOWUP_SAVE');
                if(['MENU_CREATE','MENU_UPLOAD'].includes(cell.kind)){await write('FOLLOWUP_PUBLISH');await write('CLEANUP');}
                if(cell.kind==='SHOP_SAVE')await f.send('SHOP_WRITE',{...extra,resource:{...f.resourceFor('SHOP_WRITE',extra),purpose:'RESTORE',
                    evidence:{knownOutcome:true,ownerStateMatches:true,freshUpdatedAt:true,ownChangeMatches:true,noConcurrentChange:true}}});
                return {status:'KNOWN_OBSERVATION',originalClaimRetained:true,clientUnknown:false,forwardCalls:1,followupWrites:0,bodyValidated:true};
            }
            if(cell.mode==='BLOCK_BEFORE_FORWARD'){
                if(cell.kind==='STOP')await write('CLEANUP');
                return {status:'KNOWN_OBSERVATION',originalClaimRetained:true,clientUnknown:true,serverOutcome:'NO_FORWARD_PROVEN',
                    forwardCalls:0,retryCalls:0,fallbackCalls:0,followupWrites:0,successDisplayed:false,inputRetained:true,fileRetained:true,
                    ownerApiUnchanged:true,soleSenderConfirmed:true};
            }
            return {status:'HOLD',originalClaimRetained:true,clientUnknown:true};
        };return f;
    };
    const f=build('ALL0'),suite=prepareManagedSuite(f.input);await suite.executeCore();
    const order=['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_UPLOAD','SHOP_SAVE'];
    let snapshot=await suite.executeServiceArm({armId:'ARM0',cellIds:[...order.map(k=>k+'_DELIVER'),
        ...order.map(k=>k+'_BLOCK_BEFORE_FORWARD'),'MENU_CREATE_WITHHOLD_AFTER_RESPONSE']});
    assert.equal(snapshot.arms.at(-1).code,'SERVICE_TERMINAL_RECONCILIATION_REQUIRED');
    for(const [i,kind] of ['MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].entries()){
        const next=build('ALL'+(i+1)),resumed=prepareManagedSuite({...next.input,initialSnapshot:snapshot});
        await resumed.reconcileTerminalArm({});snapshot=await resumed.executeServiceArm({armId:'ARM'+(i+1),cellIds:[kind+'_WITHHOLD_AFTER_RESPONSE']});
        assert.equal(snapshot.arms.at(-1).code,'SERVICE_TERMINAL_RECONCILIATION_REQUIRED');
    }
    assert.deepEqual(snapshot.counts,{menus:32,createAttempts:33,menuWrites:103,shopWrites:4,blobUploads:5,sessions:7,denialRequests:10});
    assert.equal(snapshot.service.filter(c=>c.status==='OBSERVED_NOT_INDEPENDENTLY_ATTESTED').length,6);
    assert.equal(snapshot.service.filter(c=>c.status==='NO_FORWARD_PROVEN_CLIENT_UNKNOWN').length,6);
    assert.equal(snapshot.service.filter(c=>c.status==='HOLD').length,6);
    assert.equal(snapshot.claims.length,127);assert.equal(snapshot.livePass,false);
});

function recoveryPlanFixture(realIds=false){
    const claims=[],fixtures=[{id:'ct1inherited',owner:'S1'}];
    const create=(scenario,key,owner)=>{
        const id='c'+scenario.toLowerCase()+key.toLowerCase();fixtures.push({id,owner});
        claims.push({id:`${scenario}_${key}_CREATE`,kind:'MENU_CREATE',owner,state:'FORWARD_CONSUMED',createdId:id,
            resource:{creationOperationId:randomUUID()}});return id;
    };
    const write=(scenario,key,phase,owner)=>{const id='c'+scenario.toLowerCase()+key.toLowerCase();claims.push({id:`${scenario}_${key}_${phase}`,kind:'MENU_WRITE',owner,state:'FORWARD_CONSUMED',
        resource:{method:phase==='STOP'?'POST':'PUT',path:'/api/admin/menus/'+id+(phase==='STOP'?'/stop':''),menuId:id,beforeVersion:29,purpose:'CORE'}});};
    const t2=[];for(let n=1;n<=8;n++){const key='M0'+n,owner=n<=4?'S1':'S2';t2.push(create('T2',key,owner));write('T2',key,'INITIAL_PUBLISH',owner);}
    for(const key of ['M01','M02','M05','M06'])for(const phase of ['STOP','CORRECT_PRIVATE','REPUBLISH'])write('T2',key,phase,['M01','M02'].includes(key)?'S1':'S2');
    const t3=create('T3','M01','S1');write('T3','M01','INITIAL_PUBLISH','S1');create('T3','M02','S1');
    const data={snapshot:{applicationSha:target.source,status:'HOLD_NO_FURTHER_WRITES',claims,fixtures,counts:{menus:11,menuWrites:37}},
        terminal:{unknownWrites:0,consumedSessions:7,allConsumedSessionsClosed:true,confirmedMenuWrites:42,consumedRequestIds:Array.from({length:42},()=>randomUUID()),
            menus:fixtures.map(f=>({...f,isPublished:t2.slice(4).includes(f.id),ownerMatches:true})),extraConfirmedStops:[...t2.slice(0,4),t3]}};
    if(!realIds)return data;
    const ids=['cmvziwd1k0001js07pqfoctkr','cmvzk8bru0001l608a2gjmewc','cmvzk905d0009l608790fkj9u','cmvzk9mbm000hl6085xpcrgm6','cmvzka8kt000pl608yugd9vi3',
        'cmvzkaueq000xl6086shu6i7o','cmvzkbgd80015l6089s4spnqg','cmvzkc2u5001dl6089rwngm8c','cmvzkcoq3001ll608iv8ekwxk','cmvzkk6r9002pl608yc64yz0m','cmvzkkvde002xl608mxvyjpda'];
    const map=new Map(fixtures.map((f,i)=>[f.id,ids[i]]));
    const walk=v=>typeof v==='string'?[...map].reduce((x,[a,b])=>x.replaceAll(a,b),v):Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)])):v;
    const converted=walk(data);converted.snapshot.fixtures.forEach((f,i)=>{if(i>0){f.scenario=i<9?'T2':'T3';f.key='M0'+(i<9?i:i-8);}});return converted;
}
test('OFFLINE interrupted suite inherits claims without CREATE replay; case STOP reservations give32/105 and session16 or17',()=>{
    for(const standaloneBRecovery of [false,true]){
        const input={...recoveryPlanFixture(),standaloneBRecovery},before=structuredClone(input),p=planManaged414953Recovery(input);
        assert.deepEqual(input,before);assert.equal(p.liveEnabled,false);assert.equal(p.resumeBridge,'NOT_IMPLEMENTED');
        assert.deepEqual(p.normalExpected,{menus:32,createAttempts:33,menuWrites:105,shopWrites:4,blobUploads:5,sessions:standaloneBRecovery?15:14,denialRequests:10});
        assert.deepEqual(p.reservedMaximum,{menus:32,createAttempts:33,menuWrites:106,shopWrites:5,blobUploads:5,sessions:standaloneBRecovery?17:16,denialRequests:10});
        assert.equal(p.remaining.menus,21);assert.equal(p.remaining.menuWrites,63);assert.equal(p.remaining.expectedSessions,standaloneBRecovery?8:7);
        assert.equal(p.sessionExpectedTotal,standaloneBRecovery?15:14);assert.deepEqual(p.remaining.recoverySessions,{S1:1,S2:1});
        assert.equal(p.inherited.operationClaimIds.length,31);assert.equal(p.inherited.creationOperationIds.length,10);
        assert.deepEqual(p.caseWrites,{existingBPrivate:4,t3Resume:16,t3Private:6,t4:3,controls:10,service:24});
        assert.equal(p.caseBudgets.reduce((n,c)=>n+c.menuWrites,0),63);
        assert.equal(p.caseBudgets[1].publicStopReservations,6);assert.equal(p.peakStopReservations,8);
        assert.ok(p.caseBudgets.filter(c=>c.case!=='T3_RESUME_EXISTING_CLAIMS').every(c=>c.publicStopReservations===0));
        assert.equal(p.reservationsNotRetries,true);assert.equal(p.unchangedLiveLimits.menuWrites,103);assert.equal(p.unchangedLiveLimits.sessions,7);
        assert.equal(p.coverage,'NOT_ATTESTED');assert.deepEqual(p.unmeasured,['T2_PUBLIC_PROPAGATION_AND_INTERMEDIATE_UI']);assert.equal(p.extraT2RepublicationWritesBudgeted,false);
        assert.deepEqual(p.inherited.consumedRequestIds,input.terminal.consumedRequestIds);assert.equal(p.inherited.originalSnapshotStatus,'HOLD_NO_FURTHER_WRITES');
        assert.ok(p.futureManifest.every(a=>!p.inherited.operationClaimIds.includes(a.plannedClaimId)));
        assert.equal(new Set(p.futureManifest.map(a=>a.plannedClaimId)).size,72);
        assert.ok(p.futureManifest.filter(a=>a.kind==='CREATE').every(a=>!input.snapshot.fixtures.some(f=>f.id===a.menuKey)));
        assert.equal(p.futureManifest.some(a=>a.case.startsWith('T2')&&a.kind!=='STOP'),false);
        assert.ok(p.futureManifest.filter(a=>a.kind==='PUBLISH').every(a=>a.stopReservationsBeforeForward>=1));
        assert.ok(p.futureManifest.every(a=>a.writesBeforeForward+(a.channel==='MENU'?1:0)+a.stopReservationsBeforeForward-(a.kind==='STOP'?1:0)<=105));
        assert.ok(p.sessionPrefixes.every(s=>s.reservedRecovery.S1===1&&s.reservedRecovery.S2===1
            &&s.consumedBeforeAuthentication+s.remainingNormalSessions+2===p.reservedMaximum.sessions));
    }
});
test('OFFLINE service order includes all18 cells, exactShop4/Blob5 and six SQL cuts; each unknown prefix gates recovery',()=>{
    const p=planManaged414953Recovery(recoveryPlanFixture()),order=['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_UPLOAD','SHOP_SAVE'];
    const cells=p.caseBudgets.filter(c=>c.serviceCell);
    assert.deepEqual(cells.map(c=>c.serviceCell),[...order.map(k=>k+'_DELIVER'),...order.map(k=>k+'_BLOCK_BEFORE_FORWARD'),
        ...['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].map(k=>k+'_WITHHOLD_AFTER_RESPONSE')]);
    assert.deepEqual(cells.map(c=>c.arm),[...Array(13).fill(1),2,3,4,5,6]);
    assert.equal(cells.filter(c=>c.serviceCell.startsWith('SHOP_')).length,6);
    assert.equal(cells.reduce((n,c)=>n+c.menuWrites,0),24);assert.equal(cells.reduce((n,c)=>n+c.shopWrites,0),4);assert.equal(cells.reduce((n,c)=>n+c.blobUploads,0),5);
    assert.deepEqual(p.serviceTerminals.map(t=>[t.arm,t.afterCell]),[1,2,3,4,5,6].map((arm,i)=>[arm,
        ['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'][i]+'_WITHHOLD_AFTER_RESPONSE']));
    assert.ok(p.serviceTerminals.every(t=>t.independentSqlRequired&&t.sessionsClosedRequired&&t.nextNormalActionsBeforeReceipt===0));
    const last=p.futureManifest.filter(a=>a.case==='SERVICE_SHOP_UPLOAD_WITHHOLD');
    assert.deepEqual(last.map(a=>a.kind),['SHOP_RESTORE','BLOB_UPLOAD']);
    assert.equal(cells.find(c=>c.case==='SERVICE_SHOP_UPLOAD_WITHHOLD').requiresPreviousTerminal,true);
    assert.equal(p.cutContrasts.length,144);
    for(const cut of p.cutContrasts){
        assert.equal(cut.originalHeld,true);assert.deepEqual(cut.beforeIndependentTerminal,{normalActions:0,recoverySessions:0,recoveryWrites:0});
        assert.equal(cut.afterIndependentTerminal.normalActions,0);assert.equal(cut.normalRetries,0);
        assert.ok(cut.afterIndependentTerminal.recoverySessions.S1<=1&&cut.afterIndependentTerminal.recoverySessions.S2<=1);
        assert.ok(cut.afterIndependentTerminal.requiredStopWrites<=cut.stopReservations);
        assert.equal(cut.requiresExactFreshStateAndIndependentTerminal,true);
    }
    assert.ok(p.cutContrasts.every(c=>c.afterIndependentTerminal.recoveryAllowedWithinProposedWriteBudget));
    const restore=p.cutContrasts.find(c=>!c.serverCommitted&&/SERVICE_SHOP_UPLOAD_WITHHOLD_0$/.test(c.cutAfter));
    assert.equal(restore.afterIndependentTerminal.extraForwardReserveUsed.shopRestore,1);
    assert.equal(restore.afterIndependentTerminal.fullNormalPlusSingleRecoveryBound.shopWrites,5);
    const stop=p.cutContrasts.find(c=>!c.serverCommitted&&p.futureManifest.find(a=>a.plannedClaimId===c.cutAfter)?.kind==='STOP');
    assert.equal(stop.afterIndependentTerminal.extraForwardReserveUsed.menuStop,1);
    assert.equal(stop.afterIndependentTerminal.fullNormalPlusSingleRecoveryBound.menuWrites,106);
    assert.ok(p.cutContrasts.every(c=>c.afterIndependentTerminal.extraForwardReserveUsed.menuStop+c.afterIndependentTerminal.extraForwardReserveUsed.shopRestore<=1));
    assert.ok(p.futureManifest.every(a=>a.unexpectedRecoveryWriteReserve.menuStop===1&&a.unexpectedRecoveryWriteReserve.shopRestore===1));
    assert.match(p.reserveScope,/SECOND_FAULT_HOLD/);
});

test('OFFLINE recovery refuses missing/repeated claims, unknown writes, unclosed sessions or unmatched public/cleanup evidence',()=>{
    for(const alter of [x=>x.snapshot.claims.pop(),x=>{x.snapshot.claims[1].id=x.snapshot.claims[0].id;},
        x=>{x.snapshot.claims[1].kind='SESSION';},x=>{x.snapshot.claims[1].owner='S2';},
        x=>{x.snapshot.claims[0].resource.creationOperationId=x.snapshot.claims[2].resource.creationOperationId;},
        x=>{x.terminal.unknownWrites=1;},x=>{x.terminal.allConsumedSessionsClosed=false;},x=>{x.terminal.confirmedMenuWrites=41;},
        x=>{x.terminal.consumedRequestIds[1]=x.terminal.consumedRequestIds[0];},
        x=>{x.terminal.menus[0].isPublished=true;},x=>{x.terminal.menus[0].ownerMatches=false;},
        x=>{x.terminal.extraConfirmedStops[4]=x.terminal.extraConfirmedStops[0];}]){
        const input=recoveryPlanFixture();alter(input);assert.throws(()=>planManaged414953Recovery(input),{message:'OFFLINE_RECOVERY_PLAN_REFUSED'});
    }
});

const memorySavedMenu=(id,isPublished=false,version=29,foodVersion=29)=>({id,version,foodVersion,isPublished,
    publicationConfirmedFoodVersion:isPublished?foodVersion:null,reviewedFoodVersion:null,foodReviews:[],name:'fictional menu',description:null,category:null,
    priceYen:800,ingredients:'fictional ingredients',precaution:null,imageUrl:null,imageFrame:'square',imageFit:'cover',imagePosition:'center',
    imageZoom:100,imagePositionX:50,imagePositionY:50,allergens:Array.from({length:29},(_,i)=>({slug:'fictional'+i,status:'FREE'}))});
function resumeBridgeFixture(fault='OK',realIds=false){
    const input=recoveryPlanFixture(realIds),log=[],claimIds=new Set(),menus=new Map();let boundary;
    for(const m of input.terminal.menus){Object.assign(m,{version:30,foodVersion:29});menus.set(m.id,memorySavedMenu(m.id,m.isPublished,30,29));}
    const creationOperationIds=Object.fromEntries(['M03','M04','M05','M06','M07','M08'].map(k=>[k,randomUUID()]));
    const plan=planManaged414953Recovery(input),canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)
        ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
    const approval={status:'APPROVED',scope:'RESUME_414953_B4_T3_ONLY',limits:plan.reservedMaximum,oldClaimsSha256:plan.inherited.claimsSha256,
        creationIdsSha256:createHash('sha256').update(canonical(creationOperationIds)).digest('hex')};
    const ports={
        verifyApproval:async()=>{log.push('approval');return fault!=='APPROVAL';},
        verifyCheckpoint:async()=>{log.push('checkpoint');return fault!=='CHECKPOINT';},
        reserveRecoveryBudget:async value=>{log.push('reserve:'+value.type+':'+(value.menuId||'owners'));return fault!=='RESERVE';},
        installSendGuard:async value=>{log.push('install');boundary=value;return {beforeSend:true,remove:async()=>{log.push('remove');return true;}};},
        claimOperation:async value=>{log.push('claim:'+value.id);if(fault==='CLAIM'||claimIds.has(value.id))return false;claimIds.add(value.id);return true;},
        readMenu:async({id,checkpoint})=>{log.push('read:'+id);const m=structuredClone(menus.get(id));
            if(fault==='BASELINE'&&checkpoint)m.version++;return {menu:m,checkpointMatches:fault!=='BASELINE'};},
        observeT3Evidence:async value=>{log.push('evidence:'+value.phase);assert.equal(value.fixtures.length,8);
            if(value.phase==='START')assert.ok(value.fixtures.every(f=>menus.get(f.id).isPublished));
            else assert.equal(value.fixtures.filter(f=>menus.get(f.id).isPublished).length,6);
            return {source:'ORIGINAL_T3_EVIDENCE',observed:fault!=='EVIDENCE'&&!(fault==='EVIDENCE_LOOKUP'&&value.phase==='LOT_ALLOCATION_LOOKUP'),
                lotAllocationHeld:value.phase!=='START',evidenceIds:value.phase==='START'?['E31']:['E32']};},
        write:async({claim,resource,payloadIntent})=>{
            if(fault==='GUARD_RESOURCE')await boundary.authorize({...claim,owner:'S1'});
            const permit=await boundary.authorize(claim);
            boundary.consumeSendPermission({id:permit.id,resource});log.push('forward:'+payloadIntent.kind+':'+(payloadIntent.key||resource.menuId));
            if(fault==='DUPLICATE_CONSUME')boundary.consumeSendPermission({id:permit.id,resource});
            let m;if(payloadIntent.kind==='CREATE'){
                const id='cnew'+payloadIntent.key.toLowerCase();m=memorySavedMenu(id);menus.set(id,m);
                await boundary.recordCreated({operationId:claim.id,id});
                if(fault==='CREATE_UNKNOWN')throw Error('SYNTHETIC_SECRET');
            }else{m=menus.get(resource.menuId);if(fault==='CONFLICT')return {status:409,requestId:randomUUID(),menu:structuredClone(m)};
                m.version+=payloadIntent.kind==='PUBLISH'?3:1;m.isPublished=payloadIntent.kind==='PUBLISH';if(m.isPublished)m.publicationConfirmedFoodVersion=m.foodVersion;
                if(fault==='READBACK_VERSION_JUMP')m.version++;
                if(fault==='READBACK_FOOD_CHANGED')m.foodVersion++;}
            return {status:payloadIntent.kind==='CREATE'?201:200,requestId:randomUUID(),menu:structuredClone(m),...(payloadIntent.kind==='CREATE'?{createdId:m.id}:{})};
        },
    };
    return {input:{...input,approval,creationOperationIds,ports},log,menus,claimIds,boundary:()=>boundary};
}
test('LOCAL bridge refuses absent/unapproved/changed approval before every port; reservations precede any read/send',async()=>{
    for(const alter of [x=>{x.approval=undefined;},x=>{x.approval.status='PENDING';},x=>{x.approval.limits.menuWrites=103;},
        x=>{x.creationOperationIds.M03=randomUUID();}]){const f=resumeBridgeFixture();alter(f.input);
        assert.throws(()=>prepareManaged414953Resume(f.input));assert.deepEqual(f.log,[]);}
    for(const fault of ['APPROVAL','CHECKPOINT','RESERVE']){const f=resumeBridgeFixture(fault),run=prepareManaged414953Resume(f.input);
        await assert.rejects(run.initialize(),{message:'RESUME_414953_HELD'});assert.ok(!f.log.includes('install'));assert.ok(!f.log.some(x=>x.startsWith('forward:')));}
});
test('LOCAL bridge performs B4 cleanup then reuses T3M01/M02, creates only6, verifies evidence, STOP2 and case cleanup6 through sole guard',async()=>{
    const f=resumeBridgeFixture(),before=structuredClone(f.input.snapshot),run=prepareManaged414953Resume(f.input);
    await assert.rejects(run.executeT3());assert.deepEqual(f.log,[]);
    const initialized=await run.initialize();assert.equal(initialized.status,'RESERVED_READY_NO_AUTH_PERFORMED');
    const result=await run.executeT3();assert.equal(result.status,'T3_API_SEQUENCE_PRIVATE_NOT_ATTESTED_T4_NOT_IMPLEMENTED');
    assert.equal(result.counts.menus,17);assert.equal(result.counts.menuWrites,68);assert.equal(result.newClaims.length,26);
    assert.equal(f.log.filter(x=>x.startsWith('forward:CREATE:')).length,6);
    assert.ok(!f.log.some(x=>/^forward:CREATE:M0[12]$/.test(x)));assert.ok([...f.menus.values()].every(m=>!m.isPublished));
    const sends=f.log.filter(x=>x.startsWith('forward:'));assert.ok(sends.slice(0,4).every(x=>x.startsWith('forward:STOP:')));
    assert.deepEqual(sends.slice(-8).map(x=>x.split(':')[2]),['M01','M05','M02','M03','M04','M06','M07','M08']);
    assert.ok(f.log.indexOf('evidence:START')<f.log.lastIndexOf('forward:STOP:M01'));
    assert.ok(f.log.lastIndexOf('forward:STOP:M05')<f.log.indexOf('evidence:LOT_ALLOCATION_LOOKUP'));
    assert.ok(f.log.indexOf('evidence:LOT_ALLOCATION_LOOKUP')<f.log.lastIndexOf('forward:STOP:M02'));
    assert.equal(f.log.indexOf('reserve:OWNER_SESSIONS:owners')<f.log.findIndex(x=>x.startsWith('read:')),true);
    for(const claim of result.newClaims.filter(c=>c.id.endsWith('_PUBLISH'))){
        const reserve=f.log.indexOf('reserve:STOP_WRITE:'+claim.resource.menuId),claimed=f.log.indexOf('claim:'+claim.id);assert.ok(reserve>=0&&reserve<claimed);}
    assert.deepEqual(f.input.snapshot,before);assert.equal(result.originalHold,'HOLD_NO_FURTHER_WRITES');assert.equal(result.livePass,false);
    assert.equal(result.publicPropagation,'NOT_ATTESTED');assert.ok(result.remainingNotImplemented.includes('T4_OBSERVER'));
    assert.equal(result.sendGuardRemoved,true);await assert.rejects(run.executeT3());assert.equal(sends.length,26);
});
test('LOCAL bridge unknown/409/claims/owner baseline/evidence failures hold, retain IDs and reservations, and never cleanup/retry',async()=>{
    for(const fault of ['BASELINE','CLAIM','GUARD_RESOURCE','DUPLICATE_CONSUME','CONFLICT','CREATE_UNKNOWN','EVIDENCE','EVIDENCE_LOOKUP','READBACK_FOOD_CHANGED','READBACK_VERSION_JUMP']){
        const f=resumeBridgeFixture(fault),run=prepareManaged414953Resume(f.input);await run.initialize();const result=await run.executeT3();
        assert.match(result.status,/^HOLD/);assert.equal(result.automaticCleanup,false);assert.equal(result.automaticRetry,false);assert.equal(result.livePass,false);
        const sent=f.log.filter(x=>x.startsWith('forward:'));await assert.rejects(run.executeT3());assert.equal(f.log.filter(x=>x.startsWith('forward:')).length,sent.length);
        assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_SECRET/);
        if(fault==='CREATE_UNKNOWN'){assert.equal(result.counts.menus,12);assert.ok(result.knownFixtures.some(f=>f.id==='cnewm03'));assert.equal(sent.length,7);assert.equal(result.stopReservations.length,2);}
        if(fault==='EVIDENCE'){assert.equal(result.stopReservations.length,8);assert.equal(sent.length,18);}
        if(fault==='EVIDENCE_LOOKUP'){assert.equal(result.stopReservations.length,6);assert.equal(sent.length,20);}
        if(fault==='BASELINE'||fault==='CLAIM'||fault==='GUARD_RESOURCE')assert.equal(sent.length,0);
    }
});

function remainderFixture(fault='OK',realIds=false){
    const f=resumeBridgeFixture('OK',realIds),p=f.input.ports,shop={id:target.shop,updatedAt:'2026-11-02T00:00:00.000Z'},saved={};let serial=0,actorCalls=0,bClosed=false;
    const originalRead=p.readMenu;p.readMenu=async value=>{if(bClosed&&value.owner==='S2')throw Error('CLOSED_B_GET_REFUSED');return originalRead(value);};
    const owners=new Map(f.input.snapshot.fixtures.map(x=>[x.id,x.owner]));f.input.approval.scope='RESUME_414953_FULL_MANAGED';
    const evidence={knownOutcome:true,ownerStateMatches:true,freshVersion:true,freshUpdatedAt:true,ownChangeMatches:true,noConcurrentChange:true};
    p.verifyResourceBeforeForward=async({claim})=>{
        const r=claim.resource;if(claim.kind==='MENU_CREATE')return {creationOperationFresh:true};
        if(claim.kind==='BLOB_UPLOAD')return {uploadTargetValidated:true};if(claim.kind==='SHOP_WRITE')return {shop:{...shop}};
        return {menu:structuredClone(f.menus.get(r.menuId))};
    };
    const send=async({id,kind='MENU_WRITE',owner='S1',menuId,cell,mode=cell?.mode||'DELIVER',purpose=cell?'PRIMARY':'CORE',method,extra={}})=>{
        const creation=kind==='MENU_CREATE',upload=kind==='BLOB_UPLOAD',shopWrite=kind==='SHOP_WRITE';
        const stop=method==='POST'||cell?.kind==='STOP'&&purpose==='PRIMARY'||purpose==='CLEANUP';
        const resource=creation?{method:'POST',path:'/api/admin/menus',shopId:owner==='S1'?target.shop:'cmvs4x9h80011wn0w7s8abaie',creationOperationId:randomUUID(),purpose}
            :upload?{method:'POST',path:'/api/admin/upload-'+(cell?.kind==='SHOP_UPLOAD'?'shop':'menu')+'-image',shopId:target.shop,purpose}
            :shopWrite?{method:'PUT',path:'/api/admin/shop',shopId:target.shop,beforeUpdatedAt:shop.updatedAt,purpose,...extra}
            :{method:stop?'POST':'PUT',path:'/api/admin/menus/'+menuId+(stop?'/stop':''),menuId,beforeVersion:f.menus.get(menuId).version,purpose,...extra};
        if(cell&&purpose!=='PRIMARY'&&!['SETUP_CREATE','SETUP_UPLOAD'].includes(purpose)&&purpose!=='RESTORE_PRIOR_SHOP')resource.evidence={...evidence,...(cell.mode==='BLOCK_BEFORE_FORWARD'?{noForwardProven:true}:{})};
        const claim={id:id||'REM_'+(++serial),kind,owner,...(cell?{cellId:cell.id,mode}:{}),resource};
        if(purpose==='RESTORE_PRIOR_SHOP')delete claim.cellId;
        const permit=await f.boundary().authorize(claim);if(!permit.allowedForward)return menuId;
        f.boundary().consumeSendPermission({id:permit.id,resource});f.log.push('remainder-forward:'+claim.id);
        if(creation){menuId='cremainder'+(++serial);f.menus.set(menuId,memorySavedMenu(menuId));owners.set(menuId,owner);
            await f.boundary().recordCreated({operationId:claim.id,id:menuId});return menuId;}
        if(shopWrite){shop.updatedAt=new Date(Date.parse(shop.updatedAt)+1000).toISOString();return menuId;}
        if(!upload&&kind!=='DENIAL'){const m=f.menus.get(menuId),publish=purpose.endsWith('_PUBLISH')||id?.endsWith('_PUBLISH');
            m.version+=publish?3:1;if(stop)m.isPublished=false;else if(publish){m.isPublished=true;m.publicationConfirmedFoodVersion=m.foodVersion;}}
        return menuId;
    };
    p.runT4=async()=>{
        const id=await send({id:'RESUME_T4_CREATE',kind:'MENU_CREATE'});await send({id:'RESUME_T4_INITIAL_PUBLISH',menuId:id});await send({id:'RESUME_T4_STOP',menuId:id,method:'POST'});
        return {status:'T4_STOP_API_AND_OBSERVATIONS_CONFIRMED_NOT_LIVE_PASS',writesConfirmed:3,ownedPagesClosed:true,preexistingPagesPreserved:true,
            observation:{freshReadOutcome:fault==='T4_OBSERVER'?'UNKNOWN':'FRESH_READS_HIDE_TARGET',held:{targetMatched:true},back:{targetMatched:true},failedRefetch:{injection:'ONE_DOCUMENT_GET_ABORTED_BEFORE_FORWARD'}}};
    };
    p.runControls=async()=>{for(const [label,owner] of [['PRICE','S1'],['STOP','S2'],['SILENT','S2']]){
        const id=await send({id:'CONTROL_'+label+'_CREATE',kind:'MENU_CREATE',owner});await send({id:'CONTROL_'+label+'_PUBLISH',menuId:id,owner});
        if(label==='PRICE')await send({id:'CONTROL_PRICE_ONLY',menuId:id,owner});
        await send({id:label==='STOP'?'CONTROL_STOP_ONLY':'CONTROL_'+label+'_FINAL_PRIVATE',menuId:id,owner,method:'POST'});
    }return {priceFoodVersionUnchanged:true,stopFoodVersionUnchanged:true,noSignalAutomaticStops:0,noSignalRequiredStopDenominator:0};};
    p.runDenials=async()=>{
        for(let n=0;n<10;n++){const owner=n<4?'S1':n<8?'S2':n===8?'S1':'S2',own=n>=8;
            const id=[...owners].find(([,o])=>own?o===owner:o!==owner)[0],purpose=own?'STALE_STOP':['CROSS_OWNER_GET','CROSS_OWNER_EDIT','CROSS_OWNER_STOP','CROSS_OWNER_PUBLISH'][n%4];
            const method=purpose==='CROSS_OWNER_GET'?'GET':purpose.endsWith('STOP')?'POST':'PUT',m=f.menus.get(id);
            const resource={method,path:'/api/admin/menus/'+id+(method==='POST'?'/stop':''),menuId:id,purpose,...(method==='GET'?{}:{beforeVersion:m.version-(own?1:0)})};
            const claim={id:'DENIAL_RESUME_'+n,kind:'DENIAL',owner,resource},permit=await f.boundary().authorize(claim);f.boundary().consumeSendPermission({id:permit.id,resource});
        }return {crossOwnerRefusals:8,staleVersionConflicts:2,routeContractChecked:true,ownerStateUnchanged:true,historyObservation:'PENDING_INDEPENDENT_SQL'};
    };
    p.prepareServiceActor=async()=>{actorCalls++;bClosed=true;return {owner:'S1',identityVerified:true,sessionConsumedBeforeAuthentication:true,globalConsumedSessions:8+actorCalls,recoveryReservations:{S1:1,S2:1}};};
    p.finishServiceActor=async()=>({sessionsClosed:true,pendingRequests:0});p.closeServiceBrowser=async()=>({ownedPageClosed:true,routesDrained:true});
    p.verifyServiceTerminal=async({operationIds,resourcesSha256,closedOwnerPrivateBindings,closedOwnerPrivateBindingsSha256})=>fault==='SQL'?false:{source:'INDEPENDENT_READ_ONLY',originalTerminal:true,unknownResolved:true,sessionsClosed:true,pendingRequests:0,
        applicationSha:target.source,deployment:target.deployment,observedUtc:new Date().toISOString(),operationIds,resourcesSha256,
        closedOwnerPrivateBindingsMatch:fault!=='B_SQL',closedOwnerPrivateBindingsSha256,closedOwnerPrivateIds:closedOwnerPrivateBindings.map(b=>b.id)};
    p.restorePriorShop=async({sources,independentTerminalVerified})=>{assert.equal(independentTerminalVerified,true);assert.equal(sources[0].sourceClaimId,saved.shopSource);
        await send({kind:'SHOP_WRITE',purpose:'RESTORE_PRIOR_SHOP',mode:'DELIVER',extra:{sourceClaimId:saved.shopSource,
            evidence:{knownOutcome:true,ownerStateMatches:true,freshUpdatedAt:true,ownChangeMatches:true,noConcurrentChange:true,independentTerminalVerified:true}}});
        return {unknownWrite:false,freshStateMatched:true,verifiedSourceClaimIds:[saved.shopSource]};};
    p.runServiceCellLazy=async({cell})=>{
        let id;const args={cell};if(fault==='EMPTY_SERVICE')return {status:'KNOWN_OBSERVATION',clientUnknown:false,bodyValidated:true,originalClaimRetained:true};
        if(cell.kind==='MENU_CREATE'&&cell.mode==='DELIVER')await send({...args,kind:'BLOB_UPLOAD',purpose:'SETUP_UPLOAD',mode:'DELIVER'});
        if(['MENU_SAVE','STOP','MENU_UPLOAD'].includes(cell.kind)){id=await send({...args,kind:'MENU_CREATE',purpose:'SETUP_CREATE',mode:'DELIVER'});
            if(cell.kind==='STOP')await send({...args,menuId:id,purpose:'SETUP_PUBLISH',mode:'DELIVER'});}
        const primaryId='PRIMARY_'+cell.id,kind=cell.kind==='MENU_CREATE'?'MENU_CREATE':['MENU_SAVE','STOP'].includes(cell.kind)?'MENU_WRITE':cell.kind==='SHOP_SAVE'?'SHOP_WRITE':'BLOB_UPLOAD';
        id=await send({...args,id:primaryId,kind,menuId:id});if(cell.id==='SHOP_SAVE_WITHHOLD_AFTER_RESPONSE')saved.shopSource=primaryId;
        if(cell.mode==='DELIVER'){
            if(cell.kind==='MENU_UPLOAD')await send({...args,menuId:id,purpose:'FOLLOWUP_SAVE',mode:'DELIVER'});
            if(['MENU_CREATE','MENU_UPLOAD'].includes(cell.kind)){await send({...args,menuId:id,purpose:'FOLLOWUP_PUBLISH',mode:'DELIVER'});await send({...args,menuId:id,purpose:'CLEANUP',mode:'DELIVER'});}
            if(cell.kind==='SHOP_SAVE')await send({...args,kind:'SHOP_WRITE',purpose:'RESTORE',mode:'DELIVER'});
        }
        if(cell.kind==='STOP'&&cell.mode==='BLOCK_BEFORE_FORWARD')await send({...args,menuId:id,purpose:'CLEANUP',mode:'DELIVER'});
        return cell.mode==='WITHHOLD_AFTER_RESPONSE'?{status:'HOLD',clientUnknown:true,originalClaimRetained:true}:cell.mode==='BLOCK_BEFORE_FORWARD'
            ?{clientUnknown:true,serverOutcome:'NO_FORWARD_PROVEN',forwardCalls:0,retryCalls:0,fallbackCalls:0,followupWrites:0,successDisplayed:false,inputRetained:true,ownerApiUnchanged:true,soleSenderConfirmed:true,fileRetained:true,originalClaimRetained:true}
            :{status:'KNOWN_OBSERVATION',clientUnknown:false,bodyValidated:true,originalClaimRetained:true,forwardCalls:1,followupWrites:0};
    };
    return {...f,actorCalls:()=>actorCalls};
}
test('LOCAL FULL bridge connects observers/18 service cells, keeps six terminal holds and exact single-sender budgets',async()=>{
    const f=remainderFixture(),run=prepareManaged414953Resume(f.input);await run.initialize();await run.executeT3();const r=await run.executeRemainder({runId:randomUUID()});
    assert.equal(r.status,'REMAINDER_API_OBSERVATIONS_NOT_INDEPENDENTLY_ATTESTED',JSON.stringify({counts:r.counts,cells:r.serviceObservations,claims:r.newClaims.slice(-3)}));assert.equal(r.livePass,false);
    assert.deepEqual(r.counts,{menus:32,createAttempts:33,menuWrites:105,shopWrites:4,blobUploads:5,sessions:14,denialRequests:10});
    assert.equal(r.serviceArms.length,6);assert.ok(r.serviceArms.every(a=>a.status==='HOLD'&&a.terminalVerified));assert.equal(f.actorCalls(),6);
    assert.equal(r.serviceObservations.length,18);assert.equal(r.fullCrossJobRestore,'VERIFY_DATA_CHECKPOINT_AND_FRESH_INDEPENDENT_TERMINAL_BEFORE_AUTH');
    assert.equal(r.serviceOwnerBPrivacyEvidence,'INDEPENDENT_SQL_BINDING_MATCH_NOT_FRESH_API');
});
test('LOCAL remainder requires FULL approval; missing observers/false evidence/empty claims/SQL refusal never become completion',async()=>{
    const old=resumeBridgeFixture(),a=prepareManaged414953Resume(old.input);await a.initialize();await a.executeT3();const oldCalls=old.log.length;
    await assert.rejects(a.executeRemainder({runId:randomUUID()}),{message:'RESUME_REMAINDER_APPROVAL_REQUIRED'});assert.equal(old.log.length,oldCalls);
    for(const fault of ['T4_OBSERVER','EMPTY_SERVICE','SQL','B_SQL']){const f=remainderFixture(fault),run=prepareManaged414953Resume(f.input);await run.initialize();await run.executeT3();
        const r=await run.executeRemainder({runId:randomUUID()});assert.match(r.status,/^HOLD/);assert.equal(r.livePass,false);assert.ok(f.actorCalls()<2);
        const n=f.log.length;await assert.rejects(run.executeRemainder({runId:randomUUID()}));assert.equal(f.log.length,n);
    }
});
test('LOCAL remainder rejects parallel distinct permissions and an outstanding permission before any extra forward',async()=>{
    for(const mode of ['PARALLEL','OUTSTANDING']){
        const f=remainderFixture(),run=prepareManaged414953Resume(f.input),original=f.input.ports.runServiceCellLazy;
        let attempts=0,forwards=0,before;
        f.input.ports.runServiceCellLazy=async args=>{
            if(args.cell.id!=='MENU_UPLOAD_WITHHOLD_AFTER_RESPONSE')return original(args);
            before=run.snapshot().counts;
            const commands=Array.from({length:3},(_,i)=>({id:'LOCAL_CONCURRENT_'+i,kind:'MENU_CREATE',owner:'S1',mode:'DELIVER',cellId:args.cell.id,
                resource:{method:'POST',path:'/api/admin/menus',shopId:target.shop,purpose:'SETUP_CREATE',creationOperationId:randomUUID()}}));
            attempts=commands.length;
            if(mode==='PARALLEL'){
                const result=await Promise.allSettled(commands.map(c=>f.boundary().authorize(c)));
                for(const r of result)if(r.status==='fulfilled')try{f.boundary().consumeSendPermission({id:r.value.id,resource:r.value.resource});forwards++;}catch{/* fixed HOLD; never send */}
            }else{
                const permit=await f.boundary().authorize(commands[0]);
                await assert.rejects(f.boundary().authorize(commands[1]));
                assert.throws(()=>f.boundary().consumeSendPermission({id:permit.id,resource:permit.resource}));
            }
            throw Error('LOCAL_CONCURRENT_HELD');
        };
        await run.initialize();await run.executeT3();const r=await run.executeRemainder({runId:randomUUID()});
        assert.equal(attempts,3);assert.equal(forwards,0);assert.match(r.status,/^HOLD/);assert.equal(f.actorCalls(),4);
        assert.equal(r.counts.menuWrites,before.menuWrites);assert.equal(r.counts.menus,before.menus);assert.equal(r.counts.createAttempts,before.createAttempts);
        assert.ok(r.counts.menuWrites<=106&&r.counts.menus<=32&&r.counts.createAttempts<=33);assert.equal(r.livePass,false);
    }
});
test('LOCAL service cell or page-close failures still finalize the current actor exactly once without later authentication',async()=>{
    for(const fault of ['CELL','CLOSE']){
        const f=remainderFixture(),run=prepareManaged414953Resume(f.input);let closes=0,ends=0;
        if(fault==='CELL')f.input.ports.runServiceCellLazy=async()=>{throw Error('SYNTHETIC_PRIVATE');};
        f.input.ports.closeServiceBrowser=async()=>{closes++;if(fault==='CLOSE')throw Error('SYNTHETIC_PRIVATE');return {ownedPageClosed:true,routesDrained:true};};
        f.input.ports.finishServiceActor=async()=>{ends++;return {sessionsClosed:true,pendingRequests:0};};
        await run.initialize();await run.executeT3();const r=await run.executeRemainder({runId:randomUUID()});
        assert.match(r.status,/^HOLD/);assert.equal(closes,1);assert.equal(ends,1);assert.equal(f.actorCalls(),1);
        assert.equal(r.sendGuardRemoved,true);assert.equal(r.automaticCleanup,false);assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_PRIVATE/);
    }
});

function fullDataCheckpoint(f,controller,serviceRunId){
    const state=controller.snapshot(),k=state.serviceArms.length,last=state.serviceArms.at(-1),sha=v=>createHash('sha256').update(JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)).digest('hex');
    const {projectOriginalPayloads}=createRequire(import.meta.url)('tsx/cjs/api').require('../scripts/issue118-batch-stop.ts',import.meta.url);
    const template=projectOriginalPayloads(serviceRunId).expectedByMenu.M04,prep={version:1,runId:serviceRunId,cells:{}};
    const object=(cellId,kind)=>{const pathname=(kind==='menu'?'menu-images/'+target.shop+'/':'shops/'+target.shop+'/cover-')+cellId+'.png',url='https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com/'+pathname;
        return {url,pathname,objectSha256:createHash('sha256').update(url).digest('hex'),requestId:randomUUID(),kind};};
    for(const o of state.serviceObservations){const cell=serviceCells.find(c=>c.id===o.cellId),local=state.newClaims.filter(c=>c.cellId===cell.id),primary=local.find(c=>c.resource.purpose==='PRIMARY');
        const e=prep.cells[cell.id]={kind:cell.kind,mode:cell.mode,status:cell.mode==='WITHHOLD_AFTER_RESPONSE'?'HOLD_TERMINAL_RECONCILIATION_REQUIRED':cell.mode==='BLOCK_BEFORE_FORWARD'?'NO_FORWARD_PROVEN_CLIENT_UNKNOWN':
            cell.kind==='SHOP_SAVE'?'KNOWN_AND_RESTORED_NOT_LIVE_PASS':cell.kind==='SHOP_UPLOAD'?'UPLOAD_ACK_SAVE_PARKED':'KNOWN_PRIVATE_NOT_LIVE_PASS'};
        if(!cell.kind.startsWith('SHOP'))e.fixtureFood={...template,name:`【架空・Issue118 service】${serviceRunId} ${cell.id} M04`,imageUrl:null};
        const created=local.find(c=>c.createdId);if(created){e.menuId=created.createdId;e.creationOperationId=created.resource.creationOperationId;}
        if(cell.id==='MENU_CREATE_DELIVER')e.setupObject=object(cell.id,'menu');
        if(cell.kind.endsWith('_UPLOAD')&&cell.mode!=='BLOCK_BEFORE_FORWARD')e.knownObject=object(cell.id,cell.kind==='SHOP_UPLOAD'?'shop':'menu');
        if(cell.kind.startsWith('SHOP'))e.restoreOriginal={note:null,coverImageUrl:null};
        if(cell.kind==='SHOP_SAVE'){e.expectedOwnAfterSha256='a'.repeat(64);e.expectedOwnUpdatedAt='2026-11-02T19:00:00.000Z';}
        if(cell.mode==='WITHHOLD_AFTER_RESPONSE')e.primaryClaimId=primary.id;
    }
    prep.normalShopObject=prep.cells.SHOP_UPLOAD_DELIVER.knownObject;
    // A synthetic SQL receipt resolves only the last unobserved created fixture.
    // Values for already-read fixtures remain the controller's prior API bindings.
    const rows=[...state.privateBindings];
    for(const c of state.newClaims.filter(c=>c.arm===last.id&&c.createdId&&!rows.some(r=>r.id===c.createdId))){
        const entry=prep.cells[last.currentCell],m=f.menus.get(c.createdId),food={...entry.fixtureFood,...(last.currentCell==='MENU_SAVE_WITHHOLD_AFTER_RESPONSE'?{priceYen:801}:{})};
        const {allergenStatusBySlug,...fields}=food;Object.assign(m,fields);m.allergens=Object.entries(allergenStatusBySlug).map(([slug,status])=>({slug,status}));
        rows.push({id:c.createdId,owner:c.owner,isPublished:false,version:m.version,foodVersion:29,reviewedFoodVersion:null,
            publicationConfirmedFoodVersion:last.currentCell==='STOP_WITHHOLD_AFTER_RESPONSE'?29:null,foodSha256:sha(food),reviewsSha256:sha([])});
    }
    const checkpoint={version:1,controller:state,preparationState:prep,source:{githubRunId:String(91000+k),runnerSha:'a'.repeat(40),artifactSha256:'b'.repeat(64),jobTerminal:true,pendingRequests:0,sessionsClosed:true},
        sessionLedger:{version:1,baselineConsumed:7,attempts:Array.from({length:k+(state.t2Prefix?3:1)},(_,i)=>state.t2Prefix&&i<2?structuredClone(state.t2Prefix.checkpoint.sessionLedger.attempts[i]):({index:i+1,owner:i===1||state.t2Prefix&&i===3?'S2':'S1',sessionId:'sess_checkpoint'+i,
            providerCreatedUtc:new Date(Date.now()-10000).toISOString(),providerStatus:'removed',terminated:true,localClosed:true,sourceGithubRunId:String(91000+Math.max(1,i)),runnerSha:'a'.repeat(40)}))}};
    const bindings=state.newClaims.filter(c=>c.arm===last.id).map(c=>({operationId:c.id,kind:c.kind,mode:c.mode,owner:c.owner,resource:c.resource}));
    const receipt={source:'INDEPENDENT_READ_ONLY',readOnly:true,project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',database:'clearallergy_main19',
        applicationSha:target.source,deployment:target.deployment,originalTerminal:true,unknownResolved:true,sessionsClosed:true,pendingRequests:0,
        fullCheckpointSha256:sha(checkpoint),sourceGithubRunId:checkpoint.source.githubRunId,sourceRunnerSha:checkpoint.source.runnerSha,sourceArtifactSha256:checkpoint.source.artifactSha256,
        armId:last.id,operationIds:last.operationIds,resourcesSha256:sha(bindings),observedUtc:new Date().toISOString(),globalSessionConsumption:state.counts.sessions,
        knownFixtureRows:rows,closedOwnerPrivateBindingsMatch:true,closedOwnerPrivateBindingsSha256:sha(state.closedOwnerPrivateBindings),closedOwnerPrivateIds:state.closedOwnerPrivateBindings.map(b=>b.id),
        blobOutcomesKnown:true,shopStateMatched:true,allMenuHistoryMatched:true};
    return {fullCheckpoint:checkpoint,continuationReceipt:receipt};
}
test('FULL data-only cross-job restoration advances six finite arms without replaying prior CREATE/core operations',async()=>{
    const f=remainderFixture(),serviceRunId=randomUUID();f.input.ports.verifyServiceTerminal=async()=>false;
    let run=prepareManaged414953Resume(f.input);await run.initialize();await run.executeT3();await run.executeRemainder({runId:serviceRunId});
    const firstForwards=f.log.filter(l=>l.startsWith('remainder-forward:')).length;
    for(let k=1;k<=6;k++){
        const bundle=fullDataCheckpoint(f,run,serviceRunId),raw=structuredClone(bundle),before=f.log.length,priorWrites=run.snapshot().counts.menuWrites;
        const bounded=admittedContinuation(f,bundle,serviceRunId);delete bounded.image;assert.deepEqual(decodeManagedFullInput(encodeManagedFullInput(bounded)),bounded);
        let verified;try{verified=validateManagedFullCheckpoint({...f.input,...bundle});}catch(e){assert.fail('RESTORE_'+k+'_'+e.predicateStage);}
        assert.equal(verified.nextArmIndex,k);assert.equal(f.log.length,before);
        const resumed=prepareManaged414953Resume({...f.input,...bundle});await assert.rejects(resumed.executeT3());
        await resumed.initialize();const result=await resumed.executeRemainder({runId:serviceRunId});
        assert.deepEqual(bundle,raw);assert.equal(result.originalHold,'HOLD_NO_FURTHER_WRITES');assert.equal(result.livePass,false);
        assert.equal(result.serviceArms.length,Math.min(k+1,6));assert.equal(f.log.filter(l=>l==='remainder-forward:RESUME_T4_CREATE').length,1);
        assert.equal(f.log.filter(l=>l.startsWith('forward:CREATE:')).length,6);
        if(k===6){assert.equal(result.status,'REMAINDER_API_OBSERVATIONS_NOT_INDEPENDENTLY_ATTESTED');assert.equal(result.counts.menuWrites,105);assert.equal(result.counts.menus,32);
            assert.equal(result.counts.shopWrites,4);assert.equal(result.counts.blobUploads,5);assert.equal(result.counts.sessions,14);assert.equal(result.counts.menuWrites,priorWrites);
            const directory=mkdtempSync(join(tmpdir(),'issue118-full-final-'));let authentications=0;
            try{const input=admittedContinuation(f,bundle,serviceRunId);input.claimDirectory=directory;input.dependencies={openActor:async()=>{authentications++;throw Error('SHOULD_NOT_AUTH');}};
                const final=await executeManagedApprovedResume(input);assert.equal(authentications,0);assert.equal(final.sessionConsumption,14);assert.equal(final.sessionsComplete,true);
                assert.equal(final.status,'REMAINDER_API_OBSERVATIONS_NOT_INDEPENDENTLY_ATTESTED');assert.equal(final.sessionAttempts.length,0);
            }finally{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true});}
        }
        run=resumed;
    }
    assert.ok(firstForwards>0);assert.equal(f.actorCalls(),6);
});
test('FULL restore rejects changed, stale, unfinished, duplicated or over-budget checkpoint data before any port',async()=>{
    const f=remainderFixture(),runId=randomUUID();f.input.ports.verifyServiceTerminal=async()=>false;const run=prepareManaged414953Resume(f.input);
    await run.initialize();await run.executeT3();await run.executeRemainder({runId});const bundle=fullDataCheckpoint(f,run,runId);
    for(const alter of [x=>{x.fullCheckpoint.controller.counts.menuWrites++;},x=>{x.fullCheckpoint.source.jobTerminal=false;},
        x=>{x.fullCheckpoint.sessionLedger.attempts[1].terminated=false;},x=>{x.fullCheckpoint.controller.newClaims[0].resource.path='/api/admin/shop';},
        x=>{x.fullCheckpoint.controller.newClaims[2].id=x.fullCheckpoint.controller.newClaims[0].id;},x=>{x.continuationReceipt.observedUtc=new Date(Date.now()-3600001).toISOString();},
        x=>{x.continuationReceipt.unknownResolved=false;},x=>{x.continuationReceipt.globalSessionConsumption=8;},x=>{x.continuationReceipt.knownFixtureRows.pop();},
        x=>{x.fullCheckpoint.controller.newClaims[1].requestId=x.fullCheckpoint.controller.newClaims[0].requestId;},
        x=>{x.fullCheckpoint.preparationState.cells.MENU_CREATE_DELIVER.lastKnown={token:'SYNTHETIC_PRIVATE'};},
        x=>{x.fullCheckpoint.preparationState.secret='SYNTHETIC_PRIVATE';},x=>{x.fullCheckpoint.controller.token='SYNTHETIC_PRIVATE';}]){
        const candidate=structuredClone(bundle),calls=f.log.length;alter(candidate);
        candidate.continuationReceipt.fullCheckpointSha256=createHash('sha256').update(JSON.stringify(candidate.fullCheckpoint,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)).digest('hex');
        assert.throws(()=>prepareManaged414953Resume({...f.input,...candidate}),e=>e.message==='MANAGED_FULL_CHECKPOINT_REFUSED'&&!e.cause);
        assert.equal(f.log.length,calls);
    }
});

function admittedContinuation(f,bundle,serviceRunId){
    const input={...f.input},now=new Date().toISOString(),sha=fullResumeHash;delete input.ports;delete input.prefixCheckpoint;delete input.prefixReceipt;
    const authorization={...input.approval,verifiedBy:'human',evidenceReference:'Sentinel_'+('1'.repeat(32)),approvedUtc:now,
        snapshotSha256:sha(input.snapshot),terminalSha256:sha(input.terminal)};
    delete input.approval;
    return {...input,...bundle,operation:'SERVICE_NEXT',authorization,serviceRunId,
        image:{buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))},
        identityReceipt:{...Object.fromEntries(['project','projectId','origin','deployment','source','alias'].map(k=>[k,target[k]])),
            environment:'Preview',status:'Ready',verifiedBy:'cli_metadata_observer',evidenceReference:'SYNTHETIC',observedUtc:now,
            protectionVerified:true,protectionMode:'ALL_DEPLOYMENTS',productionTarget:false},
        checkpointReceipt:{source:'INDEPENDENT_READ_ONLY',readOnly:true,project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',database:'clearallergy_main19',role:'neondb_owner',
            applicationSha:target.source,deployment:target.deployment,originalRunId:'41495319922',originalTerminal:true,unknownResolved:true,allSevenSessionsClosed:true,pendingRequests:0,menuWrites:42,menuCount:11,extraAudits:0,exclusive:true,
            snapshotSha256:authorization.snapshotSha256,terminalSha256:authorization.terminalSha256,oldClaimsSha256:authorization.oldClaimsSha256,
            requestIdsSha256:sha([...input.terminal.consumedRequestIds].sort()),sqlObservedUtc:now,observedUtc:now}};
}
test('SERVICE_NEXT actual entry and real runtime restore fixed IDs via mock HTTP, never replay CREATE/core or authenticate B',async()=>{
    const f=remainderFixture('OK',true),runId=randomUUID();f.input.ports.verifyServiceTerminal=async()=>false;
    const run=prepareManaged414953Resume(f.input);await run.initialize();await run.executeT3();await run.executeRemainder({runId});
    const bundle=fullDataCheckpoint(f,run,runId),input=admittedContinuation(f,bundle,runId),calls=[],opened=[];
    const directory=mkdtempSync(join(tmpdir(),'issue118-full-next-'));input.claimDirectory=directory;
    input.env={GITHUB_RUN_ID:'999001',GITHUB_SHA:'a'.repeat(40)};
    input.dependencies={openActor:async({role,record})=>{
        opened.push(role);assert.equal(role,'S1');const identity=managedActorIdentity[role],browser={close:async()=>{}},context={request:{},close:async()=>{}};
        const page={context:()=>context,evaluate:async()=>({id:identity.ownerId,pk:'pk_test_'+Buffer.from(ciIdentity.clerkDomain+'$').toString('base64')})};
        // This intentionally minimal browser surface stops the next cell before
        // an UI primary send. Its actual runtime owner GET and setup CREATE are real code.
        context.browser=()=>browser;context.pages=()=>[page];context.newPage=async()=>{throw Error('SYNTHETIC_BROWSER_STOP');};
        const response=(body,status=200)=>({status:()=>status,json:async()=>structuredClone(body),headers:()=>({'x-request-id':randomUUID()})});
        const token=()=>{const t=Math.floor(Date.now()/1000);return 'e30.'+Buffer.from(JSON.stringify({iss:'https://token.actions.githubusercontent.com',aud:ciIdentity.audience,
            sub:`repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`,repository:ciIdentity.repository,repository_id:ciIdentity.repositoryId,
            ref:ciIdentity.ref,workflow_ref:ciIdentity.workflowRef,environment:ciIdentity.environment,iat:t,exp:t+300})).toString('base64url')+'.synthetic';};
        const session={id:'sess_fullnext',ownerId:identity.ownerId,ownerVerified:true,eligibleForCleanup:true,providerCreatedUtc:new Date().toISOString(),providerStatus:'active',providerTerminationConfirmed:false};
        const access={token,sessionLifecycleMode:()=> 'TRACKED_OWNER_SESSION',sessionObservation:()=>structuredClone(session),signOut:async()=>{
            Object.assign(session,{providerStatus:'removed',providerTerminationConfirmed:true,frontendSignOutAcknowledged:true,canonicalReadAttempts:2});return 'SIGNOUT_CONFIRMED';},
            read:async(_api,url)=>{calls.push({method:'GET',url});if(url===target.origin+'/api/admin/shop')return response({shop:{id:identity.shopId,name:'Synthetic shop',...Object.fromEntries(['description','address','prefecture','city','nearestStation','category','googlePlaceId','hours','regularHoliday','phoneNumber','note','latitude','longitude','averageBudgetYen','coverImageUrl'].map(k=>[k,null])),
                    coverImageFrame:'square',coverImageFit:'cover',coverImagePosition:'center',coverImageZoom:100,coverImagePositionX:50,coverImagePositionY:50,updatedAt:'2026-11-02T19:00:00.000Z'}});
                if(url===target.origin+'/api/admin/menus')return response({menus:[...f.menus.values()].map(m=>({...m,updatedAt:'2026-11-02T19:00:00.000Z'}))});
                const m=structuredClone(f.menus.get(url.split('/').at(-1)));assert.ok(m);m.allergens=m.allergens.map((a,i)=>({...a,nameJa:a.slug,nameEn:null,sortOrder:i}));return response({menu:m});}};
        context.request.fetch=async(url,options)=>{calls.push({method:options.method,url});assert.equal(url,target.origin+'/api/admin/menus');assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);
            const id='cmockednewfullnext';const {allergenStatusBySlug,...fields}=options.data;f.menus.set(id,{...memorySavedMenu(id),...fields,
                allergens:Object.entries(allergenStatusBySlug).map(([slug,status])=>({slug,status}))});return response({id},201);};
        const tracker={wrap:fn=>fn,drain:async()=>({status:'QUIET_CONFIRMED',pending:0,generation:0,quietWindowObserved:true}),snapshot:()=>({started:0,settled:0,pending:0})};
        const actor={owner:role,expectedUserId:identity.ownerId,binding:{owner:role,shopId:identity.shopId},context,page,browser,access,lifecycle:{browser,tracker},
            finalize:()=>finalizeOwnedCiActor({access,page,context,browser,expectedOwnerId:identity.ownerId,drainRoutes:()=>tracker.drain(),readRouteState:()=>tracker.snapshot(),attempts:{contextCreateAttempted:true,browserLaunchAttempted:true}})};
        record({owner:role,stage:'OWNER_AND_SHOP_VERIFIED',sessionIdentity:session});return actor;
    }};
    try{assert.equal((await assertManagedResumeActivation(input)).restored.nextArmIndex,1);
        const report=await executeManagedApprovedResume(input);assert.deepEqual(opened,['S1']);assert.equal(report.sessionConsumption,10);assert.equal(report.sessionsComplete,true);
        assert.equal(report.core.status,'INHERITED_TERMINAL_NOT_REPLAYED');assert.match(report.status,/^HOLD/);assert.equal(report.livePass,false);
        assert.equal(calls.filter(c=>c.method!=='GET').length,1,JSON.stringify({status:report.status,controller:report.controller.status,runtime:!!report.runtime,reads:calls.length,lastRead:calls.at(-1)?.url.split('/').at(-1)}));assert.equal(report.controller.counts.menuWrites,bundle.fullCheckpoint.controller.counts.menuWrites+1);
        assert.ok(report.runtime.fixtures.some(f=>f.id==='cmockednewfullnext'));assert.ok(!calls.some(c=>c.method!=='GET'&&c.url!==target.origin+'/api/admin/menus'));
        assert.equal(report.automaticCleanup,false);
    }finally{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true});}
});
test('restored source provenance compares immutable artifact payload before auth; changed restore data/digest and unfinished source refuse',async()=>{
    const f=remainderFixture(),runId=randomUUID();f.input.ports.verifyServiceTerminal=async()=>false;const run=prepareManaged414953Resume(f.input);
    await run.initialize();await run.executeT3();await run.executeRemainder({runId});
    const bundle=fullDataCheckpoint(f,run,runId),input=admittedContinuation(f,bundle,runId);delete input.image;
    input.executionApproval={status:'APPROVED',scope:'FULL_RESUME_WITH_ACTIONS_READ',verifiedBy:'human',evidenceReference:input.authorization.evidenceReference,
        actionsReadApproved:true,singleAttempt:true,runnerSha:'a'.repeat(40),operation:input.operation,inputSha256:fullResumeHash(input)};
    const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:ciIdentity.repository,GITHUB_REPOSITORY_ID:ciIdentity.repositoryId,
        GITHUB_REF:ciIdentity.ref,GITHUB_WORKFLOW_REF:ciIdentity.workflowRef,ISSUE118_GITHUB_ENVIRONMENT:ciIdentity.environment,GITHUB_SHA:'a'.repeat(40),ISSUE118_EXPECTED_RUNNER_SHA:'a'.repeat(40),
        GITHUB_RUN_ID:'999001',GITHUB_RUN_NUMBER:'901',GH_TOKEN:'SYNTHETIC_TOKEN',ISSUE118_RESUME_CLAIM:(await assertManagedResumeActivation(input)).checkpointKey};
    const sourcePayload=Object.fromEntries(Object.entries(input.fullCheckpoint).filter(([k])=>k!=='source'));
    for(const fault of ['NONE','PAYLOAD','DIGEST','UNFINISHED']){
        const fetchImpl=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');const source=input.fullCheckpoint.source;
            const common={run_attempt:1,event:'workflow_dispatch',head_branch:'test/issue118-live-t1-20261030',head_sha:'a'.repeat(40),path:'.github/workflows/issue118-live-e2e.yml'};
            const value=url.includes('/artifacts?')?{total_count:1,artifacts:[{name:'issue118-full-'+source.githubRunId,expired:false,digest:'sha256:'+(fault==='DIGEST'?'c'.repeat(64):source.artifactSha256),workflow_run:{id:Number(source.githubRunId)}}]}:
                url.includes('/workflows/')?{total_count:1,workflow_runs:[{...common,id:999001,run_number:901,display_title:'Issue118 FULL '+env.ISSUE118_RESUME_CLAIM}]}:
                    {...common,status:fault==='UNFINISHED'?'in_progress':'completed',run_number:900};
            return {status:200,text:async()=>JSON.stringify(value)};
        };
        const payload=structuredClone(sourcePayload);if(fault==='PAYLOAD')payload.preparationState.cells.SHOP_SAVE_DELIVER.restoreOriginal.note='SYNTHETIC_TAMPER';
        const task=()=>verifyManagedFullGithubProvenance({input,env,fetchImpl,sourcePayload:payload});
        if(fault==='NONE')assert.equal((await task()).sourceVerified,true);else await assert.rejects(task,/MANAGED_FULL_ENTRY_REFUSED/);
    }
});

async function withT2Prefix(f){
    const input=f.input;input.approval.scope=completionScope;input.approval.limits={...completionLimits};
    for(let n=1;n<=8;n++){const key='M0'+n,id=input.snapshot.claims.find(c=>c.id==='T2_'+key+'_CREATE').createdId,m=f.menus.get(id);
        const {allergenStatusBySlug,...fields}=t2ExpectedFood(key,['M01','M02','M05','M06'].includes(key));Object.assign(m,fields);m.allergens=Object.entries(allergenStatusBySlug).map(([slug,status])=>({slug,status}));}
    const ports={...input.ports,readT2:async({id})=>structuredClone(f.menus.get(id)),readT2Evidence:async()=>({source:'ORIGINAL_T2_EVIDENCE',evidenceIds:['E21','E22','E23']}),
        writeT2:async({command,claim,resource})=>{const p=await f.boundary().authorize(claim);f.boundary().consumeSendPermission({id:p.id,resource});const m=f.menus.get(command.id);
            if(command.kind==='STOP'){m.isPublished=false;m.version++;}else if(command.kind==='PUBLISH'){m.isPublished=true;m.version+=3;m.publicationConfirmedFoodVersion=m.foodVersion;}
            else{const {allergenStatusBySlug,...fields}=t2ExpectedFood(command.key,command.phase==='CORRECT');Object.assign(m,fields);m.allergens=Object.entries(allergenStatusBySlug).map(([slug,status])=>({slug,status}));m.version+=59;m.foodVersion+=59;m.publicationConfirmedFoodVersion=null;}
            return {status:200,requestId:randomUUID(),menu:structuredClone(m),uiObserved:command.ui};},
        observeT2:async({phase,fixtures,evidenceIds})=>({phase,evidenceIds,rows:fixtures.map(f=>({id:f.id,key:f.key,owner:f.owner,isPublished:f.menu.isPublished,
            ownerFoodMatched:true,ownerRevisionMatched:true,adminFieldsMatched:true,adminPublicationMatched:true,publicApiStatus:f.menu.isPublished?200:404,publicFieldsMatched:true,publicDomMatched:true,shopMembershipMatched:true}))})};
    const prefix=prepareT2Reobservation({snapshot:input.snapshot,terminal:input.terminal,authorization:input.approval,runId:randomUUID(),ports});await prefix.initialize();
    const state=await prefix.execute();assert.equal(state.status,'T2_PRIVATE_PENDING_INDEPENDENT_SQL');
    const source={githubRunId:'91000',runnerSha:'a'.repeat(40),artifactSha256:'c'.repeat(64),jobTerminal:true,pendingRequests:0,sessionsClosed:true};
    const checkpoint={version:1,controller:state,source,sessionLedger:{version:1,baselineConsumed:7,attempts:['S1','S2'].map((owner,i)=>({index:i+1,owner,sessionId:'sess_t2prefix'+i,
        providerCreatedUtc:new Date(Date.now()-10000).toISOString(),providerStatus:'removed',terminated:true,localClosed:true,sourceGithubRunId:source.githubRunId,runnerSha:source.runnerSha}))}};
    const receipt={source:'INDEPENDENT_READ_ONLY',readOnly:true,project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',database:'clearallergy_main19',applicationSha:target.source,deployment:target.deployment,
        prefixSha256:t2Hash(checkpoint),unknownResolved:true,sessionsClosed:true,pendingRequests:0,menuWrites:78,globalSessionConsumption:9,allHistoryMatched:true,exclusive:true,rows:state.finalRows,requestIds:state.claims.map(c=>c.requestId),observedUtc:new Date().toISOString()};
    input.prefixCheckpoint=checkpoint;input.prefixReceipt=receipt;const prepare=input.ports.prepareServiceActor;
    input.ports.prepareServiceActor=async args=>{const r=await prepare(args);return {...r,globalConsumedSessions:r.globalConsumedSessions+2};};return f;
}
test('T2 prefix plus six FULL cross-job restorations keep36 prefix claims, skip B4 replay, and reach137/16 with old103/7 unchanged',async()=>{
    const f=await withT2Prefix(remainderFixture('OK',true)),runId=randomUUID();f.input.ports.verifyServiceTerminal=async()=>false;
    const prefixBefore=structuredClone(f.input.prefixCheckpoint);let run=prepareManaged414953Resume(f.input);await run.initialize();const core=await run.executeT3();assert.equal(core.counts.menuWrites,100);assert.equal(core.newClaims.length,22);
    await run.executeRemainder({runId});
    for(let k=1;k<=6;k++){const bundle=fullDataCheckpoint(f,run,runId),v=validateManagedFullCheckpoint({...f.input,...bundle});assert.equal(v.nextArmIndex,k);
        assert.equal(bundle.fullCheckpoint.controller.t2Prefix.checkpoint.controller.claims.length,36);assert.equal(bundle.fullCheckpoint.sessionLedger.attempts.length,k+3);
        if(k===1){const bad=structuredClone(bundle);bad.fullCheckpoint.sessionLedger.attempts[0].sessionId='sess_FORGED';bad.continuationReceipt.fullCheckpointSha256=t2Hash(bad.fullCheckpoint);
            assert.throws(()=>validateManagedFullCheckpoint({...f.input,...bad}),/MANAGED_FULL_CHECKPOINT_REFUSED/);}
        const next=prepareManaged414953Resume({...f.input,...bundle});await next.initialize();const r=await next.executeRemainder({runId});run=next;
        if(k===6){assert.equal(r.counts.menuWrites,137);assert.equal(r.counts.sessions,16);assert.equal(r.counts.menus,32);assert.equal(r.counts.shopWrites,4);assert.equal(r.counts.blobUploads,5);assert.deepEqual(r.evidenceGaps,[]);assert.equal(r.livePass,false);}
    }
    assert.deepEqual(f.input.prefixCheckpoint,prefixBefore);assert.equal(f.log.filter(x=>x.startsWith('forward:STOP:')&&['M05','M06','M07','M08'].some(k=>x.endsWith(k))).length,4);
    assert.equal(suiteLimits.menuWrites,103);assert.equal(suiteLimits.sessions,7);
});
