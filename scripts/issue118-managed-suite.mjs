// Callable controller only: no CLI, credentials, authentication, HTTP or fixture I/O.
// The owner installs the send guard on its existing managed transport. Every actual
// send must await authorize(), and every acknowledged 201 ID must call recordCreated().
import { prepareOriginalBatchRun,target } from './check-issue118-live-t1-browser.mjs';
import { createHash } from 'node:crypto';

export const suiteLimits = Object.freeze({ menus:32, createAttempts:33, menuWrites:103,
    shopWrites:4, blobUploads:5, sessions:7, denialRequests:10 });
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
