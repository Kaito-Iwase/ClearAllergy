// Local candidate only. Fixed original T2 projection; no auth/HTTP/default execution.
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {target} from './check-issue118-live-t1-browser.mjs';
import {scopedOidcHeaders} from './issue118-preview-transport.mjs';
import {assertOidcClaims} from './issue118-ci-auth.mjs';
import {planManaged414953Recovery} from './issue118-managed-suite.mjs';
export const completionScope='RESUME_414953_T2_FULL';
export const completionLimits=Object.freeze({menus:32,createAttempts:33,menuWrites:138,shopWrites:5,blobUploads:5,sessions:18,denialRequests:10});
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const t2Hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const need=v=>{if(!v)throw Error('T2_REOBSERVATION_REFUSED');};
const keys=Array.from({length:8},(_,i)=>'M0'+(i+1)),affected=['M01','M02','M05','M06'];
export const t2RecipeRun='fc6fd8a4-6f9a-4fa9-b30e-04981bf77f67';
export function t2ExpectedFood(key,corrected){
    need(keys.includes(key));const source=createRequire(import.meta.url)('tsx/cjs/api').require('./issue118-batch-stop.ts',import.meta.url);
    if(!corrected||!affected.includes(key))return source.projectOriginalPayloads(t2RecipeRun).expectedByMenu[key];
    const food={...source.t2PrivateCorrections(t2RecipeRun,['E21','E23']).find(c=>c.key===key).body};delete food.isPublished;return food;
}
export function t2Projection(m,owner){
    const source=createRequire(import.meta.url)('tsx/cjs/api').require('./issue118-batch-stop.ts',import.meta.url);
    need(m&&/^c[a-z0-9]+$/.test(m.id)&&Number.isSafeInteger(m.version)&&m.version>=0&&Number.isSafeInteger(m.foodVersion)&&m.foodVersion>=0
        &&typeof m.isPublished==='boolean'&&m.reviewedFoodVersion===null&&Array.isArray(m.foodReviews));
    return {id:m.id,owner,version:m.version,foodVersion:m.foodVersion,isPublished:m.isPublished,reviewedFoodVersion:null,
        publicationConfirmedFoodVersion:m.publicationConfirmedFoodVersion,foodSha256:t2Hash(source.fixturePayload(m)),reviewsSha256:t2Hash(m.foodReviews)};
}
export function t2Commands(snapshot){
    const bind=key=>{const c=snapshot.claims.find(c=>c.id==='T2_'+key+'_CREATE');need(c?.createdId);return {key,id:c.createdId,owner:Number(key.slice(1))<=4?'S1':'S2'};};
    return [['B_CLEANUP',keys.slice(4)],['RESET',affected],['BASELINE_PUBLISH',keys],['SIGNAL_STOP',affected],['CORRECT',affected],['REPUBLISH',affected],['FINAL_PRIVATE',keys]]
        .flatMap(([phase,selected])=>selected.map(key=>({...bind(key),phase,claimId:'REOBSERVE_T2_'+phase+'_'+key,
            kind:['B_CLEANUP','SIGNAL_STOP','FINAL_PRIVATE'].includes(phase)?'STOP':['BASELINE_PUBLISH','REPUBLISH'].includes(phase)?'PUBLISH':'SAVE',
            ui:['SIGNAL_STOP','CORRECT','REPUBLISH'].includes(phase)})));
}
export function planManagedT2Completion(input){
    const old=planManaged414953Recovery(input),commands=t2Commands(input.snapshot);
    need(commands.length===36&&new Set(commands.map(c=>c.claimId)).size===36);
    const extra=commands.slice(4).map(c=>({plannedClaimId:'PLAN_'+c.claimId,case:'T2_REOBSERVATION',kind:c.kind==='SAVE'?'WRITE':c.kind,channel:'MENU',menuKey:c.id,owner:c.owner,arm:0}));
    const merged=[...old.futureManifest.slice(0,4),...extra,...old.futureManifest.slice(4)],exposed=new Map(commands.slice(0,4).map(c=>[c.id,c.owner]));
    let menuWrites=42,shopWrites=0,blobUploads=0,peak=4;const checkpoints=[],manifest=[];
    for(const a of merged){const before=menuWrites,stops=exposed.size+(a.kind==='PUBLISH'?1:0);
        need(menuWrites+(a.channel==='MENU'?1:0)+stops-(a.kind==='STOP'?1:0)+1<=138);
        if(a.kind==='PUBLISH'){need(!exposed.has(a.menuKey));exposed.set(a.menuKey,a.owner);}if(a.kind==='STOP'){need(exposed.has(a.menuKey));exposed.delete(a.menuKey);}
        if(a.channel==='MENU')menuWrites++;if(a.channel==='SHOP')shopWrites++;if(a.channel==='BLOB')blobUploads++;
        peak=Math.max(peak,exposed.size);manifest.push({...a,writesBeforeForward:before,stopReservationsBeforeForward:stops,ownerRecoverySessionReserve:{S1:1,S2:1},unexpectedRecoveryWriteReserve:{menuStop:1,shopRestore:1,singleUnexpectedCutOnly:true}});
        let c=checkpoints.at(-1);if(c?.case!==a.case){c={case:a.case,menuWrites:0,shopWrites:0,blobUploads:0};checkpoints.push(c);}
        if(a.channel==='MENU')c.menuWrites++;if(a.channel==='SHOP')c.shopWrites++;if(a.channel==='BLOB')c.blobUploads++;c.publicStopReservations=exposed.size;
    }
    need(menuWrites===137&&shopWrites===4&&blobUploads===5&&exposed.size===0);
    const cuts=[];for(let cut=0;cut<manifest.length;cut++)for(const committed of [true,false]){
        const publicIds=new Map(commands.slice(0,4).map(c=>[c.id,c.owner]));let spent=42,shop=0,changed=false;
        for(let i=0;i<=cut;i++){const a=manifest[i];if(a.channel==='MENU')spent++;if(a.channel==='SHOP')shop++;
            if(i===cut&&!committed)break;if(a.kind==='PUBLISH')publicIds.set(a.menuKey,a.owner);if(a.kind==='STOP')publicIds.delete(a.menuKey);
            if(a.kind==='SHOP_SAVE')changed=true;if(a.kind==='SHOP_RESTORE')changed=false;}
        need(spent+publicIds.size<=138&&shop+(changed?1:0)<=5);
        const owners=new Set(publicIds.values());if(changed)owners.add('S1');
        cuts.push({cutAfter:manifest[cut].plannedClaimId,serverCommitted:committed,originalHeld:true,normalRetries:0,
            beforeIndependentTerminal:{normalActions:0,recoverySessions:0,recoveryWrites:0},
            afterIndependentTerminal:{normalActions:0,recoverySessions:{S1:owners.has('S1')?1:0,S2:owners.has('S2')?1:0},recoveryStopWrites:publicIds.size,recoveryShopRestores:changed?1:0,
                status:'RECOVERY_BOUNDED_ONLY_NOT_COVERAGE_PASS'},requiresExactFreshStateAndIndependentTerminal:true});
    }
    const owners=['S1','S2',...old.sessionPrefixes.map(p=>p.owner)];need(owners.length===9);
    const prefixes=owners.map((owner,i)=>({owner,consumedBeforeAuthentication:7+i,reservedRecovery:{S1:1,S2:1},remainingNormalSessions:owners.length-i}));
    return {...old,normalExpected:{...old.normalExpected,menuWrites:137,sessions:16},reservedMaximum:{...completionLimits},
        t2Reobservation:{newMenus:0,menuWrites:32,prefixWritesIncludingBPrivate:36,normalSessions:2},
        remaining:{...old.remaining,menuWrites:95,expectedSessions:9},futureManifest:manifest,caseBudgets:checkpoints,cutContrasts:cuts,sessionPrefixes:prefixes,
        sessionExpectedTotal:16,peakStopReservations:peak,caseWrites:{existingBPrivate:4,t2Reobservation:32,t3Resume:16,t3Private:6,t4:3,controls:10,service:24},
        unmeasured:['HUMAN_BURDEN_AND_SAFETY','ORIGINAL_BYTE_IDENTICAL_COMPARISON','FRESHNESS_SLO'],extraT2RepublicationWritesBudgeted:true,
        coverage:'NOT_ATTESTED',liveEnabled:false};
}
const exact=(v,list)=>need(v&&Object.keys(v).length===list.length&&list.every(k=>Object.hasOwn(v,k)));
function checkProjection(p){exact(p,['id','owner','version','foodVersion','isPublished','reviewedFoodVersion','publicationConfirmedFoodVersion','foodSha256','reviewsSha256']);
    need(/^c[a-z0-9]+$/.test(p.id)&&['S1','S2'].includes(p.owner)&&['version','foodVersion'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)
        &&typeof p.isPublished==='boolean'&&p.reviewedFoodVersion===null&&(p.publicationConfirmedFoodVersion===null||Number.isSafeInteger(p.publicationConfirmedFoodVersion))
        &&['foodSha256','reviewsSha256'].every(k=>/^[a-f0-9]{64}$/.test(p[k])));}
