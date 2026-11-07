// PURE PROPOSAL: no network, process environment, filesystem or deployment client.
import { staging, checkSource } from './staging-source.mjs';
export const policy = Object.freeze({ ...staging, repositoryId: 1144262510,
  name: 'clear-allergy-e2e', environmentCount: 12, writeOnlyCount: 4 });
// Non-secret names and raw API types verified during the read-only review.
// No value or real environment record ID is stored here.
export const expectedEnvironment = Object.freeze({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'encrypted',
  PORTFOLIO_MODE: 'encrypted',
  CLEARALLERGY_TEST_PREVIEW: 'encrypted',
  ADMIN_REGISTRATION_MODE: 'encrypted',
  ENABLE_CLERK_ADMIN_AUTH: 'encrypted',
  EXPECTED_TEST_BLOB_STORE_ID: 'encrypted',
  ALLOWED_IMAGE_URL_PREFIXES: 'encrypted',
  PORTFOLIO_EDITOR_APP_USER_IDS: 'encrypted',
  DATABASE_URL: 'sensitive',
  DIRECT_URL: 'sensitive',
  CLERK_SECRET_KEY: 'sensitive',
  TEST_BLOB_READ_WRITE_TOKEN: 'sensitive',
});
const ensure = (ok, code) => { if (!ok) throw new Error(code); };
const exactKeys = (obj, keys) => obj && Object.keys(obj).every(k => keys.includes(k));

/** Normalized metadata only, never environment values. A future adapter must verify
 * authenticated API origin, fresh reads, complete pagination and reviewed key/ID
 * inventory. These inputs are NOT self-authenticating API proof. */
export function checkProject(project, inventory) {
  ensure(project?.id === policy.project && project.id !== policy.productionProject
    && project.accountId === policy.team && project.name === policy.name, 'WRONG_PROJECT');
  ensure(project.link?.type === 'github' && project.link.repoId === policy.repositoryId
    && project.link.org === 'Kaito-Iwase' && project.link.repo === 'ClearAllergy', 'WRONG_GIT_LINK');
  // Normalized prerequisites: productionBranch is not yet live-verified.
  ensure(project.productionBranch === 'main', 'UNVERIFIED_OR_WRONG_PRODUCTION_BRANCH');
  ensure(project.ssoProtection?.enabled === true
    && project.ssoProtection.deploymentType === 'all', 'SSO_PROTECTION_REQUIRED');
  ensure(inventory?.complete === true && inventory.envs?.length === policy.environmentCount,
    'INCOMPLETE_ENV_INVENTORY');
  ensure(new Set(inventory.envs.map(e => e.id)).size === policy.environmentCount
    && new Set(inventory.envs.map(e => e.key)).size === policy.environmentCount, 'DUPLICATE_ENV');
  ensure(inventory.envs.every(e => exactKeys(e, ['id','key','type','target','gitBranch','customEnvironmentIds'])
    && typeof e.id === 'string' && e.id && typeof e.key === 'string' && e.key
    && e.gitBranch === policy.branch && Array.isArray(e.target)
    && e.target.length === 1 && e.target[0] === 'preview'
    && (e.customEnvironmentIds === undefined
      || (Array.isArray(e.customEnvironmentIds) && e.customEnvironmentIds.length === 0))), 'WRONG_ENV_SCOPE_OR_VALUE');
  ensure(inventory.envs.every(e => Object.hasOwn(expectedEnvironment, e.key)
    && e.type === expectedEnvironment[e.key]), 'WRONG_ENV_KEY_OR_TYPE');
}

/** The source checker is real extracted logic; reader is a mock in this prototype.
 * Requires test/staging=false and all configured values false; unspecified
 * branches default enabled. This does not serialize or disable other writers.
 * This is a printable request proposal, not an executable transport operation. */
export async function plan({ event, trustedSha, github, project, inventory }) {
  ensure(event.repository?.id === policy.repositoryId, 'WRONG_REPOSITORY_ID');
  const source = await checkSource({ event, trustedSha, github });
  checkProject(project, inventory);
  return { source, request: { method: 'POST', path: `/v13/deployments?teamId=${policy.team}`,
    body: { name: policy.name, project: policy.project,
      gitSource: { type: 'github', repoId: String(policy.repositoryId), ref: policy.branch, sha: source.sha },
      meta: { clearallergyCommitSha: source.sha, clearallergyRunId: source.runId,
        clearallergyRunAttempt: source.attempt } } },
    limitations: ['READY may automatically change the existing branch alias before postchecks',
      'Branch movement during remote build can expose an older SHA',
      'No automatic retry, rollback, deletion, promotion or alias mutation'] };
}

