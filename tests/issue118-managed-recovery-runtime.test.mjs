// Actual runtime sender with memory HTTP/Clerk seams; no browser/service/auth I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createManagedRuntimePorts,target,assertManagedResumeActivation,executeManagedApprovedResume,openManagedOwnedActor} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity,managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';
import {prepareManaged414953Resume,planManaged414953Recovery} from '../scripts/issue118-managed-suite.mjs';
import {finalizeOwnedCiActor} from '../scripts/issue118-close-browser.mjs';
import {admitManagedFullInput,verifyManagedFullGithubProvenance,encodeManagedFullInput,decodeManagedFullInput,fullResumeHash,runManagedFullCli} from '../scripts/issue118-managed-full-entry.mjs';
const source=createRequire(import.meta.url)('tsx/cjs/api').require('../scripts/issue118-batch-stop.ts',import.meta.url);
const t1='cmvziwd1k0001js07pqfoctkr';
const t2=['cmvzk8bru0001l608a2gjmewc','cmvzk905d0009l608790fkj9u','cmvzk9mbm000hl6085xpcrgm6','cmvzka8kt000pl608yugd9vi3',
    'cmvzkaueq000xl6086shu6i7o','cmvzkbgd80015l6089s4spnqg','cmvzkc2u5001dl6089rwngm8c','cmvzkcoq3001ll608iv8ekwxk'];
