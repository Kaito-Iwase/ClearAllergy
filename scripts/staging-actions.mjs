// Remote Preview adapter. Importing this module never reads credentials or sends requests.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { policy, expectedEnvironment, plan, validateFixedUrlFollow } from './staging-guards.mjs';
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
  return async (path, body) => {
    requireThat(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
      && new URL(path, origin).origin === origin, 'INVALID_API_PATH');
    requireThat(body === undefined || (service === 'vercel'
      && path === `/v13/deployments?teamId=${policy.team}`
      && body.project === policy.project && body.project !== policy.productionProject
      && body.name === policy.name && !Object.hasOwn(body, 'target')
      && body.gitSource?.type === 'github' && body.gitSource.repoId === String(policy.repositoryId)
      && body.gitSource.ref === policy.branch && /^[0-9a-f]{40}$/.test(body.gitSource.sha)
      && Object.keys(body.gitSource).sort().join() === 'ref,repoId,sha,type'
      && Object.keys(body).sort().join() === 'gitSource,meta,name,project'), 'WRITE_NOT_ALLOWED');
    let response;
    try {
      response = await transport(origin + path, { method: body === undefined ? 'GET' : 'POST',
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
          'Content-Type': 'application/json', ...(service === 'github' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      requireThat(response.ok && !response.redirected, 'HTTP_FAILURE');
      return await response.json();
    } catch { throw new Error(body === undefined ? 'API_READ_FAILED' : 'CREATE_OUTCOME_UNCERTAIN'); }
  };
}
const query = path => `${path}${path.includes('?') ? '&' : '?'}teamId=${policy.team}`;
export function vercelReader(api) {
  const getDeployment = async id => {
    requireThat(idOK(id), 'INVALID_DEPLOYMENT_ID');
    return api(query(`/v13/deployments/${id}`));
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
      requireThat(r.status === 'completed' && ['success', 'skipped'].includes(r.conclusion),
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
  interrupted = () => false, deadlineMs = 45 * 60 * 1000 }) {
  requireThat(enabled === 'true', 'DISABLED');
  requireThat(/^\d+$/.test(writerRunId) && writerAttempt === '1', 'WRITER_RECONCILIATION_REQUIRED');
  requireThat(idOK(approvedAliasId), 'APPROVED_ALIAS_REQUIRED');
  await checkWriterHistory(github, writerRunId, reconciledThroughRunId);
  const reader = vercelReader(vercel);
  let createStarted = false;
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
  let created; createStarted = true;
  try { created = await vercel(final.request.path, final.request.body); }
  catch {
    // Read-only reconciliation, never a second POST. A missing match is not proof of absence.
    try { await reader.listDeployments(); } catch { /* unknown remains unknown */ }
    throw new Error('CREATE_OUTCOME_UNCERTAIN_DISABLE_AND_RECONCILE');
  }
  requireThat(idOK(created?.id), 'CREATE_ID_UNKNOWN_DISABLE_AND_RECONCILE');
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
      const alias = await reader.getAlias();
      return validateFixedUrlFollow({ deployment: d, source: final.source, expectedId: id, alias });
    }
    if (clock.now() >= deadline) throw new Error('REMOTE_BUILD_STILL_RUNNING_DISABLE_AND_RECONCILE');
    await clock.sleep(5000);
  }
}

export async function execute(options) {
  try { return await executeInternal(options); }
  catch (error) {
    if (error.message === 'SAFE_NO_CREATE_SUPERSEDED') return {
      noDeploymentCreated: true, reason: 'source superseded before create',
      fixedUrlFollowConfirmed: false, functionalChecksVerified: false };
    throw error;
  }
}

async function main() {
  // Gate before opening event or accessing token environment variables.
  requireThat(process.env.STAGING_ACTIONS_ENABLED === 'true', 'DISABLED');
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; }); process.on('SIGINT', () => { stopping = true; });
  const result = await execute({ enabled: process.env.STAGING_ACTIONS_ENABLED,
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    trustedSha: process.env.TRUSTED_SHA, approvedAliasId: process.env.STAGING_APPROVED_ALIAS_ID,
    reconciledThroughRunId: process.env.STAGING_RECONCILED_THROUGH_RUN_ID || '0',
    writerRunId: process.env.GITHUB_RUN_ID, writerAttempt: process.env.GITHUB_RUN_ATTEMPT,
    github: apiClient({ service: 'github', token: process.env.GH_TOKEN }),
    vercel: apiClient({ service: 'vercel', token: process.env.VERCEL_TOKEN }), interrupted: () => stopping });
  console.log(JSON.stringify(result)); // Whitelisted result only, never API payloads.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('STAGING_STOPPED: inspect remote state before any retry; disable activation after uncertain outcomes.'); process.exitCode = 1; });
}
