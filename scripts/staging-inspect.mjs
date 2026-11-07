// Incident-only GET observer. No deployment/alias mutation capabilities or arbitrary target inputs.
import { pathToFileURL } from 'node:url';
import { policy } from './staging-guards.mjs';
export const incidentId = 'dpl_9oBSZQhdJRqB886HvuP78WSWuPhM';
const sha = '2cea0ce6768ffb2c9fba6cead2cb468686bdf68c';
const paths = [
 `/v13/deployments/${incidentId}?teamId=${policy.team}`,
 `/v13/deployments/${incidentId}?teamId=${policy.team}&withGitRepoInfo=true`,
 `/v4/aliases/${policy.host}?teamId=${policy.team}`,
];
export function inspectionClient({token, transport = fetch}) {
 if(typeof token !== 'string' || !token) throw new Error('INSPECTION_FAILED');
 return async path => {
  if(!paths.includes(path)) throw new Error('INSPECTION_FAILED');
  try {
   const r = await transport('https://api.vercel.com'+path, {method:'GET',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
   if(!r.ok || r.redirected) throw new Error();
   return await r.json();
  } catch { throw new Error('INSPECTION_FAILED'); }
 };
}
function projection(d) {
 const meta=d?.meta, git=d?.gitSource;
 return {idMatches:d?.id===incidentId, projectMatches:d?.projectId===policy.project,
  ownerMatches:d?.ownerId===policy.team, preview:d?.target===null, noCustomEnvironment:!d?.customEnvironment,
  ready:d?.readyState==='READY', source: ['api','cli','git'].includes(d?.source)?d.source:'other-or-missing',
  gitMetadataPresent:d?.gitMetadata!==undefined, automaticAliasesPresent:Array.isArray(d?.automaticAliases),
  automaticAliasesContainHost:Array.isArray(d?.automaticAliases)&&d.automaticAliases.includes(policy.host),
  autoAssignCustomDomainsTrue:d?.autoAssignCustomDomains===true,
   gitSourcePresent:git!==undefined, gitTypeMatches:git?.type==='github',
  gitRepoMatches:String(git?.repoId)===String(policy.repositoryId), gitRefMatches:git?.ref===policy.branch,
  gitShaMatches:git?.sha===sha, providerShaMatches:meta?.githubCommitSha===sha,
  sourceShaMatches:meta?.clearallergyCommitSha===sha, sourceRunMatches:meta?.clearallergyRunId==='42357097487',
  sourceAttemptMatches:meta?.clearallergyRunAttempt==='2', writerRunMatches:meta?.clearallergyWriterRunId==='42372125591',
  writerAttemptMatches:meta?.clearallergyWriterAttempt==='1',
  aliasAssignedType:typeof d?.aliasAssigned==='boolean'?'boolean':d?.aliasAssigned===undefined?'missing':'other',
  aliasAssignedTrue:d?.aliasAssigned===true, aliasErrorAbsent:d?.aliasError==null,
  aliasListPresent:Array.isArray(d?.alias), aliasListContainsHost:Array.isArray(d?.alias)&&d.alias.includes(policy.host)};
}
export async function inspectIncident(get) {
 const ordinary=projection(await get(paths[0]));
 const withGitRepoInfo=projection(await get(paths[1]));
 const a=await get(paths[2]);
 return {readOnly:true, deploymentId:incidentId, ordinary, withGitRepoInfo,
  alias:{hostMatches:a?.alias===policy.host,projectMatches:a?.projectId===policy.project,
   pointsToIncident:a?.deploymentId===incidentId,
   pointsToPrevious:a?.deploymentId==='dpl_2ccZ9M7vQTd1vyrnKfwbsnT6y6DR',
   redirectNull:a?.redirect===null,noMicrofrontends:!a?.microfrontends,
   nestedIdConsistent:a?.deployment?.id===undefined||a.deployment.id===a.deploymentId}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 inspectIncident(inspectionClient({token:process.env.VERCEL_TOKEN}))
  .then(result=>console.log(JSON.stringify(result)))
  .catch(()=>{console.error('INSPECTION_FAILED');process.exitCode=1;});
}
