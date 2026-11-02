// Real candidate controller/runtime with memory HTTP + Playwright-shaped UI only.
// No real browser, authentication, DB, Blob or external network.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
import {completionScope,completionLimits,t2Commands,t2ExpectedFood,t2Hash,planManagedT2Completion,validateT2PrefixCheckpoint} from '../scripts/issue118-t2-reobserve.mjs';
import {planManaged414953Recovery,prepareManaged414953Resume,suiteLimits} from '../scripts/issue118-managed-suite.mjs';
import {target,executeManagedApprovedResume,assertManagedResumeActivation} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity,managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';import {finalizeOwnedCiActor} from '../scripts/issue118-close-browser.mjs';
const source=createRequire(import.meta.url)('tsx/cjs/api').require('../scripts/issue118-batch-stop.ts',import.meta.url);
const t2ids=['cmvzk8bru0001l608a2gjmewc','cmvzk905d0009l608790fkj9u','cmvzk9mbm000hl6085xpcrgm6','cmvzka8kt000pl608yugd9vi3','cmvzkaueq000xl6086shu6i7o','cmvzkbgd80015l6089s4spnqg','cmvzkc2u5001dl6089rwngm8c','cmvzkcoq3001ll608iv8ekwxk'];
const t3ids=['cmvzkk6r9002pl608yc64yz0m','cmvzkkvde002xl608mxvyjpda'],t1='cmvziwd1k0001js07pqfoctkr',affected=['M01','M02','M05','M06'];
function fixture(fault='NONE'){
 const directory=mkdtempSync(join(tmpdir(),'issue118-t2-')),menus=new Map(),claims=[],fixtures=[{id:t1,owner:'S1'}],calls=[],pages=[],seen=[];let uiSends=0;
 const menu=(id,owner,food,v=29,f=29,pub=false,conf=null)=>({id,owner,...food,version:v,foodVersion:f,isPublished:pub,publicationConfirmedFoodVersion:conf,reviewedFoodVersion:null,foodReviews:[],updatedAt:'2026-11-02T19:00:00.000Z',allergens:Object.entries(food.allergenStatusBySlug).map(([slug,status],sortOrder)=>({slug,status,nameJa:slug==='milk'?'乳':slug,nameEn:null,sortOrder}))});
 menus.set(t1,menu(t1,'S1',t2ExpectedFood('M03',false),96,87,false,87));
 for(const [scenario,ids] of [['T2',t2ids],['T3',t3ids]])for(const [i,id] of ids.entries()){
  const key='M0'+(i+1),owner=i<4?'S1':'S2',correct=scenario==='T2'&&affected.includes(key),pub=scenario==='T2'&&owner==='S2',fv=correct?88:29;
  const food=scenario==='T2'?t2ExpectedFood(key,correct):source.projectOriginalPayloads('39390038-ddea-409d-bbe3-0faee2293ed6').expectedByMenu[key];
  menus.set(id,menu(id,owner,food,scenario==='T2'?(correct?(pub?95:96):(pub?32:33)):(i?29:33),fv,pub,scenario==='T3'&&i?null:fv));fixtures.push({id,owner,scenario,key});
  claims.push({id:scenario+'_'+key+'_CREATE',kind:'MENU_CREATE',owner,state:'FORWARD_CONSUMED',createdId:id,resource:{creationOperationId:randomUUID()}});
  if(scenario==='T2'||!i)claims.push({id:scenario+'_'+key+'_INITIAL_PUBLISH',kind:'MENU_WRITE',owner,state:'FORWARD_CONSUMED'});
  if(correct)for(const phase of ['STOP','CORRECT_PRIVATE','REPUBLISH'])claims.push({id:'T2_'+key+'_'+phase,kind:'MENU_WRITE',owner,state:'FORWARD_CONSUMED'});
 }
 const snapshot={applicationSha:target.source,status:'HOLD_NO_FURTHER_WRITES',claims,fixtures,counts:{menus:11,menuWrites:37}};
 const terminal={unknownWrites:0,consumedSessions:7,allConsumedSessionsClosed:true,confirmedMenuWrites:42,consumedRequestIds:Array.from({length:42},()=>randomUUID()),extraConfirmedStops:[...t2ids.slice(0,4),t3ids[0]],menus:[...menus.values()].map(m=>({id:m.id,owner:m.owner,ownerMatches:true,version:m.version,foodVersion:m.foodVersion,isPublished:m.isPublished,publicationConfirmedFoodVersion:m.publicationConfirmedFoodVersion}))};
 const old=planManaged414953Recovery({snapshot,terminal}),creationOperationIds=Object.fromEntries(['M03','M04','M05','M06','M07','M08'].map(k=>[k,randomUUID()])),now=new Date().toISOString();
 const authorization={status:'APPROVED',scope:completionScope,limits:{...completionLimits},oldClaimsSha256:old.inherited.claimsSha256,creationIdsSha256:t2Hash(creationOperationIds),verifiedBy:'human',evidenceReference:'Sentinel_'+('1'.repeat(32)),approvedUtc:now,snapshotSha256:t2Hash(snapshot),terminalSha256:t2Hash(terminal)};
 const identityReceipt={...Object.fromEntries(['project','projectId','origin','deployment','source','alias'].map(k=>[k,target[k]])),environment:'Preview',status:'Ready',observedUtc:now,verifiedBy:'cli_metadata_observer',evidenceReference:'SYNTHETIC_ONLY',protectionVerified:true,protectionMode:'ALL_DEPLOYMENTS',productionTarget:false};
 const checkpointReceipt={source:'INDEPENDENT_READ_ONLY',readOnly:true,project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',database:'clearallergy_main19',role:'neondb_owner',applicationSha:target.source,deployment:target.deployment,originalRunId:'41495319922',originalTerminal:true,unknownResolved:true,allSevenSessionsClosed:true,pendingRequests:0,menuWrites:42,menuCount:11,extraAudits:0,exclusive:true,snapshotSha256:authorization.snapshotSha256,terminalSha256:authorization.terminalSha256,oldClaimsSha256:authorization.oldClaimsSha256,requestIdsSha256:t2Hash([...terminal.consumedRequestIds].sort()),sqlObservedUtc:now,observedUtc:now};
 const response=(body,status=200)=>({status:()=>status,json:async()=>structuredClone(body),headers:()=>({'x-request-id':randomUUID()})});
 const pk='pk_test_'+Buffer.from(ciIdentity.clerkDomain+'$').toString('base64');
 const token=()=>{const t=Math.floor(Date.now()/1000);return 'e30.'+Buffer.from(JSON.stringify({iss:'https://token.actions.githubusercontent.com',aud:ciIdentity.audience,sub:`repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`,repository:ciIdentity.repository,repository_id:ciIdentity.repositoryId,ref:ciIdentity.ref,workflow_ref:ciIdentity.workflowRef,environment:ciIdentity.environment,iat:t,exp:t+300})).toString('base64url')+'.synthetic';};
 const actors=['S1','S2'].map(owner=>{
  const identity=managedActorIdentity[owner],browser={close:async()=>{}},context={request:{},close:async()=>{}};let started=0,settled=0;
  const tracker={wrap:fn=>async x=>{started++;try{return await fn(x);}finally{settled++;}},drain:async()=>({status:'QUIET_CONFIRMED',pending:started-settled,generation:0,quietWindowObserved:true}),snapshot:()=>({started,settled,pending:started-settled})};context.browser=()=>browser;
  const api=async(url,options={})=>{assert.equal(new URL(url).origin,target.origin);const method=options.method||'GET';calls.push({owner,method,url});
   if(url===target.origin+'/api/admin/shop')return response({shop:{id:identity.shopId}});
   const id=new URL(url).pathname.split('/').filter(x=>x!=='stop').at(-1),m=menus.get(id);assert.ok(m);
   if(url.includes('/api/menus/'))return response(m.isPublished?{menu:m}:{error:'NOT_FOUND'},m.isPublished?200:404);
   assert.equal(m.owner,owner);if(method==='GET')return response({menu:m});assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);
   const data=options.data||{};if(data.expectedVersion!==undefined&&data.expectedVersion!==m.version)return response({error:'CONFLICT'},409);
   if(fault==='409'&&calls.filter(c=>c.method!=='GET').length===5)return response({error:'CONFLICT'},409);
   if(method==='POST'){m.isPublished=false;m.version++;}else if(data.publicationAction==='publish'){m.isPublished=true;m.version+=3;m.publicationConfirmedFoodVersion=m.foodVersion;}
   else{const {isPublished,allergenStatusBySlug,...food}=data;delete food.expectedVersion;assert.equal(isPublished,false);Object.assign(m,food);m.allergens=m.allergens.map(a=>({...a,status:allergenStatusBySlug[a.slug]}));m.version+=59;m.foodVersion+=59;m.isPublished=false;m.publicationConfirmedFoodVersion=null;}
   if(fault==='LOST'&&calls.filter(c=>c.method!=='GET').length===5)throw Error('SYNTHETIC_PRIVATE');
   return response(method==='POST'?{ok:true,menu:{id,version:m.version,isPublished:false}}:{menu:m});};context.request.fetch=api;
  const createPage=()=>{let closed=false,url='',handler,dialog,notice=false,lastMenu;const fields={},frame={page:()=>page};
   const current=()=>menus.get(new URL(url).pathname.split('/').filter(x=>x!=='edit').at(-1));
   const submit=async(kind)=>{const m=current();let data;if(kind==='PUBLISH')data={expectedVersion:m.version,publicationAction:'publish'};
    else if(kind==='SAVE'){data={...source.fixturePayload(m),expectedVersion:m.version,isPublished:false,ingredients:fields.ingredients,allergenStatusBySlug:{...source.fixturePayload(m).allergenStatusBySlug,milk:fields.milk}};}
    const method=kind==='STOP'?'POST':'PUT',requestUrl=target.origin+'/api/admin/menus/'+m.id+(kind==='STOP'?'/stop':'');
    const request={method:()=>method,url:()=>requestUrl,postDataBuffer:()=>data?Buffer.from(JSON.stringify(data)):null,frame:()=>frame,allHeaders:async()=>({})};
    assert.ok(handler);uiSends++;await handler({request:()=>request,fetch:async opts=>api(requestUrl,{...opts,method,data}),fulfill:async()=>{notice=true;},abort:async()=>{},fallback:async()=>assert.fail('Unexpected fallback')});};
   const locator=selector=>({inputValue:async()=>{const m=current();return selector.endsWith('-1')?m.name:selector.endsWith('-2')?String(m.priceYen):fields.ingredients??m.ingredients;},fill:async v=>{fields.ingredients=v;},
    count:async()=>{const m=[...menus.values()].find(m=>selector.includes('/menus/'+m.id));return m?.isPublished?1:0;},innerText:async()=> '乳 含む'});
   const role=(type,opt={})=>({count:async()=>{const m=current();return type==='heading'?(opt.name==='ページが見つかりません'?!m?.isPublished:m?.isPublished&&opt.name===m.name)?1:0:1;},
    waitFor:async()=>{if(fault==='LATE_DUPLICATE'&&notice&&handler)await submit('SAVE');assert.ok(notice||current());},getByText:()=>role('text'),getByRole:(t,o)=>role(t,o),locator,
    getAttribute:async()=> 'true',click:async()=>{if(opt.name==='含む'){fields.milk='CONTAINS';return;}if(opt.name==='公開する')return;
      if(opt.name==='公開を停止する'){await dialog({type:()=> 'confirm',accept:async()=>{}});await submit('STOP');}
      else if(opt.name==='保存する')await submit('SAVE');else if(opt.name==='この内容で公開')await submit('PUBLISH');}});
   const page={context:()=>context,mainFrame:()=>frame,isClosed:()=>closed,url:()=>url,on:()=>{},once:(_name,fn)=>{dialog=fn;},
    goto:async next=>{url=next;if(next.includes('/menus/'))lastMenu=new URL(next).pathname.split('/').filter(x=>x!=='edit').at(-1);notice=false;delete fields.ingredients;delete fields.milk;return {status:()=>fault==='SHOP500'&&next===target.origin+'/shops/'+identity.shopId&&lastMenu&&!menus.get(lastMenu)?.isPublished?500:next.includes('/admin/')||current()?.isPublished||next===target.origin+'/shops/'+identity.shopId&&[...menus.values()].some(m=>m.owner===owner&&m.isPublished)?200:404};},
    waitForFunction:async()=>{},evaluate:async()=>identity.ownerId,locator,getByRole:role,
    getByText:(text)=>({count:async()=>{const m=current();if(text.startsWith('保存済みの公開設定：'))return text.endsWith(m.isPublished?'：公開':'：非公開')?1:0;return 1;},waitFor:async()=>assert.ok(notice),locator:()=>({innerText:async()=> '乳 含む'})}),
    route:async(_pattern,fn)=>{handler=fn;},unroute:async()=>{handler=undefined;},close:async()=>{closed=true;}};pages.push(page);return page;};
  context.newPage=async()=>createPage();context.pages=()=>pages.filter(p=>p.context()===context&&!p.isClosed());const page=createPage();page.evaluate=async()=>({id:identity.ownerId,pk});
  const session={id:'sess_T2'+owner,ownerId:identity.ownerId,ownerVerified:true,eligibleForCleanup:true,providerCreatedUtc:now,providerStatus:'active',providerTerminationConfirmed:false};
  const access={token,read:async(_api,url)=>api(url),sessionLifecycleMode:()=> 'TRACKED_OWNER_SESSION',sessionObservation:()=>structuredClone(session),signOut:async()=>{Object.assign(session,{providerStatus:'removed',providerTerminationConfirmed:true,frontendSignOutAcknowledged:true,canonicalReadAttempts:2});return 'SIGNOUT_CONFIRMED';}};
  const actor={owner,expectedUserId:identity.ownerId,binding:{owner,shopId:identity.shopId},page,context,access,lifecycle:{browser,tracker},finalize:()=>finalizeOwnedCiActor({access,page,context,browser,expectedOwnerId:identity.ownerId,drainRoutes:()=>tracker.drain(),readRouteState:()=>tracker.snapshot(),attempts:{browserLaunchAttempted:true,contextCreateAttempted:true}})};return actor;
 });
 const input={snapshot,terminal,authorization,creationOperationIds,identityReceipt,checkpointReceipt,operation:'T2_REOBSERVE_PREFIX',serviceRunId:randomUUID(),claimDirectory:directory,image:{buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))},env:{GITHUB_RUN_ID:'999001',GITHUB_SHA:'a'.repeat(40)},dependencies:{openActor:async({role,record})=>{seen.push(role);const actor=actors.find(a=>a.owner===role);record({owner:role,stage:'OWNER_AND_SHOP_VERIFIED',sessionIdentity:actor.access.sessionObservation()});return actor;}}};
 const cleanup=()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true});};
 return {input,menus,calls,actors,pages,seen,cleanup,directory,uiSends:()=>uiSends};
}
function makePrefix(report,input){const checkpoint={...report.t2PrefixPayload,source:{githubRunId:'999001',runnerSha:'a'.repeat(40),artifactSha256:'b'.repeat(64),jobTerminal:true,pendingRequests:0,sessionsClosed:true}};
 const receipt={source:'INDEPENDENT_READ_ONLY',readOnly:true,project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',database:'clearallergy_main19',applicationSha:target.source,deployment:target.deployment,prefixSha256:t2Hash(checkpoint),unknownResolved:true,sessionsClosed:true,pendingRequests:0,menuWrites:78,globalSessionConsumption:9,allHistoryMatched:true,exclusive:true,rows:checkpoint.controller.finalRows,requestIds:checkpoint.controller.claims.map(c=>c.requestId),observedUtc:new Date().toISOString()};
 return {prefixCheckpoint:checkpoint,prefixReceipt:receipt,snapshot:input.snapshot,terminal:input.terminal,authorization:input.authorization};}
test('T2 minimum reobservation has32 forwards not CREATE8; proposed caps do not overwrite active103/7',()=>{const h=fixture();try{const p=planManagedT2Completion(h.input);assert.equal(p.normalExpected.menuWrites,137);assert.equal(p.reservedMaximum.sessions,18);assert.equal(p.futureManifest.filter(x=>x.channel==='MENU').length,95);assert.equal(p.caseBudgets.reduce((n,c)=>n+c.menuWrites,0),95);assert.equal(p.cutContrasts.length,208);assert.equal(p.sessionPrefixes.length,9);assert.equal(p.sessionExpectedTotal,16);assert.ok(p.cutContrasts.every(x=>x.normalRetries===0&&x.beforeIndependentTerminal.recoveryWrites===0));const c=t2Commands(h.input.snapshot);assert.equal(c.length,36);assert.equal(c.slice(4).length,32);assert.ok(c.every(c=>c.kind!=='CREATE'));assert.equal(c.filter(c=>c.ui).length,12);assert.equal(suiteLimits.menuWrites,103);assert.equal(suiteLimits.sessions,7);}finally{h.cleanup();}});
test('same real entry/controller/runtime with mock HTTP/UI uses old8, observes5phases, closes A/B, exports78/9 prefix without CREATE',async()=>{const h=fixture();try{const before=h.input.snapshot.claims.map(c=>c.id),r=await executeManagedApprovedResume(h.input);
 assert.equal(r.status,'T2_PRIVATE_PENDING_INDEPENDENT_SQL',JSON.stringify({status:r.status,controller:r.controller?.status,calls:h.calls.filter(c=>c.method!=='GET').length,first:r.controller?.firstFailure}));
 assert.deepEqual(h.seen,['S1','S2']);assert.equal(r.sessionConsumption,9);assert.equal(r.sessionsComplete,true);assert.equal(r.t2CheckpointExportable,true);assert.equal(h.uiSends(),12);
 assert.equal(h.calls.filter(c=>c.method!=='GET').length,36);assert.equal(h.menus.size,11);assert.ok([...h.menus.values()].every(m=>!m.isPublished));assert.equal(r.controller.observations.length,5);
 assert.deepEqual(h.input.snapshot.claims.map(c=>c.id),before);const p=makePrefix(r,h.input);assert.equal(validateT2PrefixCheckpoint(p).controller.counts.menuWrites,78);
 for(const alter of [x=>{x.prefixCheckpoint.controller.claims[1].requestId=x.prefixCheckpoint.controller.claims[0].requestId;},x=>{x.prefixCheckpoint.controller.observations[1].rows[0].publicDomMatched=false;},x=>{x.prefixCheckpoint.sessionLedger.attempts[0].terminated=false;},x=>{x.prefixCheckpoint.sessionLedger.attempts[0].providerCreatedUtc='2040-01-01T00:00:00.000Z';},x=>{x.prefixReceipt.token='SYNTHETIC_PRIVATE';},x=>{x.prefixReceipt.observedUtc=new Date(Date.now()-3600001).toISOString();},x=>{x.prefixCheckpoint.controller.claims[0].resource.path='/api/admin/shop';}]){
  const bad=structuredClone(p);alter(bad);bad.prefixReceipt.prefixSha256=t2Hash(bad.prefixCheckpoint);assert.throws(()=>validateT2PrefixCheckpoint(bad),/T2_PREFIX_CHECKPOINT_REFUSED/);
 }
 }finally{h.cleanup();}});
test('T2 old approval/cap is refused before auth and lost or409 write stops without retry/cleanup or export',async()=>{
 const h=fixture();try{h.input.authorization.limits.menuWrites=103;await assert.rejects(executeManagedApprovedResume(h.input));assert.equal(h.seen.length,0);assert.equal(h.calls.length,0);}finally{h.cleanup();}
 for(const fault of ['409','LOST']){const h=fixture(fault);try{const r=await executeManagedApprovedResume(h.input);assert.match(r.status,/^HOLD/);assert.equal(r.t2CheckpointExportable,false);assert.equal(h.calls.filter(c=>c.method!=='GET').length,5);assert.equal(r.controller.claims.at(-1).state,'FORWARD_CONSUMED');assert.equal(r.automaticCleanup,false);}finally{h.cleanup();}}
});
test('verified T2 prefix restores FULL without replaying B4 or T2; missing/false prefix proof is refused before auth',async()=>{
 const h=fixture();try{const r=await executeManagedApprovedResume(h.input),p=makePrefix(r,h.input);assert.ok(r.t2CheckpointExportable);const next={...h.input,...p,operation:'CORE_AND_SERVICE'};
 const admission=await assertManagedResumeActivation(next);assert.equal(admission.initialCounts.menuWrites,78);assert.equal(admission.initialCounts.sessions,9);
 let reserved;const ports={verifyApproval:async()=>true,verifyCheckpoint:async()=>true,reserveRecoveryBudget:async v=>{reserved=v;return true;},installSendGuard:async()=>({beforeSend:true,remove:async()=>true}),claimOperation:async()=>true,readMenu:async()=>{throw Error('STOP_BEFORE_ANY_WRITE');},write:async()=>assert.fail('No write in this local hydration test'),observeT3Evidence:async()=>{}};
 const controller=prepareManaged414953Resume({snapshot:h.input.snapshot,terminal:h.input.terminal,approval:h.input.authorization,creationOperationIds:h.input.creationOperationIds,prefixCheckpoint:p.prefixCheckpoint,prefixReceipt:p.prefixReceipt,ports});await controller.initialize();assert.equal(controller.snapshot().counts.menuWrites,78);assert.equal(controller.snapshot().stopReservations.length,0);assert.equal(reserved.normal.S2,1);
 const held=await controller.executeT3();assert.match(held.status,/^HOLD/);assert.equal(held.newClaims.length,0);
 for(const change of [x=>{delete x.prefixCheckpoint;},x=>{x.prefixReceipt.unknownResolved=false;}]){const bad={...next,prefixReceipt:structuredClone(next.prefixReceipt)};change(bad);await assert.rejects(assertManagedResumeActivation(bad));}
 }finally{h.cleanup();}
});

test('late UI duplicate and private shop500 never become phase success; prefix mode with proof refuses before any actor',async()=>{
 for(const fault of ['LATE_DUPLICATE','SHOP500']){const h=fixture(fault);try{const r=await executeManagedApprovedResume(h.input);assert.match(r.status,/^HOLD/);assert.equal(r.t2CheckpointExportable,false);assert.equal(r.automaticCleanup,false);assert.ok(h.calls.filter(c=>c.method!=='GET').length<36);}finally{h.cleanup();}}
 for(const field of ['prefixCheckpoint','prefixReceipt','fullCheckpoint','continuationReceipt']){const h=fixture();try{h.input[field]={};await assert.rejects(assertManagedResumeActivation(h.input));assert.deepEqual(h.seen,[]);assert.equal(h.calls.length,0);}finally{h.cleanup();}}
});
