// One explicitly approved A authentication. No FULL import, fallback or menu writer.
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,fsyncSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ciIdentity,managedActorIdentity,assertCiEnvironment,assertClerkPublishableKey} from './issue118-ci-auth.mjs';
import {target,assertIdentityReceipt,openReadonlyPreflightActor} from './check-issue118-live-t1-browser.mjs';

export const readonlyApproval='Sentinel_3224f9754e248191b437d1cda6f6d180';
export const readonlySource=Object.freeze({runId:41637959671,runNumber:38,runnerSha:'b5a3c2c76bb0c5153f8cd09171124be22049b8e2',
    artifactId:13231827089,digest:'sha256:90bfad48839acc7dbdb188f4de9a9b7e123c2e82e061ceabc2d31dea08e9a932'});
export const readonlyClaimKey=createHash('sha256').update(JSON.stringify({approval:readonlyApproval,source:readonlySource})).digest('hex');
const refuse=()=>{throw Error('READONLY_A_ENTRY_REFUSED');};
const need=value=>{if(!value)refuse();};
function context(env){
    need(!env.ISSUE118_FULL_INPUT);
    const expected={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:ciIdentity.repository,
        GITHUB_REPOSITORY_ID:ciIdentity.repositoryId,GITHUB_REF:ciIdentity.ref,GITHUB_WORKFLOW_REF:ciIdentity.workflowRef,
        ISSUE118_GITHUB_ENVIRONMENT:ciIdentity.environment,ISSUE118_READONLY_MODE:'READONLY_A_PREFLIGHT_14_TO_15'};
    for(const [k,v] of Object.entries(expected))need(env[k]===v);
    need(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')&&env.GITHUB_SHA===env.ISSUE118_EXPECTED_RUNNER_SHA&&/^\d+$/.test(env.GITHUB_RUN_ID||'')
        &&/^\d+$/.test(env.GITHUB_RUN_NUMBER||'')&&env.ISSUE118_RESUME_CLAIM===readonlyClaimKey);
    for(const k of ['DATABASE_URL','DIRECT_URL','DEBUG','PWDEBUG','NODE_OPTIONS','NODE_DEBUG','CLERK_API_URL','CLERK_FAPI','CLERK_TESTING_TOKEN'])need(!env[k]);
    need(env.ACTIONS_STEP_DEBUG!=='true'&&env.ACTIONS_RUNNER_DEBUG!=='true');
}
export function assertReadonlySource(result){
    need(result?.status==='HOLD_MANAGED_RESUME_ENTRY'&&result.sessionConsumption===14&&result.livePass===false&&result.evidencePersistenceComplete===true);
    need(result.target?.deployment===target.deployment&&result.target?.source===target.source);
    need(result.controller?.counts?.menuWrites===66&&result.controller?.counts?.sessions===14&&result.controller?.counts?.menus===11);
    need(Array.isArray(result.controller.claims)&&result.controller.claims.length===0);
    // Session uncertainty is retained, never converted into all-closed evidence.
    return true;
}
export async function verifyReadonlyProvenance({env,fetchImpl=fetch}){
    context(env);need(typeof env.GH_TOKEN==='string'&&env.GH_TOKEN.length>0);
    const get=async path=>{const r=await fetchImpl('https://api.github.com/repos/'+ciIdentity.repository+path,
        {method:'GET',redirect:'error',headers:{accept:'application/vnd.github+json',authorization:'Bearer '+env.GH_TOKEN},signal:AbortSignal.timeout(15000)});
        need(r.status===200);const text=await r.text();need(text.length<=4000000);return JSON.parse(text);};
    const rows=[];let total;
    for(let page=1;page<=10;page++){
        const x=await get('/actions/runs?event=workflow_dispatch&branch=test%2Fissue118-live-t1-20261030&per_page=100&page='+page);
        need(Number.isSafeInteger(x.total_count)&&x.total_count>=1&&x.total_count<1000&&Array.isArray(x.workflow_runs));
        total??=x.total_count;need(total===x.total_count);rows.push(...x.workflow_runs);
        if(rows.length>=total)break;need(x.workflow_runs.length===100&&page<10);
    }
    need(rows.length===total&&new Set(rows.map(x=>x.id)).size===rows.length);
    const scoped=rows.filter(x=>x.path==='.github/workflows/issue118-live-e2e.yml'),current=scoped.find(x=>String(x.id)===env.GITHUB_RUN_ID);
    need(current&&current.status==='in_progress'&&current.display_title==='Issue118 AREADONLY '+readonlyClaimKey&&current.head_sha===env.GITHUB_SHA&&current.run_attempt===1
        &&current.run_number===Number(env.GITHUB_RUN_NUMBER)&&current.head_branch==='test/issue118-live-t1-20261030'&&current.event==='workflow_dispatch');
    need(!scoped.some(x=>String(x.id)!==env.GITHUB_RUN_ID&&(x.status!=='completed'||x.display_title===current.display_title)));
    need(!scoped.some(x=>String(x.id)!==env.GITHUB_RUN_ID&&x.run_number>readonlySource.runNumber));
    const source=scoped.find(x=>x.id===readonlySource.runId);
    need(source?.status==='completed'&&source.run_attempt===1&&source.head_sha===readonlySource.runnerSha&&source.run_number===readonlySource.runNumber
        &&source.run_number<current.run_number);
    const artifacts=await get('/actions/runs/'+readonlySource.runId+'/artifacts?per_page=100');
    need(artifacts.total_count<100&&artifacts.artifacts.filter(a=>a.id===readonlySource.artifactId&&a.name==='issue118-full-'+readonlySource.runId
        &&a.digest===readonlySource.digest&&!a.expired&&a.workflow_run?.id===readonlySource.runId).length===1);
    return{allRunMetadataChecked:true,sourceVerified:true,duplicateClaim:false,otherActiveDedicatedRun:false};
}
function durable(path,value){let fd;try{fd=openSync(path,'wx',0o600);writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}
    finally{if(fd!==undefined)closeSync(fd);}}
