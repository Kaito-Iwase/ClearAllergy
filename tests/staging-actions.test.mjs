import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policy as p, expectedEnvironment, plan, checkProject, validateResponse, validateFixedUrlFollow, simulate } from '../scripts/staging-guards.mjs';
const sha = 'a'.repeat(40), trustedSha = 'b'.repeat(40), blob = 'c'.repeat(40);
function fixture() {
 const repository = { id:p.repositoryId, full_name:p.repository };
 const run = { id:10, repository, head_repository:repository, event:'push', head_branch:p.branch,
   path:p.workflow, status:'completed', conclusion:'success', run_attempt:1, head_sha:sha, workflow_id:20 };
 const event = {action:'completed', repository, workflow_run: structuredClone(run)};
 const project = { productionBranch:'main', ssoProtection:{enabled:true,deploymentType:'all'}, id:p.project, accountId:p.team, name:p.name,
   link:{type:'github', repoId:p.repositoryId, org:'Kaito-Iwase', repo:'ClearAllergy'} };
 // Observed non-secret names/types; IDs and fixture states are fictitious.
 const inventory = {complete:true, envs:Object.entries(expectedEnvironment).map(([key,type],i)=>({
   id:`mock-${i}`, key, type, target:['preview'], gitBranch:p.branch}))};
 const root = `/repos/${p.repository}`;
 const snapshots = {
  [`${root}/actions/runs/10`]:run,
  [`${root}/actions/workflows/ci.yml`]:{id:20,path:p.workflow,state:'active'},
  [`${root}/git/ref/heads/${p.branch}`]:{object:{sha}},
  [`${root}/branches/${encodeURIComponent(p.branch)}`]:{protected:true},
  [`${root}/actions/workflows/20/runs?branch=${encodeURIComponent(p.branch)}&event=push&per_page=1`]:{workflow_runs:[run]},
 };
 for (const path of [p.workflow,'vercel.json']) for (const ref of [sha,trustedSha]) snapshots[`${root}/contents/${path}?ref=${ref}`] = {
   type:'file',sha:blob,content:Buffer.from(JSON.stringify({git:{deploymentEnabled:{[p.branch]:false}}})).toString('base64') };
 return {event,project,inventory,trustedSha,run,snapshots,github:async path=> {
   assert.ok(Object.hasOwn(snapshots,path),`Unexpected mock read ${path}`); return structuredClone(snapshots[path]); }};
}
test('plan preserves branch and immutable SHA; omits target, values, files and credentials', async()=>{
 const result=await plan(fixture());
 assert.deepEqual(Object.keys(result.request.body).sort(),['gitSource','meta','name','project']);
 assert.equal(result.request.body.gitSource.ref,p.branch); assert.equal(result.request.body.gitSource.sha,sha);
 assert.equal(result.request.body.gitSource.repoId,String(p.repositoryId));
 assert.equal(Object.hasOwn(result.request.body,'deploymentId'),false);
 assert.equal(Object.hasOwn(result.request.body,'withLatestCommit'),false);
 assert.equal(result.request.path,`/v13/deployments?teamId=${p.team}`);
});
const sourceCases = [
 ['foreign event repository',f=>f.event.repository.full_name='someone/fork'],
 ['wrong fixed repository ID',f=>f.event.repository.id=99],
 ['pull request CI',f=>f.run.event='pull_request'],
 ['other branch',f=>f.run.head_branch='main'],
 ['failed CI',f=>f.run.conclusion='failure'],
 ['unfinished CI',f=>f.run.status='in_progress'],
 ['changed attempt',f=>f.run.run_attempt=2],
 ['changed SHA',f=>f.run.head_sha='d'.repeat(40)],
 ['unprotected branch',f=>f.snapshots[`/repos/${p.repository}/branches/${encodeURIComponent(p.branch)}`].protected=false],
 ['stale head',f=>f.snapshots[`/repos/${p.repository}/git/ref/heads/${p.branch}`].object.sha='d'.repeat(40)],
 ['newer CI run',f=>f.snapshots[`/repos/${p.repository}/actions/workflows/20/runs?branch=${encodeURIComponent(p.branch)}&event=push&per_page=1`].workflow_runs=[{id:11}]],
 ['unreviewed config',f=>f.snapshots[`/repos/${p.repository}/contents/vercel.json?ref=${sha}`].sha='d'.repeat(40)],
 ['automatic Git build enabled',f=>f.snapshots[`/repos/${p.repository}/contents/vercel.json?ref=${trustedSha}`].content=Buffer.from(JSON.stringify({git:{deploymentEnabled:{[p.branch]:true}}})).toString('base64')],
];
for(const [name,mutate] of sourceCases) test(`reject source: ${name}`,async()=>{ const f=fixture();mutate(f); await assert.rejects(plan(f)); });
const projectCases = [
 ['production project',f=>f.project.id=p.productionProject], ['wrong team',f=>f.project.accountId='other'],
 ['disconnected Git',f=>f.project.link=null],['wrong repository link',f=>f.project.link.repoId=99],
 ['production env',f=>f.inventory.envs[0].target=['production']], ['branchless env',f=>f.inventory.envs[0].gitBranch=null],
 ['other branch env',f=>f.inventory.envs[0].gitBranch='main'], ['missing env',f=>f.inventory.envs.pop()],
 ['partial pagination',f=>f.inventory.complete=false],['env value supplied',f=>f.inventory.envs[0].value='NOT_A_SECRET'],
 ['sensitive type downgrade',f=>f.inventory.envs[8].type='encrypted'],
 ['changed key with same count',f=>f.inventory.envs[0].key='UNEXPECTED_KEY'],
 ['swapped types with same sensitive count',f=>{f.inventory.envs[0].type='sensitive';f.inventory.envs[8].type='encrypted';}],
 ['nonempty custom environment',f=>f.inventory.envs[0].customEnvironmentIds=['env_mock']],
 ['null custom environment',f=>f.inventory.envs[0].customEnvironmentIds=null],
 ['malformed custom environment',f=>f.inventory.envs[0].customEnvironmentIds=''],
 ['staging production branch',f=>f.project.productionBranch=p.branch],
 ['missing production branch',f=>delete f.project.productionBranch],
 ['disabled SSO',f=>f.project.ssoProtection.enabled=false],
 ['SSO not all deployments',f=>f.project.ssoProtection.deploymentType='preview'],
 ['missing SSO',f=>delete f.project.ssoProtection],
 ['missing SSO enabled',f=>delete f.project.ssoProtection.enabled],
 ['duplicate inventory',f=>f.inventory.envs[1]=structuredClone(f.inventory.envs[0])],
];
for(const [name,mutate] of projectCases) test(`reject preflight: ${name}`,()=>{const f=fixture();mutate(f);assert.throws(()=>checkProject(f.project,f.inventory));});
function response(){return {id:'dpl_MOCK',projectId:p.project,ownerId:p.team,target:null,readyState:'READY',
 gitSource:{type:'github',repoId:String(p.repositoryId),ref:p.branch,sha},url:'mock-deployment.vercel.app',
 meta:{githubCommitSha:sha,clearallergyCommitSha:sha,clearallergyRunId:'10',clearallergyRunAttempt:'1'}};}
