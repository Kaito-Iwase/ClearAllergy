import test from 'node:test';
import assert from 'node:assert/strict';
import {createResponseTrackingRoute,newWriteLedger,beginWrite,target} from '../scripts/check-issue118-live-t1-browser.mjs';

const id='c'+'a'.repeat(24),operationId='12345678-1234-4123-8123-123456789012';
function fixture(){
    const calls=[],ledger=newWriteLedger(),operation=beginWrite(ledger,'CREATE');
    Object.assign(operation,{state:'IN_FLIGHT',requestSent:true,creationOperationId:operationId});
    const request={url:()=>target.origin+'/api/admin/menus',method:()=> 'POST',postDataJSON:()=>({operationId})};
    const response={url:request.url,status:()=>201,json:async()=>({id})};
    const route={request:()=>request,fulfill:async options=>{calls.push('fulfill');assert.equal(options.response,response);return 'FULFILLED';},abort:async()=>calls.push('abort')};
    const input={route,ledger,operation,requestOperations:new WeakMap([[request,operation]]),protectedIds:new Set(),knownCreatedIds:new Set(),
        trackCreated:async value=>{assert.equal(value,id);calls.push('track');}};
    return {calls,ledger,operation,request,response,route,input,options:{response}};
}
test('captures actual201 ID and awaits tracking before browser fulfillment/automatic GET; no extra request',async()=>{
    const f=fixture();let release;f.input.trackCreated=async value=>{assert.equal(value,id);f.calls.push('track');await new Promise(r=>{release=r;});};
    const wrapped=createResponseTrackingRoute(f.input),pending=wrapped.fulfill(f.options);
    await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.calls,['track']);assert.equal(f.operation.createdId,id);
    release();assert.equal(await pending,'FULFILLED');assert.deepEqual(f.calls,['track','fulfill']);assert.ok(f.input.knownCreatedIds.has(id));
    await assert.rejects(wrapped.fulfill(f.options),{message:'CREATE_RESPONSE_ROUTE_HELD'});assert.deepEqual(f.calls,['track','fulfill']);
});
test('nonCREATE route methods and response options delegate unchanged',async()=>{
    const f=fixture();f.operation.phase='STOP';const wrapped=createResponseTrackingRoute(f.input);
    assert.equal(wrapped.request(),f.request);await wrapped.abort();assert.equal(await wrapped.fulfill(f.options),'FULFILLED');
    assert.deepEqual(f.calls,['abort','fulfill']);assert.equal(f.operation.createdId,undefined);
});
test('unbound, notforwarded, mismatched operation/request and protected or duplicate IDs hold without fulfill',async()=>{
    for(const change of [f=>{f.input.requestOperations=new WeakMap();},
        f=>{f.operation.requestSent=false;},f=>{f.operation.state='ARMED';},f=>{f.operation.creationOperationId='bad';},
        f=>{f.request.postDataJSON=()=>({operationId:'22345678-1234-4123-8123-123456789012'});},
        f=>{f.request.method=()=> 'PUT';},f=>{f.request.url=()=>target.origin+'/api/admin/menus?other=1';},
        f=>{f.response.url=()=>target.origin+'/api/admin/shop';},f=>{f.input.protectedIds.add(id);},f=>{f.input.knownCreatedIds.add(id);},
        f=>{f.operation.createdId='c'+'b'.repeat(24);},f=>{f.options.body='SYNTHETIC_SECRET';}]){
        const f=fixture();change(f);
        await assert.rejects(createResponseTrackingRoute(f.input).fulfill(f.options),{message:'CREATE_RESPONSE_ROUTE_HELD'});
        assert.equal(f.ledger.held,true);assert.ok(!f.calls.includes('fulfill'));assert.doesNotMatch(JSON.stringify(f.ledger),/SYNTHETIC_SECRET/);
    }
});
test('malformed201 and callback errors retain knownID where possible and never fulfill/retry or leak raw data',async()=>{
    for(const kind of ['json','id','ancillary','callback','operation']){
        const f=fixture();
        if(kind==='json')f.response.json=async()=>{throw Error('SYNTHETIC_SECRET');};
        if(kind==='id')f.response.json=async()=>({id:'not-a-cuid'});
        if(kind==='ancillary')f.response.json=async()=>({id,publicRefreshPending:'SYNTHETIC_SECRET'});
        if(kind==='operation')f.response.json=async()=>({id,operationId:'different'});
        if(kind==='callback')f.input.trackCreated=async()=>{throw Error('SYNTHETIC_SECRET');};
        await assert.rejects(createResponseTrackingRoute(f.input).fulfill(f.options),error=>error.message==='CREATE_RESPONSE_ROUTE_HELD'&&!error.cause);
        assert.equal(f.ledger.held,true);assert.equal(f.operation.createdId,['json','id'].includes(kind)?undefined:id);
        assert.ok(!f.calls.includes('fulfill'));assert.doesNotMatch(JSON.stringify(f.ledger),/SYNTHETIC_SECRET/);
    }
});
test('non201 is passed unchanged without a createdID; fulfill errors hold with captured ID',async()=>{
    const failed=fixture();failed.response.status=()=>409;assert.equal(await createResponseTrackingRoute(failed.input).fulfill(failed.options),'FULFILLED');
    assert.equal(failed.operation.createdId,undefined);assert.deepEqual(failed.calls,['fulfill']);
    const f=fixture();f.route.fulfill=async()=>{f.calls.push('fulfill');throw Error('SYNTHETIC_SECRET');};
    await assert.rejects(createResponseTrackingRoute(f.input).fulfill(f.options),{message:'CREATE_RESPONSE_ROUTE_HELD'});
    assert.equal(f.operation.createdId,id);assert.equal(f.ledger.held,true);assert.deepEqual(f.calls,['track','fulfill']);
});
