import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policy as p, expectedEnvironment } from '../scripts/staging-guards.mjs';
import { execute, apiClient, vercelReader } from '../scripts/staging-actions.mjs';
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

function adapterFixture() {
 const f=fixture(), calls=[]; let ticks=0;
 const d={id:'dpl_new',projectId:p.project,ownerId:p.team,target:null,readyState:'READY',
  gitSource:{type:'github',repoId:p.repositoryId,ref:p.branch,sha},url:'new-preview.vercel.app',
  aliasAssigned:true,aliasError:null,meta:{githubCommitSha:sha,clearallergyCommitSha:sha,
   clearallergyRunId:'10',clearallergyRunAttempt:'1',clearallergyWriterRunId:'100',clearallergyWriterAttempt:'1'}};
 let posted=false;
 const history={total_count:1,workflow_runs:[{id:100,status:'in_progress'}]};
 const options={enabled:'true',event:f.event,trustedSha,writerRunId:'100',writerAttempt:'1',approvedAliasId:'dpl_old',
  clock:{now:()=>ticks,sleep:async ms=>{ticks+=ms}},deadlineMs:10000,
  github:async path=>path.includes('staging-deploy.yml/runs')?structuredClone(history):f.github(path),
  vercel:async(path,body)=>{
   calls.push({path,body});
   if(body){posted=true;return {id:'dpl_new'};}
   if(path.startsWith('/v9/projects/'))return {...f.project,productionBranch:undefined,link:{...f.project.link,productionBranch:'main'}};
   if(path.includes('/env?'))return {envs:[...f.inventory.envs.map(e=>({...e,visibility:e.type==='sensitive'?'secret':'config',decrypted:false})),{id:'prod',key:'PROD',type:'encrypted',target:['production'],decrypted:false}]};
   if(path.startsWith('/v6/deployments?'))return {deployments:[],pagination:{next:null}};
   if(path.startsWith('/v4/aliases/'))return {alias:p.host,projectId:p.project,deploymentId:posted?'dpl_new':'dpl_old',redirect:null};
   if(path.startsWith('/v13/deployments/dpl_old'))return {id:'dpl_old',projectId:p.project,ownerId:p.team,target:null,readyState:'READY'};
   if(path.startsWith('/v13/deployments/dpl_new'))return structuredClone(d);
   throw Error('Unexpected fake request');
  }};
 return {f,d,calls,options,history};
}
test('adapter performs one exact remote create; separate alias read confirms mapping only',async()=>{
 const f=adapterFixture(); const r=await execute(f.options);
 assert.equal(r.fixedUrlFollowConfirmed,true);assert.equal(r.functionalChecksVerified,false);
 const writes=f.calls.filter(c=>c.body);assert.equal(writes.length,1);
 assert.equal(writes[0].path,`/v13/deployments?teamId=${p.team}`);
 assert.deepEqual(writes[0].body.gitSource,{type:'github',repoId:String(p.repositoryId),ref:p.branch,sha});
 assert.equal(Object.hasOwn(writes[0].body,'target'),false);
 assert.ok(!JSON.stringify(writes).includes('CIPHERTEXT'));
});
for(const [name,mutate] of [
 ['disabled',f=>f.options.enabled='false'],['rerun',f=>f.options.writerAttempt='2'],
 ['previous ambiguous writer',f=>{f.history.total_count=2;f.history.workflow_runs.push({id:99,status:'completed',conclusion:'failure'});}],
 ['previous cancelled writer',f=>{f.history.total_count=2;f.history.workflow_runs.push({id:99,status:'completed',conclusion:'cancelled'});}],
 ['history partial',f=>f.history.total_count=200],
 ['unprotected',f=>f.f.snapshots[`/repos/${p.repository}/branches/${encodeURIComponent(p.branch)}`].protected=false],
 ['wrong fetched run id',f=>f.f.run.id=11],
 ['production project',f=>f.f.project.id=p.productionProject],
 ['missing production branch',f=>f.f.project.link.productionBranch=undefined],
])test(`pre-create rejects ${name}`,async()=>{
 const f=adapterFixture();mutate(f);
 // fixture synthesizes raw productionBranch; override for this missing-field test.
 if(name==='missing production branch'){const old=f.options.vercel;f.options.vercel=async(...a)=>{const r=await old(...a);if(a[0].startsWith('/v9/'))delete r.link.productionBranch;return r;};}
 await assert.rejects(execute(f.options));assert.equal(f.calls.filter(c=>c.body).length,0);
});
for(const change of [d=>delete d.target,d=>d.target='production',d=>d.ownerId='team_other',d=>d.gitSource.sha='e'.repeat(40),d=>d.meta.githubCommitSha='e'.repeat(40),d=>d.aliasAssigned=false,d=>d.aliasError={message:'SECRET'},d=>d.customEnvironment={id:'custom'}])
 test('post-create identity/alias failure never retries',async()=>{const f=adapterFixture();change(f.d);await assert.rejects(execute(f.options));assert.equal(f.calls.filter(c=>c.body).length,1);});