const source={sha,runId:'10',attempt:'1'};
test('validate synthetic Preview READY response',()=>assert.equal(validateResponse(response(),source,'dpl_MOCK').identityAndBuildReady,true));
for(const [name,mutate] of [
 ['production target',d=>d.target='production'], ['missing target',d=>delete d.target],
 ['custom env',d=>d.customEnvironment={id:'env_mock'}],['production project',d=>d.projectId=p.productionProject],
 ['wrong owner',d=>d.ownerId='other'],['wrong SHA',d=>d.gitSource.sha='d'.repeat(40)],
 ['wrong branch',d=>d.gitSource.ref='main'], ['wrong Git repo',d=>d.gitSource.repoId='99'],
 ['not ready',d=>d.readyState='BUILDING'], ['wrong run',d=>d.meta.clearallergyRunId='11'], ['wrong provider SHA',d=>d.meta.githubCommitSha='d'.repeat(40)],
 ['wrong deployment',d=>d.id='dpl_other'],['alias as deployment URL',d=>d.url=p.host],
])test(`reject response: ${name}`,()=>{const d=response();mutate(d);assert.throws(()=>validateResponse(d,source,'dpl_MOCK'));});
const start=[{type:'branch',sha},{type:'ci',sha,success:true},{type:'start'}];
test('cannot start before successful CI',()=>assert.throws(()=>simulate([{type:'start'}])));
test('cannot start stale candidate',()=>assert.throws(()=>simulate([...start.slice(0,2),{type:'branch',sha:'new'},{type:'start'}])));
test('documents early alias even when postchecks eventually pass',()=>{const s=simulate([...start,{type:'ready'},{type:'postcheck',success:true}]);assert.equal(s.earlyAlias,true);assert.equal(s.postchecked,true);});
test('documents stale alias race and no rollback after failed postchecks',()=>{const s=simulate([...start,{type:'branch',sha:'new'},{type:'ready'},{type:'postcheck',success:true}]);assert.equal(s.staleExposure,true);assert.equal(s.aliasSha,sha);assert.equal(s.inspect,true);});
test('uncertain result requires inspection; cannot retry',()=>{assert.equal(simulate([...start,{type:'uncertain'}]).inspect,true);assert.throws(()=>simulate([...start,{type:'uncertain'},{type:'start'}]),/INSPECTION_REQUIRED/);});
for(const type of ['rollback','delete','retry','promote','alias'])test(`no automatic ${type}`,()=>assert.throws(()=>simulate([...start,{type}]),/NO_AUTOMATIC/));

