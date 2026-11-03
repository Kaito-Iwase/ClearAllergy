// Synthetic provider/HTTP only. No real auth, browser, menu, DB or Blob calls.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
import {assertExact8CleanupInput,executeExact8Cleanup,target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {fullResumeHash as hash,admitManagedFullInput,verifyManagedFullGithubProvenance,encodeManagedFullInput,runManagedFullCli} from '../scripts/issue118-managed-full-entry.mjs';
import {ciIdentity,managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';
const ts=createRequire(import.meta.url)('tsx/cjs/api');const {ALLERGEN_MASTER}=ts.require('../lib/constants/allergen-master.ts',import.meta.url);
const {fixturePayload}=ts.require('../scripts/issue118-batch-stop.ts',import.meta.url);
function fixture(fault='NONE'){
 const directory=mkdtempSync(join(tmpdir(),'issue118-exact8-')),claimDirectory=join(directory,'claims'),now=Date.now(),utc=n=>new Date(now+n).toISOString(),menus=new Map(),claims=[];
 const affected=['M01','M02','M05','M06'],keys=Array.from({length:8},(_,i)=>'M0'+(i+1));
 for(const key of keys){const owner=Number(key.slice(1))<=4?'S1':'S2',milk=affected.includes(key)?'CONTAINS':'FREE',pub=owner==='S2',v=affected.includes(key)?(pub?95:96):(pub?32:33);
  menus.set(key,{id:'csynthetic'+key.toLowerCase(),shopId:managedActorIdentity[owner].shopId,owner,name:'SYNTHETIC '+key,description:null,priceYen:800,category:null,ingredients:'合成の米と水',precaution:null,imageUrl:null,imageFrame:'square',imageFit:'cover',imagePosition:'center',imageZoom:100,imagePositionX:50,imagePositionY:50,
   version:v,foodVersion:affected.includes(key)?88:29,isPublished:pub,reviewedFoodVersion:null,publicationConfirmedFoodVersion:affected.includes(key)?88:29,foodReviews:[],allergens:ALLERGEN_MASTER.map(a=>({...a,status:a.slug==='milk'?milk:'FREE'}))});}
 const projection=m=>({id:m.id,owner:m.owner,version:m.version,foodVersion:m.foodVersion,isPublished:m.isPublished,reviewedFoodVersion:null,publicationConfirmedFoodVersion:m.publicationConfirmedFoodVersion,foodSha256:hash(fixturePayload(m)),reviewsSha256:hash(m.foodReviews)});
 const order=[...keys.slice(4).map(k=>['B_CLEANUP',k]),...affected.map(k=>['RESET',k]),...keys.map(k=>['BASELINE_PUBLISH',k])];
 for(const [phase,key] of order){const m=menus.get(key),before=projection(m);if(phase==='B_CLEANUP'){m.version++;m.isPublished=false;}else if(phase==='RESET'){m.version+=59;m.foodVersion+=59;m.publicationConfirmedFoodVersion=null;m.allergens.find(a=>a.slug==='milk').status='FREE';}else{m.version+=3;m.isPublished=true;m.publicationConfirmedFoodVersion=m.foodVersion;}
  claims.push({id:'REOBSERVE_T2_'+phase+'_'+key,key,phase,owner:m.owner,kind:'MENU_WRITE',state:'CONFIRMED_RESPONSE_AND_READBACK',uiObserved:false,requestId:randomUUID(),before,after:projection(m),resource:{method:phase==='B_CLEANUP'?'POST':'PUT',path:'/api/admin/menus/'+m.id+(phase==='B_CLEANUP'?'/stop':''),shopId:m.shopId,menuId:m.id,purpose:'CORE',beforeVersion:before.version}});}
 const oldSessions=['S1','S2'].map(role=>({owner:role,sessionIdentity:{id:'sess_Old'+role,ownerId:managedActorIdentity[role].ownerId,ownerVerified:true,providerCreatedUtc:utc(-180000),providerTerminationConfirmed:role==='S1'}}));
 const result={target:{source:target.source,deployment:target.deployment,origin:target.origin},livePass:false,sessionConsumption:9,evidencePersistenceComplete:true,
  controller:{kind:'T2_REOBSERVATION_PREFIX',status:'HOLD_T2_REOBSERVATION_NO_RETRY_OR_CLEANUP',firstFailure:{stage:'BASELINE'},applicationSha:target.source,deployment:target.deployment,automaticRetry:false,automaticCleanup:false,counts:{menus:11,createAttempts:11,menuWrites:58,shopWrites:0,blobUploads:0,sessions:9,denialRequests:0},claims},
  sessionAttempts:oldSessions,sessionFinalizations:oldSessions.map(x=>({...x,localClosed:true}))};
 const cleanupCheckpoint={version:1,result,source:{githubRunId:'880001',runnerSha:'c'.repeat(40),artifactSha256:'b'.repeat(64),jobTerminal:true,pendingRequests:0}};
 const input={operation:'EXACT_T2_CLEANUP8',authorization:{status:'APPROVED',scope:'EXACT_T2_CLEANUP8',verifiedBy:'human',evidenceReference:'Sentinel_'+('1'.repeat(32)),approvedUtc:utc(-1000),limits:{priorMenuWrites:58,priorSessions:9,maximumMenuWrites:66,maximumSessions:11,maximumStops:8,maximumNewSessions:2,globalMenuWrites:138,globalSessions:18},sourceSha256:hash(cleanupCheckpoint)},
  identityReceipt:{...Object.fromEntries(['project','projectId','origin','deployment','source','alias'].map(k=>[k,target[k]])),environment:'Preview',status:'Ready',observedUtc:utc(-1000),verifiedBy:'cli_metadata_observer',evidenceReference:'SYNTHETIC_ONLY',protectionVerified:true,protectionMode:'ALL_DEPLOYMENTS',productionTarget:false},cleanupCheckpoint,
  cleanupReceipt:{source:'INDEPENDENT_READ_ONLY',readOnly:true,verifiedBy:'cli_metadata_observer',project:'patient-heart-55595249',branch:'br-flat-wildflower-aoeragrs',database:'clearallergy_main19',role:'neondb_owner',applicationSha:target.source,deployment:target.deployment,sourceSha256:hash(cleanupCheckpoint),knownTerminal:true,unknownResolved:true,exclusive:true,pendingRequests:0,menuWrites:58,sessionConsumption:9,allNineSessionsClosed:true,requestIds:[...Array.from({length:42},()=>randomUUID()),...claims.map(c=>c.requestId)],rows:[...menus.values()].map(m=>({...projection(m),ownerMatches:true})),sessionClosures:oldSessions.map(x=>({owner:x.owner,sessionId:x.sessionIdentity.id,providerCreatedUtc:x.sessionIdentity.providerCreatedUtc,method:x.owner==='S1'?'PROVIDER_TERMINAL':'DASHBOARD_REVOKED_RELOAD_ABSENT',terminated:true,localClosed:true,observedUtc:utc(-2000)})),sqlObservedUtc:utc(-1000),observedUtc:utc(0)},executionApproval:{}};
 const resign=x=>{x.authorization.sourceSha256=hash(x.cleanupCheckpoint);x.cleanupReceipt.sourceSha256=hash(x.cleanupCheckpoint);x.executionApproval={status:'APPROVED',scope:'FULL_RESUME_WITH_ACTIONS_READ',verifiedBy:'human',evidenceReference:x.authorization.evidenceReference,actionsReadApproved:true,singleAttempt:true,runnerSha:'a'.repeat(40),operation:x.operation,inputSha256:hash(Object.fromEntries(Object.entries(x).filter(([k])=>k!=='executionApproval')))};};resign(input);
 const admission=assertExact8CleanupInput(input),env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:ciIdentity.repository,GITHUB_REPOSITORY_ID:ciIdentity.repositoryId,GITHUB_REF:ciIdentity.ref,GITHUB_WORKFLOW_REF:ciIdentity.workflowRef,ISSUE118_GITHUB_ENVIRONMENT:ciIdentity.environment,GITHUB_SHA:'a'.repeat(40),ISSUE118_EXPECTED_RUNNER_SHA:'a'.repeat(40),GITHUB_RUN_ID:'880002',GITHUB_RUN_NUMBER:'22',ISSUE118_RESUME_CLAIM:admission.checkpointKey,GH_TOKEN:'SYNTHETIC_ONLY',ISSUE118_APPLY:'true',ISSUE118_TEST_CLERK_SECRET_KEY:'sk_test_SYNTHETIC_ONLY'};
 const seen={actors:[],posts:[],gets:[],finalized:[],requests:[]};let postCount=0;
 const openActor=async({role,record})=>{assert.ok(existsSync(join(claimDirectory,'session-attempt-'+(10+seen.actors.length)+'.json')));seen.actors.push(role);
  const identity=managedActorIdentity[role],session={id:'sess_New'+role,ownerId:identity.ownerId,providerCreatedUtc:utc(0),ownerVerified:true,eligibleForCleanup:true,providerTerminationConfirmed:false,providerStatus:'active'};
  record({owner:role,stage:'OWNER_AND_SHOP_VERIFIED',sessionIdentity:session});
  if(fault==='OPEN_FAIL')throw Error('sk_test_SYNTHETIC_PRIVATE');
  const actor={binding:{owner:role,shopId:identity.shopId},expectedUserId:identity.ownerId,routeFailed:()=>false,
   access:{sessionLifecycleMode:()=>'TRACKED_OWNER_SESSION',sessionObservation:()=>session,ensureToken:async()=>{},token:()=> 'synthetic.payload.signature'},
   context:{request:{fetch:async(url,o)=>{assert.equal(new URL(url).origin,target.origin);assert.equal(o.maxRedirects,0);assert.equal(o.maxRetries,0);
    const m=[...menus.values()].find(m=>new URL(url).pathname==='/api/admin/menus/'+m.id||new URL(url).pathname==='/api/admin/menus/'+m.id+'/stop');assert.ok(m);assert.equal(m.owner,role);
    if(o.method==='GET'){seen.gets.push(m.id);const copy=structuredClone(m);if(fault==='LATE_PREFLIGHT_VERSION'&&m.id===menus.get('M08').id||fault==='FINAL_OWNER_READ_VERSION'&&postCount===4&&m.id===menus.get('M05').id)copy.version++;return {status:()=>200,json:async()=>({menu:copy})};}
    assert.equal(o.method,'POST');assert.equal(url,target.origin+'/api/admin/menus/'+m.id+'/stop');assert.equal(Object.hasOwn(o,'data'),false);assert.equal(Object.hasOwn(o,'body'),false);seen.posts.push(m.id);postCount++;m.isPublished=false;m.version++;
    if(fault==='UNKNOWN_FIRST'&&postCount===1)throw Error('sk_test_SYNTHETIC_PRIVATE https://secret.invalid/?token=private');
    const requestId=fault==='DUPLICATE_REQUEST'?input.cleanupReceipt.requestIds[0]:randomUUID();seen.requests.push(requestId);
    return {status:()=>fault==='REDIRECT_FIRST'&&postCount===1?307:200,headers:()=>({'x-request-id':requestId}),json:async()=>({ok:true,menu:{id:m.id,isPublished:false,version:m.version}})};
   }}},finalize:async()=>{seen.finalized.push(role);if(fault==='END_JOURNAL_COLLISION')writeFileSync(join(claimDirectory,'session-end-10.json'),'SYNTHETIC');
    const ok=fault!=='FINALIZE_UNKNOWN';Object.assign(session,{providerTerminationConfirmed:ok,providerStatus:ok?'removed':'active'});
    return {complete:ok,authenticationCleanup:ok?'SIGNOUT_CONFIRMED':'SIGNOUT_UNVERIFIED',sessionIdentity:session,localClose:{allLocalClosed:true}};}};
  return actor;};
 const fetchImpl=async url=>{seen.requests.push(url);const path=url.replace('https://api.github.com/repos/'+ciIdentity.repository,'');let v;
  if(path.startsWith('/actions/workflows/'))v={total_count:2,workflow_runs:[{id:880002,display_title:'Issue118 FULL '+admission.checkpointKey,run_number:22,run_attempt:1,event:'workflow_dispatch',head_branch:'test/issue118-live-t1-20261030',head_sha:env.GITHUB_SHA,path:'.github/workflows/issue118-live-e2e.yml'},{id:880001,display_title:'OLDER',run_number:21}]};
  else if(path==='/actions/runs/880001')v={status:'completed',run_attempt:1,event:'workflow_dispatch',head_branch:'test/issue118-live-t1-20261030',head_sha:'c'.repeat(40),path:'.github/workflows/issue118-live-e2e.yml',run_number:21};
  else if(path==='/actions/runs/880001/artifacts?per_page=100')v={total_count:1,artifacts:[{name:'issue118-full-880001',expired:false,digest:'sha256:'+('b'.repeat(64)),workflow_run:{id:880001}}]};else assert.fail('Unknown synthetic GitHub path');
  return {status:200,text:async()=>JSON.stringify(v)};};
 return {input,env,directory,claimDirectory,menus,seen,openActor,resign,fetchImpl,cleanup:()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true});}};
}