export function validateT2PrefixCheckpoint({snapshot,terminal,authorization,prefixCheckpoint,prefixReceipt,now=Date.now(),historical=false}){
    try{
        need(authorization.scope===completionScope&&canonical(authorization.limits)===canonical(completionLimits));
        const x=prefixCheckpoint,p=prefixReceipt,s=x?.controller;
        exact(x,['version','controller','sessionLedger','source']);need(x.version===1);
        exact(s,['version','kind','applicationSha','deployment','status','livePass','oldClaimsSha256','originalSnapshotSha256','originalTerminalSha256','runId',
            'claims','initialRows','finalRows','observations','counts','automaticRetry','automaticCleanup','firstFailure']);
        need(s.version===1&&s.kind==='T2_REOBSERVATION_PREFIX'&&s.applicationSha===target.source&&s.deployment===target.deployment
            &&s.status==='T2_PRIVATE_PENDING_INDEPENDENT_SQL'&&s.firstFailure===null&&s.livePass===false&&s.automaticRetry===false&&s.automaticCleanup===false
            &&s.oldClaimsSha256===authorization.oldClaimsSha256&&s.originalSnapshotSha256===t2Hash(snapshot)&&s.originalTerminalSha256===t2Hash(terminal)
            &&/^[a-f0-9-]{36}$/.test(s.runId));
        const expected=t2Commands(snapshot),rows=new Map(),ids=new Set(terminal.consumedRequestIds);
        need(s.initialRows.length===11&&new Set(s.initialRows.map(r=>r.id)).size===11);
        for(const r of s.initialRows){checkProjection(r);const prior=terminal.menus.find(m=>m.id===r.id);
            need(prior&&prior.owner===r.owner&&prior.version===r.version&&prior.foodVersion===r.foodVersion&&prior.isPublished===r.isPublished);rows.set(r.id,r);}
        const bindings=new Map(expected.map(c=>[c.id,c]));for(const [id,c] of bindings){const r=rows.get(id);need(r&&r.foodSha256===t2Hash(t2ExpectedFood(c.key,affected.includes(c.key))));}
        need(s.claims.length===36);for(const [i,c] of s.claims.entries()){
            exact(c,['id','key','phase','owner','kind','resource','state','requestId','before','after','uiObserved']);const e=expected[i];
            need(c.id===e.claimId&&c.key===e.key&&c.phase===e.phase&&c.owner===e.owner&&c.kind==='MENU_WRITE'
                &&c.state==='CONFIRMED_RESPONSE_AND_READBACK'&&/^[a-f0-9-]{36}$/.test(c.requestId)&&!ids.has(c.requestId));ids.add(c.requestId);
            const before=rows.get(e.id);need(canonical(c.before)===canonical(before));checkProjection(c.after);
            need(c.after.id===e.id&&c.after.owner===e.owner&&c.after.reviewsSha256===before.reviewsSha256&&c.after.version>before.version&&c.uiObserved===e.ui);
            const publish=e.kind==='PUBLISH',save=e.kind==='SAVE',corrected=['CORRECT','REPUBLISH','FINAL_PRIVATE'].includes(e.phase)&&affected.includes(e.key);
            const food=t2Hash(t2ExpectedFood(e.key,save?e.phase==='CORRECT':e.phase==='B_CLEANUP'||e.phase==='FINAL_PRIVATE'||e.phase==='REPUBLISH'?affected.includes(e.key):false));
            need(c.after.foodSha256===food&&c.after.isPublished===publish);
            if(save)need(!before.isPublished&&c.after.foodVersion>before.foodVersion&&c.after.publicationConfirmedFoodVersion===null);
            else{need(before.isPublished===(e.kind==='STOP')&&c.after.foodVersion===before.foodVersion
                &&c.after.version===before.version+(publish?3:1)&&c.after.publicationConfirmedFoodVersion===(publish?before.foodVersion:before.publicationConfirmedFoodVersion));}
            need(canonical(c.resource)===canonical({method:e.kind==='STOP'?'POST':'PUT',path:'/api/admin/menus/'+e.id+(e.kind==='STOP'?'/stop':''),
                shopId:e.owner==='S1'?target.shop:'cmvs4x9h80011wn0w7s8abaie',menuId:e.id,purpose:'CORE',beforeVersion:before.version}));
            need(!corrected||c.after.foodSha256===t2Hash(t2ExpectedFood(e.key,true)));rows.set(e.id,c.after);
        }
        need(s.finalRows.length===11&&new Set(s.finalRows.map(r=>r.id)).size===11);for(const r of s.finalRows)need(r.isPublished===false&&canonical(r)===canonical(rows.get(r.id)));
        need(canonical(s.counts)===canonical({menus:11,createAttempts:11,menuWrites:78,shopWrites:0,blobUploads:0,sessions:9,denialRequests:0}));
        need(Array.isArray(s.observations)&&canonical(s.observations.map(o=>o.phase))===canonical(['BASELINE','AFTER_STOP','AFTER_CORRECT','AFTER_REPUBLISH','FINAL_PRIVATE']));
        for(const o of s.observations)validateT2Observation(o,snapshot);
        exact(x.source,['githubRunId','runnerSha','artifactSha256','jobTerminal','pendingRequests','sessionsClosed']);
        need(/^\d+$/.test(x.source.githubRunId)&&/^[a-f0-9]{40}$/.test(x.source.runnerSha)&&/^[a-f0-9]{64}$/.test(x.source.artifactSha256)
            &&x.source.jobTerminal===true&&x.source.pendingRequests===0&&x.source.sessionsClosed===true);
        exact(x.sessionLedger,['version','baselineConsumed','attempts']);need(x.sessionLedger.version===1&&x.sessionLedger.baselineConsumed===7&&x.sessionLedger.attempts.length===2);
        const sessions=new Set();x.sessionLedger.attempts.forEach((a,i)=>{exact(a,['index','owner','sessionId','providerCreatedUtc','providerStatus','terminated','localClosed','sourceGithubRunId','runnerSha']);need(a.index===i+1&&a.owner===(i?'S2':'S1')&&/^sess_[A-Za-z0-9]+$/.test(a.sessionId)
            &&!sessions.has(a.sessionId)&&a.terminated===true&&a.localClosed===true&&['removed','ended','revoked','expired','abandoned','replaced'].includes(a.providerStatus)
            &&Number.isFinite(Date.parse(a.providerCreatedUtc))&&Date.parse(a.providerCreatedUtc)>=Date.parse('2026-11-02T18:42:53.901Z')
            &&Date.parse(a.providerCreatedUtc)<=Date.parse(p?.observedUtc)&&a.runnerSha===x.source.runnerSha&&a.sourceGithubRunId===x.source.githubRunId);sessions.add(a.sessionId);});
        exact(p,['source','readOnly','project','branch','database','applicationSha','deployment','prefixSha256','unknownResolved','sessionsClosed','pendingRequests','menuWrites','globalSessionConsumption','allHistoryMatched','exclusive','rows','requestIds','observedUtc']);
        need(p?.source==='INDEPENDENT_READ_ONLY'&&p.readOnly===true&&p.project==='patient-heart-55595249'&&p.branch==='br-flat-wildflower-aoeragrs'&&p.database==='clearallergy_main19'
            &&p.applicationSha===target.source&&p.deployment===target.deployment&&p.prefixSha256===t2Hash(x)&&p.unknownResolved===true&&p.sessionsClosed===true
            &&p.pendingRequests===0&&p.menuWrites===78&&p.globalSessionConsumption===9&&p.allHistoryMatched===true&&p.exclusive===true
            &&canonical(p.rows)===canonical(s.finalRows)&&canonical(p.requestIds)===canonical(s.claims.map(c=>c.requestId)));
        const at=Date.parse(p.observedUtc);need(Number.isFinite(at)&&at<=now&&(historical||now-at<=3600000));
        return {controller:structuredClone(s),sessionLedger:structuredClone(x.sessionLedger),rows:structuredClone(s.finalRows),checkpointSha256:t2Hash(x),source:structuredClone(x.source)};
    }catch{throw Error('T2_PREFIX_CHECKPOINT_REFUSED');}
}
export function validateT2Observation(o,snapshot){
    exact(o,['phase','evidenceIds','rows']);need(['BASELINE','AFTER_STOP','AFTER_CORRECT','AFTER_REPUBLISH','FINAL_PRIVATE'].includes(o.phase));
    need(canonical(o.evidenceIds)===canonical(o.phase==='AFTER_STOP'?['E21','E22','E23']:[]));
    need(o.rows.length===8&&new Set(o.rows.map(r=>r.key)).size===8);
    for(const r of o.rows){exact(r,['id','key','owner','isPublished','ownerFoodMatched','ownerRevisionMatched','adminFieldsMatched','adminPublicationMatched','publicApiStatus','publicFieldsMatched','publicDomMatched','shopMembershipMatched']);
        const c=t2Commands(snapshot).find(c=>c.key===r.key),priv=o.phase==='FINAL_PRIVATE'||['AFTER_STOP','AFTER_CORRECT'].includes(o.phase)&&affected.includes(r.key);
        need(c&&r.id===c.id&&r.owner===c.owner&&r.isPublished===!priv&&r.publicApiStatus===(priv?404:200)
            &&['ownerFoodMatched','ownerRevisionMatched','adminFieldsMatched','adminPublicationMatched','publicFieldsMatched','publicDomMatched','shopMembershipMatched'].every(k=>r[k]===true));}
}
export function prepareT2Reobservation({snapshot,terminal,authorization,runId,ports}){
    const plan=planManagedT2Completion({snapshot,terminal});need(authorization?.status==='APPROVED'&&authorization.scope===completionScope
        &&canonical(authorization.limits)===canonical(completionLimits)&&authorization.oldClaimsSha256===plan.inherited.claimsSha256&&/^[a-f0-9-]{36}$/.test(runId));
    const seenRequests=new Set(terminal.consumedRequestIds);
    const initialRows=[],claims=[],observations=[],states=new Map(),stop=new Set(terminal.menus.filter(m=>m.isPublished).map(m=>m.id));let held=false,used=false,active,guard,observingPhase;
    const result={version:1,kind:'T2_REOBSERVATION_PREFIX',applicationSha:target.source,deployment:target.deployment,status:'PREPARED_NO_AUTH',livePass:false,
        oldClaimsSha256:plan.inherited.claimsSha256,originalSnapshotSha256:t2Hash(snapshot),originalTerminalSha256:t2Hash(terminal),runId,claims,initialRows,finalRows:[],observations,
        counts:{menus:11,createAttempts:11,menuWrites:42,shopWrites:0,blobUploads:0,sessions:9,denialRequests:0},automaticRetry:false,automaticCleanup:false,firstFailure:null};
    const view=()=>structuredClone(result),commandList=t2Commands(snapshot);
    const boundary={authorize:async value=>{try{need(!held&&active&&!active.claimed&&canonical(value)===canonical({id:active.claim.id,kind:'MENU_WRITE',owner:active.claim.owner,resource:active.claim.resource}));active.claimed=true;
            need(result.counts.menuWrites+1+stop.size-(active.command.kind==='STOP'?1:0)+1<=completionLimits.menuWrites);
            if(active.command.kind==='PUBLISH'){need(await ports.reserveRecoveryBudget({type:'STOP_WRITE',scope:completionScope,menuId:active.command.id,owner:active.command.owner,slots:1,sourceClaimId:active.claim.id})===true);stop.add(active.command.id);}
            need(!held&&await ports.claimOperation(structuredClone(active.claim))===true&&!held);claims.push(active.claim);return {id:value.id,resource:structuredClone(value.resource),allowedForward:true};}catch{held=true;throw Error('T2_AUTHORIZATION_HELD');}},
        consumeSendPermission:value=>{try{need(!held&&active?.claimed&&!active.consumed&&value.id===active.claim.id&&canonical(value.resource)===canonical(active.claim.resource));active.consumed=true;active.claim.state='FORWARD_CONSUMED';result.counts.menuWrites++;}catch{held=true;throw Error('T2_CONSUMPTION_HELD');}},
        recordCreated:async()=>{throw Error('T2_NO_CREATE');}};
    const observe=async phase=>{observingPhase=phase;const expected=commandList.filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i).map(c=>({...c,menu:states.get(c.id)}));
        const o=await ports.observeT2({phase,fixtures:expected,evidenceIds:phase==='AFTER_STOP'?['E21','E22','E23']:[]});try{validateT2Observation(o,snapshot);}catch{result.firstFailure={stage:phase,rows:Array.isArray(o?.rows)?o.rows.map(r=>({key:keys.includes(r.key)?r.key:'UNKNOWN',...Object.fromEntries(['ownerFoodMatched','ownerRevisionMatched','adminFieldsMatched','adminPublicationMatched','publicFieldsMatched','publicDomMatched','shopMembershipMatched'].map(k=>[k,r[k]===true]))})):[]};throw Error('T2_PHASE_OBSERVATION_REFUSED');}observations.push(structuredClone(o));observingPhase=undefined;};
    return {snapshot:view,async initialize(){need(!used&&!guard&&!held);need(await ports.verifyApproval()===true&&await ports.verifyCheckpoint()===true);
            need(await ports.reserveRecoveryBudget({type:'T2_PREFIX_OWNER_SESSIONS',scope:completionScope,limits:{...completionLimits},normal:{S1:1,S2:1},recovery:{S1:1,S2:1}})===true);
            guard=await ports.installSendGuard(boundary);need(guard?.beforeSend===true);result.status='READY_NO_AUTH';return view();},
        async execute(){need(!used&&!held&&guard);used=true;
            try{for(const f of snapshot.fixtures){const m=await ports.readT2({id:f.id,owner:f.owner});const r=t2Projection(m,f.owner),old=terminal.menus.find(x=>x.id===f.id);
                need(r.version===old.version&&r.foodVersion===old.foodVersion&&r.isPublished===old.isPublished);initialRows.push(r);states.set(f.id,m);}
                for(const [i,c] of commandList.entries()){
                    if(i===16){const evidence=await ports.readT2Evidence();need(evidence?.source==='ORIGINAL_T2_EVIDENCE'&&canonical(evidence.evidenceIds)===canonical(['E21','E22','E23']));}
                    const before=states.get(c.id),fresh=await ports.readT2(c);need(canonical(t2Projection(fresh,c.owner))===canonical(t2Projection(before,c.owner)));
                    const priorCorrected=i<4||c.phase==='RESET';need(t2Projection(before,c.owner).foodSha256===t2Hash(t2ExpectedFood(c.key,priorCorrected||['REPUBLISH','FINAL_PRIVATE'].includes(c.phase)?affected.includes(c.key):false)));
                    if(c.kind==='PUBLISH')need(!before.isPublished);if(c.kind==='STOP')need(before.isPublished&&stop.has(c.id));
                    const resource={method:c.kind==='STOP'?'POST':'PUT',path:'/api/admin/menus/'+c.id+(c.kind==='STOP'?'/stop':''),shopId:c.owner==='S1'?target.shop:'cmvs4x9h80011wn0w7s8abaie',menuId:c.id,purpose:'CORE',beforeVersion:before.version};
                    const record={id:c.claimId,key:c.key,phase:c.phase,owner:c.owner,kind:'MENU_WRITE',resource,state:'AUTHORIZED_ONCE',requestId:null,before:t2Projection(before,c.owner),after:null,uiObserved:false};
                    active={command:c,claim:record,claimed:false,consumed:false};const response=await ports.writeT2({command:c,claim:{id:record.id,kind:record.kind,owner:record.owner,resource},resource,before});
                    // The boundary owns the full durable record; the sender receives only immutable operation identity.
                    need(active.consumed&&response?.status===200&&/^[a-f0-9-]{36}$/.test(response.requestId)&&!seenRequests.has(response.requestId));seenRequests.add(response.requestId);
                    const after=await ports.readT2(c);need(canonical(after)===canonical(response.menu));const projected=t2Projection(after,c.owner);
                    need(projected.id===c.id&&projected.version>before.version&&projected.reviewsSha256===record.before.reviewsSha256&&projected.isPublished===(c.kind==='PUBLISH'));
                    need(projected.foodSha256===t2Hash(t2ExpectedFood(c.key,['CORRECT','REPUBLISH','FINAL_PRIVATE'].includes(c.phase)&&affected.includes(c.key)||c.phase==='B_CLEANUP'&&affected.includes(c.key))));
                    if(c.kind==='SAVE')need(!before.isPublished&&projected.foodVersion>before.foodVersion&&projected.publicationConfirmedFoodVersion===null);
                    else need(projected.foodVersion===before.foodVersion&&projected.version===before.version+(c.kind==='PUBLISH'?3:1)&&projected.publicationConfirmedFoodVersion===(c.kind==='PUBLISH'?before.foodVersion:before.publicationConfirmedFoodVersion));
                    need(response.uiObserved===c.ui);Object.assign(record,{state:'CONFIRMED_RESPONSE_AND_READBACK',requestId:response.requestId,after:projected,uiObserved:response.uiObserved});states.set(c.id,after);active=undefined;if(c.kind==='STOP')stop.delete(c.id);
                    if(i===15)await observe('BASELINE');if(i===19)await observe('AFTER_STOP');if(i===23)await observe('AFTER_CORRECT');if(i===27)await observe('AFTER_REPUBLISH');
                }
                need(stop.size===0);await observe('FINAL_PRIVATE');for(const f of snapshot.fixtures){const got=t2Projection(await ports.readT2(f),f.owner);need(!got.isPublished);
                    if(!commandList.some(c=>c.id===f.id))need(canonical(got)===canonical(initialRows.find(r=>r.id===f.id)));result.finalRows.push(got);}
                need(result.counts.menuWrites===78);result.status='T2_PRIVATE_PENDING_INDEPENDENT_SQL';
            }catch{held=true;result.firstFailure??={stage:active?.command.phase??observingPhase??'BASELINE_READ',code:'FIXED_CONTRACT_OR_PROVIDER_FAILURE'};result.status='HOLD_T2_REOBSERVATION_NO_RETRY_OR_CLEANUP';}
            finally{active=undefined;try{need(await guard.remove()===true);}catch{result.status='HOLD_T2_GUARD_REMOVAL';}guard=undefined;}
            return view();}};
}