/** A future integration must supply the newly created deployment ID from a known
 * successful response; a lost create response requires inspection before retry.
 * This validates identity/build readiness ONLY, not fixed-URL assignment. */
export function validateResponse(d, source, expectedId) {
  ensure(/^dpl_[A-Za-z0-9]+$/.test(expectedId) && d?.id === expectedId, 'WRONG_DEPLOYMENT_ID');
  ensure(d.projectId === policy.project && d.ownerId === policy.team, 'WRONG_DEPLOYMENT_OWNER');
  ensure(d.target === null && !d.customEnvironment, 'NOT_PREVIEW');
  ensure(d.readyState === 'READY', 'DEPLOYMENT_NOT_READY');
  ensure(d.gitSource?.type === 'github' && String(d.gitSource.repoId) === String(policy.repositoryId)
    && d.gitSource.ref === policy.branch && d.gitSource.sha === source.sha, 'WRONG_GIT_SOURCE');
  ensure(d.meta?.githubCommitSha === source.sha && d.meta?.clearallergyCommitSha === source.sha && d.meta?.clearallergyRunId === source.runId
    && d.meta?.clearallergyRunAttempt === source.attempt, 'WRONG_SOURCE_META');
  ensure(typeof d.url === 'string' && /^[a-z0-9-]+\.vercel\.app$/.test(d.url)
    && d.url !== policy.host, 'WRONG_DEPLOYMENT_URL');
  return { identityAndBuildReady: true, deploymentId: d.id, fixedUrlFollowConfirmed: false };
}

/** Pure read-only snapshot validation, not a DNS/HTTP or API operation.
 * Fresh deployment and exact alias-resolution snapshots are both required.
 * A prior alias failure remains unresolved until BOTH snapshots show success;
 * an alias resolving correctly cannot override a still-failing deployment snapshot.
 * This observation does not prevent another writer from changing the alias later. */
export function validateFixedUrlFollow({ deployment, source, expectedId, alias }) {
  const identity = validateResponse(deployment, source, expectedId);
  ensure(deployment.aliasAssigned === true && deployment.aliasError == null,
    'ALIAS_ASSIGNMENT_NOT_CONFIRMED');
  ensure(alias?.alias === policy.host && alias.projectId === policy.project
    && alias.deploymentId === identity.deploymentId && alias.redirect === null && !alias.microfrontends
    && (alias.deployment?.id === undefined || alias.deployment.id === alias.deploymentId),
    'FIXED_ALIAS_RESOLUTION_MISMATCH');
  return { ...identity, fixedUrlFollowConfirmed: true, functionalChecksVerified: false, observedHost: policy.host,
    scope: 'supplied API routing mapping only; not HTTP, authentication, app health or lasting routing' };
}

/** Explicit simulation of Vercel-managed branch alias behavior, NOT an API mock
 * claiming live behavior was tested. No transitions issue actions. */
export function simulate(events) {
  let s = { phase: 'idle', branchSha: null, candidateSha: null, aliasSha: 'previous',
    ciPassed: false, postchecked: false, earlyAlias: false, staleExposure: false, inspect: false };
  for (const e of events) {
    ensure(!s.inspect, 'INSPECTION_REQUIRED');
    if (e.type === 'branch') s.branchSha = e.sha;
    else if (e.type === 'ci') { ensure(s.phase === 'idle', 'INVALID_TRANSITION');
      s.ciPassed = e.success === true; s.candidateSha = e.sha; }
    else if (e.type === 'start') {
      ensure(s.phase === 'idle' && s.ciPassed && s.branchSha === s.candidateSha, 'CI_GATE_FAILED');
      s.phase = 'building';
    } else if (e.type === 'ready') {
      ensure(s.phase === 'building', 'INVALID_TRANSITION'); s.phase = 'ready';
      s.aliasSha = s.candidateSha; // Automatic Vercel action, before our postchecks.
      s.earlyAlias = !s.postchecked; s.staleExposure = s.branchSha !== s.candidateSha;
    } else if (e.type === 'postcheck') {
      ensure(s.phase === 'ready', 'INVALID_TRANSITION');
      s.postchecked = e.success === true && s.branchSha === s.candidateSha;
      s.inspect = !s.postchecked;
    } else if (e.type === 'uncertain' || e.type === 'failed') {
      ensure(s.phase === 'building' || s.phase === 'ready', 'INVALID_TRANSITION'); s.inspect = true;
    } else throw new Error('NO_AUTOMATIC_MUTATION_OR_RETRY');
  }
  return s;
}