test('exact cleanup reuses eight genuine source IDs, caps66/11 and pre-auth rejects stale altered or unknown proof fields',async()=>{
 const f=fixture();try{assert.equal(assertExact8CleanupInput(f.input).cleanup,true);
  for(const change of [x=>x.authorization.status='PENDING',x=>x.authorization.limits.maximumStops=9,x=>x.authorization.limits.maximumSessions=12,x=>x.cleanupReceipt.menuWrites=57,
   x=>x.cleanupReceipt.allNineSessionsClosed=false,x=>x.cleanupReceipt.rows[0].version++,x=>x.cleanupReceipt.rows[0].owner='S2',x=>x.cleanupReceipt.rows[0].id='cother',
   x=>x.cleanupReceipt.rows.push(x.cleanupReceipt.rows[0]),x=>x.cleanupCheckpoint.result.controller.claims[0].state='FORWARD_CONSUMED',x=>x.cleanupCheckpoint.result.controller.claims[0].requestId=x.cleanupCheckpoint.result.controller.claims[1].requestId,
   x=>x.cleanupReceipt.sessionClosures[1].terminated=false,x=>x.cleanupReceipt.sessionClosures[1].method='PROVIDER_TERMINAL',x=>x.cleanupReceipt.sqlObservedUtc='2000-01-01T00:00:00.000Z',x=>x.identityReceipt.token='SYNTHETIC_PRIVATE']){
   const bad=structuredClone(f.input);change(bad);f.resign(bad);await assert.rejects(executeExact8Cleanup(bad,{env:f.env,claimDirectory:f.claimDirectory,openActor:f.openActor}),/EXACT8_CLEANUP_ADMISSION_REFUSED/);
   assert.equal(f.seen.actors.length,0);assert.equal(existsSync(f.claimDirectory),false);
  }
 }finally{f.cleanup();}
});
test('actual cleanup executor uses mock HTTP for B4 then A4 exactly once; records auth charges before open and closes each owner',async()=>{
 const f=fixture();try{const r=await executeExact8Cleanup(f.input,{env:f.env,claimDirectory:f.claimDirectory,openActor:f.openActor});assert.equal(r.status,'EXACT8_PRIVATE_API_CONFIRMED_PENDING_SQL');
  assert.deepEqual(f.seen.actors,['S2','S1']);assert.deepEqual(f.seen.finalized,['S2','S1']);assert.equal(f.seen.posts.length,8);assert.equal(new Set(f.seen.posts).size,8);assert.ok([...f.menus.values()].every(x=>!x.isPublished));
  assert.deepEqual(r.counts,{menus:11,menuWrites:66,sessions:11,shopWrites:0,blobUploads:0});assert.equal(r.livePass,false);assert.equal(r.independentDatabase,'NOT_ATTESTED');
  assert.equal(r.sessionAttempts.length,2);assert.ok(r.sessionAttempts.every(x=>x.finalization.complete&&x.finalization.localClosed));
 }finally{f.cleanup();}
});
test('owner preflight checks all four before sending; unknown redirect duplicate request or teardown failure never advances to the next owner',async()=>{
 for(const [fault,posts] of [['LATE_PREFLIGHT_VERSION',0],['UNKNOWN_FIRST',1],['REDIRECT_FIRST',1],['DUPLICATE_REQUEST',1],['FINAL_OWNER_READ_VERSION',4],['FINALIZE_UNKNOWN',4],['OPEN_FAIL',0],['END_JOURNAL_COLLISION',4]]){
  const f=fixture(fault);try{const r=await executeExact8Cleanup(f.input,{env:f.env,claimDirectory:f.claimDirectory,openActor:f.openActor});assert.match(r.status,/^HOLD/);assert.deepEqual(f.seen.actors,['S2']);assert.equal(f.seen.posts.length,posts,fault);
   assert.equal(r.counts.sessions,10);assert.ok(r.counts.menuWrites<=62);assert.equal(r.automaticRetry,false);assert.equal(r.automaticCleanup,false);assert.doesNotMatch(JSON.stringify(r),/sk_test_SYNTHETIC_PRIVATE|secret\.invalid|token=private/);
  }finally{f.cleanup();}
 }
});
test('same CLI admission and genuine artifact comparator select cleanup without normal FULL/T2 or image execution',async()=>{
 const f=fixture();try{assert.equal((await admitManagedFullInput(f.input,f.env)).cleanup,true);
  assert.equal((await verifyManagedFullGithubProvenance({input:f.input,env:f.env,fetchImpl:f.fetchImpl,sourcePayload:f.input.cleanupCheckpoint.result})).sourceVerified,true);
  await assert.rejects(verifyManagedFullGithubProvenance({input:f.input,env:f.env,fetchImpl:f.fetchImpl,sourcePayload:{...f.input.cleanupCheckpoint.result,changed:true}}),/MANAGED_FULL_ENTRY_REFUSED/);
  const source=join(f.directory,'source');mkdirSync(source);writeFileSync(join(source,'result.json'),JSON.stringify(f.input.cleanupCheckpoint.result));
  const fake=join(f.directory,'fake-playwright.cjs');writeFileSync(fake,'module.exports={chromium:{synthetic:true}};');
  const env={...f.env,ISSUE118_FULL_INPUT:encodeManagedFullInput(f.input),ISSUE118_SOURCE_ARTIFACT_DIRECTORY:source,CLEARALLERGY_BROWSER_OUTPUT:join(f.directory,'out'),PLAYWRIGHT_MODULE_PATH:fake};let called=0;
  assert.equal((await runManagedFullCli({argv:['--preflight'],env,fetchImpl:f.fetchImpl,execute:()=>assert.fail('No FULL')})).status,'FULL_PREFLIGHT_NO_AUTH');assert.equal(existsSync(env.CLEARALLERGY_BROWSER_OUTPUT),false);
  const r=await runManagedFullCli({argv:['--apply'],env,fetchImpl:f.fetchImpl,execute:()=>assert.fail('No FULL'),executeCleanup:async(input,args)=>{called++;assert.equal(input.operation,'EXACT_T2_CLEANUP8');assert.equal(Object.hasOwn(args,'image'),false);return {status:'HOLD_SYNTHETIC_NO_AUTH',counts:{sessions:9}};}});
  assert.equal(called,1);assert.equal(r.status,'HOLD_SYNTHETIC_NO_AUTH');assert.equal(r.checkpointExported,false);assert.equal(f.seen.actors.length,0);
 }finally{f.cleanup();}
});