const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('T2_UI_TIMEOUT_HELD')),45000);})]);}finally{clearTimeout(timer);}};
// Uses the real existing edit/confirmation UI, but this handler is the sole
// mutation sender. No route.continue header inheritance or response substitution.
export async function dispatchT2Ui({actor,command,data,permit,resource,boundary,verify}){
    let page,handler,used=false,resolveResult,rejectResult,failed=false;
    const result=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});result.catch(()=>{});
    try{
        page=await actor.context.newPage();const url=target.origin+'/admin/menus/'+command.id+'/edit';
        const nav=await page.goto(url,{waitUntil:'load',timeout:20000});need(nav?.status()===200&&page.url()===url);
        await page.waitForFunction(id=>window.Clerk?.user?.id===id,actor.expectedUserId);
        need(await page.locator('#edit-menu-field-1').inputValue()===t2ExpectedFood(command.key,false).name);
        if(command.phase==='CORRECT'){
            await page.locator('#edit-menu-field-5').fill(data.ingredients);
            await page.getByRole('group',{name:'乳',exact:true}).getByRole('button',{name:'含む',exact:true}).click();
        }
        const panel=page.getByRole('region',{name:/保存しました|保存済み内容の確認/});
        if(command.phase==='REPUBLISH'){
            await page.getByRole('button',{name:'公開する',exact:true}).click();
            await panel.getByText(t2ExpectedFood(command.key,true).name,{exact:true}).waitFor();
        }
        need(typeof actor.lifecycle?.tracker?.wrap==='function');
        handler=actor.lifecycle.tracker.wrap(async route=>{
            const req=route.request();if(req.method()==='GET')return route.fallback();
            try{need(!used&&req.url()===target.origin+resource.path&&req.method()===resource.method&&req.frame()===page.mainFrame());
                const raw=req.postDataBuffer()||Buffer.alloc(0);need(command.kind==='STOP'?raw.length===0:canonical(JSON.parse(raw.toString('utf8')))===canonical(data));
                used=true;await verify();need((await page.evaluate(()=>window.Clerk?.user?.id))===actor.expectedUserId);
                const headers=scopedOidcHeaders(req.url(),await req.allHeaders(),assertOidcClaims(actor.access.token()));
                boundary.consumeSendPermission({id:permit.id,resource});
                const response=await route.fetch({headers,maxRedirects:0,maxRetries:0,timeout:20000});need(response.status()===200);
                const body=await response.json();need(command.kind==='STOP'?body?.ok===true&&body.menu?.id===command.id&&body.menu.isPublished===false:body?.menu?.id===command.id);
                await route.fulfill({response});resolveResult(response);
            }catch{failed=true;try{await route.abort('failed');}catch{/* fixed refusal */}rejectResult(Error('T2_UI_REQUEST_HELD'));}
        });
        await page.route('**/api/admin/**',handler);
        if(command.kind==='STOP'){
            const dialog=new Promise((resolve,reject)=>page.once('dialog',async d=>{try{need(d.type()==='confirm');await d.accept();resolve();}catch{reject(Error('T2_DIALOG_HELD'));}}));
            await bounded(Promise.all([dialog,page.getByRole('button',{name:'公開を停止する',exact:true}).click()]));
        }else if(command.phase==='CORRECT')await page.getByRole('button',{name:'保存する',exact:true}).click();
        else await panel.getByRole('button',{name:'この内容で公開',exact:true}).click();
        const response=await bounded(result);need(used&&!failed);
        if(command.phase==='CORRECT')await page.getByRole('region',{name:'保存しました',exact:true}).waitFor();
        else if(command.kind==='STOP')await page.getByText(/公開停止を保存しました。編集を続ける前に最新内容を確認してください。|公開停止を保存しましたが、公開表示の更新処理が未完了です。/,{exact:true}).waitFor();
        else await page.getByText('保存済み内容を公開しました。',{exact:true}).waitFor();
        const drained=await actor.lifecycle.tracker.drain(),state=actor.lifecycle.tracker.snapshot();need(!failed&&used&&drained.status==='QUIET_CONFIRMED'&&state.pending===0&&state.started===state.settled);
        return response;
    }catch{throw Error('T2_UI_HELD_NO_RETRY');}
    finally{if(page){try{if(handler)await page.unroute('**/api/admin/**',handler);await page.close({runBeforeUnload:false});need(page.isClosed());}catch{throw Error('T2_UI_CLOSE_UNVERIFIED');}}}
}
export async function observeT2RuntimePhase({phase,fixtures,evidenceIds,actors,readOwner,verify}){
    const rows=[],pages=[];
    try{
        for(const f of fixtures){const actor=actors.get(f.owner);need(actor);await verify(f.owner);
            const m=await readOwner(f.id,f.owner),expected=f.menu;need(canonical(t2Projection(m,f.owner))===canonical(t2Projection(expected,f.owner)));
            const page=await actor.context.newPage();pages.push(page);const edit=target.origin+'/admin/menus/'+f.id+'/edit';
            const r=await page.goto(edit,{waitUntil:'load',timeout:20000});need(r?.status()===200&&page.url()===edit);
            await page.waitForFunction(id=>window.Clerk?.user?.id===id,actor.expectedUserId);
            const milk=m.allergens.find(a=>a.slug==='milk')?.status,label=milk==='CONTAINS'?'含む':'原材料に含まない登録';
            const fields=await page.locator('#edit-menu-field-1').inputValue()===m.name&&await page.locator('#edit-menu-field-5').inputValue()===m.ingredients
                &&await page.locator('#edit-menu-field-2').inputValue()===String(m.priceYen)
                &&await page.getByRole('group',{name:'乳',exact:true}).getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed')==='true';
            const adminPublication=await page.getByText('保存済みの公開設定：'+(m.isPublished?'公開':'非公開'),{exact:true}).count()===1;
            const api=await actor.access.read(actor.context.request,target.origin+'/api/menus/'+f.id),status=api.status();let publicFields=false;
            if(m.isPublished){const body=await api.json();publicFields=status===200&&body?.menu?.id===f.id&&body.menu.name===m.name&&body.menu.ingredients===m.ingredients&&body.menu.allergens.find(a=>a.slug==='milk')?.status===milk;}
            else publicFields=status===404;
            const pub=target.origin+'/shops/'+actor.binding.shopId+'/menus/'+f.id,nav=await page.goto(pub,{waitUntil:'load',timeout:20000});need(page.url()===pub);
            const milkDom=!m.isPublished||milk!=='CONTAINS'||/含む(?!可能性)/.test(await page.getByText('乳',{exact:true}).locator('..').innerText());
            const dom=m.isPublished?nav?.status()===200&&await page.getByRole('heading',{name:m.name,exact:true}).count()===1&&await page.getByText(m.ingredients,{exact:true}).count()>0&&milkDom:
                [200,404].includes(nav?.status())&&await page.getByRole('heading',{name:'ページが見つかりません',exact:true}).count()>0&&await page.getByRole('heading',{name:m.name,exact:true}).count()===0;
            const shop=target.origin+'/shops/'+actor.binding.shopId,shopResponse=await page.goto(shop,{waitUntil:'load',timeout:20000});need(page.url()===shop);
            need(shopResponse?.status()===200||shopResponse?.status()===404&&!m.isPublished&&await page.getByRole('heading',{name:'ページが見つかりません',exact:true}).count()>0);
            const member=await page.locator('a[href="/shops/'+actor.binding.shopId+'/menus/'+f.id+'"]').count()>0;
            rows.push({id:f.id,key:f.key,owner:f.owner,isPublished:m.isPublished,ownerFoodMatched:true,ownerRevisionMatched:true,
                adminFieldsMatched:fields,adminPublicationMatched:adminPublication,publicApiStatus:status,publicFieldsMatched:publicFields,publicDomMatched:dom,shopMembershipMatched:member===m.isPublished});
            await page.close({runBeforeUnload:false});need(page.isClosed());
        }
        return {phase,evidenceIds,rows};
    }catch{throw Error('T2_OBSERVATION_HELD');}
    finally{for(const p of pages)if(!p.isClosed()){try{await p.close({runBeforeUnload:false});need(p.isClosed());}catch{throw Error('T2_OBSERVATION_CLOSE_UNVERIFIED');}}}
}