test('allow explicit empty custom environment IDs',()=>{const f=fixture();for(const e of f.inventory.envs)e.customEnvironmentIds=[];assert.doesNotThrow(()=>checkProject(f.project,f.inventory));});
test('inventory has exact raw sensitive/encrypted type mapping',()=>{const f=fixture();assert.equal(f.inventory.envs.filter(e=>e.type==='sensitive').length,4);assert.equal(f.inventory.envs.filter(e=>e.type==='encrypted').length,8);});

function aliasFixture() { return { deployment: {...response(),aliasAssigned:true,aliasError:null},
 source, expectedId:'dpl_MOCK', alias:{alias:p.host,projectId:p.project,deploymentId:'dpl_MOCK',redirect:null} }; }
test('READY identity is explicitly not fixed-URL success',()=>{
 const d={...response(),aliasAssigned:false,aliasError:{code:'MOCK_FAILURE'}};
 const result=validateResponse(d,source,'dpl_MOCK');
 assert.equal(result.identityAndBuildReady,true); assert.equal(result.fixedUrlFollowConfirmed,false);
 assert.equal(Object.hasOwn(result,'validated'),false);
});
test('fixed URL requires successful deployment alias state and exact resolution',()=>{
 const result=validateFixedUrlFollow(aliasFixture());
 assert.equal(result.fixedUrlFollowConfirmed,true);assert.equal(result.functionalChecksVerified,false);
});
for (const [name, mutate] of [
 ['READY with alias failure', f=>{f.deployment.aliasAssigned=false;f.deployment.aliasError={code:'MOCK_FAILURE'};}],
 ['aliasAssigned false',f=>f.deployment.aliasAssigned=false],
 ['aliasAssigned absent',f=>delete f.deployment.aliasAssigned],
 ['alias error despite assigned true',f=>f.deployment.aliasError={code:'MOCK_FAILURE'}],
 ['wrong host',f=>f.alias.alias='other.vercel.app'],
 ['wrong project',f=>f.alias.projectId=p.productionProject],
 ['wrong deployment',f=>f.alias.deploymentId='dpl_other'],
 ['redirect',f=>f.alias.redirect='https://example.invalid'],
 ['missing redirect',f=>delete f.alias.redirect],
 ['missing host',f=>delete f.alias.alias],
 ['missing project',f=>delete f.alias.projectId],
 ['missing deployment',f=>delete f.alias.deploymentId],
 ['absent alias snapshot',f=>delete f.alias],
 ['Production candidate in dedicated project',f=>f.deployment.target='production'],
 ['real production project candidate',f=>f.deployment.projectId=p.productionProject],
]) test(`reject fixed-URL confirmation: ${name}`,()=>{
 const f=aliasFixture(); mutate(f); assert.throws(()=>validateFixedUrlFollow(f));
});
test('absence of aliasError is allowed only with explicit assigned true and exact resolution',()=>{
 const f=aliasFixture();delete f.deployment.aliasError;assert.equal(validateFixedUrlFollow(f).fixedUrlFollowConfirmed,true);
});
test('failed alias then resolved needs fresh success in both snapshots, no mutation',()=>{
 const failed=aliasFixture();failed.deployment.aliasAssigned=false;failed.deployment.aliasError={code:'MOCK_FAILURE'};
 assert.throws(()=>validateFixedUrlFollow(failed)); // Correct alias alone is insufficient.
 const partial=structuredClone(failed);partial.deployment.aliasAssigned=true;
 assert.throws(()=>validateFixedUrlFollow(partial)); // Lingering failure still requires inspection.
 const resolved=structuredClone(partial);resolved.deployment.aliasError=null;
 assert.equal(validateFixedUrlFollow(resolved).fixedUrlFollowConfirmed,true);
 assert.equal(failed.deployment.aliasAssigned,false); // No prior observation was mutated.
});
test('source guard permits unspecified main: no claim of disabling all branches',async()=>{
 const f=fixture();const config=JSON.parse(Buffer.from(f.snapshots[`/repos/${p.repository}/contents/vercel.json?ref=${trustedSha}`].content,'base64'));
 assert.deepEqual(config.git.deploymentEnabled,{[p.branch]:false});
 assert.equal(Object.hasOwn(config.git.deploymentEnabled,'main'),false);
 await assert.doesNotReject(plan(f));
});

