import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {runReadonlyEntry,readonlySource,readonlyClaimKey} from '../scripts/issue118-readonly-entry.mjs';
import {target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity,managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';
function fixture(fault='NONE'){
 const root=mkdtempSync(join(tmpdir(),'ca-readonly-')),source=join(root,'source'),output=join(root,'output');mkdirSync(source);
 const payload={status:'HOLD_MANAGED_RESUME_ENTRY',sessionConsumption:14,livePass:false,evidencePersistenceComplete:true,target,
  controller:{counts:{menus:11,menuWrites:66,sessions:14},claims:[]}};
 if(fault==='WRITES')payload.controller.counts.menuWrites=67;
 writeFileSync(join(source,'result.json'),JSON.stringify(payload));
 const receipt={...Object.fromEntries(['project','projectId','origin','deployment','source','alias'].map(k=>[k,target[k]])),
  environment:'Preview',status:'Ready',verifiedBy:'cli_metadata_observer',evidenceReference:'SYNTHETIC_READONLY_RECEIPT',observedUtc:new Date().toISOString(),
  protectionVerified:true,protectionMode:'ALL_DEPLOYMENTS',productionTarget:false};
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:ciIdentity.repository,
  GITHUB_REPOSITORY_ID:ciIdentity.repositoryId,GITHUB_REF:ciIdentity.ref,GITHUB_WORKFLOW_REF:ciIdentity.workflowRef,
  ISSUE118_GITHUB_ENVIRONMENT:ciIdentity.environment,ISSUE118_READONLY_MODE:'READONLY_A_PREFLIGHT_14_TO_15',GITHUB_SHA:'a'.repeat(40),
  ISSUE118_EXPECTED_RUNNER_SHA:'a'.repeat(40),GITHUB_RUN_ID:'999888',GITHUB_RUN_NUMBER:'39',ISSUE118_RESUME_CLAIM:readonlyClaimKey,
  GH_TOKEN:'SYNTHETIC_ONLY',ISSUE118_READONLY_IDENTITY:JSON.stringify(receipt),RUNNER_TEMP:root,CLEARALLERGY_BROWSER_OUTPUT:output,
  ISSUE118_SOURCE_ARTIFACT_DIRECTORY:source};
 const current={id:999888,display_title:'Issue118 AREADONLY '+readonlyClaimKey,head_sha:env.GITHUB_SHA,run_attempt:1,run_number:39,
  path:'.github/workflows/issue118-live-e2e.yml',head_branch:'test/issue118-live-t1-20261030',event:'workflow_dispatch',status:'in_progress'};
 const old={...current,id:readonlySource.runId,run_number:38,head_sha:readonlySource.runnerSha,status:'completed',display_title:'OLD_FULL'};
 const rows=[current,old];if(fault==='DUPLICATE')rows.push({...old,id:123,display_title:current.display_title});
 if(fault==='ACTIVE')rows.push({...old,id:123,status:'in_progress'});
 if(fault==='LATER_COMPLETE')rows.push({...old,id:123,run_number:39,display_title:'LATER_COMPLETED_FULL'});
 const artifact={id:readonlySource.artifactId,name:'issue118-full-'+readonlySource.runId,digest:readonlySource.digest,expired:false,
  workflow_run:{id:readonlySource.runId}};if(fault==='DIGEST')artifact.digest='sha256:'+'0'.repeat(64);
 let opens=0,finalizations=0,barrier,reads=0,routeFailed=false;
 const fetchImpl=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  const body=url.includes('/artifacts?')?{total_count:1,artifacts:[artifact]}:{total_count:rows.length,workflow_runs:rows};return{status:200,text:async()=>JSON.stringify(body)};};
 const page={isClosed:()=>true,close:async()=>{},goto:async()=>({status:()=>200}),waitForFunction:async()=>{},
  evaluate:async()=>({pk:'pk_test_'+Buffer.from(ciIdentity.clerkDomain+'$').toString('base64'),sessionId:'sess_Unit'}),
  locator:()=>({inputValue:async()=> 'SYNTHETIC_MENU'}),getByRole:()=>({click:async()=>{if(fault==='NON_GET')await barrier({request:()=>({method:()=> 'PUT'}),abort:async()=>{}});},
   getByText:()=>({waitFor:async()=>{}}),getByRole:()=>({click:async()=>{}}),waitFor:async()=>{}})};
 const tracker={wrap:f=>f,drain:async()=>({status:'QUIET_CONFIRMED'}),snapshot:()=>({started:0,settled:0,pending:0})};
 const actor={owner:'S1',expectedUserId:managedActorIdentity.S1.ownerId,observation:{gateVerified:true},routeFailed:()=>routeFailed,
  context:{request:{},newPage:async()=>page,route:async(_p,f)=>{barrier=f;},unroute:async()=>{}},lifecycle:{tracker},
  access:{sessionObservation:()=>({id:'sess_Unit'}),registerManagedReadPage:()=>()=>{},read:async()=>{reads++;return{status:()=>200,json:async()=>({menu:{id:'cmvzk8bru0001l608a2gjmewc',name:'SYNTHETIC_MENU',isPublished:false}})};}},
  finalize:async()=>{finalizations++;if(fault==='LATE_ROUTE')routeFailed=true;return{complete:fault!=='END_UNVERIFIED'};}};
 const openActor=async({charge})=>{opens++;assert.equal(JSON.parse(readFileSync(join(output,'charge.json'),'utf8')).after,15);
  assert.equal(charge.recoveryReserve,2);if(fault==='AUTH_LOST')throw Error('SYNTHETIC_PRIVATE');return actor;};
 return{env,fetchImpl,openActor,chromium:{},root,output,opens:()=>opens,finalizations:()=>finalizations,reads:()=>reads,
  applyEnv:()=>({...env,ISSUE118_APPLY:'true',ISSUE118_TEST_CLERK_SECRET_KEY:'sk_test_SYNTHETIC_ONLY'}),cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('A-only admission durably charges 14->15 before auth, preserves2 recovery slots, then reads and independently finalizes only A',async()=>{
 const f=fixture();try{const r=await runReadonlyEntry({...f,argv:['--admit']});assert.equal(r.authAttempted,false);assert.equal(f.opens(),0);
  const charge=JSON.parse(readFileSync(join(f.output,'charge.json'),'utf8'));assert.equal(charge.after,15);assert.equal(charge.recoveryReserve,2);assert.equal(charge.appMutationBudget,0);
  assert.ok(charge.uncertainHistoricalReceipts.includes('OLD_B_UI'));
  const result=await runReadonlyEntry({...f,argv:['--apply'],env:f.applyEnv()});assert.equal(result.status,'READONLY_A_COMPLETED_NOT_FULL_PASS');
  assert.equal(result.livePass,false);assert.equal(result.sessionConsumption,15);assert.equal(result.applicationWritesForwarded,0);
  assert.equal(f.opens(),1);assert.equal(f.finalizations(),1);assert.equal(f.reads(),1);
  await assert.rejects(runReadonlyEntry({...f,argv:['--apply'],env:f.applyEnv()}));assert.equal(f.opens(),1);
 }finally{f.cleanup();}
});
test('duplicate claim, active old run, wrong digest or changed writes refuse before charge, auth or FULL fallback',async()=>{
 for(const fault of ['DUPLICATE','ACTIVE','DIGEST','WRITES','LATER_COMPLETE']){const f=fixture(fault);try{
  await assert.rejects(runReadonlyEntry({...f,argv:['--admit']}));assert.equal(f.opens(),0);assert.equal(existsSync(join(f.output,'charge.json')),false);
 }finally{f.cleanup();}}
});
test('lost authentication, non-GET or unverified termination stays HOLD, consumes15 without retry or refund',async()=>{
 for(const fault of ['AUTH_LOST','NON_GET','END_UNVERIFIED','LATE_ROUTE']){const f=fixture(fault);try{
  await runReadonlyEntry({...f,argv:['--admit']});const r=await runReadonlyEntry({...f,argv:['--apply'],env:f.applyEnv()});
  assert.equal(r.status,'HOLD_READONLY_A');assert.equal(r.sessionConsumption,15);assert.equal(r.livePass,false);assert.equal(f.opens(),1);
  assert.equal(JSON.parse(readFileSync(join(f.output,'charge.json'),'utf8')).after,15);
  await assert.rejects(runReadonlyEntry({...f,argv:['--apply'],env:f.applyEnv()}));assert.equal(f.opens(),1);
 }finally{f.cleanup();}}
});
test('local context, rerun, full bundle or secret delivered before admission is refused without I/O',async()=>{
 for(const extra of [{GITHUB_ACTIONS:'false'},{GITHUB_RUN_ATTEMPT:'2'},{ISSUE118_FULL_INPUT:'FULL'},{ISSUE118_TEST_CLERK_SECRET_KEY:'sk_test_SYNTHETIC_ONLY'}]){
  const f=fixture();try{await assert.rejects(runReadonlyEntry({...f,argv:['--admit'],env:{...f.env,...extra}}));assert.equal(f.opens(),0);
   assert.equal(existsSync(join(f.output,'charge.json')),false);}finally{f.cleanup();}}
});
test('workflow A-only selector reuses exact permissions, excludes every FULL action and persists charge before its only secret step',()=>{
 const yaml=readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml',import.meta.url),'utf8');const w=createRequire(import.meta.url)('js-yaml').load(yaml),job=w.jobs['managed-full-resume'];
 assert.deepEqual(job.permissions,{contents:'read',actions:'read','id-token':'write'});assert.equal(w.concurrency.group,'clearallergy-main19-live-fixtures');
 const steps=job.steps,admit=steps.findIndex(s=>s.run==='node scripts/issue118-readonly-entry.mjs --admit'),apply=steps.findIndex(s=>s.run==='node scripts/issue118-readonly-entry.mjs --apply');
 assert.ok(admit>=0&&apply>admit&&steps.slice(admit+1,apply).some(s=>s.uses==='actions/upload-artifact@v4'&&s.with['if-no-files-found']==='error'));
 assert.equal(steps[apply].if,"inputs.confirmation == 'APPROVE_READONLY_A_PREFLIGHT'");assert.ok(!JSON.stringify(steps[admit]).includes('secrets.'));
 for(const s of steps.filter(s=>s.run?.includes('issue118-managed-full-entry.mjs')))assert.equal(s.if,"inputs.confirmation == 'APPROVE_FULL_RESUME_CANDIDATE'");
});