const t3=['cmvzkk6r9002pl608yc64yz0m','cmvzkkvde002xl608mxvyjpda'];
const recipe={T2:'fc6fd8a4-6f9a-4fa9-b30e-04981bf77f67',T3:'39390038-ddea-409d-bbe3-0faee2293ed6'};
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=v=>createHash('sha256').update(canonical(v)).digest('hex');
function harness(){
    const directory=mkdtempSync(join(tmpdir(),'issue118-recovery-ports-')),menus=new Map(),checkpointFixtures=[{id:t1,owner:'S1'}],calls=[];
    const menu=(id,p,extra={})=>{const {allergenStatusBySlug,...fields}=p;return {id,...fields,version:29,foodVersion:29,
        reviewedFoodVersion:null,publicationConfirmedFoodVersion:null,isPublished:false,foodReviews:[],
        allergens:Object.entries(allergenStatusBySlug).map(([slug,status],sortOrder)=>({slug,status,sortOrder,nameJa:slug,nameEn:null})),...extra};};
    for(const [scenario,ids] of [['T2',t2],['T3',t3]])for(const [index,id] of ids.entries()){
        const key='M0'+(index+1),owner=index<4?'S1':'S2';let payload=source.projectOriginalPayloads(recipe[scenario]).expectedByMenu[key];
        const corrected=scenario==='T2'&&[0,1,4,5].includes(index);
        if(corrected){payload={...source.t2PrivateCorrections(recipe.T2,['E21','E23']).find(c=>c.key===key).body};delete payload.isPublished;}
        const isPublished=scenario==='T2'&&index>=4,version=scenario==='T2'?(corrected?(isPublished?95:96):(isPublished?32:33)):(index===0?33:29);
        const foodVersion=corrected?88:29,publicationConfirmedFoodVersion=scenario==='T3'&&index===1?null:foodVersion;
        menus.set(id,menu(id,payload,{isPublished,version,foodVersion,publicationConfirmedFoodVersion}));checkpointFixtures.push({id,owner,key,scenario});
    }
    const token=()=>{const body={iss:'https://token.actions.githubusercontent.com',aud:ciIdentity.audience,
        sub:`repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`,repository:ciIdentity.repository,repository_id:ciIdentity.repositoryId,
        ref:ciIdentity.ref,workflow_ref:ciIdentity.workflowRef,environment:ciIdentity.environment,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300};
        return 'eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify(body)).toString('base64url')+'.synthetic';};
    const response=(body,status=200)=>({status:()=>status,json:async()=>structuredClone(body),headers:()=>({'x-request-id':randomUUID()})});
    const actors=['S1','S2'].map(owner=>{const identity=managedActorIdentity[owner],context={request:{}},page={context:()=>context,
        evaluate:async()=>({id:identity.ownerId,pk:'pk_test_'+Buffer.from(ciIdentity.clerkDomain+'$').toString('base64')})};
        const access={token,read:async(_api,url)=>{calls.push({method:'GET',url});if(url===target.origin+'/api/admin/shop')return response({shop:{id:identity.shopId}});
            const id=url.slice((target.origin+'/api/admin/menus/').length);assert.ok(menus.has(id));return response({menu:menus.get(id)});}};
        context.request.fetch=async(url,options)=>{calls.push({method:options.method,url,options});assert.equal(new URL(url).origin,target.origin);
            assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);let data=options.data;
            if(url===target.origin+'/api/admin/menus'){const id='cresumecreated'+menus.size;menus.set(id,menu(id,data));return response({id},201);}
            const id=url.slice((target.origin+'/api/admin/menus/').length).replace(/\/stop$/,'');const before=menus.get(id);assert.equal(data.expectedVersion,before.version);
            const after={...before,version:before.version+(options.method==='PUT'?3:1),isPublished:options.method!=='POST',
                ...(options.method==='PUT'?{publicationConfirmedFoodVersion:before.foodVersion}:{})};menus.set(id,after);
            return response(options.method==='POST'?{ok:true,menu:after}:{menu:after});};
        return {binding:{owner,shopId:identity.shopId},expectedUserId:identity.ownerId,context,page,access};});
    const runtime=createManagedRuntimePorts({actors,claimDirectory:directory,t1FixtureId:t1,checkpointFixtures,operation:'RESUME_CORE'});
    const checkpoint=id=>{const f=checkpointFixtures.find(f=>f.id===id),m=menus.get(id);return {...f,shopId:managedActorIdentity[f.owner].shopId,ownerMatches:true,
        version:m.version,foodVersion:m.foodVersion,reviewedFoodVersion:m.reviewedFoodVersion,publicationConfirmedFoodVersion:m.publicationConfirmedFoodVersion,
        isPublished:m.isPublished,food:source.fixturePayload(m),reviews:'0',resolutions:'0'};};
    const install=async()=>{const seen={authorize:0,consume:0,created:[]};await runtime.resumePorts.installSendGuard({
        authorize:async value=>{seen.authorize++;return {id:value.id,resource:value.resource,allowedForward:true};},
        consumeSendPermission:()=>{seen.consume++;},recordCreated:async value=>{seen.created.push(value.id);}});return seen;};
    const close=()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});};
    return {runtime,ports:runtime.resumePorts,actors,menus,calls,checkpoint,install,close,directory,checkpointFixtures};
}
test('resume runtime exposes no auth entry; fixed SQL/API fields and source recipe must all match',async()=>{
    const h=harness();try{const id=t2[4],f={id,owner:'S2',key:'M05',scenario:'T2',checkpoint:h.checkpoint(id)};
        assert.equal((await h.ports.readMenu(f)).checkpointMatches,true);assert.equal(h.calls.some(c=>c.method!=='GET'),false);
        f.checkpoint.publicationConfirmedFoodVersion++;await assert.rejects(h.ports.readMenu(f),/MANAGED_RECOVERY_READ_HELD/);
        assert.equal(h.runtime.snapshot().held,true);assert.equal(h.runtime.ports.authenticate,undefined);
    }finally{h.close();}
});
test('B STOP is one guarded exact-origin send; food unchanged and consumed request/status retained',async()=>{
    const h=harness();try{const guard=await h.install(),id=t2[4],before=structuredClone(h.menus.get(id));
        const resource={method:'POST',path:'/api/admin/menus/'+id+'/stop',shopId:managedActorIdentity.S2.shopId,purpose:'CORE',menuId:id,beforeVersion:before.version};
        const result=await h.ports.write({claim:{id:'RESUME_B_STOP',kind:'MENU_WRITE',owner:'S2'},resource,payloadIntent:{kind:'STOP',key:'M05',scenario:'T2'}});
        assert.equal(result.status,200);assert.equal(result.menu.version,before.version+1);assert.equal(result.menu.isPublished,false);
        assert.deepEqual(source.fixturePayload(result.menu),source.fixturePayload(before));assert.equal(guard.authorize,1);assert.equal(guard.consume,1);
        assert.equal(h.calls.filter(c=>c.method==='POST').length,1);assert.ok(result.requestId);
    }finally{h.close();}
});
test('old CREATE keys, unexpected scope and fresh CAS conflict cannot forward',async()=>{
    for(const fault of ['OLD_CREATE','SCOPE','CAS']){const h=harness();try{await h.install();const id=t3[0];const resource={method:'PUT',path:'/api/admin/menus/'+id,
        shopId:managedActorIdentity.S1.shopId,purpose:'CORE',menuId:id,beforeVersion:h.menus.get(id).version};
        const payloadIntent={kind:'PUBLISH',key:'M01',scenario:'T3'};
        if(fault==='OLD_CREATE'){payloadIntent.kind='CREATE';resource.creationOperationId=randomUUID();}
        if(fault==='SCOPE')resource.path='/api/admin/shop';if(fault==='CAS')resource.beforeVersion--;
        await assert.rejects(h.ports.write({claim:{id:'REFUSE',kind:fault==='OLD_CREATE'?'MENU_CREATE':'MENU_WRITE',owner:'S1'},resource,payloadIntent}),/MANAGED_RECOVERY_WRITE_HELD/);
        assert.equal(h.calls.filter(c=>c.method!=='GET').length,0);
    }finally{h.close();}}
});
test('new T3 CREATE binds original payload and retains201 ID before later parse/readback failure',async()=>{
    const h=harness();try{const guard=await h.install(),id=randomUUID();
        const resource={method:'POST',path:'/api/admin/menus',shopId:managedActorIdentity.S1.shopId,purpose:'CORE',creationOperationId:id};
        const read=h.actors[0].access.read;h.actors[0].access.read=async(api,url)=>{const r=await read(api,url);if(url.includes('/cresumecreated'))throw Error('SYNTHETIC_PRIVATE');return r;};
        await assert.rejects(h.ports.write({claim:{id:'NEW_CREATE',kind:'MENU_CREATE',owner:'S1'},resource,payloadIntent:{kind:'CREATE',key:'M03',scenario:'T3'}}),/MANAGED_RECOVERY_WRITE_HELD/);
        assert.equal(guard.created.length,1);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
        assert.ok(h.runtime.snapshot().fixtures.some(f=>f.id===guard.created[0]));assert.doesNotMatch(JSON.stringify(h.runtime.snapshot()),/SYNTHETIC_PRIVATE/);
    }finally{h.close();}
});
test('owner/session and STOP write reservations are distinct durable records, never credentials or live cap mutations',async()=>{
    const h=harness();try{const scope='RESUME_414953_B4_T3_ONLY';
        const value={type:'OWNER_SESSIONS',scope,limits:{menus:32,createAttempts:33,menuWrites:106,shopWrites:5,blobUploads:5,sessions:16,denialRequests:10},normal:{S1:1,S2:1},recovery:{S1:1,S2:1},oldClaimsSha256:'a'.repeat(64)};
        assert.equal(await h.ports.reserveRecoveryBudget(value),true);
        assert.equal(await h.ports.reserveRecoveryBudget({type:'STOP_WRITE',scope,menuId:t2[4],owner:'S2',sourceClaimId:'INHERITED_PUBLIC',slots:1}),true);
        assert.equal(readdirSync(h.directory).length,2);assert.deepEqual(JSON.parse(readFileSync(join(h.directory,'recovery-reservation.json'),'utf8')),value);
        assert.equal(h.calls.length,0);assert.equal(await h.ports.reserveRecoveryBudget(value),false);
    }finally{h.close();}
});
test('source-known E31 then E32 are separate observations with no mutation or human discovery claim',async()=>{
    const h=harness();try{const first=await h.ports.observeT3Evidence({phase:'START'}),later=await h.ports.observeT3Evidence({phase:'LOT_ALLOCATION_LOOKUP'});
        assert.deepEqual(first.evidenceIds,['E31']);assert.equal(first.lotAllocationHeld,false);assert.deepEqual(later.evidenceIds,['E32']);assert.equal(later.lotAllocationHeld,true);
        assert.equal(h.calls.filter(c=>c.method!=='GET').length,0);
    }finally{h.close();}
});
test('unexpected reservation data and provider exceptions remain fixed errors with no raw content',async()=>{
    for(const kind of ['RESERVATION','EVIDENCE']){const h=harness();try{
        if(kind==='RESERVATION')await assert.rejects(h.ports.reserveRecoveryBudget({scope:'SYNTHETIC_PRIVATE'}),e=>e.message==='MANAGED_RECOVERY_RESERVATION_HELD'&&!e.cause);
        else{h.actors[0].access.read=async()=>{throw Error('SYNTHETIC_PRIVATE');};await assert.rejects(h.ports.observeT3Evidence({phase:'START'}),e=>e.message==='MANAGED_RECOVERY_EVIDENCE_HELD'&&!e.cause);}
        assert.equal(h.calls.filter(c=>c.method!=='GET').length,0);assert.doesNotMatch(JSON.stringify(h.runtime.snapshot()),/SYNTHETIC_PRIVATE/);
    }finally{h.close();}}
});
function bridgeInput(h){
    const claims=[];for(const f of h.checkpointFixtures.filter(f=>f.id!==t1)){
        claims.push({id:`${f.scenario}_${f.key}_CREATE`,kind:'MENU_CREATE',owner:f.owner,state:'FORWARD_CONSUMED',createdId:f.id,resource:{creationOperationId:randomUUID()}});
        if(f.scenario==='T2'||f.key==='M01')claims.push({id:`${f.scenario}_${f.key}_INITIAL_PUBLISH`,kind:'MENU_WRITE',owner:f.owner,state:'FORWARD_CONSUMED'});
        if(f.scenario==='T2'&&['M01','M02','M05','M06'].includes(f.key))for(const phase of ['STOP','CORRECT_PRIVATE','REPUBLISH'])
            claims.push({id:`T2_${f.key}_${phase}`,kind:'MENU_WRITE',owner:f.owner,state:'FORWARD_CONSUMED'});
    }
    const snapshot={applicationSha:target.source,status:'HOLD_NO_FURTHER_WRITES',claims,fixtures:h.checkpointFixtures,counts:{menus:11,menuWrites:37}};
    const terminal={unknownWrites:0,consumedSessions:7,allConsumedSessionsClosed:true,confirmedMenuWrites:42,
        consumedRequestIds:Array.from({length:42},()=>randomUUID()),extraConfirmedStops:[...t2.slice(0,4),t3[0]],
        menus:[{id:t1,owner:'S1',ownerMatches:true,version:96,foodVersion:87,isPublished:false},...h.checkpointFixtures.filter(f=>f.id!==t1).map(f=>h.checkpoint(f.id))]};
    const plan=planManaged414953Recovery({snapshot,terminal});
    const creationOperationIds=Object.fromEntries(['M03','M04','M05','M06','M07','M08'].map(k=>[k,randomUUID()]));
    const approval={status:'APPROVED',scope:'RESUME_414953_B4_T3_ONLY',limits:plan.reservedMaximum,oldClaimsSha256:plan.inherited.claimsSha256,creationIdsSha256:sha(creationOperationIds)};
    return {snapshot,terminal,approval,creationOperationIds,ports:{...h.ports,verifyApproval:async()=>true,verifyCheckpoint:async()=>true}};
}
test('real controller + real runtime sender resume old IDs, create six only, clean each completed case and stop before T4',async()=>{
    const h=harness();try{const input=bridgeInput(h),controller=prepareManaged414953Resume(input);
        assert.equal(h.calls.length,0);await controller.initialize();assert.equal(h.calls.length,0);
        const result=await controller.executeT3();assert.equal(result.status,'T3_API_SEQUENCE_PRIVATE_NOT_ATTESTED_T4_NOT_IMPLEMENTED');
        assert.equal(result.counts.menus,17);assert.equal(result.counts.menuWrites,68);assert.equal(result.counts.sessions,7);
        assert.equal(result.livePass,false);assert.equal(result.coverage,'NOT_ATTESTED');assert.equal(result.sendGuardRemoved,true);
        assert.equal(h.calls.filter(c=>c.method==='POST'&&c.url===target.origin+'/api/admin/menus').length,6);
        assert.equal(h.calls.filter(c=>c.method!=='GET').length,26);assert.ok([...h.menus.values()].every(m=>m.isPublished===false));
        assert.ok(result.newClaims.every(c=>c.state==='CONFIRMED_RESPONSE_AND_READBACK'));
        assert.deepEqual(result.inheritedRequestIds,input.terminal.consumedRequestIds);assert.equal(result.stopReservations.length,0);
        await assert.rejects(controller.executeT3());assert.equal(h.calls.filter(c=>c.method!=='GET').length,26);
    }finally{h.close();}
});
test('missing approval touches no runtime ports; a consumed response loss holds all later writes without cleanup or replay',async()=>{
    const first=harness();try{const input=bridgeInput(first);input.approval.status='PENDING';assert.throws(()=>prepareManaged414953Resume(input),/APPROVAL_REQUIRED/);assert.equal(first.calls.length,0);
    }finally{first.close();}
    const h=harness();try{const input=bridgeInput(h),fetch=h.actors[1].context.request.fetch;
        h.actors[1].context.request.fetch=async(url,options)=>{await fetch(url,options);throw Error('SYNTHETIC_PRIVATE_RESPONSE_LOSS');};
        const controller=prepareManaged414953Resume(input);await controller.initialize();const result=await controller.executeT3();
        assert.match(result.status,/^HOLD_/);assert.equal(h.calls.filter(c=>c.method!=='GET').length,1);assert.equal(result.counts.menuWrites,43);
        assert.equal(result.stopReservations.length,4);assert.equal(result.newClaims[0].state,'FORWARD_CONSUMED');
        assert.equal(result.automaticCleanup,false);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE/);
        await assert.rejects(controller.executeT3());assert.equal(h.calls.filter(c=>c.method!=='GET').length,1);
    }finally{h.close();}
});
function admissionInput(h){
    const b=bridgeInput(h),now=new Date().toISOString(),authorization={...b.approval,scope:'RESUME_414953_FULL_MANAGED',verifiedBy:'human',
        evidenceReference:'Sentinel_'+('1'.repeat(32)),approvedUtc:now,snapshotSha256:sha(b.snapshot),terminalSha256:sha(b.terminal)};
    const identityReceipt={...Object.fromEntries(['project','projectId','origin','deployment','source','alias'].map(k=>[k,target[k]])),
        environment:'Preview',status:'Ready',verifiedBy:'cli_metadata_observer',evidenceReference:'SYNTHETIC_OFFLINE_METADATA',observedUtc:now,
        protectionVerified:true,protectionMode:'ALL_DEPLOYMENTS',productionTarget:false};
    const checkpointReceipt={source:'INDEPENDENT_READ_ONLY',readOnly:true,project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',
        database:'clearallergy_main19',role:'neondb_owner',applicationSha:target.source,deployment:target.deployment,originalRunId:'41495319922',originalTerminal:true,
        unknownResolved:true,allSevenSessionsClosed:true,pendingRequests:0,menuWrites:42,menuCount:11,extraAudits:0,exclusive:true,
        snapshotSha256:authorization.snapshotSha256,terminalSha256:authorization.terminalSha256,oldClaimsSha256:authorization.oldClaimsSha256,
        requestIdsSha256:sha([...b.terminal.consumedRequestIds].sort()),sqlObservedUtc:now,observedUtc:now};
    return {...b,authorization,identityReceipt,checkpointReceipt,claimDirectory:h.directory,
        image:{buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))},serviceRunId:randomUUID()};
}
function mockOwnedOpener(h,seen,{fail=false}={}){
    return async({role,record})=>{
        seen.push({role,attemptFiles:readdirSync(h.directory).filter(n=>n.startsWith('session-attempt-')).length});
        if(fail)throw Error('SYNTHETIC_PRIVATE_AUTH');
        const actor=h.actors.find(a=>a.binding.owner===role),browser={close:async()=>{}},context=actor.context;
        context.browser=()=>browser;context.close=async()=>{};
        const session={id:'sess_Synthetic'+role,ownerId:actor.expectedUserId,providerCreatedUtc:new Date().toISOString(),
            providerStatus:'active',ownerVerified:true,eligibleForCleanup:true,providerTerminationConfirmed:false,frontendSignOutAcknowledged:false,canonicalReadAttempts:0};
        actor.owner=role;actor.access.sessionLifecycleMode=()=> 'TRACKED_OWNER_SESSION';actor.access.sessionObservation=()=>structuredClone(session);
        actor.access.signOut=async()=>{Object.assign(session,{providerStatus:'removed',providerTerminationConfirmed:true,frontendSignOutAcknowledged:true,canonicalReadAttempts:2});return 'SIGNOUT_CONFIRMED';};
        const tracker={drain:async()=>({status:'QUIET_CONFIRMED',pending:0,generation:0,quietWindowObserved:true}),snapshot:()=>({started:0,settled:0,pending:0})};
        actor.lifecycle={browser,tracker};actor.finalize=()=>finalizeOwnedCiActor({access:actor.access,page:actor.page,context,browser,
            expectedOwnerId:actor.expectedUserId,drainRoutes:()=>tracker.drain(),readRouteState:()=>tracker.snapshot(),
            attempts:{contextCreateAttempted:true,browserLaunchAttempted:true}});
        record({owner:role,stage:'OWNER_AND_SHOP_VERIFIED',sessionIdentity:session});return actor;
    };
}
test('same real admission rejects stale/source/cap/approval changes before directory or authentication operations',async()=>{
    for(const change of [x=>{x.authorization.status='PENDING';},x=>{x.authorization.limits.sessions=7;},x=>{x.authorization.limits.menuWrites=103;},
        x=>{x.authorization.creationIdsSha256='b'.repeat(64);},x=>{x.checkpointReceipt.unknownResolved=false;},
        x=>{x.checkpointReceipt.database='OTHER';},x=>{x.identityReceipt.source='a'.repeat(40);},
        x=>{x.checkpointReceipt.sqlObservedUtc=new Date(Date.now()-3600001).toISOString();},x=>{x.checkpointReceipt.exclusive=false;},
        x=>{x.identityReceipt.protectionVerified=false;},x=>{x.identityReceipt.protectionMode='PREVIEW_ONLY';},x=>{x.identityReceipt.productionTarget=true;}]){
        const h=harness();try{const input=admissionInput(h),seen=[];change(input);input.dependencies={openActor:mockOwnedOpener(h,seen)};
            await assert.rejects(executeManagedApprovedResume(input),e=>e.message==='MANAGED_RESUME_ACTIVATION_NOT_APPROVED_OR_FRESH');
            assert.equal(seen.length,0);assert.equal(h.calls.length,0);assert.equal(readdirSync(h.directory).length,0);
        }finally{h.close();}}
    const h=harness();try{const input=admissionInput(h),seen=[];input.operation='SERVICE_NEXT';input.dependencies={openActor:mockOwnedOpener(h,seen)};
        // A service continuation without its FULL proof now fails at admission,
        // before the former stage dispatcher and before any auth/write side effect.
        await assert.rejects(executeManagedApprovedResume(input),e=>e.message==='MANAGED_RESUME_ACTIVATION_NOT_APPROVED_OR_FRESH');
        assert.equal(seen.length,0);assert.equal(h.calls.length,0);assert.equal(readdirSync(h.directory).length,0);
    }finally{h.close();}
});
test('admitted real entry charges before the authentication seam, preserves unknown slot and never tries a second owner',async()=>{
    const h=harness();try{const input=admissionInput(h),seen=[];input.dependencies={openActor:mockOwnedOpener(h,seen,{fail:true})};
        const report=await executeManagedApprovedResume(input);assert.equal(seen.length,1);assert.equal(seen[0].attemptFiles,1);
        assert.equal(report.sessionConsumption,8);assert.equal(report.sessionAttempts[0].consumedBeforeAuthentication,true);
        assert.equal(report.sessionsComplete,false);assert.match(report.status,/^HOLD/);assert.equal(h.calls.length,0);
        assert.doesNotMatch(JSON.stringify(report),/SYNTHETIC_PRIVATE_AUTH/);
        const again=await executeManagedApprovedResume(input);assert.match(again.status,/^HOLD/);assert.equal(seen.length,1);
    }finally{h.close();}
});
test('real entry plus real controller/runtime uses mock HTTP only, creates six menus, and canonical finalization closes both owned sessions',async()=>{
    const h=harness();try{const input=admissionInput(h),seen=[];input.dependencies={openActor:mockOwnedOpener(h,seen)};
        assert.equal((await assertManagedResumeActivation(input)).scope,'RESUME_414953_FULL_MANAGED');assert.equal(h.calls.length,0);
        const report=await executeManagedApprovedResume(input);
        assert.equal(report.sessionConsumption,9);assert.equal(seen.length,2);assert.equal(seen[0].attemptFiles,1);assert.equal(seen[1].attemptFiles,2);
        assert.equal(report.core.counts.menus,17);assert.equal(report.core.counts.menuWrites,68);
        assert.equal(report.sessionFinalizations.length,2);assert.equal(report.sessionsComplete,true);assert.ok(report.sessionFinalizations.every(s=>s.complete&&s.localClosed));
        assert.equal(report.livePass,false);assert.equal(report.actualServicePass,false);assert.equal(report.independentDatabase,'NOT_ATTESTED');
        assert.equal(h.calls.filter(c=>c.method==='POST'&&c.url===target.origin+'/api/admin/menus').length,7);
        assert.match(report.status,/^HOLD/); // Minimal browser seam refuses T4 observation after its known CREATE.
        assert.ok(report.controller.evidenceGaps.includes('T2_PUBLIC_PROPAGATION_AND_INTERMEDIATE_UI'));
    }finally{h.close();}
});
test('an extended scope or forged session permit cannot directly open the existing real actor function',async()=>{
    const h=harness();try{const {identityReceipt}=admissionInput(h);let launches=0;
        await assert.rejects(openManagedOwnedActor({role:'S1',chromium:{launch:async()=>{launches++;}},
            env:{ISSUE118_MANAGED_SCOPE:'RESUME_414953_FULL_MANAGED'},identityReceipt,sessionPermit:{owner:'S1'}}));assert.equal(launches,0);
    }finally{h.close();}
});
test('an admitted B permit reaches the real SDK OIDC boundary with mock transport; an unowned permit remains refused',async t=>{
    const h=harness();try{const input=admissionInput(h),seen=[],memoryOpen=mockOwnedOpener(h,seen);let oidcCalls=0,launches=0;
        input.env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:ciIdentity.repository,
            GITHUB_REPOSITORY_ID:ciIdentity.repositoryId,GITHUB_REF:ciIdentity.ref,GITHUB_WORKFLOW_REF:ciIdentity.workflowRef,
            ISSUE118_GITHUB_ENVIRONMENT:ciIdentity.environment,ISSUE118_APPLY:'true',GITHUB_SHA:'a'.repeat(40),ISSUE118_EXPECTED_RUNNER_SHA:'a'.repeat(40),
            ISSUE118_TEST_CLERK_SECRET_KEY:'sk_test_SYNTHETIC_NOT_REAL',
            ACTIONS_ID_TOKEN_REQUEST_URL:'https://run-actions-synthetic.actions.githubusercontent.com/only/_apis/oidc/idtoken?api-version=2.0',
            ACTIONS_ID_TOKEN_REQUEST_TOKEN:'SYNTHETIC_NOT_REAL'};
        t.mock.method(globalThis,'fetch',async()=>{oidcCalls++;return {ok:true,json:async()=>({value:h.actors[1].access.token()})};});
        input.chromium={launch:async()=>{launches++;throw Error('SYNTHETIC_LAUNCH_STOP_BEFORE_CLERK');}};
        input.dependencies={openActor:args=>args.role==='S1'?memoryOpen(args):openManagedOwnedActor(args)};
        const result=await executeManagedApprovedResume(input);
        assert.equal(oidcCalls,1);assert.equal(launches,1);assert.equal(result.sessionConsumption,9);assert.equal(result.status,'HOLD_MANAGED_RESUME_ENTRY');
        assert.equal(h.calls.filter(c=>c.method!=='GET').length,0);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_LAUNCH_STOP/);
    }finally{t.mock.restoreAll();h.close();}
});
test('one session-end journal failure does not interrupt canonical finalization of the other owned actor',async()=>{
    const h=harness();try{const input=admissionInput(h),seen=[],memoryOpen=mockOwnedOpener(h,seen),ended=[];
        writeFileSync(join(h.directory,'session-end-1.json'),'SYNTHETIC_EXISTING_EVIDENCE_DO_NOT_OVERWRITE');
        input.dependencies={openActor:async args=>{const actor=await memoryOpen(args),close=actor.finalize;
            actor.finalize=async()=>{ended.push(actor.owner);return close();};return actor;}};
        const result=await executeManagedApprovedResume(input);
        assert.deepEqual(ended,['S2','S1']);assert.equal(result.sessionFinalizations.length,2);assert.ok(result.sessionFinalizations.every(s=>s.complete));
        assert.equal(result.evidencePersistenceComplete,false);assert.match(result.status,/^HOLD/);
        assert.equal(readFileSync(join(h.directory,'session-end-1.json'),'utf8'),'SYNTHETIC_EXISTING_EVIDENCE_DO_NOT_OVERWRITE');
    }finally{h.close();}
});
test('session ID observations persist during authentication; observation journal failure prevents the next owner and menu writes',async()=>{
    for(const failRecord of [false,true]){const h=harness();try{const input=admissionInput(h),seen=[],memoryOpen=mockOwnedOpener(h,seen);
        if(failRecord)writeFileSync(join(h.directory,'session-observation-1-1.json'),'SYNTHETIC_EXISTING_RECEIPT');
        input.dependencies={openActor:async args=>{const actor=await memoryOpen(args);
            if(!failRecord){const stored=JSON.parse(readFileSync(join(h.directory,'session-observation-'+seen.length+'-1.json'),'utf8'));
                assert.equal(stored.sessionIdentity.id,actor.access.sessionObservation().id);assert.equal(stored.owner,args.role);}
            return actor;}};
        const result=await executeManagedApprovedResume(input);
        if(failRecord){assert.equal(seen.length,1);assert.equal(result.evidencePersistenceComplete,false);assert.equal(result.sessionConsumption,8);
            assert.equal(result.sessionFinalizations.length,1);assert.equal(result.sessionFinalizations[0].complete,true);assert.equal(h.calls.filter(c=>c.method!=='GET').length,0);}
        else assert.equal(seen.length,2);
    }finally{h.close();}}
});