test('reject disagreement between nested and direct alias deployment IDs',()=>{
 const f=aliasFixture();f.alias.deployment={id:'dpl_other'};
 assert.throws(()=>validateFixedUrlFollow(f),/FIXED_ALIAS_RESOLUTION_MISMATCH/);
 f.alias.deployment.id=f.alias.deploymentId;
 assert.equal(validateFixedUrlFollow(f).fixedUrlFollowConfirmed,true);
});

// Explicit audit of still-applicable PR #132 source regressions. These cases are
// retained individually rather than inferred from the larger prototype count.
const priorSourceCases = [
 ['manual CI','CI_NOT_ELIGIBLE', f=>f.run.event='workflow_dispatch'],
 ['cancelled CI','CI_NOT_ELIGIBLE', f=>f.run.conclusion='cancelled'],
 ['fake workflow path','CI_NOT_ELIGIBLE', f=>f.run.path='.github/workflows/fake.yml'],
 ['fork trigger','UNTRUSTED_TRIGGER', f=>f.event.workflow_run.head_repository.full_name='fork/repo'],
 ['fetched repository ID mismatch','UNTRUSTED_REPOSITORY', f=>f.run.head_repository={id:999,full_name:p.repository}],
 ['fetched repository name mismatch','UNTRUSTED_REPOSITORY', f=>f.run.head_repository={id:p.repositoryId,full_name:'fork/repo'}],
 ['short SHA','RUN_CHANGED', f=>f.run.head_sha='abc123'],
 ['fake workflow ID','WORKFLOW_MISMATCH', f=>f.run.workflow_id=999],
 ['CI definition drift','UNREVIEWED_CONFIGURATION', f=>f.snapshots[`/repos/${p.repository}/contents/${p.workflow}?ref=${sha}`].sha='d'.repeat(40)],
 ['conflicting wildcard Git enable','GIT_DEPLOYMENT_NOT_DISABLED', f=>f.snapshots[`/repos/${p.repository}/contents/vercel.json?ref=${trustedSha}`].content=Buffer.from(JSON.stringify({git:{deploymentEnabled:{[p.branch]:false,'**':true}}})).toString('base64')],
 ['alias override','GIT_DEPLOYMENT_NOT_DISABLED', f=>f.snapshots[`/repos/${p.repository}/contents/vercel.json?ref=${trustedSha}`].content=Buffer.from(JSON.stringify({alias:['production.invalid'],git:{deploymentEnabled:{[p.branch]:false}}})).toString('base64')],
];
for(const [name,reason,change] of priorSourceCases)test(`PR132 retained: ${name}`,async()=>{
 const f=fixture();change(f);await assert.rejects(plan(f),new RegExp(reason));
});
test('PR132 retained: repeated gates reread run state rather than cache success',async()=>{
 const f=fixture();let calls=0;const original=f.github;
 f.github=async path=>{if(path.endsWith('/actions/runs/10'))calls++;return original(path);};
 await plan(f);f.run.status='in_progress';await assert.rejects(plan(f),/CI_NOT_ELIGIBLE/);assert.equal(calls,2);
});
test('PR132 retained: canonical config rules stay false without enabling global suppression',async()=>{
 const {readFileSync}=await import('node:fs');const rules=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')).git.deploymentEnabled;
 assert.equal(rules[p.branch],false);assert.equal(rules['ci/staging-actions-20261106'],false);
 assert.ok(Object.values(rules).every(value=>value===false));assert.equal(rules.main,undefined);
});
test('PR132 retained: CI covers staging-base PRs and staging pushes without paths exclusions',async()=>{
 const {readFileSync}=await import('node:fs');const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 function branches(event){const block=ci.match(new RegExp(`^  ${event}:\\n((?: {4}[^\\n]*\\n)+)`,'m'))?.[1];assert.ok(block);
  const list=block.match(/^    branches: \[([^\]]+)\]$/m)?.[1];assert.ok(list);
  assert.doesNotMatch(block,/^    (?:paths(?:-ignore)?|branches-ignore):/m);return list.split(',').map(v=>v.trim());}
 const prs=branches('pull_request');assert.deepEqual(prs,['main','develop','test/staging']);assert.deepEqual(branches('push'),prs);
 for(const [base,head,expected] of [['test/staging','fix/reviewed-change',true],['main','test/staging',true],['develop','fix/reviewed-change',true],['unrelated','test/staging',false]])assert.equal(prs.includes(base),expected,`${head} -> ${base}`);
});
// Pure documented scheduler model, not evidence of GitHub's live queue behavior.
function queueBehindActive(policy,arrivals){const pending=[],cancelled=[];
 for(const id of arrivals){if(policy==='single')cancelled.push(...pending.splice(0));else if(pending.length===100){cancelled.push(id);continue;}pending.push(id);}return {pending,cancelled};}