function load(path){need(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink()&&lstatSync(path).size<=600000);return JSON.parse(readFileSync(path,'utf8'));}
export async function runReadonlyEntry({argv=process.argv.slice(2),env=process.env,fetchImpl=fetch,openActor=openReadonlyPreflightActor,chromium}={}){
    context(env);need(argv.length===1&&['--admit','--apply'].includes(argv[0]));
    const identity=JSON.parse(env.ISSUE118_READONLY_IDENTITY||'{}');assertIdentityReceipt(identity);
    need(identity.protectionVerified===true&&identity.protectionMode==='ALL_DEPLOYMENTS'&&identity.productionTarget===false);
    const directory=resolve(env.CLEARALLERGY_BROWSER_OUTPUT||'');need(directory!==resolve('.')&&directory.startsWith(resolve(env.RUNNER_TEMP||'')+'/'));
    assertReadonlySource(load(join(env.ISSUE118_SOURCE_ARTIFACT_DIRECTORY||'','result.json')));
    const provenance=await verifyReadonlyProvenance({env,fetchImpl});
    if(argv[0]==='--admit'){
        need(!env.ISSUE118_TEST_CLERK_SECRET_KEY&&!env.ISSUE118_APPLY);mkdirSync(directory,{recursive:false});
        need(!lstatSync(directory).isSymbolicLink());
        const charge={status:'SESSION_CHARGE_CONSUMED_NO_REFUND',owner:'S1',before:14,after:15,maximum:23,recoveryReserve:2,
            approvalReference:readonlyApproval,budgetApprovalReference:'Sentinel_6ed8010ed9fc8191bbd2f2c19d2215e5',
            runId:env.GITHUB_RUN_ID,runnerSha:env.GITHUB_SHA,claimKey:readonlyClaimKey,source:readonlySource,menuWrites:66,menuWritesMaximum:153,
            sqlBasis:{source:'PARENT_READ_ONLY_ATTESTATION',observedUtc:'2026-11-03T23:05:09.000Z',database:'clearallergy_main19',rows:11,privateRows:11,successfulAudits:66,laterAudits:0},
            uncertainHistoricalReceipts:['EARLIEST_SEVEN_ORIGINALS','OLD_B_UI','SLOT10_UI','LATEST_A_PROVIDER'],aTerminationBasis:'ACCEPTED_USER_REPORT_PROVIDER_UNVERIFIED',
            appMutationBudget:0,createdUtc:new Date().toISOString(),provenance};
        need(charge.after+charge.recoveryReserve<=charge.maximum);durable(join(directory,'charge.json'),charge);
        return{status:'READONLY_A_CHARGED_15_BEFORE_AUTH',sessionConsumption:15,authAttempted:false,livePass:false};
    }
    assertCiEnvironment(env);need(env.ISSUE118_APPLY==='true');
    const charge=load(join(directory,'charge.json'));
    need(charge.runId===env.GITHUB_RUN_ID&&charge.runnerSha===env.GITHUB_SHA&&charge.claimKey===readonlyClaimKey&&charge.after===15
        &&charge.before===14&&charge.recoveryReserve===2&&charge.approvalReference===readonlyApproval&&charge.appMutationBudget===0);
    durable(join(directory,'auth-attempt.json'),{owner:'S1',index:15,consumed:true,startedUtc:new Date().toISOString()});
    const report={status:'HOLD_READONLY_A',livePass:false,sessionConsumption:15,applicationWritesForwarded:0,applicationMutationAttempts:0,
        firstFailure:null,authentication:null,editor:null,finalization:null,historicalSessionEvidence:'PARTIAL_NOT_ALL_CLOSED',sourceProvenance:provenance};
    const save=()=>writeFileSync(join(directory,'result.json'),JSON.stringify(report,null,2),{mode:0o600});
    let actor,page,release,barrier;save();
    try{
        actor=await openActor({chromium:chromium||createRequire(import.meta.url)(env.PLAYWRIGHT_MODULE_PATH||'playwright').chromium,env,identityReceipt:identity,charge,
            record:observation=>{report.authentication=observation;save();}});
        need(actor.owner==='S1'&&actor.expectedUserId===managedActorIdentity.S1.ownerId&&actor.observation.gateVerified===true);
        const id='cmvzk8bru0001l608a2gjmewc',r=await actor.access.read(actor.context.request,target.origin+'/api/admin/menus/'+id);
        need(r.status()===200);const m=(await r.json()).menu;need(m?.id===id&&m.isPublished===false);
        const quiet=await actor.lifecycle.tracker.drain();need(quiet.status==='QUIET_CONFIRMED');
        barrier=actor.lifecycle.tracker.wrap(async route=>{if(route.request().method()==='GET')return route.fallback();
            report.applicationMutationAttempts++;report.firstFailure??='NON_GET_DURING_READONLY';save();await route.abort('blockedbyclient');});
        await actor.context.route('**/*',barrier);
        page=await actor.context.newPage();release=actor.access.registerManagedReadPage(page,id);
        const nav=await page.goto(target.origin+'/admin/menus/'+id+'/edit',{timeout:20000,waitUntil:'load'});need(nav?.status()===200);
        await page.waitForFunction(expected=>window.Clerk?.loaded===true&&window.Clerk.user?.id===expected,actor.expectedUserId,{timeout:20000});
        const client=await page.evaluate(()=>({pk:window.Clerk?.publishableKey,sessionId:window.Clerk?.session?.id}));
        assertClerkPublishableKey(client.pk);need(client.sessionId===actor.access.sessionObservation().id);
        need(await page.locator('#edit-menu-field-1').inputValue()===m.name);
        await page.getByRole('button',{name:'公開する',exact:true}).click();
        const panel=page.getByRole('region',{name:'保存済み内容の確認',exact:true});await panel.getByText(m.name,{exact:true}).waitFor();
        await panel.getByRole('button',{name:'公開の確認を閉じる',exact:true}).click();await panel.waitFor({state:'detached'});
        need(!actor.routeFailed()&&report.firstFailure===null);assertIdentityReceipt(identity);
        report.editor={http200:true,ownerMatched:true,sessionMatched:true,fieldsMatched:true,savedPanelRead:true,publicationClicked:false};save();
    }catch{report.firstFailure??='AUTH_OR_READ_HELD';}
    finally{
        release?.();
        if(page)try{await page.close({runBeforeUnload:false});need(page.isClosed());}catch{report.firstFailure??='PAGE_CLOSE_HELD';}
        if(actor){
            try{const d=await actor.lifecycle.tracker.drain();need(d.status==='QUIET_CONFIRMED');if(barrier)await actor.context.unroute('**/*',barrier);}
            catch{report.firstFailure??='ROUTE_DRAIN_HELD';}
            try{report.finalization=await actor.finalize();if(!report.finalization.complete)report.firstFailure??='SESSION_END_UNVERIFIED';}
            catch{report.firstFailure??='SESSION_END_UNVERIFIED';}
        }else report.finalization=report.authentication?.finalization||null;
        try{if(actor){need(!actor.routeFailed());assertIdentityReceipt(identity);}}catch{report.firstFailure??='FINAL_READINESS_HELD';}
        if(!report.firstFailure&&report.editor&&report.finalization?.complete)report.status='READONLY_A_COMPLETED_NOT_FULL_PASS';
        save();
    }
    return{status:report.status,livePass:false,sessionConsumption:15,applicationWritesForwarded:0,sessionEnded:report.finalization?.complete===true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runReadonlyEntry().then(r=>{
    console.log(JSON.stringify(r));if(!['READONLY_A_CHARGED_15_BEFORE_AUTH','READONLY_A_COMPLETED_NOT_FULL_PASS'].includes(r.status))process.exitCode=2;
}).catch(()=>{console.error('READONLY_A_ENTRY_REFUSED_NO_RAW_ERROR');process.exitCode=1;});
