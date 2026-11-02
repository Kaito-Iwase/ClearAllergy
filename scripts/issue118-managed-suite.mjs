// Callable controller only: no CLI, credentials, authentication, HTTP or fixture I/O.
// The owner installs the send guard on its existing managed transport. Every actual
// send must await authorize(), and every acknowledged 201 ID must call recordCreated().
import { prepareOriginalBatchRun,target } from './check-issue118-live-t1-browser.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {completionScope,planManagedT2Completion,validateT2PrefixCheckpoint} from './issue118-t2-reobserve.mjs';

export const suiteLimits = Object.freeze({ menus:32, createAttempts:33, menuWrites:103,
    shopWrites:4, blobUploads:5, sessions:7, denialRequests:10 });
// OFFLINE ONLY: one reconciled interrupted suite, not a live authorization/bridge.
// Existing limits and consumed claims remain unchanged. Proposed extra limits need approval.
export function planManaged414953Recovery({snapshot,terminal,standaloneBRecovery=false}) {
    const refuse=()=>{throw Error('OFFLINE_RECOVERY_PLAN_REFUSED');},require=value=>{if(!value)refuse();};
    require(typeof standaloneBRecovery==='boolean'&&snapshot?.applicationSha===target.source);
    require(snapshot.status==='HOLD_NO_FURTHER_WRITES'&&Array.isArray(snapshot.claims)&&Array.isArray(snapshot.fixtures));
    require(terminal?.unknownWrites===0&&terminal.consumedSessions===7&&terminal.allConsumedSessionsClosed===true);
    require(terminal.confirmedMenuWrites===42&&Array.isArray(terminal.menus)&&terminal.menus.length===11);
    require(Array.isArray(terminal.consumedRequestIds)&&terminal.consumedRequestIds.length===42
        &&new Set(terminal.consumedRequestIds).size===42&&terminal.consumedRequestIds.every(uuid));
    const claims=snapshot.claims,ids=new Set(claims.map(c=>c.id)),fixtures=new Map(snapshot.fixtures.map(f=>[f.id,f]));
    require(ids.size===31&&claims.length===31&&fixtures.size===11&&snapshot.counts.menus===11&&snapshot.counts.menuWrites===37);
    const expected=[];
    for(let n=1;n<=8;n++){const key='M0'+n;expected.push(`T2_${key}_CREATE`,`T2_${key}_INITIAL_PUBLISH`);}
    for(const key of ['M01','M02','M05','M06'])expected.push(`T2_${key}_STOP`,`T2_${key}_CORRECT_PRIVATE`,`T2_${key}_REPUBLISH`);
    expected.push('T3_M01_CREATE','T3_M01_INITIAL_PUBLISH','T3_M02_CREATE');
    require(expected.every(id=>ids.has(id))&&claims.every(c=>c.state==='FORWARD_CONSUMED'));
    require(claims.every(c=>{const [,scenario,key,phase]=/^(T[23])_(M0[1-8])_(.+)$/.exec(c.id)||[];
        return scenario&&c.kind===(phase==='CREATE'?'MENU_CREATE':'MENU_WRITE')&&c.owner===(Number(key.slice(1))<=4?'S1':'S2');}));
    const created=claims.filter(c=>c.kind==='MENU_CREATE'),operationIds=created.map(c=>c.resource?.creationOperationId);
    require(created.length===10&&new Set(operationIds).size===10&&operationIds.every(uuid));
    require(new Set(created.map(c=>c.createdId)).size===10&&created.every(c=>fixtures.get(c.createdId)?.owner===c.owner));
    const menus=new Map(terminal.menus.map(m=>[m.id,m]));require(menus.size===11);
    require([...fixtures].every(([id,f])=>menus.get(id)?.owner===f.owner&&menus.get(id)?.ownerMatches===true
        &&typeof menus.get(id)?.isPublished==='boolean'));
    const byClaim=id=>claims.find(c=>c.id===id),t2A=['M01','M02','M03','M04'].map(k=>byClaim(`T2_${k}_CREATE`).createdId);
    const t2B=['M05','M06','M07','M08'].map(k=>byClaim(`T2_${k}_CREATE`).createdId),t3A=byClaim('T3_M01_CREATE').createdId;
    require([...menus.values()].every(m=>m.isPublished===t2B.includes(m.id)));
    require(Array.isArray(terminal.extraConfirmedStops)&&terminal.extraConfirmedStops.length===5
        &&new Set(terminal.extraConfirmedStops).size===5&&[...t2A,t3A].every(id=>terminal.extraConfirmedStops.includes(id)));
    const cases=[],add=(name,actions,extra={})=>cases.push({name,actions,...extra}),act=(kind,id,owner='S1')=>({kind,id,owner});
    add('T2_B_RECOVERY_AND_VERIFY_PRIVATE',t2B.map(id=>act('STOP',id,'S2')));
    const t3=[act('PUBLISH',t3A),act('PUBLISH',byClaim('T3_M02_CREATE').createdId)];
    for(let n=3;n<=8;n++){const id='PLANNED_T3_M0'+n,owner=n<=4?'S1':'S2';t3.push(act('CREATE',id,owner),act('PUBLISH',id,owner));}
    t3.push(act('STOP',t3A),act('STOP','PLANNED_T3_M05','S2'));
    add('T3_RESUME_EXISTING_CLAIMS',t3);
    add('T3_CASE_PRIVATE',[act('STOP',byClaim('T3_M02_CREATE').createdId),...[3,4,6,7,8].map(n=>act('STOP','PLANNED_T3_M0'+n,n<=4?'S1':'S2'))]);
    add('T4_CASE_PRIVATE',['CREATE','PUBLISH','STOP'].map(k=>act(k,'PLANNED_T4')));
    for(const [label,owner] of [['PRICE','S1'],['STOP','S2'],['SILENT','S2']]){
        const id='PLANNED_CONTROL_'+label;add('CONTROL_'+label+'_CASE_PRIVATE',[
            act('CREATE',id,owner),act('PUBLISH',id,owner),...(label==='PRICE'?[act('WRITE',id,owner)]:[]),act('STOP',id,owner)]);
    }
    const serviceOrder=['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_UPLOAD','SHOP_SAVE'];
    const orderedCells=[...serviceOrder.map(kind=>({kind,mode:'DELIVER',arm:1})),
        ...serviceOrder.map(kind=>({kind,mode:'BLOCK',arm:1})),
        ...['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].map((kind,i)=>({kind,mode:'WITHHOLD',arm:i+1}))];
    for(const {kind,mode,arm} of orderedCells){
        const id='PLANNED_SERVICE_'+kind+'_'+mode,actions=[];
        if(kind==='SHOP_UPLOAD'){
            if(mode==='WITHHOLD')actions.push(act('SHOP_RESTORE','PLANNED_SERVICE_SHOP_SAVE_WITHHOLD'));
            if(mode!=='BLOCK')actions.push(act('BLOB_UPLOAD',id));
        }else if(kind==='SHOP_SAVE'){
            if(mode!=='BLOCK')actions.push(act('SHOP_SAVE',id));
            if(mode==='DELIVER')actions.push(act('SHOP_RESTORE',id));
        }else if(kind==='MENU_CREATE'){
            if(mode==='DELIVER')actions.push(act('BLOB_UPLOAD',id));
            if(mode!=='BLOCK')actions.push(act('CREATE',id));if(mode==='DELIVER')actions.push(act('PUBLISH',id),act('STOP',id));}
        else{actions.push(act('CREATE',id));if(kind==='STOP')actions.push(act('PUBLISH',id),act('STOP',id));
            if(kind==='MENU_SAVE'&&mode!=='BLOCK')actions.push(act('WRITE',id));
            if(kind==='MENU_UPLOAD'&&mode!=='BLOCK')actions.push(act('BLOB_UPLOAD',id));
            if(kind==='MENU_UPLOAD'&&mode==='DELIVER')actions.push(act('WRITE',id),act('PUBLISH',id),act('STOP',id));}
        add('SERVICE_'+kind+'_'+mode,actions,{serviceCell:kind+'_'+(mode==='BLOCK'?'BLOCK_BEFORE_FORWARD':mode==='WITHHOLD'?'WITHHOLD_AFTER_RESPONSE':mode),
            arm,independentTerminalAfter:mode==='WITHHOLD',requiresPreviousTerminal:arm>1});
    }
    const publicIds=new Set(t2B),known=new Set(fixtures.keys());let writes=42,newMenus=0,peakStopReservations=4;
    const checkpoints=[],futureManifest=[];let shopWrites=0,blobUploads=0;
    for(const c of cases){for(const [index,a] of c.actions.entries()){
        const channel=a.kind==='BLOB_UPLOAD'?'BLOB':a.kind.startsWith('SHOP_')?'SHOP':'MENU';
        if(channel==='MENU')require(a.kind==='CREATE'?!known.has(a.id):known.has(a.id));
        const plannedClaimId='PLAN_'+c.name+'_'+index;require(!ids.has(plannedClaimId));
        const stopReservationsBeforeForward=publicIds.size+(a.kind==='PUBLISH'?1:0);
        require(writes+(channel==='MENU'?1:0)+stopReservationsBeforeForward-(a.kind==='STOP'?1:0)<=105);
        futureManifest.push({plannedClaimId,case:c.name,kind:a.kind,channel,menuKey:a.id,owner:a.owner,arm:c.arm??0,
            writesBeforeForward:writes,stopReservationsBeforeForward,ownerRecoverySessionReserve:{S1:1,S2:1},
            unexpectedRecoveryWriteReserve:{menuStop:1,shopRestore:1,singleUnexpectedCutOnly:true}});
        if(a.kind==='CREATE'){known.add(a.id);newMenus++;}
        if(a.kind==='PUBLISH'){require(!publicIds.has(a.id));publicIds.add(a.id);}
        if(a.kind==='STOP'){require(publicIds.has(a.id));publicIds.delete(a.id);}
        // Each newly public item holds one of the remaining write slots for STOP.
        if(channel==='MENU')writes++;else if(channel==='SHOP')shopWrites++;else blobUploads++;
        require(writes+publicIds.size<=105);peakStopReservations=Math.max(peakStopReservations,publicIds.size);
    }
        if(c.name!=='T3_RESUME_EXISTING_CLAIMS')require(publicIds.size===0);
        checkpoints.push({case:c.name,menuWrites:c.actions.filter(a=>!a.kind.startsWith('SHOP_')&&a.kind!=='BLOB_UPLOAD').length,
            shopWrites:c.actions.filter(a=>a.kind.startsWith('SHOP_')).length,blobUploads:c.actions.filter(a=>a.kind==='BLOB_UPLOAD').length,
            publicStopReservations:publicIds.size,...(c.serviceCell?{serviceCell:c.serviceCell,arm:c.arm,
                independentTerminalAfter:c.independentTerminalAfter,requiresPreviousTerminal:c.requiresPreviousTerminal}:{})});
    }
    require(writes===105&&newMenus===21&&known.size===32&&publicIds.size===0&&shopWrites===4&&blobUploads===5);
    // Cut every possible forwarded write. Neither a client error nor an API read
    // grants cleanup: only the modeled independent terminal receipt unlocks the
    // owner's reserved recovery session, and normal test continuation stays stopped.
    const cutContrasts=[];
    for(let cut=0;cut<futureManifest.length;cut++)for(const committed of [false,true]){
        const exposed=new Map(t2B.map(id=>[id,'S2']));let menuSpent=42,shopSpent=0,shopChanged=false;
        for(let i=0;i<=cut;i++){
            const a=futureManifest[i];if(a.channel==='MENU')menuSpent++;if(a.channel==='SHOP')shopSpent++;
            if(i===cut&&!committed)break;
            if(a.kind==='PUBLISH')exposed.set(a.menuKey,a.owner);if(a.kind==='STOP')exposed.delete(a.menuKey);
            if(a.kind==='SHOP_SAVE')shopChanged=true;if(a.kind==='SHOP_RESTORE')shopChanged=false;
        }
        const cutAction=futureManifest[cut],reservedStops=Math.max(exposed.size,cutAction.stopReservationsBeforeForward);
        const owners=[...new Set([...exposed.values(),...(shopChanged?['S1']:[])])].sort();
        const extraMenuStop=!committed&&cutAction.kind==='STOP'?1:0,extraShopRestore=!committed&&cutAction.kind==='SHOP_RESTORE'?1:0;
        // Normal test forwards cannot consume these extra slots. The exceptional
        // operation remains consumed even when SQL proves that it did not commit.
        const fits=menuSpent+exposed.size<=106&&shopSpent+(shopChanged?1:0)<=5;
        let verified=false,recoveryWrites=0;const normalActions=0,used={S1:0,S2:0},remainingByOwner={S1:shopChanged?1:0,S2:0};
        for(const owner of exposed.values())remainingByOwner[owner]++;
        const request=(type,owner)=>{
            if(type==='NORMAL'){return false;} // The original held arm is never resumed.
            if(!verified||!fits||!owners.includes(owner))return false;
            if(type==='RECOVERY_AUTH'){if(used[owner]>=1)return false;used[owner]++;return true;}
            if(type==='RECOVERY_WRITE'){if(used[owner]!==1||remainingByOwner[owner]<1)return false;remainingByOwner[owner]--;recoveryWrites++;return true;}
            return false;
        };
        require(request('NORMAL','S1')===false&&request('RECOVERY_AUTH','S1')===false&&request('RECOVERY_WRITE','S1')===false);
        const beforeSql={normalActions,recoverySessions:used.S1+used.S2,recoveryWrites};
        verified=true;require(request('NORMAL','S1')===false);
        if(fits){for(const owner of owners){require(request('RECOVERY_AUTH',owner)===true);require(request('RECOVERY_AUTH',owner)===false);}
            for(const owner of exposed.values())require(request('RECOVERY_WRITE',owner)===true);
            if(shopChanged)require(request('RECOVERY_WRITE','S1')===true);
            require(request('RECOVERY_WRITE','S1')===false&&request('RECOVERY_WRITE','S2')===false);
        }else require(request('RECOVERY_AUTH','S1')===false&&request('RECOVERY_WRITE','S1')===false);
        const afterSql={normalActions,recoverySessions:used,recoveryStopWrites:fits?exposed.size:0,recoveryShopRestores:fits&&shopChanged?1:0,
            recoveryAllowedWithinProposedWriteBudget:fits,requiredStopWrites:exposed.size,requiredShopRestores:shopChanged?1:0,
            extraForwardReserveUsed:{menuStop:extraMenuStop,shopRestore:extraShopRestore},
            fullNormalPlusSingleRecoveryBound:{menuWrites:105+extraMenuStop,shopWrites:4+extraShopRestore},
            status:fits?'RECOVERY_BOUNDED_ONLY_NOT_COVERAGE_PASS':'HOLD_NEEDS_ADDITIONAL_WRITE_BUDGET'};
        require(used.S1<=1&&used.S2<=1&&owners.length<=2&&exposed.size<=reservedStops);
        cutContrasts.push({cutAfter:cutAction.plannedClaimId,serverCommitted:committed,originalHeld:true,stopReservations:reservedStops,
            beforeIndependentTerminal:beforeSql,
            afterIndependentTerminal:afterSql,normalRetries:0,requiresExactFreshStateAndIndependentTerminal:true});
    }
    const expectedSessions=7+(standaloneBRecovery?1:0),reserve={S1:1,S2:1};
    const sessionOwners=[...(standaloneBRecovery?['S2']:[]),'S1','S2',...Array(5).fill('S1')];
    let consumed=7;const maximum=7+expectedSessions+reserve.S1+reserve.S2,sessionPrefixes=[];
    for(let i=0;i<sessionOwners.length;i++){require(consumed+1+(sessionOwners.length-i-1)+reserve.S1+reserve.S2<=maximum);
        sessionPrefixes.push({owner:sessionOwners[i],consumedBeforeAuthentication:consumed,reservedRecovery:{...reserve},remainingNormalSessions:sessionOwners.length-i});consumed++;}
    return {mode:'OFFLINE_PLAN_ONLY',liveEnabled:false,resumeBridge:'NOT_IMPLEMENTED',
        coverage:'NOT_ATTESTED',unmeasured:['T2_PUBLIC_PROPAGATION_AND_INTERMEDIATE_UI'],extraT2RepublicationWritesBudgeted:false,
        inherited:{menus:11,menuWrites:42,sessions:7,originalSnapshotStatus:snapshot.status,consumedRequestIds:[...terminal.consumedRequestIds],
            operationClaimIds:[...ids].sort(),claimsSha256:createHash('sha256').update(canonical(claims)).digest('hex'),creationOperationIds:operationIds},
        remaining:{menus:newMenus,menuWrites:writes-42,expectedSessions,recoverySessions:reserve},
        normalExpected:{menus:32,createAttempts:33,menuWrites:writes,shopWrites,blobUploads,sessions:7+expectedSessions,denialRequests:10},
        reservedMaximum:{menus:32,createAttempts:33,menuWrites:106,shopWrites:5,blobUploads,sessions:maximum,denialRequests:10},
        reserveScope:'ONE_UNEXPECTED_CUT_THEN_ONE_SUCCESSFUL_BOUNDED_RECOVERY; SECOND_FAULT_HOLD',
        sessionExpectedTotal:consumed,peakStopReservations,caseBudgets:checkpoints,futureManifest,sessionPrefixes,cutContrasts,
        serviceTerminals:checkpoints.filter(c=>c.independentTerminalAfter).map(c=>({afterCell:c.serviceCell,arm:c.arm,
            independentSqlRequired:true,sessionsClosedRequired:true,nextNormalActionsBeforeReceipt:0})),
        caseWrites:{existingBPrivate:4,t3Resume:16,t3Private:6,t4:3,controls:10,service:24},
        unknownPolicy:'HOLD_NO_AUTOMATIC_CLEANUP; INDEPENDENT_TERMINAL_BEFORE_RESERVED_RECOVERY',
        reservationsNotRetries:true,unchangedLiveLimits:{...suiteLimits},
        assumptions:['All future normal writes have known confirmed outcomes; no extra failure writes are included.',
            'Planned claim IDs are offline labels, not an executable resume bridge or assigned new creation UUIDs.',
            'Every WITHHOLD requires independent terminal SQL/session closure before the next arm.',
            'Recovery sessions are owner-specific and cannot be spent on normal test retries.',
            'The extra menu STOP and Shop restore are mutually exclusive single-cut recovery allowances, never normal test/retry slots.',
            'A further failure during recovery is not covered: HOLD and a new explicit budget decision are required.']};
}
// Callable local bridge only. CLI/workflow and suiteLimits do not enable it.
export function validateManagedFullCheckpoint({snapshot,terminal,approval,creationOperationIds,fullCheckpoint,continuationReceipt,now=Date.now()}={}){
    let predicateStage='DATA';const refuse=()=>{const e=Error('MANAGED_FULL_CHECKPOINT_REFUSED');e.predicateStage=predicateStage;throw e;},need=v=>{if(!v)refuse();};
    try{
        let nodes=0;const data=(v,depth=0)=>{need(++nodes<30000&&depth<20);
            if(v===null||typeof v==='boolean')return;if(typeof v==='number'){need(Number.isSafeInteger(v)&&v>=0);return;}
            if(typeof v==='string'){need(v.length<=10000);return;}
            need(v&&typeof v==='object'&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype));if(Array.isArray(v))need(v.length<=300);
            for(const k of Reflect.ownKeys(v)){if(Array.isArray(v)&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(v,k);need(typeof k==='string'&&d&&'value'in d);data(d.value,depth+1);}};
        data(fullCheckpoint);data(continuationReceipt);const x=structuredClone(fullCheckpoint),p=structuredClone(continuationReceipt),s=x.controller;
        const exact=(v,keys)=>need(v&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)));
        const sha=v=>createHash('sha256').update(canonical(v)).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
        const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString()===v;
        exact(x,['version','controller','preparationState','sessionLedger','source']);need(x.version===1);
        exact(x.source,['githubRunId','runnerSha','artifactSha256','jobTerminal','pendingRequests','sessionsClosed']);
        need(/^\d{1,20}$/.test(x.source.githubRunId)&&/^[a-f0-9]{40}$/.test(x.source.runnerSha)&&hex(x.source.artifactSha256)
            &&x.source.jobTerminal===true&&x.source.pendingRequests===0&&x.source.sessionsClosed===true);
        const fullT2=approval.scope===completionScope,plan=(fullT2?planManagedT2Completion:planManaged414953Recovery)({snapshot,terminal});need((approval.scope==='RESUME_414953_FULL_MANAGED'||fullT2)&&approval.status==='APPROVED'
            &&canonical(approval.limits)===canonical(plan.reservedMaximum)&&approval.oldClaimsSha256===plan.inherited.claimsSha256
            &&approval.creationIdsSha256===sha(creationOperationIds));
        predicateStage='STATE_SCHEMA';
        exact(s,['checkpointVersion','applicationSha','deployment','approvedScope','serviceRunId','status','livePass','coverage','publicPropagation',
            'originalHold','inheritedClaimsSha256','inheritedOperationClaimIds','inheritedRequestIds','counts','newClaims','knownFixtures','stopReservations',
            'sessionReservations','automaticRetry','automaticCleanup','remainingNotImplemented','remainingNotRun','evidenceGaps','serviceArms',
            'serviceOwnerBPrivacyEvidence','serviceObservations','terminalCreationBindings','completedStages','closedOwnerPrivateBindings','privateBindings',
            'fullCrossJobRestore','restoredFrom','t2Prefix']);
        need(s.checkpointVersion===1&&s.applicationSha===target.source&&s.deployment===target.deployment&&s.approvedScope===approval.scope&&uuid(s.serviceRunId));
        need(/^HOLD_/.test(s.status)&&s.livePass===false&&s.coverage==='NOT_ATTESTED'&&s.publicPropagation==='NOT_ATTESTED'
            &&s.automaticRetry===false&&s.automaticCleanup===false&&s.originalHold===snapshot.status
            &&s.inheritedClaimsSha256===plan.inherited.claimsSha256&&canonical(s.inheritedOperationClaimIds)===canonical(plan.inherited.operationClaimIds)
            &&canonical(s.inheritedRequestIds)===canonical(plan.inherited.consumedRequestIds));
        need(canonical(s.completedStages)===canonical(['T4_OBSERVER','CONTROLS_OBSERVATIONS','DENIALS'])&&Array.isArray(s.serviceArms)
            &&s.serviceArms.length>=1&&s.serviceArms.length<=6&&Array.isArray(s.newClaims)&&s.newClaims.length<=150);
        const prefix=fullT2?validateT2PrefixCheckpoint({snapshot,terminal,authorization:approval,prefixCheckpoint:s.t2Prefix?.checkpoint,prefixReceipt:s.t2Prefix?.receipt,now,historical:true}):null;
        need(fullT2||s.t2Prefix===null);
        const armOrder=[['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_UPLOAD','SHOP_SAVE'].flatMap(k=>[k+'_DELIVER']),
            ['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_UPLOAD','SHOP_SAVE'].map(k=>k+'_BLOCK_BEFORE_FORWARD')].flat();
        armOrder.push('MENU_CREATE_WITHHOLD_AFTER_RESPONSE');
        const arms=[armOrder,...['MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].map(k=>[k+'_WITHHOLD_AFTER_RESPONSE'])],k=s.serviceArms.length;
        for(const [i,a] of s.serviceArms.entries()){
            exact(a,['id','zone','status','terminalVerified','operationIds','currentCell']);
            need(a.id==='RESUME_SERVICE_'+(i+1)&&a.zone==='SERVICE'&&a.status==='HOLD'&&a.terminalVerified===(i<k-1)
                &&a.currentCell===arms[i].at(-1)&&Array.isArray(a.operationIds)&&new Set(a.operationIds).size===a.operationIds.length);
        }
        const selected=arms.slice(0,k).flat();need(Array.isArray(s.serviceObservations)&&s.serviceObservations.length===selected.length);
        s.serviceObservations.forEach((o,i)=>{exact(o,['cellId','status']);need(o.cellId===selected[i]&&o.status===(o.cellId.endsWith('WITHHOLD_AFTER_RESPONSE')?'HOLD':'OBSERVED_NOT_INDEPENDENTLY_ATTESTED'));});
        predicateStage='CORE_T3';const known=new Map(snapshot.fixtures.map(f=>[f.id,{...f}])),prior=new Map(snapshot.claims.map(c=>[c.id,c])),versions=new Map(terminal.menus.map(m=>[m.id,m.version]));
        const counts={menus:11,createAttempts:11,menuWrites:prefix?78:42,shopWrites:0,blobUploads:0,sessions:(prefix?10:8)+k,denialRequests:0};
        if(prefix)for(const r of prefix.rows)versions.set(r.id,r.version);
        const requestIds=new Set([...terminal.consumedRequestIds,...(prefix?prefix.controller.claims.map(c=>c.requestId):[])]);
        const claimedIds=new Set(prior.keys()),createdIds=new Set(known.keys()),creationIds=new Set(plan.inherited.creationOperationIds),coreCreated=new Map(),t3Created=new Map();
        for(const c of snapshot.claims){const m=/^T3_(M0[12])_CREATE$/.exec(c.id);if(m)t3Created.set(m[1],c.createdId);}
        let cursor=0;const addCreated=c=>{need(menuId(c.createdId)&&!forbiddenMenu(c.createdId)&&!createdIds.has(c.createdId)&&uuid(c.resource.creationOperationId)&&!creationIds.has(c.resource.creationOperationId));
            createdIds.add(c.createdId);creationIds.add(c.resource.creationOperationId);known.set(c.createdId,{id:c.createdId,owner:c.owner,zone:c.zone||'CORE'});versions.set(c.createdId,29);counts.menus++;};
        const claim=()=>{const c=s.newClaims[cursor++];need(c&&safeKey(c.id)&&!claimedIds.has(c.id)&&['S1','S2'].includes(c.owner));
            need(Object.keys(c).every(f=>['id','kind','owner','resource','mode','arm','zone','state','createdId','requestId','cellId'].includes(f)));
            claimedIds.add(c.id);if(c.requestId!==undefined){need(uuid(c.requestId)&&!requestIds.has(c.requestId));requestIds.add(c.requestId);}return c;};
        const coreIntent=(scenario,key,kind,id)=>{
            const c=claim(),owner=Number(key.slice(1))<=4?'S1':'S2';need(c.id==='RESUME414953_'+scenario+'_'+key+'_'+kind&&c.owner===owner
                &&c.kind===(kind==='CREATE'?'MENU_CREATE':'MENU_WRITE')&&c.state==='CONFIRMED_RESPONSE_AND_READBACK'&&uuid(c.requestId)
                &&c.mode===undefined&&c.arm===undefined&&c.zone===undefined);
            const r={method:kind==='CREATE'||kind==='STOP'?'POST':'PUT',path:kind==='CREATE'?'/api/admin/menus':'/api/admin/menus/'+id+(kind==='STOP'?'/stop':''),
                shopId:ownerShop[owner],purpose:'CORE',...(kind==='CREATE'?{creationOperationId:creationOperationIds[key]}:{menuId:id,beforeVersion:versions.get(id)})};
            need(canonical(c.resource)===canonical(r));if(kind==='CREATE'){addCreated(c);t3Created.set(key,c.createdId);}else versions.set(id,versions.get(id)+(kind==='PUBLISH'?3:1));
            counts.menuWrites++;if(kind==='CREATE')counts.createAttempts++;prior.set(c.id,{...c,state:c.state==='CONFIRMED_RESPONSE_AND_READBACK'?'FORWARD_CONSUMED':c.state});
        };
        if(!prefix)for(const key of ['M05','M06','M07','M08'])coreIntent('T2',key,'STOP',snapshot.claims.find(c=>c.id==='T2_'+key+'_CREATE').createdId);
        for(let n=1;n<=8;n++){const key='M0'+n;if(n>2)coreIntent('T3',key,'CREATE');coreIntent('T3',key,'PUBLISH',t3Created.get(key));}
        for(const key of ['M01','M05','M02','M03','M04','M06','M07','M08'])coreIntent('T3',key,'STOP',t3Created.get(key));
        const core=[['RESUME_T4_CREATE','MENU_CREATE','S1','T4'],['RESUME_T4_INITIAL_PUBLISH','MENU_WRITE','S1','T4','PUBLISH'],['RESUME_T4_STOP','MENU_WRITE','S1','T4','STOP']];
        for(const [label,owner] of [['PRICE','S1'],['STOP','S2'],['SILENT','S2']]){
            core.push(['CONTROL_'+label+'_CREATE','MENU_CREATE',owner,label],['CONTROL_'+label+'_PUBLISH','MENU_WRITE',owner,label,'PUBLISH']);
            if(label==='PRICE')core.push(['CONTROL_PRICE_ONLY','MENU_WRITE',owner,label,'SAVE']);
            core.push([label==='STOP'?'CONTROL_STOP_ONLY':'CONTROL_'+label+'_FINAL_PRIVATE','MENU_WRITE',owner,label,'STOP']);
        }
        const armCore={id:'RESUME_REMAINDER_CORE',zone:'CORE'};
        predicateStage='REMAINDER_CORE';
        for(const [id,kind,owner,label,action] of core){const c=claim();need(c.id===id&&c.kind===kind&&c.owner===owner&&c.arm===armCore.id&&c.zone==='CORE'&&c.mode==='DELIVER'&&c.state==='CONFIRMED_RESPONSE_AND_READBACK');
            validateResource(c,known,prior,armCore,s.serviceArms);
            if(kind==='MENU_CREATE'){addCreated(c);coreCreated.set(label,c.createdId);}else{need(c.resource.menuId===coreCreated.get(label)&&c.resource.beforeVersion===versions.get(c.resource.menuId));versions.set(c.resource.menuId,versions.get(c.resource.menuId)+(action==='PUBLISH'?3:1));}
            for(const [f,n] of Object.entries(deltaFor(c.kind,c.mode)))counts[f]+=n;prior.set(c.id,{...c,state:c.state==='CONFIRMED_RESPONSE_AND_READBACK'?'FORWARD_CONSUMED':c.state});
        }
        predicateStage='DENIALS';for(let i=0;i<10;i++){const c=claim();need(c.kind==='DENIAL'&&c.arm===armCore.id&&c.zone==='CORE'&&c.mode==='DELIVER'&&c.state==='FORWARD_CONSUMED');
            validateResource(c,known,prior,armCore,s.serviceArms);if(c.resource.beforeVersion!==undefined)need(c.resource.beforeVersion===versions.get(c.resource.menuId)-(['STALE_EDIT','STALE_STOP'].includes(c.resource.purpose)?1:0));prior.set(c.id,{...c,state:c.state==='CONFIRMED_RESPONSE_AND_READBACK'?'FORWARD_CONSUMED':c.state});counts.denialRequests++;}
        const denials=s.newClaims.filter(c=>c.kind==='DENIAL');need(['S1','S2'].every(owner=>denials.filter(c=>c.owner===owner&&c.resource.purpose.startsWith('CROSS_OWNER_')).length===4)
            &&denials.filter(c=>c.resource.purpose.startsWith('STALE_')).length===2);
        const derivedBindings=[];
        for(const [i,a] of s.serviceArms.entries()){
            predicateStage='SERVICE_ARM_'+(i+1);
            const local=[];while(cursor<s.newClaims.length&&s.newClaims[cursor].arm===a.id){const c=claim();predicateStage='SERVICE_CLAIM_'+(['PRIMARY','SETUP_CREATE','SETUP_PUBLISH','SETUP_UPLOAD','FOLLOWUP_SAVE','FOLLOWUP_PUBLISH','CLEANUP','RESTORE','RESTORE_PRIOR_SHOP'].includes(c.resource?.purpose)?c.resource.purpose:'UNKNOWN');need(c.zone==='SERVICE'&&c.owner==='S1');validateResource(c,known,prior,a,s.serviceArms);
                need(c.mode==='BLOCK_BEFORE_FORWARD'?c.state==='AUTHORIZED_ONCE':['FORWARD_CONSUMED','CONFIRMED_RESPONSE_AND_READBACK'].includes(c.state));
                if(c.kind==='MENU_CREATE'&&c.mode!=='BLOCK_BEFORE_FORWARD')addCreated(c);else need(c.createdId===undefined);
                if(c.kind==='MENU_WRITE'&&c.mode!=='BLOCK_BEFORE_FORWARD'){need(c.resource.beforeVersion===versions.get(c.resource.menuId));versions.set(c.resource.menuId,versions.get(c.resource.menuId)+(['SETUP_PUBLISH','FOLLOWUP_PUBLISH'].includes(c.resource.purpose)?3:1));}
                for(const [f,n] of Object.entries(deltaFor(c.kind,c.mode)))counts[f]+=n;prior.set(c.id,{...c,state:c.state==='CONFIRMED_RESPONSE_AND_READBACK'?'FORWARD_CONSUMED':c.state});local.push(c);
            }
            predicateStage='SERVICE_OPERATION_IDS';need(canonical(a.operationIds)===canonical(local.map(c=>c.id)));
            for(const cellId of arms[i]){
                predicateStage='CELL_'+cellId;const cell=serviceCells.find(c=>c.id===cellId),cc=local.filter(c=>c.cellId===cellId),primary=cc.find(c=>c.resource.purpose==='PRIMARY');need(primary);
                const purposes=['PRIMARY'];if(['MENU_SAVE','STOP','MENU_UPLOAD'].includes(cell.kind))purposes.push('SETUP_CREATE');if(cell.kind==='STOP')purposes.push('SETUP_PUBLISH');
                if(cellId==='MENU_CREATE_DELIVER')purposes.push('SETUP_UPLOAD');if(cellId==='MENU_UPLOAD_DELIVER')purposes.push('FOLLOWUP_SAVE');
                if(cell.mode==='DELIVER'&&['MENU_CREATE','MENU_UPLOAD'].includes(cell.kind))purposes.push('FOLLOWUP_PUBLISH','CLEANUP');
                if(cellId==='STOP_BLOCK_BEFORE_FORWARD')purposes.push('CLEANUP');if(cellId==='SHOP_SAVE_DELIVER')purposes.push('RESTORE');
                need(canonical(cc.map(c=>c.resource.purpose).sort())===canonical(purposes.sort()));
                const setup=cc.find(c=>c.resource.purpose==='SETUP_CREATE');if(setup&&['MENU_SAVE','STOP'].includes(cell.kind))need(primary.resource.menuId===setup.createdId);
                if(setup)need(cc.filter(c=>c.kind==='MENU_WRITE').every(c=>c.resource.menuId===setup.createdId));
            }
            need(local.every(c=>arms[i].includes(c.cellId)||(i===5&&c.resource.purpose==='RESTORE_PRIOR_SHOP')));
            const bindings=local.map(c=>({operationId:c.id,kind:c.kind,mode:c.mode,owner:c.owner,resource:c.resource})),digest=sha(bindings);
            for(const c of local.filter(c=>c.createdId))derivedBindings.push({id:c.createdId,operationId:c.id,creationOperationId:c.resource.creationOperationId,owner:c.owner,armId:a.id,resourcesSha256:digest});
        }
        predicateStage='COUNTS';need(cursor===s.newClaims.length&&canonical(counts)===canonical(s.counts));for(const f of Object.keys(counts))need(counts[f]<=approval.limits[f]);
        need(Array.isArray(s.knownFixtures)&&s.knownFixtures.length===known.size&&new Set(s.knownFixtures.map(f=>f.id)).size===known.size);
        for(const f of s.knownFixtures){need(Object.keys(f).every(key=>['id','owner','zone','key','scenario'].includes(key))&&known.get(f.id)?.owner===f.owner
            &&(f.zone===undefined||f.zone===known.get(f.id)?.zone));}
        const last=s.serviceArms.at(-1),lastClaims=s.newClaims.filter(c=>c.arm===last.id),lastBindings=lastClaims.map(c=>({operationId:c.id,kind:c.kind,mode:c.mode,owner:c.owner,resource:c.resource}));
        need(canonical(s.terminalCreationBindings)===canonical(derivedBindings.filter(b=>b.armId!==last.id)));
        need(Array.isArray(s.stopReservations)&&new Set(s.stopReservations).size===s.stopReservations.length&&s.stopReservations.every(id=>last.currentCell==='STOP_WITHHOLD_AFTER_RESPONSE'&&lastClaims.some(c=>c.resource.purpose==='PRIMARY'&&c.resource.menuId===id)));
        predicateStage='INDEPENDENT_PROOF';need(p.source==='INDEPENDENT_READ_ONLY'&&p.readOnly===true&&p.project==='patient-heart-55595249'&&p.branch==='br-flat-wildflower-aoeragrs'&&p.database==='clearallergy_main19'
            &&p.applicationSha===target.source&&p.deployment===target.deployment&&p.originalTerminal===true&&p.unknownResolved===true&&p.sessionsClosed===true&&p.pendingRequests===0
            &&p.fullCheckpointSha256===sha(x)&&p.sourceGithubRunId===x.source.githubRunId&&p.sourceRunnerSha===x.source.runnerSha&&p.sourceArtifactSha256===x.source.artifactSha256
            &&p.armId===last.id&&canonical(p.operationIds)===canonical(last.operationIds)&&p.resourcesSha256===sha(lastBindings));
        need(iso(p.observedUtc)&&Date.parse(p.observedUtc)<=now&&now-Date.parse(p.observedUtc)<=3600000&&p.globalSessionConsumption===counts.sessions);
        predicateStage='SQL_ROWS';const rows=p.knownFixtureRows;need(Array.isArray(rows)&&rows.length===known.size&&new Set(rows.map(r=>r.id)).size===known.size);
        for(const r of rows){need(known.get(r.id)?.owner===r.owner&&r.isPublished===false&&r.version===versions.get(r.id)&&Number.isSafeInteger(r.foodVersion)
            &&(r.publicationConfirmedFoodVersion===null||Number.isSafeInteger(r.publicationConfirmedFoodVersion))&&r.reviewedFoodVersion===null&&hex(r.foodSha256)&&hex(r.reviewsSha256));}
        need(Array.isArray(s.privateBindings)&&new Set(s.privateBindings.map(b=>b.id)).size===s.privateBindings.length);
        for(const b of s.privateBindings)need(canonical(rows.find(r=>r.id===b.id))===canonical(b));
        need(Array.isArray(s.closedOwnerPrivateBindings)&&s.closedOwnerPrivateBindings.length===[...known.values()].filter(f=>f.owner==='S2').length);
        need(p.closedOwnerPrivateBindingsMatch===true&&p.closedOwnerPrivateBindingsSha256===sha(s.closedOwnerPrivateBindings)
            &&canonical(p.closedOwnerPrivateIds)===canonical(s.closedOwnerPrivateBindings.map(b=>b.id)));
        for(const b of s.closedOwnerPrivateBindings)need(b.owner==='S2'&&canonical(rows.find(r=>r.id===b.id))===canonical(b));
        predicateStage='SESSIONS';exact(x.sessionLedger,['version','baselineConsumed','attempts']);need(x.sessionLedger.version===1&&x.sessionLedger.baselineConsumed===7&&x.sessionLedger.attempts.length===k+(prefix?3:1));
        if(prefix)need(canonical(x.sessionLedger.attempts.slice(0,2))===canonical(prefix.sessionLedger.attempts));
        const sessionIds=new Set();x.sessionLedger.attempts.forEach((a,i)=>{exact(a,['index','owner','sessionId','providerCreatedUtc','providerStatus','terminated','localClosed','sourceGithubRunId','runnerSha']);
            need(a.index===i+1&&a.owner===((i===1||prefix&&i===3)?'S2':'S1')&&/^sess_[A-Za-z0-9]{1,128}$/.test(a.sessionId)&&!sessionIds.has(a.sessionId)
                &&iso(a.providerCreatedUtc)&&Date.parse(a.providerCreatedUtc)>=Date.parse('2026-11-02T18:42:53.901Z')&&Date.parse(a.providerCreatedUtc)<=Date.parse(p.observedUtc)&&['removed','ended','revoked','expired','abandoned','replaced'].includes(a.providerStatus)
                &&a.terminated===true&&a.localClosed===true&&/^\d{1,20}$/.test(a.sourceGithubRunId)&&a.runnerSha===x.source.runnerSha);sessionIds.add(a.sessionId);});
        predicateStage='PREPARATION';const prep=x.preparationState;need(prep&&prep.version===1&&prep.runId===s.serviceRunId&&Object.keys(prep).every(f=>['version','runId','cells','normalShopObject'].includes(f))
            &&prep.cells&&canonical(Object.keys(prep.cells).sort())===canonical([...selected].sort()));
        const {projectOriginalPayloads}=createRequire(import.meta.url)('tsx/cjs/api').require('./issue118-batch-stop.ts',import.meta.url);
        const template=projectOriginalPayloads(s.serviceRunId).expectedByMenu.M04;
        const object=ref=>{exact(ref,['url','pathname','objectSha256','requestId','kind']);const u=new URL(ref.url);need(u.href===ref.url&&u.origin==='https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com'
            &&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&!u.pathname.includes('%')&&u.pathname==='/'+ref.pathname&&uuid(ref.requestId)
            &&ref.objectSha256===createHash('sha256').update(ref.url).digest('hex')&&['menu','shop'].includes(ref.kind)
            &&u.pathname.startsWith(ref.kind==='menu'?'/menu-images/'+target.shop+'/':'/shops/'+target.shop+'/cover-'));};
        for(const cellId of selected){const e=prep.cells[cellId],cell=serviceCells.find(c=>c.id===cellId);need(e&&e.kind===cell.kind&&e.mode===cell.mode
            &&Object.keys(e).every(f=>['status','kind','mode','fixtureFood','creationOperationId','menuId','lastKnown','setupObject','knownObject','restoreOriginal','primaryClaimId','expectedOwnAfterSha256','expectedOwnUpdatedAt','finishStarted','restoreAttempted'].includes(f)));
            need(['KNOWN_PRIVATE_NOT_LIVE_PASS','KNOWN_AND_RESTORED_NOT_LIVE_PASS','UPLOAD_ACK_SAVE_PARKED','NO_FORWARD_PROVEN_CLIENT_UNKNOWN','HOLD_TERMINAL_RECONCILIATION_REQUIRED','RESTORED_AFTER_INDEPENDENT_TERMINAL'].includes(e.status));
            if(!cell.kind.startsWith('SHOP'))need(canonical(e.fixtureFood)===canonical({...template,name:`【架空・Issue118 service】${s.serviceRunId} ${cellId} M04`,imageUrl:null}));
            if(e.lastKnown!==undefined){exact(e.lastKnown,['version','foodVersion','isPublished']);need(Number.isSafeInteger(e.lastKnown.version)&&e.lastKnown.version>=0&&Number.isSafeInteger(e.lastKnown.foodVersion)&&e.lastKnown.foodVersion>=0&&typeof e.lastKnown.isPublished==='boolean');}
            for(const field of ['finishStarted','restoreAttempted'])if(e[field]!==undefined)need(typeof e[field]==='boolean');
            if(e.menuId!==undefined)need(known.get(e.menuId)?.owner==='S1');if(e.creationOperationId!==undefined)need(creationIds.has(e.creationOperationId));
            for(const field of ['setupObject','knownObject'])if(e[field])object(e[field]);
            if(e.restoreOriginal){exact(e.restoreOriginal,['note','coverImageUrl']);need(e.restoreOriginal.note===null||typeof e.restoreOriginal.note==='string');need(e.restoreOriginal.coverImageUrl===null||typeof e.restoreOriginal.coverImageUrl==='string');}
            if(e.expectedOwnAfterSha256!==undefined)need(hex(e.expectedOwnAfterSha256)&&iso(e.expectedOwnUpdatedAt));
            if(cell.mode==='WITHHOLD_AFTER_RESPONSE'){const primary=last.currentCell===cellId?lastClaims.find(c=>c.cellId===cellId&&c.resource.purpose==='PRIMARY'):s.newClaims.find(c=>c.cellId===cellId&&c.resource.purpose==='PRIMARY');
                need(e.primaryClaimId===primary?.id);if(cell.kind.endsWith('_UPLOAD'))need(e.knownObject);if(cell.kind==='SHOP_SAVE')need(e.expectedOwnAfterSha256&&e.restoreOriginal);}
        }
        for(const row of rows.filter(r=>!s.privateBindings.some(b=>b.id===r.id))){
            const created=lastClaims.find(c=>c.createdId===row.id);need(created&&created.cellId===last.currentCell);
            const entry=prep.cells[last.currentCell],food={...entry.fixtureFood,...(last.currentCell==='MENU_SAVE_WITHHOLD_AFTER_RESPONSE'?{priceYen:801}:{})};
            need(row.foodSha256===sha(food)&&row.foodVersion===29&&row.reviewedFoodVersion===null&&row.reviewsSha256===sha([])
                &&row.publicationConfirmedFoodVersion===(last.currentCell==='STOP_WITHHOLD_AFTER_RESPONSE'?29:null));
        }
        if(prep.normalShopObject)object(prep.normalShopObject);
        need(p.blobOutcomesKnown===true&&p.shopStateMatched===true&&p.allMenuHistoryMatched===true);
        return {controller:s,preparationState:prep,sessionLedger:x.sessionLedger,source:x.source,nextArmIndex:k,
            verifiedBindings:derivedBindings,knownFixtureRows:rows,checkpointSha256:sha(x),receipt:continuationReceipt};
    }catch{refuse();}
}

export function prepareManaged414953Resume({snapshot,terminal,approval,creationOperationIds,ports,fullCheckpoint,continuationReceipt,prefixCheckpoint,prefixReceipt}={}) {
    const reject=code=>{throw Error(code);},must=(v,code='RESUME_414953_REFUSED')=>{if(!v)reject(code);};
    const fullT2=approval?.scope===completionScope,plan=(fullT2?planManagedT2Completion:planManaged414953Recovery)({snapshot,terminal});
    const prefixData=fullCheckpoint?.controller?.t2Prefix??(prefixCheckpoint?{checkpoint:prefixCheckpoint,receipt:prefixReceipt}:null);
    const prefix=fullT2?validateT2PrefixCheckpoint({snapshot,terminal,authorization:approval,prefixCheckpoint:prefixData?.checkpoint,prefixReceipt:prefixData?.receipt,historical:fullCheckpoint!==undefined}):null;
    must(approval?.status==='APPROVED'&&['RESUME_414953_B4_T3_ONLY','RESUME_414953_FULL_MANAGED',completionScope].includes(approval.scope),'RESUME_414953_APPROVAL_REQUIRED');
    must(canonical(approval.limits)===canonical(plan.reservedMaximum)&&approval.oldClaimsSha256===plan.inherited.claimsSha256,'RESUME_414953_APPROVAL_REQUIRED');
    const newKeys=['M03','M04','M05','M06','M07','M08'],newIds=structuredClone(creationOperationIds);
    must(newIds&&Object.keys(newIds).length===6&&newKeys.every(k=>uuid(newIds[k]))
        &&new Set(Object.values(newIds)).size===6&&Object.values(newIds).every(id=>!plan.inherited.creationOperationIds.includes(id)));
    must(approval.creationIdsSha256===createHash('sha256').update(canonical(newIds)).digest('hex'),'RESUME_414953_APPROVAL_REQUIRED');
    const restored=fullCheckpoint===undefined?null:validateManagedFullCheckpoint({snapshot,terminal,approval,creationOperationIds,fullCheckpoint,continuationReceipt});
    const required=['verifyApproval','verifyCheckpoint','reserveRecoveryBudget','installSendGuard','claimOperation','readMenu','write','observeT3Evidence'];
    must(required.every(name=>typeof ports?.[name]==='function'),'RESUME_414953_PORT_NOT_IMPLEMENTED');
    const original=structuredClone(snapshot),baseline=structuredClone(terminal),approved=structuredClone(approval),limit=structuredClone(approval.limits);
    must(baseline.menus.every(m=>Number.isSafeInteger(m.version)&&m.version>=0&&Number.isSafeInteger(m.foodVersion)&&m.foodVersion>=0));
    const known=new Map(original.fixtures.map(f=>[f.id,{...f}])),states=new Map(),newClaims=[],stopReservations=new Set(baseline.menus.filter(m=>m.isPublished).map(m=>m.id));
    const counts={menus:11,createAttempts:11,menuWrites:prefix?78:42,shopWrites:0,blobUploads:0,sessions:prefix?9:7};
    if(prefix){stopReservations.clear();for(const r of prefix.rows){const m=baseline.menus.find(m=>m.id===r.id);Object.assign(m,r);}}
    const seenRequestIds=new Set([...terminal.consumedRequestIds,...(prefix?prefix.controller.claims.map(c=>c.requestId):[])]);
    const byKey=new Map(),inheritedKeys=new Map();for(const c of original.claims.filter(c=>c.kind==='MENU_CREATE')){
        const match=/^(T[23])_(M0[1-8])_CREATE$/.exec(c.id);if(match){inheritedKeys.set(c.createdId,{scenario:match[1],key:match[2]});if(match[1]==='T3')byKey.set(match[2],c.createdId);}
    }
    let phase='PREPARED_NOT_AUTHORIZED',initialized=false,used=false,held=false,current,guard,removed=false,remainderUsed=false,remainderStage;
    const remainderPending=new Map(),serviceArms=[],serviceObservations=[],terminalCreationBindings=[],completedStages=[],closedOwnerPrivate=new Map(),privateBindings=new Map(),restoredExpectedPrivate=new Map();
    let closedOwnerSqlVerified=false,remainderAuthorizing=false,remainderOutstanding,activeServiceRunId=null;
    const ownerFor=key=>Number(key.slice(1))<=4?'S1':'S2';
    const hold=code=>{held=true;phase=code;};
    const safeSnapshot=()=>({checkpointVersion:1,applicationSha:target.source,deployment:target.deployment,approvedScope:approved.scope,serviceRunId:activeServiceRunId,
        status:phase,livePass:false,coverage:'NOT_ATTESTED',publicPropagation:'NOT_ATTESTED',
        originalHold:original.status,inheritedClaimsSha256:plan.inherited.claimsSha256,inheritedOperationClaimIds:[...plan.inherited.operationClaimIds],
        inheritedRequestIds:[...plan.inherited.consumedRequestIds],counts:{...counts},newClaims:structuredClone(newClaims),
        knownFixtures:[...known.values()].map(f=>({...f})),stopReservations:[...stopReservations],
        sessionReservations:{normal:{S1:1,S2:1},recovery:{S1:1,S2:1},actualConsumption:'ROOT_TRACKED_NOT_ATTESTED'},
        automaticRetry:false,automaticCleanup:false,remainingNotImplemented:['RESUME_414953_FULL_MANAGED',completionScope].includes(approved.scope)?[]
            :['T4_OBSERVER','CONTROLS_OBSERVATIONS','DENIALS','SERVICE_BROWSER_OBSERVERS'],
        remainingNotRun:['T4_OBSERVER','CONTROLS_OBSERVATIONS','DENIALS','SERVICE_BROWSER_OBSERVERS'].filter(s=>!completedStages.includes(s)),
        evidenceGaps:prefix?[]:['T2_PUBLIC_PROPAGATION_AND_INTERMEDIATE_UI'],serviceArms:structuredClone(serviceArms),
        serviceOwnerBPrivacyEvidence:closedOwnerSqlVerified?'INDEPENDENT_SQL_BINDING_MATCH_NOT_FRESH_API':'PRIOR_CORE_API_READBACK_ONLY_NOT_FRESH_AFTER_B_SESSION_CLOSE',
        serviceObservations:structuredClone(serviceObservations),terminalCreationBindings:structuredClone(terminalCreationBindings),
        completedStages:[...completedStages],closedOwnerPrivateBindings:[...closedOwnerPrivate.values()].sort((a,b)=>a.id.localeCompare(b.id)),
        privateBindings:[...privateBindings.values()].sort((a,b)=>a.id.localeCompare(b.id)),
        fullCrossJobRestore:'VERIFY_DATA_CHECKPOINT_AND_FRESH_INDEPENDENT_TERMINAL_BEFORE_AUTH',
        t2Prefix:prefixData?structuredClone(prefixData):null,
        restoredFrom:restored?{checkpointSha256:restored.checkpointSha256,originalStatus:restored.controller.status,nextArmIndex:restored.nextArmIndex}:null});
    if(restored){
        known.clear();for(const f of restored.controller.knownFixtures)known.set(f.id,structuredClone(f));
        Object.assign(counts,restored.controller.counts);newClaims.push(...structuredClone(restored.controller.newClaims));
        serviceArms.push(...structuredClone(restored.controller.serviceArms));serviceArms.at(-1).terminalVerified=true;
        serviceObservations.push(...structuredClone(restored.controller.serviceObservations));
        terminalCreationBindings.push(...structuredClone(restored.verifiedBindings));completedStages.push(...restored.controller.completedStages);
        for(const b of restored.controller.closedOwnerPrivateBindings)closedOwnerPrivate.set(b.id,structuredClone(b));
        for(const b of restored.knownFixtureRows){privateBindings.set(b.id,structuredClone(b));if(b.owner==='S1')restoredExpectedPrivate.set(b.id,structuredClone(b));}
        stopReservations.clear();closedOwnerSqlVerified=true;used=true;activeServiceRunId=restored.controller.serviceRunId;
    }
    const same=(a,b)=>canonical(a)===canonical(b);
    const boundary={
        async authorize(value){
            if(!current)return authorizeRemainder(value);
            try{const intent=current;must(initialized&&!held&&intent?.live&&!intent.claimed&&!intent.authorizing&&same(value,intent.claim));intent.authorizing=true;
            must(counts.menuWrites+1+stopReservations.size-(intent.actionKind==='STOP'?1:0)+1<=limit.menuWrites);
            if(intent.actionKind==='CREATE')must(counts.menus<limit.menus&&counts.createAttempts<limit.createAttempts);
            if(intent.actionKind==='PUBLISH'){
                must(await ports.reserveRecoveryBudget({type:'STOP_WRITE',scope:approved.scope,menuId:intent.resource.menuId,owner:intent.claim.owner,
                    sourceClaimId:intent.claim.id,slots:1})===true);must(current===intent&&intent.live&&!held);stopReservations.add(intent.resource.menuId);
            }
            must(await ports.claimOperation(structuredClone(intent.claim))===true);must(current===intent&&intent.live&&!held);
            intent.claimed=true;intent.record={...structuredClone(intent.claim),state:'AUTHORIZED_ONCE'};newClaims.push(intent.record);
            return {id:intent.claim.id,resource:structuredClone(intent.resource),allowedForward:true};
            }catch{hold('HOLD_SEND_AUTHORIZATION_OR_RESERVATION');reject('RESUME_414953_HELD');}
        },
        consumeSendPermission(value){
            if(!current)return consumeRemainder(value);
            try{const intent=current;must(initialized&&!held&&intent?.live&&intent.claimed&&!intent.consumed
                &&value.id===intent.claim.id&&same(value.resource,intent.resource));
            intent.consumed=true;intent.record.state='FORWARD_CONSUMED';counts.menuWrites++;
            if(intent.actionKind==='CREATE')counts.createAttempts++;
            }catch{hold('HOLD_SEND_CONSUMPTION_MISMATCH');reject('RESUME_414953_HELD');}
        },
        async recordCreated({operationId,id}){
            if(!current)return recordRemainderCreated({operationId,id});
            try{const intent=current;must(!held&&intent?.live&&intent.consumed&&intent.actionKind==='CREATE'&&operationId===intent.claim.id
                &&menuId(id)&&!forbiddenMenu(id)&&!known.has(id)&&!intent.createdId);
            intent.createdId=id;intent.record.createdId=id;known.set(id,{id,owner:intent.claim.owner,zone:'CORE',key:intent.key});
            byKey.set(intent.key,id);counts.menus++;
            }catch{hold('HOLD_CREATE_ID_MISMATCH');reject('RESUME_414953_HELD');}
        },
    };
    const read=async(id,owner,key,first=false,scenario='T3')=>{
        must(initialized&&!held);const checkpoint=first?baseline.menus.find(m=>m.id===id):undefined;
        const result=await ports.readMenu({id,owner,key,scenario,...(checkpoint?{checkpoint:structuredClone(checkpoint)}:{})});
        const m=result?.menu;must(m?.id===id&&known.get(id)?.owner===owner&&Number.isSafeInteger(m.version)&&m.version>=0
            &&Number.isSafeInteger(m.foodVersion)&&m.foodVersion>=0&&typeof m.isPublished==='boolean');
        if(m.isPublished)must(m.publicationConfirmedFoodVersion===m.foodVersion);
        if(first)must(result.checkpointMatches===true&&m.version===checkpoint.version&&m.foodVersion===checkpoint.foodVersion&&m.isPublished===checkpoint.isPublished);
        states.set(id,structuredClone(m));return m;
    };
    const mutate=async(kind,key,owner,id,scenario='T3')=>{
        must(initialized&&!held&&!current);const before=kind==='CREATE'?undefined:states.get(id);must(kind==='CREATE'||before);
        if(before)must(same(await read(id,owner,key,false,scenario),before));
        const resource={method:kind==='CREATE'||kind==='STOP'?'POST':'PUT',path:kind==='CREATE'?'/api/admin/menus':'/api/admin/menus/'+id+(kind==='STOP'?'/stop':''),
            shopId:owner==='S1'?target.shop:'cmvs4x9h80011wn0w7s8abaie',purpose:'CORE',
            ...(kind==='CREATE'?{creationOperationId:newIds[key]}:{menuId:id,beforeVersion:before.version})};
        const claim={id:'RESUME414953_'+scenario+'_'+key+'_'+kind,kind:kind==='CREATE'?'MENU_CREATE':'MENU_WRITE',owner,resource};
        must(!plan.inherited.operationClaimIds.includes(claim.id)&&!newClaims.some(c=>c.id===claim.id));
        if(kind==='PUBLISH')must(before.isPublished===false);if(kind==='STOP')must(before.isPublished===true&&stopReservations.has(id));
        const intent={live:true,key,actionKind:kind,claim,resource,claimed:false,consumed:false};current=intent;
        try{
            const response=await ports.write({claim:structuredClone(claim),resource:structuredClone(resource),payloadIntent:{kind,key,scenario}});
            must(intent.consumed&&response?.status===(kind==='CREATE'?201:200)&&uuid(response.requestId)&&!seenRequestIds.has(response.requestId));seenRequestIds.add(response.requestId);
            if(kind==='CREATE')must(intent.createdId&&response.createdId===intent.createdId);
            const actualId=kind==='CREATE'?intent.createdId:id,menu=await read(actualId,owner,key,false,scenario);
            must(response.menu?.id===actualId&&same(response.menu,menu));
            if(kind==='CREATE')must(menu.isPublished===false);
            else{
                must(menu.version===before.version+(kind==='PUBLISH'?3:1)&&menu.foodVersion===before.foodVersion&&menu.isPublished===(kind==='PUBLISH'));
                const stable=m=>{const v=structuredClone(m);for(const field of ['version','isPublished','publicationConfirmedFoodVersion','updatedAt'])delete v[field];return v;};
                must(same(stable(menu),stable(before)));
                if(before.updatedAt!==undefined)must(Number.isFinite(Date.parse(menu.updatedAt))&&Date.parse(menu.updatedAt)>=Date.parse(before.updatedAt));
                must(menu.publicationConfirmedFoodVersion===(kind==='PUBLISH'?menu.foodVersion:before.publicationConfirmedFoodVersion));
            }
            intent.record.state='CONFIRMED_RESPONSE_AND_READBACK';intent.record.requestId=response.requestId;
            if(kind==='STOP')stopReservations.delete(actualId);return actualId;
        }catch{hold('HOLD_RESULT_OR_CONFLICT_REQUIRES_INDEPENDENT_TERMINAL');reject('RESUME_414953_HELD');}
        finally{intent.live=false;current=undefined;}
    };
    const initialize=async()=>{
        must(!initialized&&!held&&phase==='PREPARED_NOT_AUTHORIZED');phase='VERIFYING_APPROVAL_AND_CHECKPOINT';
        try{
            must(await ports.verifyApproval({approval:structuredClone(approved),creationOperationIds:structuredClone(newIds),plan:structuredClone(plan)})===true);
            must(await ports.verifyCheckpoint({snapshot:structuredClone(original),terminal:structuredClone(baseline),claimsSha256:plan.inherited.claimsSha256})===true);
            if(restored){
                must(await ports.reserveRecoveryBudget({type:'CONTINUATION_RESERVATIONS',scope:approved.scope,limits:structuredClone(limit),
                    normal:{S1:6-restored.nextArmIndex,S2:0},recovery:{S1:1,S2:1},priorSessionConsumption:counts.sessions,
                    checkpointSha256:restored.checkpointSha256,oldClaimsSha256:plan.inherited.claimsSha256})===true);
                initialized=true;phase='RESTORED_SERVICE_TERMINAL_READY';return safeSnapshot();
            }
            must(await ports.reserveRecoveryBudget({type:'OWNER_SESSIONS',scope:approved.scope,limits:structuredClone(limit),
                normal:{S1:1,S2:1},recovery:{S1:1,S2:1},oldClaimsSha256:plan.inherited.claimsSha256})===true);
            for(const id of stopReservations)must(await ports.reserveRecoveryBudget({type:'STOP_WRITE',scope:approved.scope,menuId:id,
                owner:known.get(id).owner,sourceClaimId:'INHERITED_PUBLIC',slots:1})===true);
            guard=await ports.installSendGuard(boundary);must(guard?.beforeSend===true&&typeof guard.remove==='function');
            initialized=true;phase='RESERVED_READY_NO_AUTH_PERFORMED';return safeSnapshot();
        }catch{hold('HOLD_APPROVAL_CHECKPOINT_OR_RESERVATION');reject('RESUME_414953_HELD');}
    };
    const authorizeRemainder=async value=>{
        let authorizationStage='BINDING';
        try{
            must(initialized&&!held&&remainderUsed&&remainderStage&&['RESUME_414953_FULL_MANAGED',completionScope].includes(approved.scope));
            must(!remainderAuthorizing&&!remainderOutstanding);remainderAuthorizing=true;
            must(value&&Object.keys(value).every(k=>['id','kind','owner','mode','cellId','resource'].includes(k))&&safeKey(value.id));
            must(!original.claims.some(c=>c.id===value.id)&&!newClaims.some(c=>c.id===value.id)&&!remainderPending.has(value.id));
            const stage=remainderStage,claim={...structuredClone(value),mode:value.mode??'DELIVER',arm:stage.arm.id,zone:stage.arm.zone};
            if(stage.expected){const expected=stage.expected[stage.index];must(expected&&claim.id===expected.id&&claim.kind===expected.kind&&claim.owner===expected.owner);}
            if(stage.cell)must(claim.cellId===stage.cell.id||claim.resource.purpose==='RESTORE_PRIOR_SHOP');
            const previous=new Map([...original.claims,...newClaims].map(c=>[c.id,c]));
            authorizationStage='RESOURCE';validateResource(claim,known,previous,stage.arm,serviceArms);
            authorizationStage='FRESH_STATE';
            const fresh=await ports.verifyResourceBeforeForward({claim:structuredClone(claim),stage:stage.name});
            must(!held&&remainderStage===stage);
            if(claim.kind==='MENU_CREATE')must(fresh?.creationOperationFresh===true&&counts.menus<limit.menus);
            if(['MENU_WRITE','DENIAL'].includes(claim.kind)){
                must(fresh?.menu?.id===claim.resource.menuId&&known.get(fresh.menu.id));
                if(claim.resource.beforeVersion!==undefined)must(fresh.menu.version===claim.resource.beforeVersion+
                    (claim.kind==='DENIAL'&&['STALE_EDIT','STALE_STOP'].includes(claim.resource.purpose)?1:0));
                if(!fresh.menu.isPublished&&stopReservations.has(fresh.menu.id))stopReservations.delete(fresh.menu.id);
            }
            if(claim.kind==='SHOP_WRITE')must(fresh?.shop?.id===target.shop&&fresh.shop.updatedAt===claim.resource.beforeUpdatedAt);
            if(claim.kind==='BLOB_UPLOAD')must(fresh?.uploadTargetValidated===true);
            const publish=claim.kind==='MENU_WRITE'&&(['SETUP_PUBLISH','FOLLOWUP_PUBLISH'].includes(claim.resource.purpose)
                ||stage.expected?.[stage.index]?.publication===true);
            if(publish){must(await ports.reserveRecoveryBudget({type:'STOP_WRITE',scope:approved.scope,menuId:claim.resource.menuId,owner:claim.owner,sourceClaimId:claim.id,slots:1})===true);
                stopReservations.add(claim.resource.menuId);}
            authorizationStage='BUDGET';const delta=deltaFor(claim.kind,claim.mode),isStop=claim.kind==='MENU_WRITE'&&claim.resource.method==='POST';
            must(counts.menuWrites+(delta.menuWrites||0)+stopReservations.size-(isStop?1:0)+1<=limit.menuWrites);
            must(counts.shopWrites+(delta.shopWrites||0)+1<=limit.shopWrites&&counts.blobUploads+(delta.blobUploads||0)<=limit.blobUploads);
            must(counts.createAttempts+(delta.createAttempts||0)<=limit.createAttempts&&(counts.denialRequests||0)+(delta.denialRequests||0)<=10);
            const slot={claim,stage,delta,claimed:false,consumed:false};remainderPending.set(claim.id,slot);
            authorizationStage='DURABLE_CLAIM';must(await ports.claimOperation(structuredClone(claim))===true);must(!held&&remainderStage===stage);
            slot.claimed=true;slot.record={...claim,state:'AUTHORIZED_ONCE'};newClaims.push(slot.record);stage.arm.operationIds.push(claim.id);
            if(claim.mode==='BLOCK_BEFORE_FORWARD'){counts.createAttempts+=delta.createAttempts||0;stage.index++;}
            else remainderOutstanding=claim.id;
            return {id:claim.id,allowedForward:claim.mode!=='BLOCK_BEFORE_FORWARD',resource:structuredClone(claim.resource)};
        }catch{hold('HOLD_REMAINDER_AUTHORIZATION_'+authorizationStage);reject('RESUME_414953_HELD');}
        finally{remainderAuthorizing=false;}
    };
    const consumeRemainder=value=>{
        try{const slot=remainderPending.get(value?.id);must(!held&&slot?.claimed&&!slot.consumed&&slot.stage===remainderStage
            &&!remainderAuthorizing&&remainderOutstanding===slot.claim.id
            &&slot.claim.mode!=='BLOCK_BEFORE_FORWARD'&&same(value.resource,slot.claim.resource));
            const isStop=slot.claim.kind==='MENU_WRITE'&&slot.claim.resource.method==='POST';
            must(counts.menuWrites+(slot.delta.menuWrites||0)+stopReservations.size-(isStop?1:0)+1<=limit.menuWrites
                &&counts.shopWrites+(slot.delta.shopWrites||0)+1<=limit.shopWrites
                &&counts.blobUploads+(slot.delta.blobUploads||0)<=limit.blobUploads
                &&counts.createAttempts+(slot.delta.createAttempts||0)<=limit.createAttempts
                &&(counts.denialRequests||0)+(slot.delta.denialRequests||0)<=10);
            slot.consumed=true;slot.record.state='FORWARD_CONSUMED';
            for(const [key,n] of Object.entries(slot.delta))counts[key]=(counts[key]||0)+n;slot.stage.index++;remainderOutstanding=undefined;
        }catch{hold('HOLD_REMAINDER_CONSUMPTION');reject('RESUME_414953_HELD');}
    };
    const recordRemainderCreated=({operationId,id})=>{
        try{const slot=remainderPending.get(operationId);must(!held&&slot?.consumed&&slot.claim.kind==='MENU_CREATE'&&!slot.record.createdId
            &&menuId(id)&&!forbiddenMenu(id)&&!known.has(id));slot.record.createdId=id;counts.menus++;
            known.set(id,{id,owner:slot.claim.owner,zone:slot.claim.zone});
        }catch{hold('HOLD_REMAINDER_CREATED_ID');reject('RESUME_414953_HELD');}
    };
    const expect=(id,kind='MENU_WRITE',owner='S1',publication=false)=>({id,kind,owner,publication});
    const finishCoreStage=()=>{must(remainderStage.index===remainderStage.expected.length);
        const slots=[...remainderPending.values()].filter(s=>s.stage===remainderStage);must(slots.length===remainderStage.expected.length&&slots.every(s=>s.consumed));};
    const confirmCoreStage=()=>{for(const slot of remainderPending.values())if(slot.stage===remainderStage)slot.record.state='CONFIRMED_RESPONSE_AND_READBACK';};
    const checkPrivate=async(serviceOwnerOnly=false)=>{
        for(const f of known.values()){if(serviceOwnerOnly&&f.owner!=='S1')continue;
            const r=await ports.readMenu({id:f.id,owner:f.owner,scenario:'REMAINDER_PRIVATE'});must(r?.menu?.id===f.id&&r.menu.isPublished===false);stopReservations.delete(f.id);
            {
                const m=r.menu;must(Array.isArray(m.allergens)&&Array.isArray(m.foodReviews));
                const food=Object.fromEntries(['name','description','category','priceYen','ingredients','precaution','imageUrl','imageFrame','imageFit',
                    'imagePosition','imageZoom','imagePositionX','imagePositionY'].map(key=>[key,m[key]]));
                food.allergenStatusBySlug=Object.fromEntries(m.allergens.map(a=>[a.slug,a.status]));
                const binding={id:f.id,owner:f.owner,isPublished:false,version:m.version,foodVersion:m.foodVersion,
                    publicationConfirmedFoodVersion:m.publicationConfirmedFoodVersion,reviewedFoodVersion:m.reviewedFoodVersion,
                    foodSha256:createHash('sha256').update(canonical(food)).digest('hex'),reviewsSha256:createHash('sha256').update(canonical(m.foodReviews)).digest('hex')};
                if(restoredExpectedPrivate.has(f.id)){must(same(binding,restoredExpectedPrivate.get(f.id)));restoredExpectedPrivate.delete(f.id);}
                privateBindings.set(f.id,binding);if(f.owner==='S2')closedOwnerPrivate.set(f.id,binding);
            }}
        must(stopReservations.size===0);
    };
    const executeRemainder=async({runId}={})=>{
        must(['RESUME_414953_FULL_MANAGED',completionScope].includes(approved.scope),'RESUME_REMAINDER_APPROVAL_REQUIRED');
        must(initialized&&!held&&!remainderUsed&&['T3_API_SEQUENCE_PRIVATE_NOT_ATTESTED_T4_NOT_IMPLEMENTED','RESTORED_SERVICE_TERMINAL_READY'].includes(phase)&&uuid(runId));
        must(!activeServiceRunId||activeServiceRunId===runId);activeServiceRunId=runId;
        const needed=['runT4','runControls','runDenials','runServiceCellLazy','closeServiceBrowser','verifyResourceBeforeForward',
            'prepareServiceActor','finishServiceActor','verifyServiceTerminal','restorePriorShop'];
        must(needed.every(n=>typeof ports[n]==='function'),'RESUME_REMAINDER_PORT_NOT_IMPLEMENTED');
        remainderUsed=true;removed=false;
        const coreArm={id:'RESUME_REMAINDER_CORE',zone:'CORE',status:'ACTIVE',operationIds:[]};
        let serviceActorAcquired=false,serviceBrowserCloseAttempted=false,serviceActorFinishAttempted=false,activeServiceArm;
        const setStage=(name,expected)=>{phase=name;remainderStage={name,expected,index:0,arm:coreArm};};
        try{
            guard=await ports.installSendGuard(boundary);must(guard?.beforeSend===true&&typeof guard.remove==='function');
            if(!restored){
            setStage('T4_REAL_OBSERVER',[expect('RESUME_T4_CREATE','MENU_CREATE'),expect('RESUME_T4_INITIAL_PUBLISH','MENU_WRITE','S1',true),expect('RESUME_T4_STOP')]);
            const t4=await ports.runT4({runId});finishCoreStage();
            must(t4?.status==='T4_STOP_API_AND_OBSERVATIONS_CONFIRMED_NOT_LIVE_PASS'&&t4.writesConfirmed===3&&t4.ownedPagesClosed===true&&t4.preexistingPagesPreserved===true);
            must(t4.observation?.freshReadOutcome==='FRESH_READS_HIDE_TARGET'&&!t4.observation.truncated&&!t4.observation.observationFailed
                &&t4.observation.held?.targetMatched===true&&t4.observation.back?.targetMatched===true
                &&t4.observation.failedRefetch?.injection==='ONE_DOCUMENT_GET_ABORTED_BEFORE_FORWARD');await checkPrivate();confirmCoreStage();completedStages.push('T4_OBSERVER');
            setStage('CONTROLS_REAL_OBSERVATIONS',[expect('CONTROL_PRICE_CREATE','MENU_CREATE'),expect('CONTROL_PRICE_PUBLISH','MENU_WRITE','S1',true),expect('CONTROL_PRICE_ONLY'),expect('CONTROL_PRICE_FINAL_PRIVATE'),
                expect('CONTROL_STOP_CREATE','MENU_CREATE','S2'),expect('CONTROL_STOP_PUBLISH','MENU_WRITE','S2',true),expect('CONTROL_STOP_ONLY','MENU_WRITE','S2'),
                expect('CONTROL_SILENT_CREATE','MENU_CREATE','S2'),expect('CONTROL_SILENT_PUBLISH','MENU_WRITE','S2',true),expect('CONTROL_SILENT_FINAL_PRIVATE','MENU_WRITE','S2')]);
            const controls=await ports.runControls({runId});finishCoreStage();must(controls?.priceFoodVersionUnchanged===true&&controls.stopFoodVersionUnchanged===true
                &&controls.noSignalAutomaticStops===0&&controls.noSignalRequiredStopDenominator===0);await checkPrivate();confirmCoreStage();completedStages.push('CONTROLS_OBSERVATIONS');
            phase='DENIALS_ACTUAL_API';remainderStage={name:phase,index:0,arm:coreArm};const beforeDenials=counts.denialRequests||0;
            const denial=await ports.runDenials({fixtures:[...known.values()],authorize:boundary.authorize});
            must((counts.denialRequests||0)-beforeDenials===10&&denial?.crossOwnerRefusals===8&&denial.staleVersionConflicts===2&&denial.routeContractChecked===true
                &&denial.ownerStateUnchanged===true&&denial.historyObservation==='PENDING_INDEPENDENT_SQL');await checkPrivate();completedStages.push('DENIALS');
            }
            const order=['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_UPLOAD','SHOP_SAVE'];
            const armCells=[[...order.map(k=>k+'_DELIVER'),...order.map(k=>k+'_BLOCK_BEFORE_FORWARD'),'MENU_CREATE_WITHHOLD_AFTER_RESPONSE'],
                ...['MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].map(k=>[k+'_WITHHOLD_AFTER_RESPONSE'])];
            for(let index=restored?.nextArmIndex||0;index<armCells.length;index++){
                const cellIds=armCells[index];
                must(index===0||closedOwnerSqlVerified);
                const arm={id:'RESUME_SERVICE_'+(index+1),zone:'SERVICE',status:'ACTIVE',terminalVerified:false,operationIds:[]};serviceArms.push(arm);
                must((prefix?11:9)+index+2<=limit.sessions);
                phase='SERVICE_ACTOR_GATE';const actor=await ports.prepareServiceActor({armId:arm.id,existingActor:index===0,
                    resumeCheckpoint:{knownFixtures:[...known.values()],newClaims:structuredClone(newClaims),terminalCreationBindings:structuredClone(terminalCreationBindings)}});
                serviceActorAcquired=true;activeServiceArm=arm.id;serviceBrowserCloseAttempted=false;serviceActorFinishAttempted=false;
                must(actor?.owner==='S1'&&actor.identityVerified===true&&actor.sessionConsumedBeforeAuthentication===true
                    &&actor.globalConsumedSessions===(prefix?11:9)+index&&same(actor.recoveryReservations,{S1:1,S2:1}));counts.sessions=actor.globalConsumedSessions;
                await checkPrivate(true);
                if(index===5){const source=newClaims.find(c=>c.cellId==='SHOP_SAVE_WITHHOLD_AFTER_RESPONSE'&&c.resource.purpose==='PRIMARY');
                    must(source&&serviceArms.find(a=>a.id===source.arm)?.terminalVerified===true);
                    remainderStage={name:'SERVICE_RESTORE_PRIOR_SHOP',index:0,arm};
                    const restored=await ports.restorePriorShop({sources:[{sourceClaimId:source.id,resource:structuredClone(source.resource)}],independentTerminalVerified:true});
                    must(restored?.unknownWrite===false&&restored.freshStateMatched===true&&same(restored.verifiedSourceClaimIds,[source.id])
                        &&newClaims.some(c=>c.arm===arm.id&&c.resource.purpose==='RESTORE_PRIOR_SHOP'&&c.resource.sourceClaimId===source.id&&c.state==='FORWARD_CONSUMED'));
                }
                for(const cellId of cellIds){const cell=serviceCells.find(c=>c.id===cellId);must(cell);phase='SERVICE_CELL';remainderStage={name:phase,index:0,arm,cell};
                    const result=await ports.runServiceCellLazy({cell,authorize:boundary.authorize,consumeSendPermission:boundary.consumeSendPermission,recordCreated:boundary.recordCreated});
                    const local=newClaims.filter(c=>c.arm===arm.id&&c.cellId===cell.id),expectedKind=cell.kind==='MENU_CREATE'?'MENU_CREATE':
                        ['MENU_SAVE','STOP'].includes(cell.kind)?'MENU_WRITE':cell.kind==='SHOP_SAVE'?'SHOP_WRITE':'BLOB_UPLOAD';
                    must(result?.originalClaimRetained===true&&local.some(c=>c.kind===expectedKind&&c.mode===cell.mode&&c.resource.purpose==='PRIMARY'
                        &&c.state===(cell.mode==='BLOCK_BEFORE_FORWARD'?'AUTHORIZED_ONCE':'FORWARD_CONSUMED')));
                    const purposes=['PRIMARY'];if(['MENU_SAVE','STOP','MENU_UPLOAD'].includes(cell.kind))purposes.push('SETUP_CREATE');
                    if(cell.kind==='STOP')purposes.push('SETUP_PUBLISH');
                    if(cell.kind==='MENU_CREATE'&&cell.mode==='DELIVER')purposes.push('SETUP_UPLOAD');
                    if(cell.mode==='DELIVER'&&cell.kind==='MENU_UPLOAD')purposes.push('FOLLOWUP_SAVE');
                    if(cell.mode==='DELIVER'&&['MENU_CREATE','MENU_UPLOAD'].includes(cell.kind))purposes.push('FOLLOWUP_PUBLISH','CLEANUP');
                    if(cell.kind==='STOP'&&cell.mode==='BLOCK_BEFORE_FORWARD')purposes.push('CLEANUP');
                    if(cell.kind==='SHOP_SAVE'&&cell.mode==='DELIVER')purposes.push('RESTORE');
                    must(same(local.map(c=>c.resource.purpose).sort(),purposes.sort()));
                    if(cell.mode==='WITHHOLD_AFTER_RESPONSE'){
                        must(result?.status==='HOLD'&&result.clientUnknown===true&&result.originalClaimRetained===true);arm.status='HOLD';arm.currentCell=cell.id;
                    }else if(cell.mode==='BLOCK_BEFORE_FORWARD')must(noForwardProven(result)&&(!cell.kind.endsWith('_UPLOAD')||result.fileRetained===true));
                    else must(result?.status==='KNOWN_OBSERVATION'&&result.clientUnknown===false&&result.bodyValidated===true
                        &&result.originalClaimRetained===true&&result.forwardCalls===1&&result.followupWrites===0);
                    if(cell.mode!=='WITHHOLD_AFTER_RESPONSE')await checkPrivate(true);
                    if(cell.mode!=='WITHHOLD_AFTER_RESPONSE')for(const c of local.filter(c=>c.kind==='MENU_CREATE'&&c.createdId))c.state='CONFIRMED_RESPONSE_AND_READBACK';
                    serviceObservations.push({cellId,status:cell.mode==='WITHHOLD_AFTER_RESPONSE'?'HOLD':'OBSERVED_NOT_INDEPENDENTLY_ATTESTED'});
                }
                serviceBrowserCloseAttempted=true;const close=await ports.closeServiceBrowser();must(close?.ownedPageClosed===true&&close.routesDrained===true);
                serviceActorFinishAttempted=true;const ended=await ports.finishServiceActor({armId:arm.id});must(ended?.sessionsClosed===true&&ended.pendingRequests===0);serviceActorAcquired=false;
                phase='HOLD_SERVICE_INDEPENDENT_TERMINAL';const bindings=arm.operationIds.map(id=>{const c=newClaims.find(c=>c.id===id);return {operationId:id,kind:c.kind,mode:c.mode,owner:c.owner,resource:c.resource};});
                const closedOwnerPrivateBindings=[...closedOwnerPrivate.values()].sort((a,b)=>a.id.localeCompare(b.id));
                must(closedOwnerPrivateBindings.length===[...known.values()].filter(f=>f.owner==='S2').length);
                const closedOwnerPrivateBindingsSha256=resourceHash(closedOwnerPrivateBindings),resourcesSha256=resourceHash(bindings);
                const proof=await ports.verifyServiceTerminal({armId:arm.id,operationIds:[...arm.operationIds],resourceBindings:structuredClone(bindings),resourcesSha256,
                    closedOwnerPrivateBindings,closedOwnerPrivateBindingsSha256});
                must(proof?.source==='INDEPENDENT_READ_ONLY'&&proof.originalTerminal===true&&proof.unknownResolved===true&&proof.sessionsClosed===true&&proof.pendingRequests===0
                    &&proof.applicationSha===target.source&&proof.deployment===target.deployment&&Number.isFinite(Date.parse(proof.observedUtc))
                    &&Date.now()-Date.parse(proof.observedUtc)>=0&&Date.now()-Date.parse(proof.observedUtc)<=3600000
                    &&proof.resourcesSha256===resourcesSha256&&Array.isArray(proof.operationIds)&&proof.operationIds.length===arm.operationIds.length
                    &&new Set(proof.operationIds).size===proof.operationIds.length&&proof.operationIds.every(id=>arm.operationIds.includes(id)));
                must(proof.closedOwnerPrivateBindingsMatch===true&&proof.closedOwnerPrivateBindingsSha256===closedOwnerPrivateBindingsSha256
                    &&same(proof.closedOwnerPrivateIds,closedOwnerPrivateBindings.map(b=>b.id)));closedOwnerSqlVerified=true;
                arm.terminalVerified=true;for(const id of arm.operationIds){const c=newClaims.find(c=>c.id===id);if(c.createdId)terminalCreationBindings.push({id:c.createdId,operationId:c.id,
                    creationOperationId:c.resource.creationOperationId,owner:c.owner,armId:arm.id,resourcesSha256});}
            }
            must(counts.menus===32&&counts.createAttempts===33&&counts.menuWrites===(prefix?137:105)&&counts.shopWrites===4&&counts.blobUploads===5&&counts.denialRequests===10);
            completedStages.push('SERVICE_BROWSER_OBSERVERS');
            phase='REMAINDER_API_OBSERVATIONS_NOT_INDEPENDENTLY_ATTESTED';
        }catch{if(!held)hold('HOLD_REMAINDER_RESULT_OR_INDEPENDENT_TERMINAL');}
        finally{
            if(serviceActorAcquired){
                if(!serviceBrowserCloseAttempted)try{serviceBrowserCloseAttempted=true;const c=await ports.closeServiceBrowser();must(c?.ownedPageClosed===true&&c.routesDrained===true);}catch{hold('HOLD_SERVICE_PAGE_CLOSE_UNVERIFIED');}
                if(!serviceActorFinishAttempted)try{serviceActorFinishAttempted=true;const e=await ports.finishServiceActor({armId:activeServiceArm});must(e?.sessionsClosed===true&&e.pendingRequests===0);}catch{hold('HOLD_SERVICE_ACTOR_FINISH_UNVERIFIED');}
            }
            remainderStage=undefined;try{must(await guard.remove()===true);removed=true;}catch{hold('HOLD_SEND_GUARD_REMOVAL_UNVERIFIED');}
        }
        return {...safeSnapshot(),sendGuardRemoved:removed};
    };
    return {initialize,executeRemainder,snapshot:safeSnapshot,async executeT3(){
        must(initialized&&!held&&!used);used=true;phase='B_PUBLIC_RECOVERY';
        try{
            for(const id of stopReservations){const f=known.get(id),source=inheritedKeys.get(id);must(source?.scenario==='T2');
                await read(id,f.owner,source.key,true,'T2');await mutate('STOP',source.key,f.owner,id,'T2');}
            must(stopReservations.size===0);phase='T3_REUSE_AND_COMPLETE_BASELINE';
            for(let n=1;n<=8;n++){const key='M0'+n,owner=ownerFor(key);let id=byKey.get(key);
                if(id)await read(id,owner,key,true);else id=await mutate('CREATE',key,owner);
                await mutate('PUBLISH',key,owner,id);
            }
            for(let n=1;n<=8;n++){const key='M0'+n;must((await read(byKey.get(key),ownerFor(key),key)).isPublished===true);}
            const evidenceInput={scenario:'T3',recipeRunId:'39390038-ddea-409d-bbe3-0faee2293ed6',fixtures:[...byKey].map(([key,id])=>({key,id,owner:ownerFor(key)}))};
            phase='T3_ORIGINAL_E31';const start=await ports.observeT3Evidence({...evidenceInput,phase:'START'});
            must(start?.source==='ORIGINAL_T3_EVIDENCE'&&start.observed===true&&start.lotAllocationHeld===false&&same(start.evidenceIds,['E31']));
            for(const key of ['M01','M05'])await mutate('STOP',key,ownerFor(key),byKey.get(key));
            phase='T3_ORIGINAL_E32';const lookup=await ports.observeT3Evidence({...evidenceInput,phase:'LOT_ALLOCATION_LOOKUP'});
            must(lookup?.source==='ORIGINAL_T3_EVIDENCE'&&lookup.observed===true&&lookup.lotAllocationHeld===true&&same(lookup.evidenceIds,['E32']));
            phase='T3_CASE_CLEANUP';for(const key of ['M02','M03','M04','M06','M07','M08'])await mutate('STOP',key,ownerFor(key),byKey.get(key));
            must(stopReservations.size===0);phase='T3_API_SEQUENCE_PRIVATE_NOT_ATTESTED_T4_NOT_IMPLEMENTED';
        }catch{if(!held)hold('HOLD_READ_EVIDENCE_OR_CONFLICT_NO_CLEANUP');}
        finally{try{must(await guard.remove()===true);removed=true;}catch{hold('HOLD_SEND_GUARD_REMOVAL_UNVERIFIED');}}
        return {...safeSnapshot(),sendGuardRemoved:removed};
    }};
}
const coreLimits = { menus:21, menuWrites:79 }, serviceLimits = { menus:11, menuWrites:24 };
const operations = ['MENU_CREATE','MENU_WRITE','SHOP_WRITE','BLOB_UPLOAD','SESSION','DENIAL'];
const modes = ['DELIVER','BLOCK_BEFORE_FORWARD','WITHHOLD_AFTER_RESPONSE'];
const kinds = ['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'];
export const serviceCells = Object.freeze(kinds.flatMap(kind => modes.map(mode => Object.freeze({id:kind+'_'+mode,kind,mode}))));
const safeKey = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const menuId = value => typeof value === 'string' && /^c[a-z0-9]+$/.test(value);
const fail = () => { throw Error('MANAGED_SUITE_REFUSED'); };
const check = value => { if(!value) fail(); };
const batchStatus = 'MANAGED_ADAPTER_SEQUENCE_CONFIRMED_NOT_LIVE_PASS';
const checkpointVersion = 2;
const ownerShop = {S1:target.shop,S2:'cmvs4x9h80011wn0w7s8abaie'};
const uuid = value => typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const forbiddenMenu = id => [target.anchor,'cmvs4x86o000vwn0w93c8ttez','cmvs4x8wt000xwn0wj6gwdih1','cmvs4x986000zwn0wer2ymhow'].includes(id);
const canonical = value => JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const resourceHash = bindings => createHash('sha256').update(canonical(bindings)).digest('hex');
const issued = claim => claim?.state==='FORWARD_CONSUMED';
function validateResource(claim,fixtures,priorClaims,arm,arms) {
    const r=claim.resource,prior=[...priorClaims.values()];
    check(r&&typeof r==='object'&&!Array.isArray(r)&&typeof r.purpose==='string'&&typeof r.path==='string'
        &&Object.keys(r).every(k=>['method','path','menuId','shopId','creationOperationId','purpose','evidence','beforeVersion','beforeUpdatedAt','sourceClaimId'].includes(k)));
    const targetFixture=fixtures.get(r.menuId),base=targetFixture?'/api/admin/menus/'+r.menuId:null;
    if(claim.kind==='SESSION'){
        check(claim.owner==='S1'&&claim.mode==='DELIVER'&&r.method==='NONE'&&r.path===''&&r.purpose==='SESSION'
            &&r.shopId===ownerShop.S1&&r.menuId===undefined&&r.creationOperationId===undefined&&r.evidence===undefined
            &&r.beforeVersion===undefined&&r.beforeUpdatedAt===undefined&&r.sourceClaimId===undefined);return;
    }
    if(claim.kind==='DENIAL'){
        check(arm.zone==='CORE'&&claim.mode==='DELIVER'&&targetFixture&&r.creationOperationId===undefined&&r.evidence===undefined);
        const cross=['CROSS_OWNER_GET','CROSS_OWNER_EDIT','CROSS_OWNER_STOP','CROSS_OWNER_PUBLISH'];
        check(cross.includes(r.purpose)?claim.owner!==targetFixture.owner:['STALE_STOP','STALE_EDIT'].includes(r.purpose)&&claim.owner===targetFixture.owner);
        check(r.method===(r.purpose==='CROSS_OWNER_GET'?'GET':['CROSS_OWNER_STOP','STALE_STOP'].includes(r.purpose)?'POST':'PUT')
            &&r.path===base+(['CROSS_OWNER_STOP','STALE_STOP'].includes(r.purpose)?'/stop':''));
        check(r.beforeUpdatedAt===undefined&&r.sourceClaimId===undefined&&(r.method==='GET'?r.beforeVersion===undefined
            :Number.isSafeInteger(r.beforeVersion)&&r.beforeVersion>=0));
        check(r.shopId===undefined||r.shopId===ownerShop[targetFixture.owner]);
        check(!prior.some(c=>c.kind==='DENIAL'&&c.owner===claim.owner&&c.resource.menuId===r.menuId&&c.resource.purpose===r.purpose));return;
    }
    if(claim.kind==='MENU_CREATE')check(r.method==='POST'&&r.path==='/api/admin/menus'&&r.menuId===undefined
        &&r.shopId===ownerShop[claim.owner]&&uuid(r.creationOperationId)&&r.beforeVersion===undefined&&r.beforeUpdatedAt===undefined
        &&!prior.some(c=>c.kind==='MENU_CREATE'&&c.resource.creationOperationId===r.creationOperationId));
    else if(claim.kind==='MENU_WRITE')check(targetFixture&&targetFixture.owner===claim.owner
        &&r.creationOperationId===undefined&&(r.shopId===undefined||r.shopId===ownerShop[claim.owner])
        &&Number.isSafeInteger(r.beforeVersion)&&r.beforeVersion>=0&&r.beforeUpdatedAt===undefined
        &&((r.method==='PUT'&&r.path===base)||(r.method==='POST'&&r.path===base+'/stop')));
    else if(claim.kind==='SHOP_WRITE')check(claim.owner==='S1'&&r.shopId===ownerShop.S1&&r.method==='PUT'&&r.path==='/api/admin/shop'
        &&r.menuId===undefined&&r.creationOperationId===undefined&&r.beforeVersion===undefined
        &&typeof r.beforeUpdatedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.beforeUpdatedAt)&&Number.isFinite(Date.parse(r.beforeUpdatedAt)));
    else if(claim.kind==='BLOB_UPLOAD')check(claim.owner==='S1'&&r.shopId===ownerShop.S1&&r.method==='POST'
        &&['/api/admin/upload-menu-image','/api/admin/upload-shop-image'].includes(r.path)&&r.creationOperationId===undefined
        &&(r.menuId===undefined||targetFixture?.owner==='S1')&&r.beforeVersion===undefined&&r.beforeUpdatedAt===undefined);
    else fail();
    if(arm.zone==='CORE'){check(r.purpose==='CORE'&&r.evidence===undefined&&r.sourceClaimId===undefined);return;}
    if(r.purpose==='RESTORE_PRIOR_SHOP'){
        const source=priorClaims.get(r.sourceClaimId),sourceArm=arms.find(a=>a.id===source?.arm),e=r.evidence;
        check(claim.kind==='SHOP_WRITE'&&claim.owner==='S1'&&claim.mode==='DELIVER'&&claim.cellId===undefined
            &&source?.kind==='SHOP_WRITE'&&source.mode==='WITHHOLD_AFTER_RESPONSE'&&source.resource.purpose==='PRIMARY'
            &&source.cellId==='SHOP_SAVE_WITHHOLD_AFTER_RESPONSE'&&issued(source)
            &&sourceArm?.status==='HOLD'&&sourceArm.terminalVerified===true&&sourceArm.id!==arm.id
            &&e&&Object.keys(e).every(k=>['knownOutcome','ownerStateMatches','freshUpdatedAt','ownChangeMatches','noConcurrentChange','independentTerminalVerified'].includes(k))
            &&['knownOutcome','ownerStateMatches','freshUpdatedAt','ownChangeMatches','noConcurrentChange','independentTerminalVerified'].every(k=>e[k]===true)
            &&!prior.some(c=>c.resource.sourceClaimId===r.sourceClaimId));return;
    }
    check(r.sourceClaimId===undefined);
    const cell=serviceCells.find(c=>c.id===claim.cellId);check(cell&&claim.owner==='S1');
    const local=prior.filter(c=>c.arm===arm.id&&c.cellId===cell.id);
    check(!local.some(c=>c.resource.purpose===r.purpose));
    const primary=local.find(c=>c.resource.purpose==='PRIMARY'&&(issued(c)||c.mode==='BLOCK_BEFORE_FORWARD'&&c.state==='AUTHORIZED_ONCE'));
    const setup=local.find(c=>c.resource.purpose==='SETUP_CREATE'&&c.createdId===r.menuId&&issued(c));
    const exactWrite = (method,suffix='') => check(claim.kind==='MENU_WRITE'&&r.method===method&&r.path===base+suffix);
    if(r.purpose==='PRIMARY'){
        const kind=cell.kind==='MENU_CREATE'?'MENU_CREATE':['MENU_SAVE','STOP'].includes(cell.kind)?'MENU_WRITE'
            :cell.kind==='SHOP_SAVE'?'SHOP_WRITE':'BLOB_UPLOAD';
        check(claim.kind===kind&&claim.mode===cell.mode&&r.evidence===undefined);
        if(cell.kind==='MENU_SAVE')exactWrite('PUT');
        if(cell.kind==='STOP')exactWrite('POST','/stop');
        if(cell.kind.endsWith('_UPLOAD'))check(r.path==='/api/admin/upload-'+(cell.kind==='MENU_UPLOAD'?'menu':'shop')+'-image');
        return;
    }
    check(claim.mode==='DELIVER');
    if(r.purpose==='SETUP_CREATE'){
        check(['MENU_SAVE','STOP','MENU_UPLOAD'].includes(cell.kind)&&claim.kind==='MENU_CREATE'&&!primary&&r.evidence===undefined);return;
    }
    if(r.purpose==='SETUP_UPLOAD'){
        check(cell.kind==='MENU_CREATE'&&cell.mode==='DELIVER'&&claim.kind==='BLOB_UPLOAD'&&r.path==='/api/admin/upload-menu-image'
            &&!primary&&r.menuId===undefined&&r.evidence===undefined);return;
    }
    const evidence=r.evidence;
    check(evidence&&Object.keys(evidence).every(k=>['knownOutcome','freshVersion','ownerStateMatches','noForwardProven',
        'freshUpdatedAt','ownChangeMatches','noConcurrentChange'].includes(k))&&Object.values(evidence).every(v=>v===true)
        &&evidence.knownOutcome===true&&evidence.ownerStateMatches===true);
    if(r.purpose==='SETUP_PUBLISH'){check(cell.kind==='STOP'&&!primary&&setup&&evidence.freshVersion===true);exactWrite('PUT');return;}
    check(primary);
    if(r.purpose==='RESTORE'){
        check(cell.kind==='SHOP_SAVE'&&cell.mode==='DELIVER'&&claim.kind==='SHOP_WRITE'&&evidence.freshUpdatedAt===true
            &&evidence.ownChangeMatches===true&&evidence.noConcurrentChange===true);return;
    }
    check(evidence.freshVersion===true);
    const primaryId=primary.createdId||primary.resource.menuId;
    check(primaryId===r.menuId||(!primaryId&&setup));
    if(r.purpose==='FOLLOWUP_SAVE'){check(cell.kind==='MENU_UPLOAD'&&cell.mode==='DELIVER');exactWrite('PUT');return;}
    if(r.purpose==='FOLLOWUP_PUBLISH'){check(['MENU_CREATE','MENU_UPLOAD'].includes(cell.kind)&&cell.mode==='DELIVER');
        if(cell.kind==='MENU_UPLOAD')check(local.some(c=>c.resource.purpose==='FOLLOWUP_SAVE'&&issued(c)&&c.resource.menuId===r.menuId));exactWrite('PUT');return;}
    check(r.purpose==='CLEANUP'&&((['MENU_CREATE','MENU_UPLOAD'].includes(cell.kind)&&cell.mode==='DELIVER')
        ||(cell.kind==='STOP'&&cell.mode==='BLOCK_BEFORE_FORWARD'&&evidence.noForwardProven===true)));exactWrite('POST','/stop');
    if(cell.mode==='DELIVER')check(local.some(c=>c.resource.purpose==='FOLLOWUP_PUBLISH'&&issued(c)&&c.resource.menuId===r.menuId));
    if(primary.createdId)check(primary.createdId===r.menuId);
    else if(primary.resource.menuId)check(primary.resource.menuId===r.menuId);
}
const blockProofKeys=['clientUnknown','serverOutcome','forwardCalls','retryCalls','fallbackCalls','followupWrites',
    'successDisplayed','inputRetained','ownerApiUnchanged','soleSenderConfirmed'];
const blockKeysFor = kind => [...blockProofKeys,...(kind.endsWith('_UPLOAD')?['fileRetained']:[])];
const noForwardProven = result => result?.serverOutcome==='NO_FORWARD_PROVEN'&&result.clientUnknown===true&&result.forwardCalls===0
    &&result.retryCalls===0&&result.fallbackCalls===0&&result.followupWrites===0&&result.successDisplayed===false
    &&result.inputRetained===true&&result.ownerApiUnchanged===true&&result.soleSenderConfirmed===true;
const deltaFor = (kind,mode) => {
    const blocked=mode==='BLOCK_BEFORE_FORWARD';
    return kind==='MENU_CREATE'?{createAttempts:1,...(!blocked?{menuWrites:1}:{})}:kind==='MENU_WRITE'?{menuWrites:blocked?0:1}
        :kind==='SHOP_WRITE'?{shopWrites:blocked?0:1}:kind==='BLOB_UPLOAD'?{blobUploads:blocked?0:1}:kind==='SESSION'?{sessions:1}:{denialRequests:1};
};
function restoreCheckpoint(value,suiteId) {
    try {
        // Data-only, bounded traversal; do not invoke input accessors or preserve extra provider fields.
        let nodes=0;
        const data=(v,depth=0)=>{
            check(++nodes<8000&&depth<12);
            if(v===null||typeof v==='boolean')return;
            if(typeof v==='string'){check(v.length<=512);return;}
            if(typeof v==='number'){check(Number.isSafeInteger(v)&&v>=0);return;}
            check(v&&typeof v==='object'&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype));
            if(Array.isArray(v))check(v.length<=200);
            for(const key of Reflect.ownKeys(v)){
                if(Array.isArray(v)&&key==='length')continue;
                check(typeof key==='string');const descriptor=Object.getOwnPropertyDescriptor(v,key);
                check(descriptor&&'value'in descriptor);data(descriptor.value,depth+1);
            }
        };
        data(value);const s=structuredClone(value);
        const exact=(object,keys)=>check(object&&Object.keys(object).length===keys.length&&keys.every(key=>Object.hasOwn(object,key)));
        exact(s,['checkpointVersion','applicationSha','t1','suiteId','status','counts','zones','fixtures','creationReservations','claims','arms','service',
            'missingPorts','denialHistory','denialHistoryScope','crossRunResume','checkpointState','independentDatabase','livePass','automaticRetry','automaticCleanup']);
        check(s.checkpointVersion===checkpointVersion&&s.applicationSha===target.source&&s.suiteId===suiteId
            &&s.independentDatabase==='NOT_ATTESTED'&&s.livePass===false&&s.automaticRetry===false&&s.automaticCleanup===false
            &&s.crossRunResume==='VERIFY_CHECKPOINT_BEFORE_OPERATIONS'&&['LOCAL_SUITE','VERIFIED'].includes(s.checkpointState));
        exact(s.t1,['fixtureId','menuWrites','sessions']);check(menuId(s.t1.fixtureId)&&!forbiddenMenu(s.t1.fixtureId)&&s.t1.menuWrites===6&&s.t1.sessions===2);
        check(['PENDING_INDEPENDENT_SQL','VERIFIED_INDEPENDENT_SQL'].includes(s.denialHistory)
            &&s.denialHistoryScope==='MENU_PUBLICATION_FOOD_ONLY_AUDIT_LOG_NOT_ATTESTED');
        check(Array.isArray(s.claims)&&s.claims.length<=160&&Array.isArray(s.arms)&&s.arms.length>=2&&s.arms.length<=7
            &&Array.isArray(s.fixtures)&&s.fixtures.length<=32&&Array.isArray(s.service)&&s.service.length===18
            &&Array.isArray(s.missingPorts)&&new Set(s.missingPorts).size===s.missingPorts.length&&s.missingPorts.every(x=>['runServiceCell:SHOP_registry_restore_and_fault_arm_transport',
                'prepareServiceActor:existing_A_then_fresh_A_only','restorePriorShop'].includes(x)));
        const armMap=new Map();
        for(const [i,a] of s.arms.entries()){
            check(safeKey(a.id)&&!armMap.has(a.id)&&a.zone===(i===0?'CORE':'SERVICE')&&typeof a.terminalVerified==='boolean'
                &&Array.isArray(a.operationIds)&&new Set(a.operationIds).size===a.operationIds.length&&a.operationIds.every(safeKey)
                &&Array.isArray(a.steps)&&Object.keys(a).every(k=>['id','zone','status','operationIds','steps','terminalVerified','code','currentCell'].includes(k)));
            if(i===0)check(a.id==='CORE'&&a.status==='CORE_API_SEQUENCE_COMPLETE'&&a.terminalVerified===false
                &&JSON.stringify(a.steps)===JSON.stringify(['T2_T3_T4_API_OBSERVATIONS','THREE_CONTROLS','OWNER_AND_STALE_REFUSALS','ALL_21_PRIVATE_API_VERIFIED']));
            else check(a.status==='HOLD'&&a.steps.length===0&&(i===s.arms.length-1||a.terminalVerified===true));
            if(a.code!==undefined)check(['SEND_GUARD_OR_BUDGET_HELD','CREATED_ID_OR_BUDGET_HELD','PENDING_SEND_PERMISSION_HELD',
                'SEND_GUARD_REMOVAL_UNVERIFIED','SERVICE_TERMINAL_RECONCILIATION_REQUIRED','SERVICE_INCOMPLETE_NO_AUTOMATIC_CLEANUP',
                'SEND_PERMISSION_REPLAY_OR_RESOURCE_HELD','UNCONSUMED_SEND_PERMISSION_HELD'].includes(a.code));
            if(a.currentCell!==undefined)check(serviceCells.some(c=>c.id===a.currentCell));armMap.set(a.id,a);
        }
        const terminalCells=s.arms.slice(1).map(a=>a.currentCell).filter(x=>x!==undefined);
        check(new Set(terminalCells).size===terminalCells.length);
        const counts={menus:1,createAttempts:1,menuWrites:6,shopWrites:0,blobUploads:0,sessions:2,denialRequests:0};
        const zones={CORE:{menus:1,menuWrites:6},SERVICE:{menus:0,menuWrites:0}},slots={CORE:1,SERVICE:0};
        const claimMap=new Map(),fixtures=new Map([[s.t1.fixtureId,{id:s.t1.fixtureId,zone:'CORE',owner:'S1'}]]);
        const core=s.arms[0];
        for(const claim of s.claims){
            check(safeKey(claim.id)&&!claimMap.has(claim.id)&&operations.includes(claim.kind)&&modes.includes(claim.mode)
                &&['S1','S2'].includes(claim.owner)&&['CLAIM_PENDING','AUTHORIZED_ONCE','FORWARD_CONSUMED'].includes(claim.state)
                &&Object.keys(claim).every(k=>['id','kind','mode','owner','arm','zone','state','cellId','createdId','resource'].includes(k)));
            const arm=armMap.get(claim.arm);check(arm&&claim.zone===arm.zone&&arm.operationIds.includes(claim.id));
            if(claim.mode==='BLOCK_BEFORE_FORWARD')check(!issued(claim));
            if(arm.zone==='CORE')check(claim.mode==='DELIVER'&&['MENU_CREATE','MENU_WRITE','DENIAL'].includes(claim.kind)
                &&issued(claim)&&claim.cellId===undefined);
            else if(claim.kind==='SESSION')check(claim.owner==='S1'&&claim.mode==='DELIVER'&&claim.cellId===undefined);
            else check(claim.owner==='S1'&&(serviceCells.some(c=>c.id===claim.cellId)
                ||(claim.kind==='SHOP_WRITE'&&claim.resource?.purpose==='RESTORE_PRIOR_SHOP'&&claim.cellId===undefined))&&claim.kind!=='DENIAL');
            validateResource(claim,fixtures,claimMap,arm,[...armMap.values()]);
            const delta=deltaFor(claim.kind,claim.mode);for(const [key,n] of Object.entries(delta))counts[key]+=n;
            zones[arm.zone].menuWrites+=delta.menuWrites||0;
            if(claim.kind==='MENU_CREATE'&&claim.mode!=='BLOCK_BEFORE_FORWARD')slots[arm.zone]++;
            if(claim.createdId!==undefined){check(claim.kind==='MENU_CREATE'&&claim.mode!=='BLOCK_BEFORE_FORWARD'
                &&issued(claim)&&menuId(claim.createdId)&&!forbiddenMenu(claim.createdId)&&!fixtures.has(claim.createdId));
                fixtures.set(claim.createdId,{id:claim.createdId,zone:arm.zone,owner:claim.owner});counts.menus++;zones[arm.zone].menus++;}
            claimMap.set(claim.id,claim);
        }
        const allIds=s.arms.flatMap(a=>a.operationIds);check(new Set(allIds).size===allIds.length&&allIds.length===claimMap.size
            &&allIds.every(id=>claimMap.has(id))&&core.operationIds.length===83);
        check(zones.CORE.menus===21&&zones.CORE.menuWrites===79&&counts.denialRequests===10);
        for(const key of Object.keys(suiteLimits))check(counts[key]<=suiteLimits[key]);
        check(slots.CORE===21&&slots.SERVICE<=11&&zones.SERVICE.menuWrites<=24&&zones.SERVICE.menus<=11);
        exact(s.counts,Object.keys(suiteLimits));for(const key of Object.keys(counts))check(s.counts[key]===counts[key]);
        exact(s.zones,['CORE','SERVICE']);for(const zone of ['CORE','SERVICE']){exact(s.zones[zone],['menus','menuWrites']);
            for(const key of ['menus','menuWrites'])check(s.zones[zone][key]===zones[zone][key]);}
        exact(s.creationReservations,['CORE','SERVICE']);check(s.creationReservations.CORE===slots.CORE&&s.creationReservations.SERVICE===slots.SERVICE);
        check(s.fixtures.length===fixtures.size&&new Set(s.fixtures.map(f=>f.id)).size===s.fixtures.length);
        for(const f of s.fixtures){exact(f,['id','zone','owner']);const expected=fixtures.get(f.id);check(expected&&f.zone===expected.zone&&f.owner===expected.owner);}
        check(new Set(s.service.map(c=>c.id)).size===18);
        const selected=new Set();
        for(const cell of s.service){
            exact(cell,['id','kind','mode','status',...(cell.blockEvidence!==undefined?['blockEvidence']:[])]);const original=serviceCells.find(c=>c.id===cell.id);
            check(original&&cell.kind===original.kind&&cell.mode===original.mode
                &&['NOT_RUN','NOT_IMPLEMENTED','RUNNING','HOLD','OBSERVED_NOT_INDEPENDENTLY_ATTESTED','NO_FORWARD_PROVEN_CLIENT_UNKNOWN'].includes(cell.status));
            if(cell.status!=='NO_FORWARD_PROVEN_CLIENT_UNKNOWN')check(cell.blockEvidence===undefined);
            const relevant=s.claims.filter(claim=>claim.cellId===cell.id);check(new Set(relevant.map(c=>c.arm)).size<=1);
            if(['NOT_RUN','NOT_IMPLEMENTED'].includes(cell.status))check(relevant.length===0);
            else {
                const arm=relevant.length?armMap.get(relevant[0].arm):s.arms.at(-1);
                check(arm.zone==='SERVICE');selected.add(cell.id);
                if(['RUNNING','HOLD'].includes(cell.status))check(arm.currentCell===cell.id);
                else check(relevant.length>0&&relevant.some(claim=>(cell.mode==='BLOCK_BEFORE_FORWARD'?claim.state==='AUTHORIZED_ONCE':issued(claim))&&claim.mode===cell.mode));
                if(cell.status==='NO_FORWARD_PROVEN_CLIENT_UNKNOWN'){
                    check(cell.mode==='BLOCK_BEFORE_FORWARD');exact(cell.blockEvidence,blockKeysFor(cell.kind));
                    check(noForwardProven(cell.blockEvidence)&&(!cell.kind.endsWith('_UPLOAD')||cell.blockEvidence.fileRetained===true));
                }
                if(cell.status==='OBSERVED_NOT_INDEPENDENTLY_ATTESTED')check(cell.mode==='DELIVER');
            }
        }
        check(s.arms.slice(1).every(a=>a.currentCell===undefined||selected.has(a.currentCell)));
        const blocked=!s.arms.at(-1).terminalVerified;
        check(s.status===(blocked?'HOLD_NO_FURTHER_WRITES':'CORE_COMPLETE_SUITE_INCOMPLETE'));
        return {snapshot:s,counts,zones,slots,fixtures,claims:claimMap,blocked};
    }catch{throw Error('MANAGED_CHECKPOINT_REFUSED');}
}

export function prepareManagedSuite({ suiteId, batchInput, t1, ports, signal, initialSnapshot,checkpointReceipt } = {}) {
    check(safeKey(suiteId) && ports && typeof ports.claimSuite === 'function' && typeof ports.claimOperation === 'function');
    const restored=initialSnapshot===undefined?null:restoreCheckpoint(initialSnapshot,suiteId);
    check(restored||(t1?.flow === 'PASS_APP_BROWSER_API' && t1.cleanup === 'PRIVATE_VERIFIED' && t1.protection === 'PASS_API_REPRESENTATION'
        && t1.unknownWrite === false && menuId(t1.fixtureId) && !forbiddenMenu(t1.fixtureId) && t1.menuWrites === 6 && t1.sessions === 2));
    const baseline=restored?restored.snapshot.t1:{fixtureId:t1.fixtureId,menuWrites:6,sessions:2};
    const counts = restored?.counts||{ menus:1, createAttempts:1, menuWrites:6, shopWrites:0, blobUploads:0, sessions:2, denialRequests:0 };
    const zones = restored?.zones||{ CORE:{menus:1,menuWrites:6}, SERVICE:{menus:0,menuWrites:0} };
    const creationSlots = restored?.slots||{ CORE:1,SERVICE:0 };
    const fixtures = restored?.fixtures||new Map([[t1.fixtureId,{id:t1.fixtureId,zone:'CORE',owner:'S1'}]]);
    const claims = restored?.claims||new Map(), arms = restored?.snapshot.arms||[],
        cells = new Map((restored?.snapshot.service||serviceCells.map(c=>({...c,status:'NOT_RUN'}))).map(c=>[c.id,c]));
    let used=!!restored, current=null, blocked=restored?.blocked||false, active=false, coreComplete=!!restored,
        reconciling=false,denialHistory=restored?.snapshot.denialHistory||'NOT_RUN',checkpointState=restored?'PENDING':'LOCAL_SUITE',checkpointPromise;
    const missing = new Set(restored?.snapshot.missingPorts||[]);
    const verifyCheckpoint = async () => {
        if(!restored)return;
        checkpointPromise??=(async()=>{try{
            check(typeof ports.verifyCheckpoint==='function'&&await ports.verifyCheckpoint({snapshot:structuredClone(restored.snapshot),
                receipt:checkpointReceipt,suiteId,applicationSha:target.source})===true);
            checkpointState='VERIFIED';
        }catch{checkpointState='REFUSED';throw Error('MANAGED_CHECKPOINT_REFUSED');}})();
        await checkpointPromise;
    };
    const snapshot = () => ({checkpointVersion,applicationSha:target.source,t1:{...baseline},suiteId,
        status:blocked?'HOLD_NO_FURTHER_WRITES':coreComplete?'CORE_COMPLETE_SUITE_INCOMPLETE':'NOT_COMPLETE',
        counts:{...counts},zones:structuredClone(zones),fixtures:[...fixtures.values()].map(x=>({...x})),
        creationReservations:{...creationSlots},claims:[...claims.values()].map(claim=>structuredClone(claim)),
        arms:structuredClone(arms),service:[...cells.values()].map(x=>structuredClone(x)),missingPorts:[...missing],
        denialHistory,denialHistoryScope:'MENU_PUBLICATION_FOOD_ONLY_AUDIT_LOG_NOT_ATTESTED',
        crossRunResume:'VERIFY_CHECKPOINT_BEFORE_OPERATIONS',checkpointState,
        independentDatabase:'NOT_ATTESTED',livePass:false,automaticRetry:false,automaticCleanup:false});
    const hold = (arm, code) => { blocked=true;if(arm){arm.status='HOLD';arm.code=code;} };
    const reserve = delta => {
        for(const [key,value] of Object.entries(delta)) check(Number.isSafeInteger(value)&&value>=0&&counts[key]+value<=suiteLimits[key]);
        const zoneDelta=delta.menuWrites||0,limit=current.zone==='CORE'?coreLimits:serviceLimits;
        check(zones[current.zone].menuWrites+zoneDelta<=limit.menuWrites);
        for(const [key,value] of Object.entries(delta)) counts[key]+=value;
        zones[current.zone].menuWrites+=zoneDelta;
    };
    const authorize = async ({id,kind,mode='DELIVER',owner,cellId,resource}={}) => {
        const arm=current;
        try {
            check(active&&arm&&!blocked&&!signal?.aborted&&safeKey(id)&&operations.includes(kind)&&modes.includes(mode)
                && ['S1','S2'].includes(owner)&&!claims.has(id));
            check(arm.zone==='SERVICE'||mode==='DELIVER');
            if(arm.zone==='SERVICE'&&kind!=='SESSION')check(resource?.purpose==='RESTORE_PRIOR_SHOP'
                ?cellId===undefined&&arm.currentCell===undefined:cellId===arm.currentCell&&cells.has(cellId));
            const blockedSend=mode==='BLOCK_BEFORE_FORWARD';
            if(kind==='MENU_CREATE'&&!blockedSend){
                const limit=arm.zone==='CORE'?coreLimits:serviceLimits;
                check(creationSlots[arm.zone]<limit.menus&&creationSlots.CORE+creationSlots.SERVICE<suiteLimits.menus);
            }
            const delta=deltaFor(kind,mode);
            if(arm.zone==='CORE') check(!['SHOP_WRITE','BLOB_UPLOAD','SESSION'].includes(kind));
            if(kind==='SESSION') check(owner==='S1'&&mode==='DELIVER');
            const claim={id,kind,mode,owner,arm:arm.id,zone:arm.zone,state:'CLAIM_PENDING',...(cellId?{cellId}:{}),resource:structuredClone(resource)};
            validateResource(claim,fixtures,claims,arm,arms);
            reserve(delta);
            if(kind==='MENU_CREATE'&&!blockedSend)creationSlots[arm.zone]++;
            claims.set(id,claim);arm.operationIds.push(id);
            check(await ports.claimOperation(structuredClone(claim))===true);
            check(active&&!blocked&&!signal?.aborted&&current===arm);
            claim.state='AUTHORIZED_ONCE';
            const binding=structuredClone(claim.resource);if(binding.evidence)Object.freeze(binding.evidence);
            return Object.freeze({id,arm:arm.id,allowedForward:!blockedSend,resource:Object.freeze(binding)});
        } catch {hold(arm,'SEND_GUARD_OR_BUDGET_HELD');fail();}
    };
    const recordCreated = ({operationId,id}={}) => {
        try {
            const claim=claims.get(operationId);
            check(active&&!blocked&&claim?.arm===current?.id&&issued(claim)&&claim.kind==='MENU_CREATE'
                &&claim.mode!=='BLOCK_BEFORE_FORWARD'&&menuId(id)&&!forbiddenMenu(id)&&!fixtures.has(id)&&!claim.createdId);
            const limit=claim.zone==='CORE'?coreLimits:serviceLimits;
            check(counts.menus<suiteLimits.menus&&zones[claim.zone].menus<limit.menus);
            counts.menus++;zones[claim.zone].menus++;claim.createdId=id;
            fixtures.set(id,{id,zone:claim.zone,owner:claim.owner});
        } catch {hold(current,'CREATED_ID_OR_BUDGET_HELD');fail();}
    };
    const consumeSendPermission = ({id,resource}={}) => {
        try {
            const claim=claims.get(id);
            check(active&&!blocked&&!signal?.aborted&&claim?.arm===current?.id&&claim.state==='AUTHORIZED_ONCE'
                &&claim.mode!=='BLOCK_BEFORE_FORWARD'&&canonical(resource)===canonical(claim.resource));
            if(current.zone==='SERVICE'&&claim.kind!=='SESSION'&&claim.resource.purpose!=='RESTORE_PRIOR_SHOP')check(claim.cellId===current.currentCell);
            claim.state='FORWARD_CONSUMED';return Object.freeze({id,resource:structuredClone(claim.resource)});
        }catch{hold(current,'SEND_PERMISSION_REPLAY_OR_RESOURCE_HELD');fail();}
    };
    const openArm = (id,zone) => {
        check(!active&&!blocked&&!signal?.aborted&&safeKey(id)&&!arms.some(a=>a.id===id));
        const arm={id,zone,status:'RUNNING',operationIds:[],steps:[],terminalVerified:false};
        arms.push(arm);current=arm;active=true;return arm;
    };
    const requirePort = name => { if(typeof ports[name]!=='function'){missing.add(name);fail();}return ports[name]; };
    const assertTotals = (before,delta) => {for(const [key,n] of Object.entries(delta))check(counts[key]-before[key]===n);};
    const finish = async (arm,guard) => {
        if(arm&&[...claims.values()].some(claim=>claim.arm===arm.id&&claim.state==='CLAIM_PENDING'))hold(arm,'PENDING_SEND_PERMISSION_HELD');
        if(arm&&[...claims.values()].some(claim=>claim.arm===arm.id&&claim.mode!=='BLOCK_BEFORE_FORWARD'&&claim.state==='AUTHORIZED_ONCE'))hold(arm,'UNCONSUMED_SEND_PERMISSION_HELD');
        active=false;
        if(guard)try{check(await guard.remove()===true);}catch{hold(arm,'SEND_GUARD_REMOVAL_UNVERIFIED');}
        current=null;
    };
    return {
        snapshot,
        async executeCore() {
            check(!used);used=true;let arm,guard;
            try {
                check(await ports.claimSuite({suiteId,limits:suiteLimits})===true);
                arm=openArm('CORE','CORE');
                for(const name of ['installSendGuard','runControls','runDenials','cleanupKnownPrivate']) requirePort(name);
                guard=await ports.installSendGuard({authorize,consumeSendPermission,recordCreated,armId:arm.id});
                check(guard?.beforeSend===true&&typeof guard.remove==='function');
                let before={...counts};
                const batch=await (ports.prepareBatch||prepareOriginalBatchRun)(batchInput).execute();
                check(!blocked&&batch.status===batchStatus&&Array.isArray(batch.results)&&batch.results.length===3);
                check(batch.results[0].status==='SCENARIO_APP_RESPONSES_CONFIRMED_NOT_LIVE_PASS'
                    &&batch.results[1].status==='SCENARIO_STOP_CONFIRMED_LOT_HOLD_NOT_LIVE_PASS'
                    &&batch.results[2].status==='T4_STOP_API_AND_OBSERVATIONS_CONFIRMED_NOT_LIVE_PASS');
                assertTotals(before,{menus:17,createAttempts:17,menuWrites:49});arm.steps.push('T2_T3_T4_API_OBSERVATIONS');
                before={...counts};
                const controls=await ports.runControls({authorize,consumeSendPermission,recordCreated,fixtures:[...fixtures.values()]});
                check(!blocked&&controls?.priceFoodVersionUnchanged===true&&controls.stopFoodVersionUnchanged===true
                    &&controls.noSignalAutomaticStops===0&&controls.noSignalRequiredStopDenominator===0);
                assertTotals(before,{menus:3,createAttempts:3,menuWrites:10});arm.steps.push('THREE_CONTROLS');
                before={...counts};const denial=await ports.runDenials({authorize,consumeSendPermission,fixtures:[...fixtures.values()]});
                check(!blocked&&denial?.crossOwnerRefusals===8&&denial.staleVersionConflicts===2
                    &&denial.routeContractChecked===true&&denial.ownerStateUnchanged===true);
                // historyUnchanged covers menu/publication/food history only, after independent SQL.
                // Rejected requests may append AuditLog success:false entries; that is not an unchanged-history claim.
                if(denial.historyUnchanged===true&&denial.historyObservation===undefined)denialHistory='VERIFIED_INDEPENDENT_SQL';
                else {
                    check(denial.historyUnchanged===undefined&&denial.historyObservation==='PENDING_INDEPENDENT_SQL');
                    denialHistory='PENDING_INDEPENDENT_SQL';
                }
                assertTotals(before,{denialRequests:10,menuWrites:0});arm.steps.push('OWNER_AND_STALE_REFUSALS');
                const denialClaims=[...claims.values()].filter(c=>c.kind==='DENIAL');
                check(['S1','S2'].every(owner=>denialClaims.filter(c=>c.owner===owner&&c.resource.purpose.startsWith('CROSS_OWNER_')).length===4));
                before={...counts};const cleanup=await ports.cleanupKnownPrivate({authorize,consumeSendPermission,fixtures:[...fixtures.values()],
                    alreadyPrivateMustNotBeStoppedAgain:true,freshVersionRequired:true});
                check(!blocked&&Array.isArray(cleanup?.verifiedPrivateIds)&&cleanup.verifiedPrivateIds.length===21
                    &&new Set(cleanup.verifiedPrivateIds).size===21&&cleanup.verifiedPrivateIds.every(id=>fixtures.has(id))
                    &&cleanup.unknownWrite===false);
                assertTotals(before,{menuWrites:14});arm.steps.push('ALL_21_PRIVATE_API_VERIFIED');
                check(counts.menuWrites===79&&counts.menus===21);arm.status='CORE_API_SEQUENCE_COMPLETE';coreComplete=true;
            } catch {hold(arm,'CORE_INCOMPLETE_NO_AUTOMATIC_CLEANUP');}
            finally {await finish(arm,guard);}
            return snapshot();
        },
        async executeServiceArm({armId,cellIds}={}) {
            await verifyCheckpoint();
            check(coreComplete&&!blocked&&!active&&Array.isArray(cellIds)&&cellIds.length>0&&cellIds.length<=18
                &&new Set(cellIds).size===cellIds.length&&cellIds.every(id=>cells.get(id)?.status==='NOT_RUN'));
            const plan=cellIds.map(id=>cells.get(id));
            check(plan.at(-1).mode==='WITHHOLD_AFTER_RESPONSE'
                &&plan.every((cell,i)=>cell.mode!=='WITHHOLD_AFTER_RESPONSE'||i===plan.length-1)
                &&arms.filter(arm=>arm.zone==='SERVICE').length<6);
            if(typeof ports.runServiceCell!=='function'||typeof ports.prepareServiceActor!=='function'){
                missing.add('runServiceCell:SHOP_registry_restore_and_fault_arm_transport');
                missing.add('prepareServiceActor:existing_A_then_fresh_A_only');
                for(const cell of plan)cell.status='NOT_IMPLEMENTED';return snapshot();
            }
            const restores=[...claims.values()].filter(claim=>claim.kind==='SHOP_WRITE'&&claim.mode==='WITHHOLD_AFTER_RESPONSE'
                &&claim.resource.purpose==='PRIMARY'&&arms.find(a=>a.id===claim.arm)?.terminalVerified
                &&![...claims.values()].some(other=>other.resource.sourceClaimId===claim.id));
            if(restores.length)requirePort('restorePriorShop'); // Before opening/authenticating a new actor.
            let arm,guard;
            try {
                arm=openArm(armId,'SERVICE');
                guard=await requirePort('installSendGuard')({authorize,consumeSendPermission,recordCreated,armId:arm.id});
                check(guard?.beforeSend===true&&typeof guard.remove==='function');
                const first=arms.filter(item=>item.zone==='SERVICE').length===1;
                const permit=first?null:await authorize({id:armId+'_SESSION',kind:'SESSION',owner:'S1',
                    resource:{method:'NONE',path:'',purpose:'SESSION',shopId:ownerShop.S1}});
                if(permit)consumeSendPermission({id:permit.id,resource:permit.resource});
                const actor=await ports.prepareServiceActor({armId,existingActor:first,permit});
                check(actor?.owner==='S1'&&actor.identityVerified===true&&actor.separateFromClosedActors===true);
                if(restores.length){
                    const before=counts.shopWrites;
                    const result=await requirePort('restorePriorShop')({sources:restores.map(c=>({sourceClaimId:c.id,resource:structuredClone(c.resource)})),authorize,consumeSendPermission});
                    check(result?.unknownWrite===false&&result.freshStateMatched===true&&Array.isArray(result.verifiedSourceClaimIds)
                        &&result.verifiedSourceClaimIds.length===restores.length&&new Set(result.verifiedSourceClaimIds).size===restores.length
                        &&result.verifiedSourceClaimIds.every(id=>restores.some(c=>c.id===id))&&counts.shopWrites-before===restores.length);
                    check(restores.every(source=>[...claims.values()].some(c=>c.resource.purpose==='RESTORE_PRIOR_SHOP'
                        &&c.resource.sourceClaimId===source.id&&c.arm===arm.id&&issued(c))));
                }
                for(const cell of plan){
                    check(!blocked&&!signal?.aborted);cell.status='RUNNING';arm.currentCell=cell.id;
                    const result=await ports.runServiceCell({cell:{id:cell.id,kind:cell.kind,mode:cell.mode},authorize,consumeSendPermission,recordCreated});
                    const expectedKind=cell.kind==='MENU_CREATE'?'MENU_CREATE':['MENU_SAVE','STOP'].includes(cell.kind)?'MENU_WRITE'
                        :cell.kind==='SHOP_SAVE'?'SHOP_WRITE':'BLOB_UPLOAD';
                    check(result?.originalClaimRetained===true&&[...claims.values()].some(claim=>claim.arm===arm.id
                        &&claim.cellId===cell.id&&claim.kind===expectedKind&&claim.mode===cell.mode
                        &&(cell.mode==='BLOCK_BEFORE_FORWARD'?claim.state==='AUTHORIZED_ONCE':issued(claim))
                        &&claim.resource.purpose==='PRIMARY'));
                    if(cell.mode==='BLOCK_BEFORE_FORWARD'){
                        check(noForwardProven(result)&&(!cell.kind.endsWith('_UPLOAD')||result.fileRetained===true));
                        cell.blockEvidence=Object.fromEntries(blockKeysFor(cell.kind).map(key=>[key,result[key]]));
                        cell.status='NO_FORWARD_PROVEN_CLIENT_UNKNOWN';continue;
                    }
                    if(result.status==='HOLD'||result.clientUnknown===true){cell.status='HOLD';hold(arm,'SERVICE_TERMINAL_RECONCILIATION_REQUIRED');break;}
                    check(result.status==='KNOWN_OBSERVATION'&&result.clientUnknown===false&&result.followupWrites===0);
                    check(cell.mode==='DELIVER'&&result.forwardCalls===1&&result.bodyValidated===true);
                    cell.status='OBSERVED_NOT_INDEPENDENTLY_ATTESTED';
                }
                if(!blocked)arm.status='SERVICE_OBSERVATIONS_NOT_LIVE_PASS';
            }catch{hold(arm,'SERVICE_INCOMPLETE_NO_AUTOMATIC_CLEANUP');}
            finally{await finish(arm,guard);}
            return snapshot();
        },
        async reconcileTerminalArm(receipt) {
            let acquired=false;
            try {
                await verifyCheckpoint();
                check(!reconciling&&blocked&&!active&&arms.length>0);const arm=arms.at(-1);
                check(arm.status==='HOLD'&&!arm.terminalVerified&&typeof ports.verifyTerminalReadOnly==='function');
                reconciling=true;acquired=true;
                const resourceBindings=arm.operationIds.map(id=>{const claim=claims.get(id);return {operationId:id,kind:claim.kind,
                    mode:claim.mode,owner:claim.owner,resource:structuredClone(claim.resource)};});
                const resourcesSha256=resourceHash(resourceBindings);
                const result=await ports.verifyTerminalReadOnly({armId:arm.id,operationIds:[...arm.operationIds],resourceBindings,resourcesSha256,receipt});
                check(result?.source==='INDEPENDENT_READ_ONLY'&&result.originalTerminal===true&&result.unknownResolved===true
                    &&result.sessionsClosed===true&&result.pendingRequests===0&&Array.isArray(result.operationIds)
                    &&result.operationIds.length===arm.operationIds.length&&new Set(result.operationIds).size===result.operationIds.length
                    &&result.operationIds.every(id=>arm.operationIds.includes(id))&&result.resourcesSha256===resourcesSha256);
                // Preserve the original arm HOLD and its operation claims. No retry/reset/cleanup.
                arm.terminalVerified=true;blocked=false;return snapshot();
            }catch{fail();}finally{if(acquired)reconciling=false;}
        },
    };
}
