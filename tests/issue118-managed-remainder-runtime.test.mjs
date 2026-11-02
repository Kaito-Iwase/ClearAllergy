// Actual runtime/observer/preparation adapters, memory HTTP and browser surfaces only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createManagedRuntimePorts,target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity,managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';
import {prepareManaged414953Resume,planManaged414953Recovery} from '../scripts/issue118-managed-suite.mjs';
const source=createRequire(import.meta.url)('tsx/cjs/api').require('../scripts/issue118-batch-stop.ts',import.meta.url);
const t1='cmvziwd1k0001js07pqfoctkr',t2=['cmvzk8bru0001l608a2gjmewc','cmvzk905d0009l608790fkj9u','cmvzk9mbm000hl6085xpcrgm6','cmvzka8kt000pl608yugd9vi3',
    'cmvzkaueq000xl6086shu6i7o','cmvzkbgd80015l6089s4spnqg','cmvzkc2u5001dl6089rwngm8c','cmvzkcoq3001ll608iv8ekwxk'];
const t3=['cmvzkk6r9002pl608yc64yz0m','cmvzkkvde002xl608mxvyjpda'];
const canonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
function harness({fault='NONE',resumeCheckpoint,service=true}={}){
    const directory=mkdtempSync(join(tmpdir(),'issue118-remainder-runtime-')),menus=new Map(),calls=[],events=[],claims=[],created=[];
    const checkpoints=[{id:t1,owner:'S1'}];let serial=0;
    const makeMenu=(id,p,extra={})=>{const {allergenStatusBySlug,...fields}=p;return {id,...fields,version:29,foodVersion:29,reviewedFoodVersion:null,
        publicationConfirmedFoodVersion:null,isPublished:false,foodReviews:[],updatedAt:'2026-11-02T19:00:00.000Z',
        allergens:Object.entries(allergenStatusBySlug).map(([slug,status],sortOrder)=>({slug,status,sortOrder,nameJa:slug,nameEn:null})),...extra};};
    for(const [scenario,ids] of [['T2',t2],['T3',t3]])for(const [i,id] of ids.entries()){
        const key='M0'+(i+1),owner=i<4?'S1':'S2',recipe=scenario==='T3'?'39390038-ddea-409d-bbe3-0faee2293ed6':'fc6fd8a4-6f9a-4fa9-b30e-04981bf77f67';
        let payload=source.projectOriginalPayloads(recipe).expectedByMenu[key];const corrected=scenario==='T2'&&[0,1,4,5].includes(i);
        if(corrected){payload={...source.t2PrivateCorrections(recipe,['E21','E23']).find(c=>c.key===key).body};delete payload.isPublished;}
        const isPublished=scenario==='T2'&&i>=4,foodVersion=corrected?88:29;
        menus.set(id,{owner,menu:makeMenu(id,payload,{isPublished,foodVersion,version:scenario==='T2'?(corrected?(isPublished?95:96):(isPublished?32:33)):(i===0?33:29),
            publicationConfirmedFoodVersion:scenario==='T3'&&i===1?null:foodVersion})});checkpoints.push({id,owner,scenario,key});
    }
    menus.set(t1,{owner:'S1',menu:makeMenu(t1,source.projectOriginalPayloads('39390038-ddea-409d-bbe3-0faee2293ed6').expectedByMenu.M04,{version:96,foodVersion:87})});
    const response=(body,status=200)=>({status:()=>status,json:async()=>structuredClone(body),headers:()=>({'x-request-id':randomUUID()})});
    const pk='pk_test_'+Buffer.from(ciIdentity.clerkDomain+'$').toString('base64');
    const actors=['S1','S2'].map(owner=>{
        const identity=managedActorIdentity[owner],pages=[];let started=0,settled=0;
        const tracker={wrap:fn=>async value=>{started++;try{return await fn(value);}finally{settled++;}},snapshot:()=>({started,settled,pending:started-settled}),
            drain:async()=>({status:started===settled?'QUIET_CONFIRMED':'UNVERIFIED',pending:started-settled})};
        const context={request:{},pages:()=>pages.filter(p=>!p.isClosed())};
        const createPage=()=>{
            let closed=false,url='',previous='',view={foodNameVisible:false,notFoundVisible:false},handler,aborted=false;
            const values=new Map(),mainFrame={page:()=>page};
            const navigate=next=>{previous=url;url=next;const id=new URL(next).pathname.split('/').at(-1),entry=menus.get(id);
                view={foodNameVisible:entry?.menu.isPublished===true,notFoundVisible:!!entry&&!entry.menu.isPublished};return {status:()=>200};};
            const submit=async()=>{
                assert.ok(handler);const data={operationId:randomUUID(),name:values.get('#new-menu-field-1'),priceYen:800,
                    ingredients:values.get('#new-menu-field-5'),isPublished:false};
                const request={method:()=> 'POST',url:()=>target.origin+'/api/admin/menus',resourceType:()=> 'fetch',frame:()=>mainFrame,
                    postDataBuffer:()=>Buffer.from(JSON.stringify(data)),allHeaders:async()=>({})};
                await handler({request:()=>request,abort:async()=>{aborted=true;},fallback:async()=>assert.fail('Mutation must not fall back'),
                    fetch:async()=>assert.fail('BLOCK must not forward'),fulfill:async()=>assert.fail('BLOCK must not fulfill')});
            };
            const locator=(selector,group=false)=>({fill:async value=>{values.set(selector,value);},first(){return this;},
                getByRole:()=>locator(selector,group),click:async()=>{if(!group)await submit();},inputValue:async()=>values.get(selector)||''});
            const page={context:()=>context,isClosed:()=>closed,url:()=>url,mainFrame:()=>mainFrame,on:()=>{},addInitScript:async()=>{},
                goto:async next=>navigate(next),reload:async()=>{
                    if(handler){let rejected=false;await handler({request:()=>({url:()=>url,method:()=> 'GET',resourceType:()=> 'document'}),
                        abort:async()=>{rejected=true;},fallback:async()=>{}});if(rejected)throw Error('SYNTHETIC_ABORT');}
                    return navigate(url);},goBack:async()=>navigate(previous),
                route:async(_pattern,fn)=>{handler=fn;},unroute:async()=>{handler=undefined;},close:async()=>{closed=true;},
                waitForFunction:async(_predicate,args)=>{if(args?.kind==='SERVICE_OWNER_HYDRATION')assert.equal(args.expectedOwner,identity.ownerId);else assert.equal(aborted,true);},
                locator:selector=>locator(selector),getByRole:role=>locator(role,role==='group'),
                evaluate:async(_fn,args)=>{if(typeof args==='string')return {...view,pageshowPersisted:false,navigationType:'navigate'};
                    if(args?.inputSelector)return {inputRetained:values.get(args.inputSelector)===String(args.expected),fileRetained:false,successDisplayed:false,followupWrites:0};
                    return {id:identity.ownerId,pk};}};
            pages.push(page);return page;
        };
        context.newPage=async()=>createPage();const page=createPage();
        const token=()=>{const now=Math.floor(Date.now()/1000),c={iss:'https://token.actions.githubusercontent.com',aud:ciIdentity.audience,
            sub:`repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`,repository:ciIdentity.repository,repository_id:ciIdentity.repositoryId,
            ref:ciIdentity.ref,workflow_ref:ciIdentity.workflowRef,environment:ciIdentity.environment,iat:now,exp:now+300};
            return 'e30.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.synthetic';};
        const fetch=async(raw,options={})=>{
            const url=new URL(raw),method=options.method||'GET';assert.equal(url.origin,target.origin);calls.push({owner,method,path:url.pathname});
            if(url.pathname==='/api/admin/shop')return response({shop:{id:identity.shopId}});
            if(url.pathname==='/api/admin/menus'&&method==='GET')return response({menus:[...menus.values()].filter(e=>e.owner===owner).map(e=>e.menu)});
            if(url.pathname==='/api/admin/menus'&&method==='POST'){
                if(fault==='CREATE_LOST')throw Error('SYNTHETIC_PROVIDER_SECRET');const id='cremainder'+(++serial),data=options.data;
                menus.set(id,{owner,menu:makeMenu(id,data)});return response({id},201);
            }
            const id=url.pathname.split('/').filter(x=>x!=='stop').at(-1),entry=menus.get(id);
            if(url.pathname.startsWith('/api/menus/'))return response(entry?.menu.isPublished?{menu:{id}}:{error:'NOT_FOUND'},entry?.menu.isPublished?200:404);
            if(!entry||entry.owner!==owner)return response({error:'NOT_FOUND'},404);
            if(method==='GET')return response({menu:entry.menu});
            assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);
            const data=options.data;if(data.expectedVersion!==entry.menu.version)return response({error:'CONFLICT'},409);
            entry.menu.version+=method==='PUT'&&data.publicationAction==='publish'?3:1;
            if(method==='POST')entry.menu.isPublished=false;
            else if(data.publicationAction==='publish'){entry.menu.isPublished=true;entry.menu.publicationConfirmedFoodVersion=entry.menu.foodVersion;}
            else if(data.priceYen!==undefined)entry.menu.priceYen=data.priceYen;
            return response(method==='POST'?{ok:true,menu:{id,version:entry.menu.version,isPublished:false}}:{menu:entry.menu});
        };
        context.request.fetch=fetch;
        return {binding:{owner,shopId:identity.shopId},expectedUserId:identity.ownerId,page,context,access:{token,read:async(_api,url)=>fetch(url)},lifecycle:{tracker,browser:{}}};
    });
    const runId=randomUUID(),preparationState={};
    const identityReceipt={...Object.fromEntries(['project','projectId','origin','deployment','source','alias'].map(k=>[k,target[k]])),environment:'Preview',status:'Ready',
        observedUtc:new Date().toISOString(),verifiedBy:'cli_metadata_observer',evidenceReference:'SYNTHETIC_ONLY'};
    const runtime=createManagedRuntimePorts({operation:'RESUME_CORE',actors,claimDirectory:directory,t1FixtureId:t1,checkpointFixtures:checkpoints,resumeCheckpoint,
        ...(service?{serviceConfig:{runId,identityReceipt,image:{buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))},preparationState}}:{}),
        record:event=>events.push(event)});
    const boundary={authorize:async value=>{claims.push(value);return {id:value.id,resource:value.resource,allowedForward:value.mode!=='BLOCK_BEFORE_FORWARD'};},
        consumeSendPermission:()=>{},recordCreated:async value=>created.push(value)};
    const install=()=>runtime.resumePorts.installSendGuard(boundary);
    const close=()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('issue118-remainder-runtime-'));rmSync(directory,{recursive:true});};
    return {runtime,actors,menus,calls,claims,created,events,install,close,runId,preparationState,checkpoints,boundary,directory};
}
test('actual T4 observer baseline, held/back/fresh/refetch failure and owned-page close follow three guarded writes',async()=>{
    const h=harness();try{await h.install();const result=await h.runtime.resumePorts.runT4({runId:h.runId});
        assert.equal(result.status,'T4_STOP_API_AND_OBSERVATIONS_CONFIRMED_NOT_LIVE_PASS');assert.equal(result.writesConfirmed,3);
        assert.deepEqual(h.claims.map(c=>c.id),['RESUME_T4_CREATE','RESUME_T4_INITIAL_PUBLISH','RESUME_T4_STOP']);
        assert.equal(result.observation.freshReadOutcome,'FRESH_READS_HIDE_TARGET');assert.equal(result.observation.held.foodNameVisible,true);
        assert.equal(result.observation.back.notFoundVisible,true);assert.equal(result.observation.failedRefetch.injection,'ONE_DOCUMENT_GET_ABORTED_BEFORE_FORWARD');
        assert.equal(result.ownedPagesClosed,true);assert.equal(result.preexistingPagesPreserved,true);assert.equal(h.actors[0].context.pages().length,1);
        assert.equal(h.runtime.snapshot().held,false);assert.equal(h.calls.filter(c=>c.method!=='GET').length,3);
        await h.runtime.resumePorts.runT4({runId:h.runId});assert.equal(h.calls.filter(c=>c.method!=='GET').length,3);
    }finally{h.close();}
});
test('service STOP setup and menu-image follow-up publish use the actual +3 contract and remain eligible for explicit cleanup',async()=>{
    for(const [cellId,purpose] of [['STOP_DELIVER','SETUP_PUBLISH'],['MENU_UPLOAD_DELIVER','FOLLOWUP_PUBLISH']]){
        const h=harness();try{await h.install();const payload={...source.projectOriginalPayloads(h.runId).expectedByMenu.M04,isPublished:false,operationId:randomUUID()};
            const before=await h.runtime.serviceApi.createMenu({id:cellId+'_CREATE',cellId,purpose:'SETUP_CREATE',payload});
            const evidence={knownOutcome:true,ownerStateMatches:true,freshVersion:true};
            const published=await h.runtime.serviceApi.menuWrite({id:cellId+'_PUBLISH',cellId,purpose,menuId:before.id,publicationAction:'publish',evidence});
            assert.equal(published.version,before.version+3);assert.equal(published.foodVersion,before.foodVersion);assert.equal(published.isPublished,true);
            const stopped=await h.runtime.serviceApi.menuWrite({id:cellId+'_CLEANUP',cellId,purpose:'CLEANUP',menuId:before.id,publicationAction:'stop',evidence});
            assert.equal(stopped.version,published.version+1);assert.equal(stopped.isPublished,false);assert.equal(h.runtime.snapshot().held,false);
            assert.equal(h.calls.filter(c=>c.method!=='GET').length,3);
        }finally{h.close();}
    }
});
test('actual controls and cross-owner/stale refusal adapters measure their ten writes and ten denials',async()=>{
    const h=harness();try{await h.install();const controls=await h.runtime.resumePorts.runControls({runId:h.runId});
        assert.equal(controls.priceFoodVersionUnchanged,true);assert.equal(controls.stopFoodVersionUnchanged,true);
        assert.equal(controls.noSignalAutomaticStops,0);assert.equal(controls.noSignalRequiredStopDenominator,0);assert.equal(h.claims.length,10);
        const op=randomUUID(),resource={method:'POST',path:'/api/admin/menus',shopId:managedActorIdentity.S2.shopId,purpose:'CORE',creationOperationId:op};
        await h.runtime.resumePorts.write({claim:{id:'RESUME414953_T3_M05_CREATE',kind:'MENU_CREATE',owner:'S2'},resource,payloadIntent:{kind:'CREATE',key:'M05',scenario:'T3'}});
        const denial=await h.runtime.resumePorts.runDenials({fixtures:h.runtime.snapshot().fixtures});
        assert.deepEqual(denial,{crossOwnerRefusals:8,staleVersionConflicts:2,routeContractChecked:true,ownerStateUnchanged:true,historyObservation:'PENDING_INDEPENDENT_SQL'});
        assert.equal(h.claims.filter(c=>c.kind==='DENIAL').length,10);assert.equal(h.runtime.snapshot().held,false);
    }finally{h.close();}
});
test('service lazy port uses real preparation/browser observer: BLOCK remains client-unknown with zero sender calls',async()=>{
    const h=harness();try{await h.install();const result=await h.runtime.resumePorts.runServiceCellLazy({cell:{id:'MENU_CREATE_BLOCK_BEFORE_FORWARD',kind:'MENU_CREATE',mode:'BLOCK_BEFORE_FORWARD'},
        ...h.boundary});assert.equal(result.status,'KNOWN_NO_FORWARD');assert.equal(result.clientUnknown,true);assert.equal(result.forwardCalls,0);
        assert.equal(result.soleSenderConfirmed,true);assert.equal(result.ownerApiUnchanged,true);assert.equal(result.inputRetained,true);
        assert.equal(h.calls.filter(c=>c.method!=='GET').length,0);assert.equal(h.preparationState.cells.MENU_CREATE_BLOCK_BEFORE_FORWARD.status,'NO_FORWARD_PROVEN_CLIENT_UNKNOWN');
        const close=await h.runtime.resumePorts.closeServiceObservation();assert.equal(close.ownedPageClosed,true);assert.equal(close.preexistingPagesPreserved,true);
    }finally{h.close();}
});
test('missing service config, T4 response loss and mismatched resource refuse without success defaults or a later write',async()=>{
    const missing=harness({service:false});try{await missing.install();await assert.rejects(missing.runtime.resumePorts.runServiceCellLazy({cell:{id:'MENU_CREATE_BLOCK_BEFORE_FORWARD'}}),/MANAGED_RECOVERY_SERVICE_HELD/);
        assert.equal(missing.calls.length,0);assert.equal(missing.runtime.snapshot().held,true);
    }finally{missing.close();}
    const lost=harness({fault:'CREATE_LOST'});try{await lost.install();const result=await lost.runtime.resumePorts.runT4({runId:lost.runId});
        assert.equal(result.status,'T4_HOLD_NO_FURTHER_WRITES');assert.equal(result.writesConfirmed,0);assert.equal(lost.calls.filter(c=>c.method!=='GET').length,1);
        await assert.rejects(lost.runtime.resumePorts.runControls({runId:lost.runId}));assert.equal(lost.calls.filter(c=>c.method!=='GET').length,1);
        assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PROVIDER_SECRET/);
    }finally{lost.close();}
});
test('resource-before-forward reads actual registered state and refuses arbitrary routes and duplicate CREATE UUIDs',async()=>{
    const h=harness();try{await h.install();const id=t3[0],claim={id:'CAS',kind:'MENU_WRITE',owner:'S1',resource:{method:'PUT',path:'/api/admin/menus/'+id,menuId:id,purpose:'CORE',shopId:target.shop}};
        assert.equal((await h.runtime.resumePorts.verifyResourceBeforeForward({claim})).menu.id,id);
        const creation={id:'CREATE_FRESH',kind:'MENU_CREATE',owner:'S1',resource:{method:'POST',path:'/api/admin/menus',purpose:'CORE',shopId:target.shop,creationOperationId:randomUUID()}};
        assert.equal((await h.runtime.resumePorts.verifyResourceBeforeForward({claim:creation})).creationOperationFresh,true);
        await assert.rejects(h.runtime.resumePorts.verifyResourceBeforeForward({claim:{...creation,id:'DIFFERENT_CLAIM'}}),/MANAGED_RECOVERY_PRE_SEND_HELD/);
        assert.equal(h.calls.filter(c=>c.method!=='GET').length,0);
    }finally{h.close();}
});
test('extra checkpoint fixtures require exact confirmed creation claims or independently bound terminal resources',()=>{
    const makeCheckpoint=()=>{const h=harness(),id='ccheckpointnew',creationOperationId=randomUUID();
        const claim={id:'RESUME414953_T3_M03_CREATE',kind:'MENU_CREATE',owner:'S1',createdId:id,state:'CONFIRMED_RESPONSE_AND_READBACK',
            resource:{method:'POST',path:'/api/admin/menus',shopId:target.shop,purpose:'CORE',creationOperationId}};
        const resumeCheckpoint={knownFixtures:[...h.checkpoints,{id,owner:'S1',zone:'CORE'}],newClaims:[claim],terminalCreationBindings:[]};return {h,id,claim,resumeCheckpoint};};
    const item=makeCheckpoint();try{const runtime=createManagedRuntimePorts({operation:'RESUME_CORE',actors:item.h.actors,claimDirectory:item.h.directory,t1FixtureId:t1,
        checkpointFixtures:item.h.checkpoints,resumeCheckpoint:item.resumeCheckpoint});assert.equal(runtime.snapshot().fixtures.find(f=>f.id===item.id).key,'M03');
        for(const alter of [c=>{c.newClaims=[];},c=>{c.newClaims[0].owner='S2';},c=>{c.newClaims[0].state='FORWARD_CONSUMED';}]){
            const candidate=structuredClone(item.resumeCheckpoint);alter(candidate);assert.throws(()=>createManagedRuntimePorts({operation:'RESUME_CORE',actors:item.h.actors,
                claimDirectory:item.h.directory,t1FixtureId:t1,checkpointFixtures:item.h.checkpoints,resumeCheckpoint:candidate}));}
        const c=item.resumeCheckpoint.newClaims[0];c.id='MENU_CREATE_WITHHOLD_AFTER_RESPONSE_PRIMARY';c.state='FORWARD_CONSUMED';c.arm='RESUME_SERVICE_1';c.mode='WITHHOLD_AFTER_RESPONSE';
        const resourcesSha256=hash([{operationId:c.id,kind:c.kind,mode:c.mode,owner:c.owner,resource:c.resource}]);
        item.resumeCheckpoint.terminalCreationBindings=[{id:c.createdId,operationId:c.id,creationOperationId:c.resource.creationOperationId,owner:c.owner,armId:c.arm,resourcesSha256}];
        assert.ok(createManagedRuntimePorts({operation:'RESUME_CORE',actors:item.h.actors,claimDirectory:item.h.directory,t1FixtureId:t1,checkpointFixtures:item.h.checkpoints,
            resumeCheckpoint:item.resumeCheckpoint}).snapshot().fixtures.some(f=>f.id===item.id));
        item.resumeCheckpoint.terminalCreationBindings[0].resourcesSha256='0'.repeat(64);assert.throws(()=>createManagedRuntimePorts({operation:'RESUME_CORE',actors:item.h.actors,
            claimDirectory:item.h.directory,t1FixtureId:t1,checkpointFixtures:item.h.checkpoints,resumeCheckpoint:item.resumeCheckpoint}));
    }finally{item.h.close();}
});

