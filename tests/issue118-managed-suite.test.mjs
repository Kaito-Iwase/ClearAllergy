import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareManagedSuite,serviceCells,suiteLimits} from '../scripts/issue118-managed-suite.mjs';
import {target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {randomUUID} from 'node:crypto';

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
