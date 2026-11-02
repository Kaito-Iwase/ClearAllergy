// LOCAL preparation. No default live execution; explicit fresh FULL approval required.
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {ciIdentity,assertCiEnvironment} from './issue118-ci-auth.mjs';
import {assertManagedResumeActivation,executeManagedApprovedResume} from './check-issue118-live-t1-browser.mjs';
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const fullResumeHash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const refuse=()=>{throw Error('MANAGED_FULL_ENTRY_REFUSED');};
const need=v=>{if(!v)refuse();};
export function encodeManagedFullInput(input){return gzipSync(Buffer.from(canonical(input))).toString('base64url');}
export function decodeManagedFullInput(text){
    try{need(typeof text==='string'&&text.length>0&&text.length<=50000&&/^[A-Za-z0-9_-]+$/.test(text));
        const raw=gunzipSync(Buffer.from(text,'base64url'),{maxOutputLength:450000});
        const value=JSON.parse(raw.toString('utf8'));need(Buffer.from(canonical(value)).length<=450000);
        need(value&&Object.keys(value).every(k=>['authorization','identityReceipt','checkpointReceipt','snapshot','terminal','creationOperationIds',
            'operation','serviceRunId','fullCheckpoint','continuationReceipt','prefixCheckpoint','prefixReceipt','executionApproval'].includes(k)));
        return value;
    }catch{refuse();}
}
// These approval fields are assertions by the trusted operator, not a signature.
// They are cross-checked with live GitHub provenance before secret delivery.
export async function admitManagedFullInput(input,env=process.env){
    try{
        need(env.GITHUB_ACTIONS==='true'&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_RUN_ATTEMPT==='1'
            &&env.GITHUB_REPOSITORY===ciIdentity.repository&&env.GITHUB_REPOSITORY_ID===ciIdentity.repositoryId
            &&env.GITHUB_REF===ciIdentity.ref&&env.GITHUB_WORKFLOW_REF===ciIdentity.workflowRef
            &&env.ISSUE118_GITHUB_ENVIRONMENT===ciIdentity.environment&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')
            &&env.GITHUB_SHA===env.ISSUE118_EXPECTED_RUNNER_SHA&&/^\d{1,20}$/.test(env.GITHUB_RUN_ID||'')
            &&/^\d{1,10}$/.test(env.GITHUB_RUN_NUMBER||'')&&!env.DEBUG&&!env.PWDEBUG&&!env.NODE_OPTIONS);
        const a=input.executionApproval;
        need(input.authorization&&Object.keys(input.authorization).every(k=>['status','scope','limits','oldClaimsSha256','creationIdsSha256','verifiedBy','evidenceReference','approvedUtc','snapshotSha256','terminalSha256'].includes(k)));
        need(a&&Object.keys(a).length===9&&Object.keys(a).every(k=>['status','scope','verifiedBy','evidenceReference','actionsReadApproved','singleAttempt','runnerSha','operation','inputSha256'].includes(k)));
        need(a&&a.status==='APPROVED'&&a.scope==='FULL_RESUME_WITH_ACTIONS_READ'
            &&a.evidenceReference===input.authorization?.evidenceReference&&a.verifiedBy==='human'
            &&a.actionsReadApproved===true&&a.singleAttempt===true&&a.runnerSha===env.GITHUB_SHA
            &&a.operation===input.operation&&a.inputSha256===fullResumeHash(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='executionApproval'))));
        need(['CORE_AND_SERVICE','SERVICE_NEXT','T2_REOBSERVE_PREFIX'].includes(input.operation));
        const admission=await assertManagedResumeActivation(input);
        need((input.operation==='SERVICE_NEXT')===!!admission.restored);
        need(env.ISSUE118_RESUME_CLAIM===admission.checkpointKey);
        return admission;
    }catch{refuse();}
}
// Read-only GitHub metadata only, no fallback/retry or raw provider errors.
// Existing global workflow concurrency serializes claim checks. A consumed claim
// is never automatically retried, including a failed pre-auth run.
export async function verifyManagedFullGithubProvenance({input,env=process.env,fetchImpl=fetch,sourcePayload}={}){
    try{
        const admission=await admitManagedFullInput(input,env),token=env.GH_TOKEN;
        need(typeof token==='string'&&token.length>0);
        const base='https://api.github.com/repos/Kaito-Iwase/ClearAllergy';
        const get=async path=>{
            const r=await fetchImpl(base+path,{method:'GET',redirect:'error',headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
            need(r?.status===200);const text=await r.text();need(text.length<2000000);return JSON.parse(text);
        };
        const claimTitle='Issue118 FULL '+admission.checkpointKey,rows=[];let total;
        for(let page=1;page<=10;page++){
            const r=await get('/actions/workflows/issue118-live-e2e.yml/runs?event=workflow_dispatch&branch=test%2Fissue118-live-t1-20261030&per_page=100&page='+page);
            need(Number.isSafeInteger(r.total_count)&&r.total_count>=1&&r.total_count<1000&&Array.isArray(r.workflow_runs));
            if(total===undefined)total=r.total_count;need(total===r.total_count);rows.push(...r.workflow_runs);
            if(rows.length>=total)break;need(r.workflow_runs.length===100&&page<10);
        }
        need(rows.length===total&&new Set(rows.map(r=>r.id)).size===rows.length);
        const current=rows.find(r=>String(r.id)===env.GITHUB_RUN_ID);
        need(current&&current.display_title===claimTitle&&current.run_number===Number(env.GITHUB_RUN_NUMBER)
            &&current.run_attempt===1&&current.event==='workflow_dispatch'&&current.head_branch==='test/issue118-live-t1-20261030'
            &&current.head_sha===env.GITHUB_SHA&&current.path==='.github/workflows/issue118-live-e2e.yml');
        need(!rows.some(r=>r.display_title===claimTitle&&r.run_number<current.run_number));
        if(admission.restored||admission.prefix){
            const wrapper=admission.restored?input.fullCheckpoint:input.prefixCheckpoint,source=wrapper.source,run=await get('/actions/runs/'+source.githubRunId);
            need(run.status==='completed'&&run.run_attempt===1&&run.event==='workflow_dispatch'&&run.head_branch==='test/issue118-live-t1-20261030'
                &&run.head_sha===source.runnerSha&&run.path==='.github/workflows/issue118-live-e2e.yml'&&run.run_number<current.run_number);
            const artifacts=await get('/actions/runs/'+source.githubRunId+'/artifacts?per_page=100');
            need(artifacts.total_count<100&&Array.isArray(artifacts.artifacts));
            const matches=artifacts.artifacts.filter(a=>a.name==='issue118-full-'+source.githubRunId&&!a.expired&&a.digest==='sha256:'+source.artifactSha256);
            need(matches.length===1&&matches[0].workflow_run?.id===Number(source.githubRunId));
            need(sourcePayload&&canonical(sourcePayload)===canonical(Object.fromEntries(Object.entries(wrapper).filter(([k])=>k!=='source'))));
        }else need(sourcePayload===undefined);
        return {provenanceVerified:true,claimKey:admission.checkpointKey,currentRunId:env.GITHUB_RUN_ID,sourceVerified:!!(admission.restored||admission.prefix)};
    }catch{refuse();}
}
export async function runManagedFullCli({argv=process.argv.slice(2),env=process.env,fetchImpl=fetch,execute=executeManagedApprovedResume}={}){
    need(argv.length===1&&['--preflight','--apply'].includes(argv[0]));
    const input=decodeManagedFullInput(env.ISSUE118_FULL_INPUT),admission=await admitManagedFullInput(input,env);
    const sourcePayload=admission.restored||admission.prefix?JSON.parse(readFileSync(join(resolve(env.ISSUE118_SOURCE_ARTIFACT_DIRECTORY||''),admission.restored?'full-checkpoint-payload.json':'t2-prefix-payload.json'),'utf8')):undefined;
    const provenance=await verifyManagedFullGithubProvenance({input,env,fetchImpl,sourcePayload});
    if(argv[0]==='--preflight')return {status:'FULL_PREFLIGHT_NO_AUTH',...provenance};
    need(env.ISSUE118_APPLY==='true');const finalOnly=admission.restored?.nextArmIndex===6;if(!finalOnly)assertCiEnvironment(env);
    need(typeof env.CLEARALLERGY_BROWSER_OUTPUT==='string'&&env.CLEARALLERGY_BROWSER_OUTPUT.length>0);
    const output=resolve(env.CLEARALLERGY_BROWSER_OUTPUT);mkdirSync(output,{recursive:false});need(!lstatSync(output).isSymbolicLink());
    const chromium=finalOnly?undefined:createRequire(import.meta.url)(env.PLAYWRIGHT_MODULE_PATH||'playwright').chromium;
    const report=await execute({...input,env,chromium,claimDirectory:join(output,'claims'),image:{buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))}});
    writeFileSync(join(output,'result.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
    if(report.t2CheckpointExportable)writeFileSync(join(output,'t2-prefix-payload.json'),JSON.stringify(report.t2PrefixPayload),{flag:'wx',mode:0o600});
    if(report.fullCheckpointExportable)writeFileSync(join(output,'full-checkpoint-payload.json'),JSON.stringify(report.fullCheckpointPayload),{flag:'wx',mode:0o600});
    // Observations and six independent SQL boundaries never imply whole-suite PASS.
    return {status:report.status,livePass:false,sessionConsumption:report.sessionConsumption,checkpointExported:report.fullCheckpointExportable===true||report.t2CheckpointExportable===true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    runManagedFullCli().then(r=>{console.log(JSON.stringify(r));if(r.status!=='FULL_PREFLIGHT_NO_AUTH')process.exitCode=2;})
        .catch(()=>{console.error('MANAGED_FULL_ENTRY_REFUSED_NO_RAW_ERROR');process.exitCode=1;});
}
