// Real candidate controller/runtime with memory HTTP + Playwright-shaped UI only.
// No real browser, authentication, DB, Blob or external network.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
import {completionScope,completionLimits,rebasedCompletionScope,rebasedCompletionLimits,t2Commands,t2ExpectedFood,t2Projection,t2Hash,planManagedT2Completion,validateT2PrefixCheckpoint,validateManagedRebase} from '../scripts/issue118-t2-reobserve.mjs';
import {planManaged414953Recovery,prepareManaged414953Resume,suiteLimits} from '../scripts/issue118-managed-suite.mjs';
import {target,executeManagedApprovedResume,assertManagedResumeActivation,executeExact8Cleanup,assertExact8CleanupInput,createManagedRuntimePorts} from '../scripts/check-issue118-live-t1-browser.mjs';
import {admitManagedFullInput,verifyManagedFullGithubProvenance,runManagedFullCli,encodeManagedFullInput} from '../scripts/issue118-managed-full-entry.mjs';
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
   if(url===target.origin+'/api/admin/menus'&&method==='POST'){const id='cmock'+randomUUID().replaceAll('-',''),m=menu(id,owner,options.data);menus.set(id,m);return response({id},201);}
   const id=new URL(url).pathname.split('/').filter(x=>x!=='stop').at(-1),m=menus.get(id);assert.ok(m);
   if(url.includes('/api/menus/'))return response(m.isPublished?{menu:m}:{error:'NOT_FOUND'},fault==='PUBLIC500'?500:m.isPublished?200:404);
   assert.equal(m.owner,owner);if(method==='GET')return response({menu:m});assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);
   const data=options.data||{};if(data.expectedVersion!==undefined&&data.expectedVersion!==m.version)return response({error:'CONFLICT'},409);
   if(fault==='409'&&calls.filter(c=>c.method!=='GET').length===5)return response({error:'CONFLICT'},409);
   if(method==='POST'){m.isPublished=false;m.version++;}else if(data.publicationAction==='publish'){m.isPublished=true;m.version+=3;m.publicationConfirmedFoodVersion=m.foodVersion;}
   else{const {isPublished,allergenStatusBySlug,...food}=data;delete food.expectedVersion;assert.equal(isPublished,false);Object.assign(m,food);m.allergens=m.allergens.map(a=>({...a,status:allergenStatusBySlug[a.slug]}));m.version+=59;m.foodVersion+=59;m.isPublished=false;m.publicationConfirmedFoodVersion=null;}
   if(fault==='LOST'&&calls.filter(c=>c.method!=='GET').length===5||fault==='AFTER_BASELINE_LOST'&&calls.filter(c=>c.method!=='GET').length===17)throw Error('SYNTHETIC_PRIVATE');
   return response(method==='POST'?{ok:true,menu:{id,version:m.version,isPublished:false}}:{menu:m});};context.request.fetch=api;
  const createPage=()=>{let closed=false,url='',handler,dialog,notice=false,lastMenu;const fields={},frame={page:()=>page};
   const current=()=>menus.get(new URL(url).pathname.split('/').filter(x=>x!=='edit').at(-1));
   const submit=async(kind)=>{const m=current();let data;if(kind==='PUBLISH')data={expectedVersion:m.version,publicationAction:'publish'};
    else if(kind==='SAVE'){data={...source.fixturePayload(m),expectedVersion:m.version,isPublished:false,ingredients:fields.ingredients,allergenStatusBySlug:{...source.fixturePayload(m).allergenStatusBySlug,milk:fields.milk}};}
    const method=kind==='STOP'?'POST':'PUT',requestUrl=target.origin+'/api/admin/menus/'+m.id+(kind==='STOP'?'/stop':'');
    const request={method:()=>method,url:()=>requestUrl,postDataBuffer:()=>data?Buffer.from(JSON.stringify(data)):null,frame:()=>frame,allHeaders:async()=>({})};
    assert.ok(handler);uiSends++;await handler({request:()=>request,fetch:async opts=>api(requestUrl,{...opts,method,data}),fulfill:async()=>{notice=true;},abort:async()=>{},fallback:async()=>assert.fail('Unexpected fallback')});};
   const locator=selector=>({inputValue:async()=>{if(fault==='FIELD_AND_CLOSE_FAILURE')throw Error('sk_test_SYNTHETIC_PRIVATE https://secret.invalid/?token=private');const m=current();return selector.endsWith('-1')?m.name:selector.endsWith('-2')?String(m.priceYen):fields.ingredients??m.ingredients;},fill:async v=>{fields.ingredients=v;},
    count:async()=>{const m=[...menus.values()].find(m=>selector.includes('/menus/'+m.id));return m?.isPublished?1:0;},innerText:async()=> '乳 含む'});
   const role=(type,opt={})=>({count:async()=>{const m=current();if(fault==='SAVED_PANEL_FALSE'&&opt.name==='この内容で公開')return 0;return type==='heading'?(opt.name==='ページが見つかりません'?!m?.isPublished:m?.isPublished&&opt.name===m.name)?1:0:1;},
    waitFor:async()=>{if(fault==='LATE_DUPLICATE'&&notice&&handler)await submit('SAVE');assert.ok(notice||current());},getByText:()=>role('text'),getByRole:(t,o)=>role(t,o),locator,
    getAttribute:async()=> 'true',click:async()=>{if(opt.name==='含む'){fields.milk='CONTAINS';return;}if(opt.name==='公開する')return;
      if(opt.name==='公開を停止する'){await dialog({type:()=> 'confirm',accept:async()=>{}});await submit('STOP');}
      else if(opt.name==='保存する')await submit('SAVE');else if(opt.name==='この内容で公開')await submit('PUBLISH');}});
   const page={context:()=>context,mainFrame:()=>frame,isClosed:()=>closed,url:()=>url,on:()=>{},setDefaultTimeout:()=>{},setDefaultNavigationTimeout:()=>{},once:(_name,fn)=>{dialog=fn;},
    goto:async next=>{url=next;if(fault==='ADMIN_NAV_FAILURE'&&next.includes('/admin/menus/'))throw Error('sk_test_SYNTHETIC_PRIVATE https://secret.invalid/?token=private');if(next.includes('/menus/'))lastMenu=new URL(next).pathname.split('/').filter(x=>x!=='edit').at(-1);notice=false;delete fields.ingredients;delete fields.milk;return {status:()=>fault==='SHOP500'&&next===target.origin+'/shops/'+identity.shopId&&lastMenu&&!menus.get(lastMenu)?.isPublished?500:next.includes('/admin/')||current()?.isPublished||next===target.origin+'/shops/'+identity.shopId&&[...menus.values()].some(m=>m.owner===owner&&m.isPublished)?200:404};},
    waitForFunction:async()=>{},evaluate:async fn=>String(fn).includes('publishableKey')?pk:identity.ownerId,locator,getByRole:role,
    getByText:(text)=>({count:async()=>{const m=current();if(text.startsWith('保存済みの公開設定：'))return text.endsWith(m.isPublished?'：公開':'：非公開')?1:0;return 1;},waitFor:async()=>assert.ok(notice),locator:()=>({innerText:async()=> '乳 含む'})}),
    route:async(_pattern,fn)=>{handler=fn;},unroute:async()=>{handler=undefined;},close:async()=>{if(fault==='PAGE_CLOSE_FAILURE'&&url===target.origin+'/shops/'+identity.shopId||fault==='FIELD_AND_CLOSE_FAILURE'&&url.includes('/admin/menus/'))throw Error('sk_test_SYNTHETIC_PRIVATE');closed=true;}};pages.push(page);return page;};
  context.newPage=async()=>createPage();context.pages=()=>pages.filter(p=>p.context()===context&&!p.isClosed());const page=createPage();page.evaluate=async()=>({id:identity.ownerId,pk});
  const session={id:'sess_T2'+owner,ownerId:identity.ownerId,ownerVerified:true,eligibleForCleanup:true,providerCreatedUtc:now,providerStatus:'active',providerTerminationConfirmed:false};
  const access={token,read:async(_api,url)=>api(url),sessionLifecycleMode:()=> 'TRACKED_OWNER_SESSION',sessionObservation:()=>structuredClone(session),signOut:async()=>{Object.assign(session,{providerStatus:'removed',providerTerminationConfirmed:true,frontendSignOutAcknowledged:true,canonicalReadAttempts:2});return 'SIGNOUT_CONFIRMED';}};
  const actor={owner,expectedUserId:identity.ownerId,binding:{owner,shopId:identity.shopId},page,context,access,lifecycle:{browser,tracker},finalize:()=>finalizeOwnedCiActor({access,page,context,browser,expectedOwnerId:identity.ownerId,drainRoutes:()=>tracker.drain(),readRouteState:()=>tracker.snapshot(),attempts:{browserLaunchAttempted:true,contextCreateAttempted:true}})};return actor;
 });
 const input={snapshot,terminal,authorization,creationOperationIds,identityReceipt,checkpointReceipt,operation:'T2_REOBSERVE_PREFIX',serviceRunId:randomUUID(),claimDirectory:directory,image:{buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))},env:{GITHUB_RUN_ID:'999001',GITHUB_SHA:'a'.repeat(40)},dependencies:{openActor:async({role,record})=>{seen.push(role);const actor=actors.find(a=>a.owner===role);record({owner:role,stage:'OWNER_AND_SHOP_VERIFIED',sessionIdentity:actor.access.sessionObservation()});return actor;}}};
 const cleanup=()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true});};
 return {input,menus,calls,actors,pages,seen,cleanup,directory,uiSends:()=>uiSends,setFault:value=>{fault=value;}};
}
// Generate the new baseline through the same retired prefix and exact-cleanup
// executors using memory HTTP, rather than editing their counters into 66/12.
async function rebasedFixture(fault='NONE'){
 const h=fixture('ADMIN_NAV_FAILURE'),old=await executeManagedApprovedResume(h.input);assert.equal(old.controller.counts.menuWrites,58);h.setFault('NONE');
 const utc=()=>new Date().toISOString(),now=utc(),originalSessions=old.sessionAttempts.map(a=>a.sessionIdentity),cp={version:2,result:old,source:{githubRunId:'999001',runnerSha:'a'.repeat(40),artifactSha256:'b'.repeat(64),jobTerminal:true,pendingRequests:0},failedAttempt:{source:{githubRunId:'999002',runnerSha:'a'.repeat(40),artifactSha256:'c'.repeat(64),jobTerminal:true,pendingRequests:0},
  result:{status:'HOLD_EXACT8_CLEANUP',scope:'EXACT_T2_CLEANUP8',livePass:false,sourceRunId:'999001',counts:{menus:11,menuWrites:58,sessions:10,shopWrites:0,blobUploads:0},sessionAttempts:[{index:10,owner:'S2',consumedBeforeAuthentication:true,sessionIdentity:null,finalization:null}],owners:[],evidencePersistenceComplete:true,automaticRetry:false,automaticCleanup:false,independentDatabase:'NOT_ATTESTED'},
  closure:{owner:'S2',sessionId:'sess_PreviousUncertainB',method:'DASHBOARD_REVOKED_RELOAD_ABSENT',terminated:true,uniqueInSourceRunWindow:true,createdMinuteUtc:new Date(Math.floor(Date.now()/60000)*60000).toISOString(),observedUtc:now,loadedDevices:true,targetRows:0,priorWindowsRows:1}}};
 const rows=()=>[...h.menus.values()].map(m=>({...t2Projection(m,m.owner),ownerMatches:true}));
 const cleanupInput={operation:'EXACT_T2_CLEANUP8',authorization:{status:'APPROVED',scope:'EXACT_T2_CLEANUP8',verifiedBy:'human',evidenceReference:'Sentinel_'+('2'.repeat(32)),approvedUtc:now,limits:{priorMenuWrites:58,priorSessions:10,maximumMenuWrites:66,maximumSessions:12,maximumStops:8,maximumNewSessions:2,globalMenuWrites:138,globalSessions:18},sourceSha256:t2Hash(cp)},identityReceipt:{...h.input.identityReceipt,observedUtc:now},cleanupCheckpoint:cp,
  cleanupReceipt:{source:'INDEPENDENT_READ_ONLY',readOnly:true,verifiedBy:'cli_metadata_observer',project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',database:'clearallergy_main19',role:'neondb_owner',applicationSha:target.source,deployment:target.deployment,sourceSha256:t2Hash(cp),knownTerminal:true,unknownResolved:true,exclusive:true,pendingRequests:0,menuWrites:58,sessionConsumption:10,allNineSessionsClosed:true,requestIds:[...h.input.terminal.consumedRequestIds,...old.controller.claims.map(c=>c.requestId)],rows:rows().filter(r=>t2ids.includes(r.id)),sessionClosures:originalSessions.map((s,i)=>({owner:i?'S2':'S1',sessionId:s.id,providerCreatedUtc:s.providerCreatedUtc,method:'DASHBOARD_REVOKED_RELOAD_ABSENT',terminated:true,localClosed:true,observedUtc:now})),sqlObservedUtc:now,observedUtc:now},executionApproval:{}};
 cleanupInput.executionApproval={status:'APPROVED',scope:'FULL_RESUME_WITH_ACTIONS_READ',verifiedBy:'human',evidenceReference:cleanupInput.authorization.evidenceReference,actionsReadApproved:true,singleAttempt:true,runnerSha:'a'.repeat(40),operation:cleanupInput.operation,inputSha256:t2Hash(Object.fromEntries(Object.entries(cleanupInput).filter(([k])=>k!=='executionApproval')))};
 let sessionSequence=0;const actor=(role,tag)=>{const base=h.actors.find(a=>a.owner===role),session={id:'sess_'+tag+role+(++sessionSequence),ownerId:managedActorIdentity[role].ownerId,providerCreatedUtc:utc(),ownerVerified:true,eligibleForCleanup:true,providerTerminationConfirmed:false,providerStatus:'active'},access={...base.access,ensureToken:async()=>{},sessionObservation:()=>structuredClone(session),signOut:async()=>{Object.assign(session,{providerTerminationConfirmed:true,providerStatus:'removed',frontendSignOutAcknowledged:true,canonicalReadAttempts:2});return 'SIGNOUT_CONFIRMED';}};
  return {...base,access,finalize:()=>finalizeOwnedCiActor({access,page:base.page,context:base.context,browser:base.lifecycle.browser,expectedOwnerId:base.expectedUserId,drainRoutes:()=>base.lifecycle.tracker.drain(),readRouteState:()=>base.lifecycle.tracker.snapshot(),attempts:{browserLaunchAttempted:true,contextCreateAttempted:true}})};};
 const started=utc(),claimsDirectory=join(h.directory,'cleanup'),result=await executeExact8Cleanup(cleanupInput,{env:{GITHUB_SHA:'a'.repeat(40)},claimDirectory:claimsDirectory,openActor:async({role,record})=>{const a=actor(role,'Cleanup');record({owner:role,stage:'OWNER_AND_SHOP_VERIFIED',sessionIdentity:a.access.sessionObservation()});return a;}});assert.equal(result.status,'EXACT8_PRIVATE_API_CONFIRMED_PENDING_SQL',JSON.stringify({counts:result.counts,owners:result.owners,sessionAttempts:result.sessionAttempts}));
 const stopEvents=readdirSync(claimsDirectory).filter(f=>/^cleanup-event-\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).map(f=>JSON.parse(readFileSync(join(claimsDirectory,f),'utf8'))).filter(x=>x.stage==='CLEANUP_PRIVATE_API_CONFIRMED');
 const rebaseCheckpoint={version:1,cleanupInput,result,stopEvents,source:{githubRunId:'999003',runnerSha:'a'.repeat(40),artifactSha256:'d'.repeat(64),jobTerminal:true,pendingRequests:0,sessionsClosed:true,startedUtc:started,finishedUtc:utc()}};
 const rebaseReceipt={source:'INDEPENDENT_READ_ONLY',readOnly:true,verifiedBy:'cli_metadata_observer',project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',database:'clearallergy_main19',role:'neondb_owner',applicationSha:target.source,deployment:target.deployment,rebaseSha256:t2Hash(rebaseCheckpoint),unknownResolved:true,exclusive:true,pendingRequests:0,menuWrites:66,sessionConsumption:12,allTwelveSessionsClosed:true,allHistoryMatched:true,rows:rows(),requestIds:[...cleanupInput.cleanupReceipt.requestIds,...stopEvents.map(c=>c.requestId)],sqlObservedUtc:utc(),observedUtc:utc()};
 h.input.rebaseCheckpoint=rebaseCheckpoint;h.input.rebaseReceipt=rebaseReceipt;h.input.authorization={...h.input.authorization,scope:rebasedCompletionScope,limits:{...rebasedCompletionLimits},rebaseSha256:t2Hash(rebaseCheckpoint)};h.input.claimDirectory=join(h.directory,'rebased');h.input.env.GITHUB_RUN_ID='999004';
 h.input.dependencies.openActor=async({role,record})=>{h.seen.push(role);const a=actor(role,'Rebased');record({owner:role,stage:'OWNER_AND_SHOP_VERIFIED',sessionIdentity:a.access.sessionObservation()});return a;};h.calls.length=0;h.seen.length=0;h.setFault(fault);return h;
}
function makePrefix(report,input){const checkpoint={...report.t2PrefixPayload,source:{githubRunId:'999001',runnerSha:'a'.repeat(40),artifactSha256:'b'.repeat(64),jobTerminal:true,pendingRequests:0,sessionsClosed:true}};
 checkpoint.source.githubRunId=input.env.GITHUB_RUN_ID;
 const receipt={source:'INDEPENDENT_READ_ONLY',readOnly:true,project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',database:'clearallergy_main19',applicationSha:target.source,deployment:target.deployment,prefixSha256:t2Hash(checkpoint),unknownResolved:true,sessionsClosed:true,pendingRequests:0,menuWrites:checkpoint.controller.counts.menuWrites,globalSessionConsumption:checkpoint.controller.counts.sessions,allHistoryMatched:true,exclusive:true,rows:checkpoint.controller.finalRows,requestIds:checkpoint.controller.claims.map(c=>c.requestId),observedUtc:new Date().toISOString()};
 return {prefixCheckpoint:checkpoint,prefixReceipt:receipt,snapshot:input.snapshot,terminal:input.terminal,authorization:input.authorization,...(input.rebaseCheckpoint?{rebaseCheckpoint:input.rebaseCheckpoint,rebaseReceipt:input.rebaseReceipt}:{})};}

test('rebased66/12 source is immutable; legacy reset/create and forged stale open or rolled-back checkpoints are refused before auth',async()=>{
 const h=await rebasedFixture();try{const b=validateManagedRebase(h.input);assert.equal(b.menuWrites,66);assert.equal(b.sessions,12);const plan=planManagedT2Completion(h.input);assert.equal(plan.normalExpected.menuWrites,153);assert.equal(plan.normalExpected.sessions,21);assert.equal(plan.reservedMaximum.sessions,23);assert.equal(plan.futureManifest.filter(x=>x.channel==='MENU').length,87);assert.equal(t2Commands(h.input.snapshot,true).length,28);assert.ok(t2Commands(h.input.snapshot,true).every(x=>!['CREATE','RESET','B_CLEANUP'].includes(x.phase)));
  for(const mutate of [x=>x.rebaseReceipt.sessionConsumption=7,x=>x.rebaseReceipt.menuWrites=42,x=>x.rebaseReceipt.allTwelveSessionsClosed=false,x=>x.rebaseReceipt.rows[0].version++,x=>x.rebaseReceipt.requestIds.pop(),x=>x.rebaseCheckpoint.result.counts.sessions=11,x=>x.rebaseCheckpoint.stopEvents[0].requestId=x.rebaseCheckpoint.stopEvents[1].requestId,x=>x.rebaseCheckpoint.result.sessionAttempts[0].finalization.complete=false,x=>x.rebaseCheckpoint.result.owners[0].fixtures[0].version--]){const bad={...h.input,rebaseCheckpoint:structuredClone(h.input.rebaseCheckpoint),rebaseReceipt:structuredClone(h.input.rebaseReceipt),authorization:structuredClone(h.input.authorization)};mutate(bad);bad.rebaseReceipt.rebaseSha256=t2Hash(bad.rebaseCheckpoint);bad.authorization.rebaseSha256=t2Hash(bad.rebaseCheckpoint);await assert.rejects(assertManagedResumeActivation(bad));assert.equal(h.seen.length,0);assert.equal(h.calls.length,0);}
 }finally{h.cleanup();}
});

test('same rebased entry preflights private8 before 28 new forwards, observes five phases, closes sessions and exports94/14',async()=>{
 const h=await rebasedFixture();try{const before=h.input.snapshot.claims.map(x=>x.id),r=await executeManagedApprovedResume(h.input);assert.equal(r.controller.status,'T2_PRIVATE_PENDING_INDEPENDENT_SQL');assert.equal(r.t2CheckpointExportable,true);assert.equal(r.sessionConsumption,14);assert.equal(r.controller.counts.menuWrites,94);assert.equal(h.calls.filter(x=>x.method!=='GET').length,28);assert.equal(r.controller.claims.length,28);assert.ok(r.controller.claims.every(x=>!x.id.includes('RESET')&&!x.id.includes('CREATE')&&!x.id.includes('B_CLEANUP')));assert.equal(r.controller.preflight.phase,'PRE_WRITE_PRIVATE');assert.ok(r.controller.preflight.rows.every(x=>!x.isPublished&&x.savedPanelMatched&&x.publicApiStatus===404));assert.equal(r.controller.observations.length,5);assert.ok(r.controller.finalRows.every(x=>!x.isPublished));assert.ok(r.sessionsComplete);assert.deepEqual(h.input.snapshot.claims.map(x=>x.id),before);assert.equal(r.t2PrefixPayload.sessionLedger.baselineConsumed,12);
  const prefix=makePrefix(r,h.input);assert.equal(validateT2PrefixCheckpoint(prefix).controller.counts.menuWrites,94);const a=await assertManagedResumeActivation({...h.input,operation:'CORE_AND_SERVICE',...prefix});assert.equal(a.initialCounts.menuWrites,94);assert.equal(a.initialCounts.sessions,14);
 }finally{h.cleanup();}
});

test('pre-write private observation failure preserves first fixed step, sends zero menu writes and never exports a prefix',async()=>{
 for(const fault of ['ADMIN_NAV_FAILURE','FIELD_AND_CLOSE_FAILURE','PUBLIC500','SAVED_PANEL_FALSE']){const h=await rebasedFixture(fault);try{const r=await executeManagedApprovedResume(h.input);assert.equal(r.controller.counts.menuWrites,66);assert.equal(r.sessionConsumption,14);assert.equal(h.calls.filter(x=>x.method!=='GET').length,0);assert.equal(r.controller.claims.length,0);assert.equal(r.controller.preflight,null);assert.equal(r.controller.observations.length,0);assert.equal(r.t2CheckpointExportable,false);assert.equal(r.controller.firstFailure.stage,'PRE_WRITE_PRIVATE');
  if(['PUBLIC500','SAVED_PANEL_FALSE'].includes(fault)){assert.equal(r.controller.firstFailure.code,'ROW_PREDICATE_FAILED');assert.ok(r.controller.firstFailure.rows.some(x=>fault==='PUBLIC500'?x.publicApiStatus===500:x.savedPanelMatched===false));}
  else{assert.equal(r.controller.firstFailure.observation.menuKey,'M01');assert.equal(r.controller.firstFailure.observation.failed,true);}
  assert.doesNotMatch(JSON.stringify(r),/sk_test_SYNTHETIC_PRIVATE|secret\.invalid|token=private/);}finally{h.cleanup();}}
});

test('rebased CLI binds genuine cleanup JSON and STOP events before secret delivery; mismatch or active source never authenticates',async()=>{
 const h=await rebasedFixture();try{const list=['snapshot','terminal','authorization','creationOperationIds','identityReceipt','checkpointReceipt','operation','serviceRunId','rebaseCheckpoint','rebaseReceipt'],input=Object.fromEntries(list.map(k=>[k,h.input[k]]));
  input.executionApproval={status:'APPROVED',scope:'FULL_RESUME_WITH_ACTIONS_READ',verifiedBy:'human',evidenceReference:input.authorization.evidenceReference,actionsReadApproved:true,singleAttempt:true,runnerSha:'a'.repeat(40),operation:input.operation,inputSha256:t2Hash(input)};
  const a=await assertManagedResumeActivation(input),cp=input.rebaseCheckpoint,sourceTitle='Issue118 FULL '+assertExact8CleanupInput(cp.cleanupInput,Date.parse(cp.source.startedUtc)).checkpointKey;
  const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:ciIdentity.repository,GITHUB_REPOSITORY_ID:ciIdentity.repositoryId,GITHUB_REF:ciIdentity.ref,GITHUB_WORKFLOW_REF:ciIdentity.workflowRef,ISSUE118_GITHUB_ENVIRONMENT:ciIdentity.environment,GITHUB_SHA:'a'.repeat(40),ISSUE118_EXPECTED_RUNNER_SHA:'a'.repeat(40),GITHUB_RUN_ID:'999004',GITHUB_RUN_NUMBER:'24',ISSUE118_RESUME_CLAIM:a.checkpointKey,GH_TOKEN:'SYNTHETIC_ONLY'};
  const provider=async(url,fault)=>{assert.ok(url.startsWith('https://api.github.com/repos/'+ciIdentity.repository+'/actions/'));let value;
   if(url.includes('/workflows/'))value={total_count:2,workflow_runs:[{id:999004,display_title:'Issue118 FULL '+a.checkpointKey,run_number:24,run_attempt:1,event:'workflow_dispatch',head_branch:'test/issue118-live-t1-20261030',head_sha:env.GITHUB_SHA,path:'.github/workflows/issue118-live-e2e.yml'},{id:999003,run_number:23}]};
   else if(url.endsWith('/actions/runs/999003'))value={status:fault==='ACTIVE'?'in_progress':'completed',run_attempt:1,event:'workflow_dispatch',head_branch:'test/issue118-live-t1-20261030',head_sha:cp.source.runnerSha,path:'.github/workflows/issue118-live-e2e.yml',run_number:23,display_title:sourceTitle,created_at:cp.source.startedUtc,updated_at:cp.source.finishedUtc};
   else if(url.includes('/actions/runs/999003/artifacts'))value={total_count:1,artifacts:[{name:'issue118-full-999003',expired:false,digest:'sha256:'+cp.source.artifactSha256,workflow_run:{id:999003}}]};else assert.fail('Unknown synthetic metadata path');
   return {status:200,text:async()=>JSON.stringify(value)};};
  const payload={result:cp.result,stopEvents:cp.stopEvents};assert.equal((await admitManagedFullInput(input,env)).rebased,true);assert.equal((await verifyManagedFullGithubProvenance({input,env,fetchImpl:url=>provider(url),rebasePayload:payload})).sourceVerified,true);
  for(const [fetchImpl,rebasePayload]of [[url=>provider(url,'ACTIVE'),payload],[url=>provider(url),{...payload,stopEvents:payload.stopEvents.slice(1)}],[url=>provider(url),{...payload,result:{...payload.result,livePass:true}}]])await assert.rejects(verifyManagedFullGithubProvenance({input,env,fetchImpl,rebasePayload}),/MANAGED_FULL_ENTRY_REFUSED/);
  const directory=join(h.directory,'source-artifact');mkdirSync(directory);mkdirSync(join(directory,'claims'));writeFileSync(join(directory,'result.json'),JSON.stringify(cp.result));cp.stopEvents.forEach((x,i)=>writeFileSync(join(directory,'claims','cleanup-event-'+i+'.json'),JSON.stringify(x)));
  assert.equal((await runManagedFullCli({argv:['--preflight'],env:{...env,ISSUE118_FULL_INPUT:encodeManagedFullInput(input),ISSUE118_REBASE_ARTIFACT_DIRECTORY:directory},fetchImpl:url=>provider(url)})).status,'FULL_PREFLIGHT_NO_AUTH');assert.equal(h.seen.length,0);assert.equal(h.calls.length,0);
 }finally{h.cleanup();}
});

test('rebased FULL core starts from94/14, reuses both T3 CREATE IDs and stops before unimplemented remainder in this synthetic transport',async()=>{
 const h=await rebasedFixture();try{const prefixRun=await executeManagedApprovedResume(h.input);assert.equal(prefixRun.t2CheckpointExportable,true);const p=makePrefix(prefixRun,h.input);h.input={...h.input,...p,operation:'CORE_AND_SERVICE',env:{...h.input.env,GITHUB_RUN_ID:'999005'},claimDirectory:join(h.directory,'core')};h.calls.length=0;h.seen.length=0;
  h.input.dependencies.createRuntime=args=>{const runtime=createManagedRuntimePorts(args);return {...runtime,resumePorts:{...runtime.resumePorts,runT4:async()=>{throw Error('SYNTHETIC_STOP_BEFORE_T4');}}};};
  const r=await executeManagedApprovedResume(h.input);assert.match(r.core.status,/^T3_API_SEQUENCE_PRIVATE/,JSON.stringify({status:r.core.status,counts:r.core.counts,claims:r.core.newClaims?.map(x=>({id:x.id,state:x.state})),requests:h.calls}));assert.equal(r.controller.counts.menuWrites,116);assert.equal(r.controller.counts.menus,17);assert.equal(r.sessionConsumption,16);assert.equal(h.calls.filter(x=>x.method!=='GET').length,22);assert.equal(h.calls.filter(x=>x.method==='POST'&&x.url===target.origin+'/api/admin/menus').length,6);assert.ok([...h.menus.values()].every(x=>!x.isPublished));assert.match(r.status,/^HOLD/);assert.equal(r.actualServicePass,false);assert.equal(r.fullCheckpointExportable,false);
 }finally{h.cleanup();}
});

test('compact prefix checkpoints refuse changed live food or reviews before any new core request',async()=>{
 for(const field of ['food','reviews']){const h=await rebasedFixture();try{
  const prior=await executeManagedApprovedResume(h.input),prefix=makePrefix(prior,h.input);assert.equal(prior.t2CheckpointExportable,true);
  h.input={...h.input,...prefix,operation:'CORE_AND_SERVICE',env:{...h.input.env,GITHUB_RUN_ID:'999005'},claimDirectory:join(h.directory,'core-refused')};
  const current=h.menus.get(t3ids[0]);if(field==='food')current.ingredients+=' changed';else current.foodReviews=[{id:'SYNTHETIC_REVIEW'}];h.calls.length=0;
  const result=await executeManagedApprovedResume(h.input);assert.match(result.status,/^HOLD/);assert.equal(result.controller.counts.menuWrites,94);
  assert.equal(h.calls.filter(x=>x.method!=='GET').length,0);assert.equal(result.fullCheckpointExportable,false);assert.equal(result.sessionsComplete,true);
 }finally{h.cleanup();}}
});
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

test('observation failures retain the first fixed stage through teardown and never record provider values',async()=>{
 for(const [fault,step] of [['ADMIN_NAV_FAILURE','ADMIN_NAV'],['PAGE_CLOSE_FAILURE','PAGE_CLOSE'],['FIELD_AND_CLOSE_FAILURE','ADMIN_FIELDS']]){
  const h=fixture(fault);try{const r=await executeManagedApprovedResume(h.input);assert.match(r.status,/^HOLD/);
   // Observation order follows the existing command registry: B cleanup IDs first.
   assert.equal(r.controller.firstFailure.stage,'BASELINE');assert.deepEqual(r.controller.firstFailure.observation,{step,menuKey:'M05',httpStatus:null,failed:true});
   assert.equal(r.controller.observations.length,0);assert.equal(r.controller.counts.menuWrites,58);assert.equal(r.t2CheckpointExportable,false);
   assert.equal(h.calls.filter(c=>c.method!=='GET').length,16);assert.equal(r.automaticCleanup,false);
   assert.doesNotMatch(JSON.stringify(r),/sk_test_SYNTHETIC_PRIVATE|secret\.invalid|token=private/);
  }finally{h.cleanup();}
 }
});

test('a later write failure cannot inherit FINISHED metadata from an earlier successful observation',async()=>{
 const h=fixture('AFTER_BASELINE_LOST');try{const r=await executeManagedApprovedResume(h.input);
  assert.match(r.status,/^HOLD/);assert.equal(r.controller.observations.length,1);
  assert.equal(r.controller.firstFailure.stage,'SIGNAL_STOP');assert.equal(Object.hasOwn(r.controller.firstFailure,'observation'),false);
  assert.equal(h.calls.filter(c=>c.method!=='GET').length,17);assert.equal(r.t2CheckpointExportable,false);assert.equal(r.automaticCleanup,false);
 }finally{h.cleanup();}
});