test('lost POST response is read-only reconciled without retry, then later writer blocked even if Vercel empty',async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>{if(body){f.calls.push({path,body});throw Error('SECRET');}return old(path,body);};
 await assert.rejects(execute(f.options),/UNCERTAIN/);assert.equal(f.calls.filter(c=>c.body).length,1);
 f.options.writerRunId='101';f.history.total_count=2;f.history.workflow_runs=[{id:101,status:'in_progress'},{id:100,status:'completed',conclusion:'failure'}];
 await assert.rejects(execute(f.options),/PRIOR_WRITER_UNRESOLVED/);assert.equal(f.calls.filter(c=>c.body).length,1);
});
test('active build hidden on second page blocks create',async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>path.startsWith('/v6/')?path.includes('until=50')?{deployments:[{uid:'dpl_active',projectId:p.project,readyState:'BUILDING'}],pagination:{next:null}}:{deployments:[],pagination:{next:50}}:old(path,body);
 await assert.rejects(execute(f.options),/OUTSTANDING/);assert.equal(f.calls.filter(c=>c.body).length,0);
});
test('cancel signal during build retains slot until terminal observation',async()=>{
 const f=adapterFixture(),old=f.options.vercel;let reads=0,stop=false;
 f.options.interrupted=()=>stop;
 f.options.vercel=async(path,body)=>{const r=await old(path,body);if(path.includes('/dpl_new')){reads++;stop=true;if(reads<3)r.readyState='BUILDING';}return r;};
 await assert.rejects(execute(f.options),/TERMINAL_INSPECTION/);assert.equal(reads,3);
});
test('nonterminal remote build reaches bounded deadline and never retries',async()=>{
 const f=adapterFixture();f.d.readyState='BUILDING';await assert.rejects(execute(f.options),/STILL_RUNNING/);assert.equal(f.calls.filter(c=>c.body).length,1);
});
test('branch advancement while building fails after terminal observation, cannot undo early alias',async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>{const r=await old(path,body);if(path.includes('/dpl_new'))f.f.snapshots[`/repos/${p.repository}/git/ref/heads/${p.branch}`].object.sha='f'.repeat(40);return r;};
 await assert.rejects(execute(f.options),/SUPERSEDED_HEAD/);assert.equal(f.calls.filter(c=>c.body).length,1);
});
test('transport refuses redirects and never leaks response errors',async()=>{
 let seen;const api=apiClient({service:'vercel',token:'FAKE_TOKEN',transport:async(url,opts)=>{seen={url,opts};throw Error('SECRET_RESPONSE');}});
 await assert.rejects(api('/v9/projects/test'),e=>e.message==='API_READ_FAILED');assert.equal(seen.opts.redirect,'error');assert.equal(seen.opts.cache,'no-store');
 await assert.rejects(api('//evil.example/path'),/INVALID_API_PATH/);
 await assert.rejects(api('/v13/deployments',{project:p.productionProject}),/WRITE_NOT_ALLOWED/);
});
test('env values are discarded, production metadata unchanged, incomplete inventory rejected',async()=>{
 const f=adapterFixture();const inventory=await vercelReader(f.options.vercel).getInventory();assert.equal(inventory.envs.length,12);assert.ok(!JSON.stringify(inventory).includes('CIPHERTEXT'));
 await assert.rejects(vercelReader(async()=>({envs:[],pagination:{next:1}})).getInventory(),/PAGINATION/);
});
test('reset watermark accepts only earlier reconciled history; no rerun bypass',async()=>{
 const f=adapterFixture();f.history.total_count=2;f.history.workflow_runs.push({id:99,status:'completed',conclusion:'failure'});
 f.options.reconciledThroughRunId='99';assert.equal((await execute(f.options)).fixedUrlFollowConfirmed,true);
 f.options.writerAttempt='2';await assert.rejects(execute(f.options),/RECONCILIATION/);
});
test('subsequent normal writer accepts alias created by previously successful writer',async()=>{
 const f=adapterFixture(),old=f.options.vercel,gh=f.options.github;
 f.options.vercel=async(path,body)=>{const r=await old(path,body);
  if(path.startsWith('/v4/')&&r.deploymentId==='dpl_old')r.deploymentId='dpl_previous';
  return r;};
 const wrapped=f.options.vercel;
 f.options.vercel=async(path,body)=>path.includes('/dpl_previous')?{...f.d,id:'dpl_previous',meta:{...f.d.meta,clearallergyWriterRunId:'99',clearallergyWriterAttempt:'1'}}:wrapped(path,body);
 f.options.github=async path=>path.endsWith('/actions/runs/99')?{id:99,repository:{id:p.repositoryId},path:'.github/workflows/staging-deploy.yml',status:'completed',conclusion:'success',run_attempt:1}:gh(path);
 assert.equal((await execute(f.options)).fixedUrlFollowConfirmed,true);
});
for(const variant of ['redirect','nested mismatch','microfrontends','other deployment'])test(`post alias rejects ${variant}`,async()=>{
 const f=adapterFixture(),old=f.options.vercel;
 f.options.vercel=async(path,body)=>{const r=await old(path,body);if(path.startsWith('/v4/')&&r.deploymentId==='dpl_new'){
 if(variant==='redirect')r.redirect='elsewhere.example';if(variant==='nested mismatch')r.deployment={id:'dpl_else'};
 if(variant==='microfrontends')r.microfrontends={};if(variant==='other deployment')r.deploymentId='dpl_else';}return r;};
 await assert.rejects(execute(f.options));assert.equal(f.calls.filter(c=>c.body).length,1);
});
for(const variant of ['cursor repeated','missing next','duplicate deployment','unknown state'])test(`pagination rejects ${variant}`,async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>{
 if(!path.startsWith('/v6/'))return old(path,body);
 if(variant==='missing next')return {deployments:[],pagination:{}};
 if(variant==='unknown state')return {deployments:[{uid:'dpl_test',projectId:p.project,readyState:'WHATEVER'}],pagination:{next:null}};
 return {deployments:variant==='duplicate deployment'?[{uid:'dpl_test',projectId:p.project,readyState:'READY'}]:[],pagination:{next:50}};};
 await assert.rejects(execute(f.options));assert.equal(f.calls.filter(c=>c.body).length,0);
});
test('mutable environment inventory changed on repeated preflight stops POST',async()=>{
 const f=adapterFixture(),old=f.options.vercel;let n=0;f.options.vercel=async(path,body)=>{const r=await old(path,body);if(path.includes('/env?')&&++n===2)r.envs[0].gitBranch='main';return r;};
 await assert.rejects(execute(f.options));assert.equal(f.calls.filter(c=>c.body).length,0);
});
test('raw conflicting project owner is rejected before normalization',async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>{const r=await old(path,body);if(path.startsWith('/v9/'))r.teamId='other';return r;};
 await assert.rejects(execute(f.options),/CONFLICTING/);assert.equal(f.calls.filter(c=>c.body).length,0);
});
test('workflow stays disabled by default and uses one trusted remote-build entrypoint',async()=>{
 const {readFileSync}=await import('node:fs');const y=readFileSync(new URL('../.github/workflows/staging-deploy.yml',import.meta.url),'utf8');
 assert.match(y,/vars.STAGING_ACTIONS_ENABLED == 'true'/);assert.match(y,/queue: max/);assert.match(y,/cancel-in-progress: false/);
 assert.match(y,/environment: staging/);assert.match(y,/ref: \$\{\{ github.sha \}\}/);assert.match(y,/persist-credentials: false/);
 assert.doesNotMatch(y.replace(/^ *#.*$/gm,''),/vercel (pull|build|deploy|alias)|npm install|DATABASE_URL:|CLERK_SECRET_KEY:|TEST_BLOB_READ_WRITE_TOKEN:/);
});
test('active A tolerates queued B, and stale pre-create A leaves no unsafe history for B',async()=>{
 const f=adapterFixture();f.history.total_count=2;f.history.workflow_runs.push({id:101,status:'queued'});
 assert.equal((await execute(f.options)).fixedUrlFollowConfirmed,true);
 const stale=adapterFixture();stale.f.snapshots[`/repos/${p.repository}/git/ref/heads/${p.branch}`].object.sha='e'.repeat(40);
 const r=await execute(stale.options);assert.equal(r.noDeploymentCreated,true);assert.equal(r.fixedUrlFollowConfirmed,false);assert.equal(stale.calls.filter(c=>c.body).length,0);
 const next=adapterFixture();next.history.total_count=2;next.history.workflow_runs.push({id:99,status:'completed',conclusion:'success'});
 assert.equal((await execute(next.options)).fixedUrlFollowConfirmed,true);
});
test('manual alias with copied successful writer metadata but foreign source is rejected',async()=>{
 const f=adapterFixture(),old=f.options.vercel,gh=f.options.github;
 f.options.vercel=async(path,body)=>{
  if(path.includes('/dpl_manual'))return {...f.d,id:'dpl_manual',gitSource:{type:'github',repoId:999,ref:'unreviewed',sha:'f'.repeat(40)},meta:{...f.d.meta,clearallergyWriterRunId:'99'}};
  const r=await old(path,body);if(path.startsWith('/v4/'))r.deploymentId='dpl_manual';return r;};
 f.options.github=async path=>path.endsWith('/actions/runs/99')?{id:99,repository:{id:p.repositoryId},path:'.github/workflows/staging-deploy.yml',status:'completed',conclusion:'success',run_attempt:1}:gh(path);
 await assert.rejects(execute(f.options),/SOURCE_MISMATCH/);assert.equal(f.calls.filter(c=>c.body).length,0);
});
for(const change of [e=>e.visibility='config',e=>e.decrypted=true])test('raw env authoritative contradiction is not discarded',async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>{const r=await old(path,body);if(path.includes('/env?'))r.envs.forEach(change);return r;};
 await assert.rejects(execute(f.options),/ENV_(VISIBILITY|DECRYPTION)/);assert.equal(f.calls.filter(c=>c.body).length,0);
});
for(const change of [d=>d.projectId=p.productionProject,d=>d.ownerId='wrong',d=>d.target='production',d=>d.gitSource={type:'github',repoId:999,ref:'main',sha}])test('contradictory create response poisons success even if later GET looks correct',async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>{const r=await old(path,body);if(body)change(r);return r;};
 await assert.rejects(execute(f.options),/TERMINAL_INSPECTION/);assert.equal(f.calls.filter(c=>c.body).length,1);
});
test('preflight alias deployment GET must return the requested exact ID',async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>{const r=await old(path,body);if(path.includes('/dpl_old'))r.id='dpl_unrelated';return r;};
 await assert.rejects(execute(f.options),/DEPLOYMENT_ID_MISMATCH/);assert.equal(f.calls.filter(c=>c.body).length,0);
});
test('reviewed raw metadata mapping accepts encrypted/config and sensitive/secret, all non-decrypted',async()=>{
 const f=adapterFixture();const env=await f.options.vercel(`/v10/projects/${p.project}/env?decrypt=false`);
 const preview=env.envs.filter(e=>e.target.includes('preview'));
 assert.equal(preview.filter(e=>e.type==='encrypted'&&e.visibility==='config'&&e.decrypted===false).length,8);
 assert.equal(preview.filter(e=>e.type==='sensitive'&&e.visibility==='secret'&&e.decrypted===false).length,4);
 assert.equal((await execute(f.options)).fixedUrlFollowConfirmed,true);
});
for(const [name,change] of [
 ['sensitive downgraded visibility',e=>{if(e.type==='sensitive')e.visibility='config';}],
 ['encrypted unexpected visibility',e=>{if(e.type==='encrypted')e.visibility='secret';}],
 ['unknown visibility',e=>e.visibility='unknown'],
 ['legacy visibility absent',e=>delete e.visibility],
 ['legacy decrypted absent',e=>delete e.decrypted],
 ['type conflicts with reviewed visibility',e=>{if(e.type==='sensitive')e.type='encrypted';}],
])test(`reviewed metadata rejects ${name}`,async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>{const r=await old(path,body);if(path.includes('/env?'))r.envs.filter(e=>e.target.includes('preview')).forEach(change);return r;};
 await assert.rejects(execute(f.options));assert.equal(f.calls.filter(c=>c.body).length,0);
});
test('PR132 retained: missing API token fails locally before transport',()=>{
 let called=false;assert.throws(()=>apiClient({service:'vercel',token:'',transport:async()=>{called=true;}}),/MISSING_API_TOKEN/);assert.equal(called,false);
});
for(const value of [true,'false',0,null,undefined])test(`all received env entries reject unverified decrypted metadata ${String(value)}`,async()=>{
 const f=adapterFixture(),old=f.options.vercel;f.options.vercel=async(path,body)=>{const r=await old(path,body);if(path.includes('/env?'))r.envs.find(e=>e.target.includes('production')).decrypted=value;return r;};
 await assert.rejects(execute(f.options),/ENV_DECRYPTION/);assert.equal(f.calls.filter(c=>c.body).length,0);
});