async function configuredQueue(){const {readFileSync}=await import('node:fs');const y=readFileSync(new URL('../.github/workflows/staging-deploy.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const block=y.match(/^concurrency:\n([\s\S]*?)(?=^\S)/m)?.[1];assert.ok(block);assert.match(block,/^  cancel-in-progress: false$/m);assert.match(block,/^  queue: max$/m);return 'max';}
async function eligibleQueue(pending){const out=[];for(const id of pending){const f=fixture();if(id===10){out.push(Number((await plan(f)).source.runId));}
 else {f.snapshots[`/repos/${p.repository}/actions/workflows/20/runs?branch=${encodeURIComponent(p.branch)}&event=push&per_page=1`].workflow_runs=[{id:11}];await assert.rejects(plan(f),/SUPERSEDED_RUN/);}}return out;}
test('PR132 retained: max queue preserves latest B when stale C arrives before or after it',async()=>{
 const old=queueBehindActive('single',[10,9]);assert.deepEqual(old.cancelled,[10]);assert.deepEqual(await eligibleQueue(old.pending),[]);
 for(const order of [[10,9],[9,10]]){const retained=queueBehindActive(await configuredQueue(),order);assert.deepEqual(retained.cancelled,[]);assert.deepEqual(await eligibleQueue(retained.pending),[10]);}
});
test('PR132 retained: 100 pending cap can lose latest trigger; drained capacity still requires fresh evidence',async()=>{
 const older=Array.from({length:100},(_,i)=>100+i);const full=queueBehindActive(await configuredQueue(),[...older,10]);assert.deepEqual(full.pending,older);assert.deepEqual(full.cancelled,[10]);
 const later=queueBehindActive(await configuredQueue(),[10]);assert.deepEqual(later.cancelled,[]);assert.deepEqual(await eligibleQueue(later.pending),[10]);
 assert.deepEqual(await eligibleQueue([9]),[]);
 // This model does not authorize rerunning the failed adapter attempt. The actual
 // incident barrier/reset and new-event rules remain covered in adapter tests.
});