function fullCliInput(h){
    const input=admissionInput(h);delete input.ports;delete input.approval;delete input.claimDirectory;delete input.image;
    input.operation='CORE_AND_SERVICE';
    input.executionApproval={status:'APPROVED',scope:'FULL_RESUME_WITH_ACTIONS_READ',verifiedBy:'human',
        evidenceReference:input.authorization.evidenceReference,actionsReadApproved:true,singleAttempt:true,runnerSha:'a'.repeat(40),
        operation:input.operation,inputSha256:fullResumeHash(input)};
    const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:ciIdentity.repository,
        GITHUB_REPOSITORY_ID:ciIdentity.repositoryId,GITHUB_REF:ciIdentity.ref,GITHUB_WORKFLOW_REF:ciIdentity.workflowRef,
        ISSUE118_GITHUB_ENVIRONMENT:ciIdentity.environment,GITHUB_SHA:'a'.repeat(40),ISSUE118_EXPECTED_RUNNER_SHA:'a'.repeat(40),
        GITHUB_RUN_ID:'999001',GITHUB_RUN_NUMBER:'901',GH_TOKEN:'SYNTHETIC_GITHUB_TOKEN'};
    return {input,env};
}
function githubMemory(env,key,alter=()=>{}){
    const row={id:Number(env.GITHUB_RUN_ID),run_number:Number(env.GITHUB_RUN_NUMBER),display_title:'Issue118 FULL '+key,
        run_attempt:1,event:'workflow_dispatch',head_branch:'test/issue118-live-t1-20261030',head_sha:env.GITHUB_SHA,path:'.github/workflows/issue118-live-e2e.yml'};
    const body={total_count:1,workflow_runs:[row]};alter(body);
    return async(url,options)=>{assert.ok(url.startsWith('https://api.github.com/repos/Kaito-Iwase/ClearAllergy/actions/workflows/issue118-live-e2e.yml/runs?'));
        assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return {status:200,text:async()=>JSON.stringify(body)};};
}
test('FULL CLI same admission+provenance path accepts mock metadata but refuses old cap/no approval before HTTP/auth',async()=>{
    const h=harness();try{const {input,env}=fullCliInput(h),a=await assertManagedResumeActivation(input);env.ISSUE118_RESUME_CLAIM=a.checkpointKey;
        assert.equal((await admitManagedFullInput(input,env)).checkpointKey,a.checkpointKey);
        assert.deepEqual(decodeManagedFullInput(encodeManagedFullInput(input)),input);
        let auth=0;const result=await runManagedFullCli({argv:['--preflight'],env:{...env,ISSUE118_FULL_INPUT:encodeManagedFullInput(input)},
            fetchImpl:githubMemory(env,a.checkpointKey),execute:async()=>{auth++;}});
        assert.equal(result.status,'FULL_PREFLIGHT_NO_AUTH');assert.equal(auth,0);assert.equal(h.calls.length,0);
        for(const change of [x=>{delete x.executionApproval;},x=>{x.authorization.limits.sessions=7;},x=>{x.executionApproval.actionsReadApproved=false;},
            x=>{x.executionApproval.runnerSha='b'.repeat(40);},x=>{x.snapshot.counts.menuWrites++;}]){
            const bad=structuredClone(input);change(bad);let reads=0;
            await assert.rejects(runManagedFullCli({argv:['--apply'],env:{...env,ISSUE118_FULL_INPUT:encodeManagedFullInput(bad)},fetchImpl:async()=>{reads++;}}),/MANAGED_FULL_ENTRY_REFUSED/);
            assert.equal(reads,0);assert.equal(auth,0);
        }
    }finally{h.close();}
});
test('global FULL claim refuses older same checkpoint, rerun, absent current metadata, over1000 and provider failures without auth',async()=>{
    const h=harness();try{const {input,env}=fullCliInput(h),a=await assertManagedResumeActivation(input);env.ISSUE118_RESUME_CLAIM=a.checkpointKey;
        for(const change of [b=>{b.total_count=2;b.workflow_runs.push({...b.workflow_runs[0],id:999000,run_number:900,status:'completed',conclusion:'failure'});},
            b=>{b.workflow_runs[0].run_attempt=2;},b=>{b.workflow_runs[0].head_sha='b'.repeat(40);},b=>{b.total_count=1000;},
            b=>{b.workflow_runs[0].display_title='WRONG';}]){
            await assert.rejects(verifyManagedFullGithubProvenance({input,env,fetchImpl:githubMemory(env,a.checkpointKey,change)}),/MANAGED_FULL_ENTRY_REFUSED/);
        }
        for(const fetchImpl of [async()=>{throw Error('SYNTHETIC_PRIVATE');},async()=>({status:403}),async()=>({status:200,text:async()=>'{private'})])
            await assert.rejects(verifyManagedFullGithubProvenance({input,env,fetchImpl}),e=>e.message==='MANAGED_FULL_ENTRY_REFUSED'&&!e.cause);
        await assert.rejects(admitManagedFullInput(input,{...env,GITHUB_RUN_ATTEMPT:'2'}));assert.equal(h.calls.length,0);
    }finally{h.close();}
});
