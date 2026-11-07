// Remote Preview adapter. Importing this module never reads credentials or sends requests.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { policy, expectedEnvironment, plan, validateResponse, validateFixedUrlFollow } from './staging-guards.mjs';
export { policy } from './staging-guards.mjs';
const requireThat = (ok, code) => { if (!ok) throw new Error(code); };
const terminal = new Set(['READY', 'ERROR', 'CANCELED']);
const states = new Set([...terminal, 'QUEUED', 'INITIALIZING', 'BUILDING']);
const idOK = id => typeof id === 'string' && /^dpl_[A-Za-z0-9]+$/.test(id);

// No redirects, implicit retries, caller-selected origins, or response-body logging.
export function apiClient({ service, token, transport = fetch }) {
  requireThat(['github', 'vercel'].includes(service), 'INVALID_SERVICE');
  requireThat(typeof token === 'string' && token.length > 0, 'MISSING_API_TOKEN');
  const origin = service === 'github' ? 'https://api.github.com' : 'https://api.vercel.com';
  let createdId, verifiedId, aliasAttempted = false;
  return async (path, body) => {
    requireThat(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
      && new URL(path, origin).origin === origin, 'INVALID_API_PATH');
    const aliasWrite = service === 'vercel' && idOK(createdId) && verifiedId === createdId
      && path === `/v2/deployments/${createdId}/aliases?teamId=${policy.team}`
      && body?.alias === policy.host && body.redirect === null
      && Object.keys(body).sort().join() === 'alias,redirect' && !aliasAttempted;
    requireThat(body === undefined || aliasWrite || (service === 'vercel'
      && path === `/v13/deployments?teamId=${policy.team}`
      && body.project === policy.project && body.project !== policy.productionProject
      && body.name === policy.name && !Object.hasOwn(body, 'target')
      && body.gitSource?.type === 'github' && body.gitSource.repoId === String(policy.repositoryId)
      && body.gitSource.ref === policy.branch && /^[0-9a-f]{40}$/.test(body.gitSource.sha)
      && Object.keys(body.gitSource).sort().join() === 'ref,repoId,sha,type'
      && Object.keys(body).sort().join() === 'gitSource,meta,name,project'), 'WRITE_NOT_ALLOWED');
    if (aliasWrite) aliasAttempted = true; // Sticky before transport, never reset.
    let response;
    try {
      response = await transport(origin + path, { method: body === undefined ? 'GET' : 'POST',
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
          'Content-Type': 'application/json', ...(service === 'github' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      requireThat(response.ok && !response.redirected, 'HTTP_FAILURE');
      const result = await response.json();
      if (body !== undefined && !aliasWrite && idOK(result?.id)) createdId = result.id;
      if (body === undefined && result?.id === createdId) {
        verifiedId = undefined;
        try { previewIdentity(result); if (result.readyState === 'READY') verifiedId = createdId; } catch {}
      }
      return result;
    } catch { throw new Error(body === undefined ? 'API_READ_FAILED' : aliasWrite ? 'ALIAS_OUTCOME_UNCERTAIN' : 'CREATE_OUTCOME_UNCERTAIN'); }
  };
}
const query = path => `${path}${path.includes('?') ? '&' : '?'}teamId=${policy.team}`;
export function vercelReader(api) {
  const getDeployment = async id => {
    requireThat(idOK(id), 'INVALID_DEPLOYMENT_ID');
    return api(query(`/v13/deployments/${id}?withGitRepoInfo=true`));
  };
  return {
    getDeployment,
    getAlias: () => api(query(`/v4/aliases/${policy.host}`)),
    async getProject() {
      const raw = await api(query(`/v9/projects/${policy.project}`));
      requireThat(raw.productionBranch === undefined || raw.productionBranch === raw.link?.productionBranch, 'CONFLICTING_PROJECT_BRANCH');
      requireThat(raw.teamId === undefined || raw.teamId === raw.accountId, 'CONFLICTING_PROJECT_OWNER');
      return { id: raw.id, accountId: raw.accountId, name: raw.name,
        link: raw.link && { type: raw.link.type, repoId: Number(raw.link.repoId), org: raw.link.org, repo: raw.link.repo },
        productionBranch: raw.link?.productionBranch,
        ssoProtection: { enabled: raw.ssoProtection?.deploymentType === 'all', deploymentType: raw.ssoProtection?.deploymentType } };
    },
    async getInventory() {
      // decrypt=false is mandatory. Never retain or log value fields, even encrypted ones.
      const raw = await api(query(`/v10/projects/${policy.project}/env?decrypt=false`));
      requireThat(Array.isArray(raw.envs) && (!raw.pagination || raw.pagination.next === null), 'ENV_PAGINATION_UNVERIFIED');
      requireThat(raw.envs.every(e => Array.isArray(e.target)), 'ENV_SCOPE_UNKNOWN');
      requireThat(raw.envs.every(e => e.decrypted === false), 'ENV_DECRYPTION_UNREVIEWED');
      requireThat(raw.envs.filter(e => e.target.includes('preview')).every(e =>
        e.decrypted === false && Object.hasOwn(expectedEnvironment, e.key)
        && e.visibility === (expectedEnvironment[e.key] === 'sensitive' ? 'secret' : 'config')),
        'ENV_VISIBILITY_OR_DECRYPTION_UNREVIEWED');
      const envs = raw.envs.filter(e => e.target.includes('preview')).map(e => ({
        id: e.id, key: e.key, type: e.type, target: e.target, gitBranch: e.gitBranch,
        ...(e.customEnvironmentIds === undefined ? {} : { customEnvironmentIds: e.customEnvironmentIds }) }));
      return { complete: true, envs };
    },
    async listDeployments() {
      const all = [], seen = new Set(); let until;
      // Full history, bounded; saturation fails closed rather than silently using a partial list.
      for (let page = 0; page < 100; page++) {
        const raw = await api(query(`/v6/deployments?projectId=${policy.project}&limit=100${until === undefined ? '' : `&until=${until}`}`));
        requireThat(Array.isArray(raw.deployments) && raw.pagination && Object.hasOwn(raw.pagination, 'next'), 'DEPLOYMENT_PAGE_UNKNOWN');
        for (const d of raw.deployments) {
          requireThat(idOK(d.uid) && !seen.has(d.uid), 'DEPLOYMENT_PAGE_DUPLICATE');
          seen.add(d.uid); all.push(d);
        }
        if (raw.pagination.next === null) return all;
        requireThat(Number.isSafeInteger(raw.pagination.next) && raw.pagination.next >= 0
          && (until === undefined || raw.pagination.next < until), 'DEPLOYMENT_CURSOR_INVALID');
        until = raw.pagination.next;
      }
      throw new Error('DEPLOYMENT_HISTORY_INCOMPLETE');
    },
  };
}
function previewIdentity(d) {
  requireThat((d?.project?.id === undefined || d.project.id === d.projectId)
    && (d?.teamId === undefined || d.teamId === d.ownerId)
    && idOK(d?.id) && d.projectId === policy.project && d.ownerId === policy.team
    && d.target === null && !d.customEnvironment, 'UNAPPROVED_PREVIEW');
}
// Durable fail-closed barrier: Actions history, not a Vercel empty-list inference.
// Reset only after operator reconciliation of every earlier unknown remote outcome.
export async function checkWriterHistory(github, writerRunId, reconciledThroughRunId) {
  requireThat(/^\d+$/.test(reconciledThroughRunId)
    && BigInt(reconciledThroughRunId) < BigInt(writerRunId), 'INVALID_RECONCILIATION_BASELINE');
  const seen = new Set(); let count;
  for (let page = 1; page <= 100; page++) {
    const data = await github(`/repos/${policy.repository}/actions/workflows/staging-deploy.yml/runs?per_page=100&page=${page}`);
    requireThat(Number.isSafeInteger(data.total_count) && Array.isArray(data.workflow_runs)
      && (count === undefined || count === data.total_count), 'WRITER_HISTORY_UNSTABLE');
    count = data.total_count;
    for (const r of data.workflow_runs) {
      requireThat(Number.isSafeInteger(r.id) && !seen.has(r.id), 'WRITER_HISTORY_INVALID');
      seen.add(r.id);
      if (BigInt(r.id) <= BigInt(reconciledThroughRunId) || String(r.id) === writerRunId) continue;
      if (BigInt(r.id) > BigInt(writerRunId)) {
        requireThat(['queued', 'waiting', 'pending', 'requested'].includes(r.status), 'NEWER_WRITER_EXISTS');
        continue;
      }
      requireThat(r.run_attempt === 1 && r.status === 'completed' && ['success', 'skipped'].includes(r.conclusion),
        'PRIOR_WRITER_UNRESOLVED');
    }
    if (seen.size === count) {
      requireThat(seen.has(Number(writerRunId)), 'CURRENT_WRITER_MISSING'); return;
    }
    requireThat(data.workflow_runs.length === 100 && seen.size < count, 'WRITER_HISTORY_INCOMPLETE');
  }
  throw new Error('WRITER_HISTORY_INCOMPLETE');
}
async function executeInternal({ enabled, event, trustedSha, github, vercel, approvedAliasId,
  writerRunId, writerAttempt, reconciledThroughRunId = '0', clock = { now: Date.now, sleep: ms => new Promise(r => setTimeout(r, ms)) },
  interrupted = () => false, deadlineMs = 45 * 60 * 1000, explicitAliasEnabled = false, context = {} }) {
  context.stage = 'preflight';
  requireThat(enabled === 'true', 'DISABLED');
  requireThat(/^\d+$/.test(writerRunId) && writerAttempt === '1', 'WRITER_RECONCILIATION_REQUIRED');
  requireThat(idOK(approvedAliasId), 'APPROVED_ALIAS_REQUIRED');
  await checkWriterHistory(github, writerRunId, reconciledThroughRunId);
  const reader = vercelReader(vercel);
  let createStarted = false, aliasStarted = false;
  const sourcePlan = async () => {
    try { return await plan({ event, trustedSha, github,
      project: await reader.getProject(), inventory: await reader.getInventory() }); }
    catch (error) {
      if (!createStarted && ['SUPERSEDED_HEAD', 'SUPERSEDED_RUN', 'RUN_CHANGED'].includes(error.message)) {
        throw new Error('SAFE_NO_CREATE_SUPERSEDED');
      }
      throw error;
    }
  };
  async function preflight(source) {
    const alias = await reader.getAlias();
    requireThat(alias.alias === policy.host && alias.projectId === policy.project
      && idOK(alias.deploymentId) && alias.redirect === null && !alias.microfrontends
      && (alias.deployment?.id === undefined || alias.deployment.id === alias.deploymentId), 'EXISTING_ALIAS_NOT_APPROVED');
    context.priorAliasId = alias.deploymentId;
    const current = await reader.getDeployment(alias.deploymentId); previewIdentity(current);
    requireThat(current.id === alias.deploymentId, 'EXISTING_ALIAS_DEPLOYMENT_ID_MISMATCH');
    requireThat(current.readyState === 'READY', 'EXISTING_ALIAS_NOT_READY');
    if (alias.deploymentId !== approvedAliasId) {
      requireThat(/^\d+$/.test(current.meta?.clearallergyWriterRunId || ''), 'EXISTING_ALIAS_NOT_APPROVED');
      const previous = await github(`/repos/${policy.repository}/actions/runs/${current.meta.clearallergyWriterRunId}`);
      requireThat(previous.id === Number(current.meta.clearallergyWriterRunId)
        && previous.repository?.id === policy.repositoryId
        && previous.path === '.github/workflows/staging-deploy.yml'
        && previous.status === 'completed' && previous.conclusion === 'success'
        && String(previous.run_attempt) === current.meta.clearallergyWriterAttempt,
        'EXISTING_ALIAS_WRITER_NOT_SUCCESSFUL');
      requireThat(/^\d+$/.test(current.meta?.clearallergyRunId || ''), 'EXISTING_ALIAS_SOURCE_UNKNOWN');
      const ci = await github(`/repos/${policy.repository}/actions/runs/${current.meta.clearallergyRunId}`);
      requireThat(ci.id === Number(current.meta.clearallergyRunId)
        && ci.repository?.id === policy.repositoryId && ci.head_repository?.id === policy.repositoryId
        && ci.path === policy.workflow && ci.event === 'push' && ci.head_branch === policy.branch
        && ci.status === 'completed' && ci.conclusion === 'success'
        && String(ci.run_attempt) === current.meta.clearallergyRunAttempt,
        'EXISTING_ALIAS_CI_NOT_SUCCESSFUL');
      requireThat(current.gitSource?.type === 'github'
        && String(current.gitSource.repoId) === String(policy.repositoryId)
        && current.gitSource.ref === policy.branch && /^[0-9a-f]{40}$/.test(ci.head_sha)
        && current.gitSource.sha === ci.head_sha && current.meta.githubCommitSha === ci.head_sha
        && current.meta.clearallergyCommitSha === ci.head_sha, 'EXISTING_ALIAS_SOURCE_MISMATCH');
      // workflow_run executes control on default branch, so writer.head_sha is not candidate SHA.
      // Metadata plus two historical records is still not cryptographic attribution to this writer.
    }
    const deployments = await reader.listDeployments();
    for (const d of deployments) {
      requireThat(d.projectId === policy.project && states.has(d.readyState)
        && (d.state === undefined || d.state === d.readyState), 'UNKNOWN_DEPLOYMENT_STATE');
      requireThat(terminal.has(d.readyState), 'OUTSTANDING_REMOTE_BUILD');
      requireThat(d.meta?.clearallergyWriterRunId !== writerRunId
        && !(d.meta?.clearallergyRunId === source.runId && d.meta?.clearallergyRunAttempt === source.attempt), 'PRIOR_CREATE_REQUIRES_RECONCILIATION');
    }
  }
  let planned = await sourcePlan(); await preflight(planned.source);
  planned = await sourcePlan(); await preflight(planned.source);
  // Narrow final head/run/config race; still not an atomic transaction with Vercel.
  const final = await sourcePlan();
  requireThat(JSON.stringify(final.source) === JSON.stringify(planned.source), 'SOURCE_CHANGED');
  await checkWriterHistory(github, writerRunId, reconciledThroughRunId);
  requireThat(!interrupted(), 'INTERRUPTED_BEFORE_CREATE');
  final.request.body.meta.clearallergyWriterRunId = writerRunId;
  final.request.body.meta.clearallergyWriterAttempt = writerAttempt;
  let created; createStarted = true; context.stage = 'create';
  try { created = await vercel(final.request.path, final.request.body); }
  catch {
    // Read-only reconciliation, never a second POST. A missing match is not proof of absence.
    try { await reader.listDeployments(); } catch { /* unknown remains unknown */ }
    throw new Error('CREATE_OUTCOME_UNCERTAIN_DISABLE_AND_RECONCILE');
  }
  requireThat(idOK(created?.id), 'CREATE_ID_UNKNOWN_DISABLE_AND_RECONCILE');
  context.deploymentId = created.id; context.stage = 'build';
  const id = created.id, deadline = clock.now() + deadlineMs;
  // A contradictory create response cannot be repaired by a later apparently valid GET.
  let bad = (created.projectId !== undefined && created.projectId !== policy.project)
    || (created.ownerId !== undefined && created.ownerId !== policy.team)
    || (created.target !== undefined && created.target !== null)
    || Boolean(created.customEnvironment)
    || (created.gitSource !== undefined && (created.gitSource.type !== 'github'
      || String(created.gitSource.repoId) !== String(policy.repositoryId)
      || created.gitSource.ref !== policy.branch || created.gitSource.sha !== final.source.sha))
    || (created.meta?.githubCommitSha !== undefined && created.meta.githubCommitSha !== final.source.sha);
  for (const [key, value] of Object.entries(final.request.body.meta)) {
    if (created.meta?.[key] !== undefined && created.meta[key] !== value) bad = true;
  }
  if (created.project?.id !== undefined && created.project.id !== policy.project) bad = true;
  if (created.teamId !== undefined && created.teamId !== policy.team) bad = true;
  // Keep the Actions slot while known build runs, even after source moves or SIGTERM.
  for (;;) {
    let d;
    try { d = await reader.getDeployment(id); }
    catch { if (clock.now() >= deadline) throw new Error('REMOTE_OUTCOME_UNKNOWN_DISABLE_AND_RECONCILE');
      await clock.sleep(5000); continue; }
    try { previewIdentity(d); } catch { bad = true; }
    if (d.id !== id || !states.has(d.readyState)) bad = true;
    if (terminal.has(d.readyState)) {
      requireThat(!bad && !interrupted(), 'TERMINAL_INSPECTION_REQUIRED');
      requireThat(d.meta?.clearallergyWriterRunId === writerRunId
        && d.meta?.clearallergyWriterAttempt === writerAttempt, 'WRITER_META_MISMATCH');
      const fresh = await sourcePlan();
      requireThat(JSON.stringify(fresh.source) === JSON.stringify(final.source), 'SOURCE_CHANGED_AFTER_BUILD');
      validateResponse(d, final.source, id);
      await checkWriterHistory(github, writerRunId, reconciledThroughRunId);
      context.stage = 'alias';
      const alias = await reader.getAlias();
      // Only the previously validated preflight mapping may remain temporarily.
      // Unknown writers, malformed states and explicit alias errors never get retried.
      requireThat(d.aliasError == null && typeof d.aliasAssigned === 'boolean', 'ALIAS_ASSIGNMENT_INVALID');
      requireThat(alias?.alias === policy.host && alias.projectId === policy.project
        && alias.redirect === null && !alias.microfrontends
        && (alias.deployment?.id === undefined || alias.deployment.id === alias.deploymentId)
        && [id, context.priorAliasId].includes(alias.deploymentId), 'ALIAS_CONFLICT');
      if (explicitAliasEnabled && d.aliasAssigned === true && !aliasStarted && alias.deploymentId === context.priorAliasId) {
        // Existing host-scoped Actions history/concurrency barrier remains in force.
        // No standalone recovery path; only this run's newly created Preview is eligible.
        await checkWriterHistory(github, writerRunId, reconciledThroughRunId);
        const inflight = await reader.listDeployments();
        requireThat(inflight.every(x => x.projectId === policy.project && terminal.has(x.readyState)
          && (x.state === undefined || x.state === x.readyState)), 'OUTSTANDING_REMOTE_BUILD');
        const latest = await sourcePlan();
        requireThat(JSON.stringify(latest.source) === JSON.stringify(final.source), 'SOURCE_CHANGED_AFTER_BUILD');
        const target = await reader.getDeployment(id); previewIdentity(target);
        validateResponse(target, final.source, id);
        requireThat(target.aliasAssigned === true && target.aliasError == null
          && target.meta?.clearallergyWriterRunId === writerRunId
          && target.meta?.clearallergyWriterAttempt === writerAttempt, 'ALIAS_ASSIGNMENT_INVALID');
        const currentAlias = await reader.getAlias();
        requireThat(currentAlias?.alias === policy.host && currentAlias.projectId === policy.project
          && currentAlias.deploymentId === context.priorAliasId && currentAlias.redirect === null && !currentAlias.microfrontends
          && (currentAlias.deployment?.id === undefined || currentAlias.deployment.id === currentAlias.deploymentId), 'ALIAS_CONFLICT');
        const previous = await reader.getDeployment(context.priorAliasId); previewIdentity(previous);
        requireThat(previous.id === context.priorAliasId && previous.readyState === 'READY', 'EXISTING_ALIAS_NOT_READY');
        requireThat(!interrupted(), 'TERMINAL_INSPECTION_REQUIRED');
        requireThat(clock.now() < deadline, 'ALIAS_SETTLEMENT_TIMEOUT');
        aliasStarted = true; // Sticky before POST. Unknown response must fail this writer.
        let assigned;
        try { assigned = await vercel(`/v2/deployments/${id}/aliases?teamId=${policy.team}`, {alias:policy.host,redirect:null}); }
        catch { try { await reader.getAlias(); } catch {} throw new Error('ALIAS_OUTCOME_UNCERTAIN'); }
        // Nullable/omitted oldDeploymentId supplies no previous-ID evidence; GET remains mandatory.
        requireThat(assigned?.alias === policy.host
          && (assigned.oldDeploymentId == null || assigned.oldDeploymentId === context.priorAliasId), 'ALIAS_RESPONSE_CONFLICT');
        continue; // Fresh source/deployment/alias snapshots, never trust POST as success.
      }
      if (d.aliasAssigned === true && alias.deploymentId === id)
        return validateFixedUrlFollow({ deployment: d, source: final.source, expectedId: id, alias });
      requireThat(clock.now() < deadline, 'ALIAS_SETTLEMENT_TIMEOUT');
      await clock.sleep(5000); continue;
    }
    if (clock.now() >= deadline) throw new Error('REMOTE_BUILD_STILL_RUNNING_DISABLE_AND_RECONCILE');
    await clock.sleep(5000);
  }
}

export async function execute(options) {
  const context = {};
  try { return await executeInternal({ ...options, context }); }
  catch (error) {
    if (error.message === 'SAFE_NO_CREATE_SUPERSEDED') return {
      noDeploymentCreated: true, reason: 'source superseded before create',
      fixedUrlFollowConfirmed: false, functionalChecksVerified: false };
    if (error && typeof error === 'object') failureContexts.set(error, context);
    throw error;
  }
}


const failureContexts = new WeakMap();
const diagnosticCodes = new Set(['ALIAS_OUTCOME_UNCERTAIN','ALIAS_RESPONSE_CONFLICT','ALIAS_ASSIGNMENT_INVALID', 'ALIAS_ASSIGNMENT_NOT_CONFIRMED', 'ALIAS_CONFLICT', 'ALIAS_SETTLEMENT_TIMEOUT', 'API_READ_FAILED', 'APPROVED_ALIAS_REQUIRED', 'CI_GATE_FAILED', 'CI_NOT_ELIGIBLE', 'CONFLICTING_PROJECT_BRANCH', 'CONFLICTING_PROJECT_OWNER', 'CREATE_ID_UNKNOWN_DISABLE_AND_RECONCILE', 'CREATE_OUTCOME_UNCERTAIN', 'CREATE_OUTCOME_UNCERTAIN_DISABLE_AND_RECONCILE', 'CURRENT_WRITER_MISSING', 'DEPLOYMENT_CURSOR_INVALID', 'DEPLOYMENT_HISTORY_INCOMPLETE', 'DEPLOYMENT_NOT_READY', 'DEPLOYMENT_PAGE_DUPLICATE', 'DEPLOYMENT_PAGE_UNKNOWN', 'DISABLED', 'DUPLICATE_ENV', 'ENV_DECRYPTION_UNREVIEWED', 'ENV_PAGINATION_UNVERIFIED', 'ENV_SCOPE_UNKNOWN', 'ENV_VISIBILITY_OR_DECRYPTION_UNREVIEWED', 'EXISTING_ALIAS_CI_NOT_SUCCESSFUL', 'EXISTING_ALIAS_DEPLOYMENT_ID_MISMATCH', 'EXISTING_ALIAS_NOT_APPROVED', 'EXISTING_ALIAS_NOT_READY', 'EXISTING_ALIAS_SOURCE_MISMATCH', 'EXISTING_ALIAS_SOURCE_UNKNOWN', 'EXISTING_ALIAS_WRITER_NOT_SUCCESSFUL', 'FIXED_ALIAS_RESOLUTION_MISMATCH', 'GIT_DEPLOYMENT_NOT_DISABLED', 'HTTP_FAILURE', 'INCOMPLETE_ENV_INVENTORY', 'INSPECTION_REQUIRED', 'INTERRUPTED_BEFORE_CREATE', 'INVALID_API_PATH', 'INVALID_DEPLOYMENT_ID', 'INVALID_RECONCILIATION_BASELINE', 'INVALID_SERVICE', 'INVALID_TRANSITION', 'MISSING_API_TOKEN', 'NEWER_WRITER_EXISTS', 'NOT_PREVIEW', 'NO_AUTOMATIC_MUTATION_OR_RETRY', 'OUTSTANDING_REMOTE_BUILD', 'PRIOR_CREATE_REQUIRES_RECONCILIATION', 'PRIOR_WRITER_UNRESOLVED', 'REMOTE_BUILD_STILL_RUNNING_DISABLE_AND_RECONCILE', 'REMOTE_OUTCOME_UNKNOWN_DISABLE_AND_RECONCILE', 'RUN_CHANGED', 'RUN_ID_MISMATCH', 'SAFE_NO_CREATE_SUPERSEDED', 'SIGINT', 'SIGTERM', 'SOURCE_BRANCH_NOT_PROTECTED', 'SOURCE_CHANGED', 'SOURCE_CHANGED_AFTER_BUILD', 'SSO_PROTECTION_REQUIRED', 'SUPERSEDED_HEAD', 'SUPERSEDED_RUN', 'TERMINAL_INSPECTION_REQUIRED', 'UNAPPROVED_PREVIEW', 'UNKNOWN_DEPLOYMENT_STATE', 'UNREVIEWED_CONFIGURATION', 'UNTRUSTED_REPOSITORY', 'UNTRUSTED_TRIGGER', 'UNVERIFIED_OR_WRONG_PRODUCTION_BRANCH', 'WORKFLOW_MISMATCH', 'WRITER_HISTORY_INCOMPLETE', 'WRITER_HISTORY_INVALID', 'WRITER_HISTORY_UNSTABLE', 'WRITER_META_MISMATCH', 'WRITER_RECONCILIATION_REQUIRED', 'WRITE_NOT_ALLOWED', 'WRONG_DEPLOYMENT_ID', 'WRONG_DEPLOYMENT_OWNER', 'WRONG_DEPLOYMENT_URL', 'WRONG_ENV_KEY_OR_TYPE', 'WRONG_ENV_SCOPE_OR_VALUE', 'WRONG_GIT_LINK', 'WRONG_GIT_SOURCE', 'WRONG_PROJECT', 'WRONG_REPOSITORY_ID', 'WRONG_SOURCE_META'] );
export function safeFailure(error) {
  const context = error && typeof error === 'object' ? failureContexts.get(error) : undefined;
  return { code: diagnosticCodes.has(error?.message) ? error.message : 'UNCLASSIFIED_FAILURE',
    stage: ['preflight','create','build','alias'].includes(context?.stage) ? context.stage : 'startup',
    ...(idOK(context?.deploymentId) ? {deploymentId:context.deploymentId} : {}) };
}

async function main() {
  // Gate before opening event or accessing token environment variables.
  requireThat(process.env.STAGING_ACTIONS_ENABLED === 'true', 'DISABLED');
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; }); process.on('SIGINT', () => { stopping = true; });
  const result = await execute({ explicitAliasEnabled: true, enabled: process.env.STAGING_ACTIONS_ENABLED,
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    trustedSha: process.env.TRUSTED_SHA, approvedAliasId: process.env.STAGING_APPROVED_ALIAS_ID,
    reconciledThroughRunId: process.env.STAGING_RECONCILED_THROUGH_RUN_ID || '0',
    writerRunId: process.env.GITHUB_RUN_ID, writerAttempt: process.env.GITHUB_RUN_ATTEMPT,
    github: apiClient({ service: 'github', token: process.env.GH_TOKEN }),
    vercel: apiClient({ service: 'vercel', token: process.env.VERCEL_TOKEN }), interrupted: () => stopping });
  console.log(JSON.stringify(result)); // Whitelisted result only, never API payloads.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(JSON.stringify({ status: 'STAGING_STOPPED', ...safeFailure(error) })); process.exitCode = 1; });
}