test('actual full-scope controller reaches real T4, controls and denials; absent next actor proof cannot start service',async()=>{
    const h=harness();try{
        const oldClaims=[];for(const f of h.checkpoints.filter(f=>f.id!==t1)){
            oldClaims.push({id:`${f.scenario}_${f.key}_CREATE`,kind:'MENU_CREATE',owner:f.owner,state:'FORWARD_CONSUMED',createdId:f.id,resource:{creationOperationId:randomUUID()}});
            if(f.scenario==='T2'||f.key==='M01')oldClaims.push({id:`${f.scenario}_${f.key}_INITIAL_PUBLISH`,kind:'MENU_WRITE',owner:f.owner,state:'FORWARD_CONSUMED'});
            if(f.scenario==='T2'&&['M01','M02','M05','M06'].includes(f.key))for(const phase of ['STOP','CORRECT_PRIVATE','REPUBLISH'])
                oldClaims.push({id:`T2_${f.key}_${phase}`,kind:'MENU_WRITE',owner:f.owner,state:'FORWARD_CONSUMED'});
        }
        const snapshot={applicationSha:target.source,status:'HOLD_NO_FURTHER_WRITES',claims:oldClaims,fixtures:h.checkpoints,counts:{menus:11,menuWrites:37}};
        const terminal={unknownWrites:0,consumedSessions:7,allConsumedSessionsClosed:true,confirmedMenuWrites:42,consumedRequestIds:Array.from({length:42},()=>randomUUID()),
            extraConfirmedStops:[...t2.slice(0,4),t3[0]],menus:h.checkpoints.map(f=>{const m=h.menus.get(f.id).menu;return {...f,shopId:managedActorIdentity[f.owner].shopId,
                ownerMatches:true,version:m.version,foodVersion:m.foodVersion,reviewedFoodVersion:m.reviewedFoodVersion,publicationConfirmedFoodVersion:m.publicationConfirmedFoodVersion,
                isPublished:m.isPublished,food:source.fixturePayload(m),reviews:'0',resolutions:'0'};})};
        const plan=planManaged414953Recovery({snapshot,terminal}),creationOperationIds=Object.fromEntries(['M03','M04','M05','M06','M07','M08'].map(k=>[k,randomUUID()]));
        const approval={status:'APPROVED',scope:'RESUME_414953_FULL_MANAGED',limits:plan.reservedMaximum,oldClaimsSha256:plan.inherited.claimsSha256,creationIdsSha256:hash(creationOperationIds)};
        let actorGates=0;
        const controller=prepareManaged414953Resume({snapshot,terminal,approval,creationOperationIds,ports:{...h.runtime.resumePorts,verifyApproval:async()=>true,verifyCheckpoint:async()=>true,
            prepareServiceActor:async()=>{actorGates++;throw Error('SYNTHETIC_NO_SERVICE_AUTH_APPROVAL');},finishServiceActor:async()=>assert.fail('No actor started'),
            verifyServiceTerminal:async()=>assert.fail('No terminal observation without an arm')}});
        await controller.initialize();const t3result=await controller.executeT3();assert.equal(t3result.counts.menuWrites,68);
        const result=await controller.executeRemainder({runId:h.runId});
        assert.equal(actorGates,1,JSON.stringify({status:result.status,counts:result.counts,lastClaim:result.newClaims.at(-1)?.id,runtimeHeld:h.runtime.snapshot().held}));
        assert.match(result.status,/^HOLD_/);assert.equal(result.counts.menus,21);assert.equal(result.counts.menuWrites,81);
        assert.equal(result.counts.denialRequests,10);assert.equal(result.remainingNotImplemented.includes('T4_OBSERVER'),false);
        assert.equal(result.livePass,false);assert.equal(result.coverage,'NOT_ATTESTED');
        const createdWrites=h.calls.filter(c=>c.method==='POST'&&c.path==='/api/admin/menus');assert.equal(createdWrites.length,10);
        assert.ok([...h.menus.values()].every(v=>v.menu.isPublished===false));
    }finally{h.close();}
});
