// Close the context BEFORE the browser; never let one success prove both.
// Results are fixed booleans only; provider errors/handles never escape.
const finalizedAccesses=new WeakSet();
const sessionSnapshot=(input,owner)=>{
    const get=k=>Object.getOwnPropertyDescriptor(input||{},k)?.value;
    const timestamp=k=>{const t=get(k);return typeof t==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(t)&&Number.isFinite(Date.parse(t))?t:null;};
    const id=get('id'),created=get('providerCreatedUtc'),status=get('providerStatus'),reads=get('canonicalReadAttempts');
    return {id:typeof id==='string'&&/^sess_[A-Za-z0-9]{1,128}$/.test(id)?id:null,
        ownerId:get('ownerId')===owner?owner:null,
        providerCreatedUtc:typeof created==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(created)&&Number.isFinite(Date.parse(created))?created:null,
        ...Object.fromEntries(['creationAttemptedUtc','creationAcknowledgedUtc','activationAcknowledgedUtc','signOutAttemptedUtc','terminationObservedUtc'].map(k=>[k,timestamp(k)])),
        providerStatus:['active','pending','ended','revoked','removed','expired','abandoned','replaced'].includes(status)?status:'OTHER',
        ...Object.fromEntries(['ownerVerified','eligibleForCleanup','providerTerminationConfirmed','frontendSignOutAcknowledged'].map(k=>[k,get(k)===true])),
        canonicalReadAttempts:Number.isSafeInteger(reads)&&reads>=0&&reads<=2?reads:null};
};
export function ownedCiActorBoundary({access,page,context,browser,expectedOwnerId,drainRoutes,readRouteState},requireVerifiedSession=false){
    try{
        if(!access||finalizedAccesses.has(access)||access.sessionLifecycleMode?.()!=='TRACKED_OWNER_SESSION'||
            typeof access.signOut!=='function'||typeof access.sessionObservation!=='function'||typeof drainRoutes!=='function'||typeof readRouteState!=='function'||
            !/^user_[A-Za-z0-9]+$/.test(expectedOwnerId||'')||page.context()!==context||context.browser()!==browser||!browser)return false;
        if(requireVerifiedSession){const s=sessionSnapshot(access.sessionObservation(),expectedOwnerId);
            if(!s.id||s.ownerId!==expectedOwnerId||!s.ownerVerified||!s.eligibleForCleanup||!s.providerCreatedUtc)return false;}
        return true;
    }catch{return false;}
}
export async function finalizeOwnedCiActor({access,page,context,browser,expectedOwnerId,drainRoutes,readRouteState,prepareForSignout=undefined,attempts={},onStage=()=>{}}) {
    const result={complete:false,authenticationCleanup:'SIGNOUT_UNVERIFIED',sessionIdentity:null,drain:{status:'NOT_RUN'},routeState:null,localClose:null,lifecycleObservationFailed:false};
    try{
        if(!ownedCiActorBoundary({access,page,context,browser,expectedOwnerId,drainRoutes,readRouteState}))return result;
        finalizedAccesses.add(access);
    }catch{return result;}
    const mark=code=>{try{onStage(code);}catch{result.lifecycleObservationFailed=true;}};
    try{
        const before=sessionSnapshot(access.sessionObservation(),expectedOwnerId);
        if(before.id)result.sessionIdentity=before;
        // Unknown or other-owner sessions are never signed out by this finalizer.
        if(before?.ownerId===expectedOwnerId&&before.ownerVerified===true&&before.eligibleForCleanup===true&&
            /^sess_[A-Za-z0-9]{1,128}$/.test(before.id||'')&&Number.isFinite(Date.parse(before.providerCreatedUtc))){
            if(prepareForSignout!==undefined){
                if(typeof prepareForSignout!=='function')throw Error('SIGNOUT_PREPARATION_UNVERIFIED');
                await prepareForSignout();
                const ready=sessionSnapshot(access.sessionObservation(),expectedOwnerId);
                if(ready.id!==before.id||ready.ownerId!==expectedOwnerId||!ready.ownerVerified||!ready.eligibleForCleanup||
                    ready.providerCreatedUtc!==before.providerCreatedUtc)throw Error('SIGNOUT_PREPARATION_SESSION_CHANGED');
            }
            mark('SIGNOUT');
            const status=await access.signOut(page);
            result.authenticationCleanup=status==='SIGNOUT_CONFIRMED'?status:'SIGNOUT_UNVERIFIED';
            result.sessionIdentity=sessionSnapshot(access.sessionObservation(),expectedOwnerId);
            if(result.sessionIdentity?.id!==before.id||result.sessionIdentity?.ownerId!==expectedOwnerId||result.sessionIdentity?.providerCreatedUtc!==before.providerCreatedUtc)result.authenticationCleanup='SIGNOUT_UNVERIFIED';
            mark('SIGNOUT_FINISHED');
        }
    }catch{/* Fixed uncertainty; no auth retry or provider text. */}
    mark('ROUTE_DRAIN_START');
    try{const d=await drainRoutes(),get=k=>Object.getOwnPropertyDescriptor(d||{},k)?.value,status=get('status'),generation=get('generation');
        result.drain={status:['QUIET_CONFIRMED','DRAIN_TIMEOUT','DRAIN_OBSERVATION_FAILED'].includes(status)?status:'DRAIN_OBSERVATION_FAILED',
        pending:get('pending')===0?0:null,generation:Number.isSafeInteger(generation)&&generation>=0?generation:null,quietWindowObserved:get('quietWindowObserved')===true};}
    catch{result.drain={status:'DRAIN_OBSERVATION_FAILED'};}
    mark('ROUTE_DRAIN_FINISHED');
    result.localClose=await closeIsolatedBrowser(context,browser,attempts,mark);
    try{const state=readRouteState(),get=k=>Object.getOwnPropertyDescriptor(state||{},k)?.value;
        result.routeState=Object.fromEntries(['started','settled','pending'].map(k=>{const value=get(k);return [k,Number.isSafeInteger(value)&&value>=0?value:null];}));
    }catch{result.routeState=null;}
    const s=result.sessionIdentity;
    result.complete=result.authenticationCleanup==='SIGNOUT_CONFIRMED'&&s?.ownerId===expectedOwnerId&&s?.ownerVerified===true&&
        s?.providerTerminationConfirmed===true&&s?.frontendSignOutAcknowledged===true&&s?.canonicalReadAttempts===2&&
        ['ended','revoked','removed','expired','abandoned','replaced'].includes(s?.providerStatus)&&
        result.drain.status==='QUIET_CONFIRMED'&&result.drain.pending===0&&result.drain.quietWindowObserved&&
        result.routeState?.pending===0&&result.routeState?.started!==null&&result.routeState?.settled!==null&&result.routeState.started===result.routeState.settled&&
        result.localClose.allLocalClosed&&!result.localClose.lifecycleObservationFailed&&!result.lifecycleObservationFailed;
    return result;
}
export async function closeIsolatedBrowser(context, browser, attempts = {}, onStage = () => {}) {
    const r = { contextCreateAttempted: attempts.contextCreateAttempted === true,
        browserLaunchAttempted: attempts.browserLaunchAttempted === true,
        contextHandlePresent: !!context, browserHandlePresent: !!browser,
        contextCloseAttempted: false, contextCloseConfirmed: false,
        browserCloseAttempted: false, browserCloseConfirmed: false, allLocalClosed: false,
        lifecycleObservationFailed: false };
    const observe = stage => { try { onStage(stage); } catch { r.lifecycleObservationFailed = true; } };
    if (context) {
        r.contextCloseAttempted = true;
        observe('CONTEXT_CLOSE_START');
        try { await context.close(); r.contextCloseConfirmed = true; } catch { /* fixed false */ }
        observe('CONTEXT_CLOSE_END');
    }
    if (browser) {
        r.browserCloseAttempted = true;
        observe('BROWSER_CLOSE_START');
        try { await browser.close(); r.browserCloseConfirmed = true; } catch { /* fixed false */ }
        observe('BROWSER_CLOSE_END');
    }
    r.allLocalClosed = (!r.contextCreateAttempted && !context || r.contextCloseConfirmed) &&
        (!r.browserLaunchAttempted && !browser || r.browserCloseConfirmed);
    return r;
}
