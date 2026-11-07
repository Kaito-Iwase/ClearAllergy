import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Reviewed on the default branch. Never read deployment policy from the candidate.
export const staging = Object.freeze({
    repository: 'Kaito-Iwase/ClearAllergy',
    branch: 'test/staging',
    workflow: '.github/workflows/ci.yml',
    team: 'team_2Y9pPeo8w16CVx1U7ToVuKFq',
    project: 'prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK',
    productionProject: 'prj_7gertmNpQ1EfYEoQ9rgFP466ahJq',
    host: 'clear-allergy-e2e-git-test-staging-kaitoexe00-9350s-projects.vercel.app',
});

function requireThat(condition, reason) {
    if (!condition) throw new Error(reason);
}

export function apiReader(base, token, fetcher = fetch) {
    requireThat(Boolean(token), 'MISSING_API_TOKEN');
    return async (path) => {
        const response = await fetcher(`${base}${path}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            redirect: 'error', signal: AbortSignal.timeout(30_000),
        });
        // Never log response bodies: they may contain credentials or user data.
        requireThat(response.ok, `API_READ_FAILED_${response.status}`);
        return response.json();
    };
}

/** Every call re-fetches current head, latest run (all conclusions), and attempt. */
export async function checkSource({ event, trustedSha, github }) {
    const trigger = event.workflow_run;
    requireThat(event.action === 'completed' && trigger
        && event.repository?.full_name === staging.repository
        && trigger.repository?.full_name === staging.repository
        && trigger.head_repository?.full_name === staging.repository
        && Number.isSafeInteger(trigger.id) && trigger.id > 0, 'UNTRUSTED_TRIGGER');
    const repo = `/repos/${staging.repository}`;
    const run = await github(`${repo}/actions/runs/${trigger.id}`);
    requireThat(run.repository?.id === event.repository.id
        && run.head_repository?.id === event.repository.id
        && run.repository?.full_name === staging.repository
        && run.head_repository?.full_name === staging.repository, 'UNTRUSTED_REPOSITORY');
    requireThat(run.event === 'push' && run.head_branch === staging.branch
        && run.path === staging.workflow && run.status === 'completed'
        && run.conclusion === 'success', 'CI_NOT_ELIGIBLE');
    requireThat(run.run_attempt === trigger.run_attempt && run.head_sha === trigger.head_sha
        && /^[0-9a-f]{40}$/.test(run.head_sha) && /^[0-9a-f]{40}$/.test(trustedSha), 'RUN_CHANGED');
    const workflow = await github(`${repo}/actions/workflows/ci.yml`);
    requireThat(workflow.id === run.workflow_id && workflow.path === staging.workflow
        && workflow.state === 'active', 'WORKFLOW_MISMATCH');
    const head = await github(`${repo}/git/ref/heads/${staging.branch}`);
    requireThat(head.object?.sha === run.head_sha, 'SUPERSEDED_HEAD');
    const branch = await github(`${repo}/branches/${encodeURIComponent(staging.branch)}`);
    requireThat(branch.protected === true, 'SOURCE_BRANCH_NOT_PROTECTED');
    const latest = await github(`${repo}/actions/workflows/${workflow.id}/runs?branch=${encodeURIComponent(staging.branch)}&event=push&per_page=1`);
    requireThat(latest.workflow_runs?.[0]?.id === run.id, 'SUPERSEDED_RUN');
    for (const path of [staging.workflow, 'vercel.json']) {
        const candidate = await github(`${repo}/contents/${path}?ref=${run.head_sha}`);
        const trusted = await github(`${repo}/contents/${path}?ref=${trustedSha}`);
        requireThat(candidate.type === 'file' && trusted.type === 'file'
            && candidate.sha === trusted.sha && /^[0-9a-f]{40}$/.test(candidate.sha), 'UNREVIEWED_CONFIGURATION');
        if (path === 'vercel.json') {
            const config = JSON.parse(Buffer.from(trusted.content, 'base64').toString('utf8'));
            const rules = config.git?.deploymentEnabled;
            requireThat(rules?.[staging.branch] === false
                && Object.values(rules).every((value) => value === false)
                && config.alias === undefined, 'GIT_DEPLOYMENT_NOT_DISABLED');
        }
    }
    return { sha: run.head_sha, runId: String(run.id), attempt: String(run.run_attempt) };
}

export function checkDeployment(deployment, source) {
    const projectId = deployment.projectId ?? deployment.project?.id;
    const ownerId = deployment.ownerId ?? deployment.team?.id;
    // checkVercel separately authenticates the project's account on every call.
    // Some API views expose project.id but omit an owner field.
    requireThat(projectId === staging.project
        && (ownerId === undefined || ownerId === staging.team), 'WRONG_DEPLOYMENT_OWNER');
    // Vercel REST v13 documents null as Preview. Missing target is rejected.
    requireThat(deployment.target === null && !deployment.customEnvironment, 'NOT_PREVIEW');
    requireThat(deployment.readyState === 'READY' && /^dpl_[A-Za-z0-9]+$/.test(deployment.id), 'DEPLOYMENT_NOT_READY');
    if (source) {
        requireThat(deployment.meta?.clearallergyCommitSha === source.sha
            && deployment.meta?.clearallergyRunId === source.runId
            && deployment.meta?.clearallergyRunAttempt === source.attempt, 'DEPLOYMENT_SOURCE_MISMATCH');
    }
    return deployment;
}

/** Read only. The CLI is the only component that creates deployments/aliases. */
export async function checkVercel({ vercel, source, deploymentUrl, requireAssigned = false }) {
    const query = `teamId=${staging.team}`;
    const project = await vercel(`/v9/projects/${staging.project}?${query}`);
    requireThat(project.id === staging.project && project.accountId === staging.team
        && project.id !== staging.productionProject, 'WRONG_PROJECT');
    // A disconnected project cannot race this workflow via main/PR Git deployments.
    requireThat(project.link === null || project.link === undefined, 'DISCONNECT_STAGING_GIT_FIRST');
    // Upload has no Git branch: build and runtime must use the same Preview defaults.
    const environment = await vercel(`/v10/projects/${staging.project}/env?${query}&decrypt=false`);
    requireThat(Array.isArray(environment.envs) && environment.envs.every((entry) =>
        entry.gitBranch !== staging.branch), 'PREVIEW_BRANCH_OVERRIDE_NOT_SUPPORTED');
    const alias = await vercel(`/v4/aliases/${staging.host}?${query}&projectId=${staging.project}`);
    requireThat(alias.alias === staging.host && alias.projectId === staging.project
        && alias.redirect === null && /^dpl_[A-Za-z0-9]+$/.test(alias.deploymentId), 'WRONG_ALIAS');
    const current = checkDeployment(await vercel(`/v13/deployments/${alias.deploymentId}?${query}`));
    if (!deploymentUrl) return current;
    const url = new URL(deploymentUrl);
    requireThat(url.protocol === 'https:' && url.origin === deploymentUrl
        && !url.username && !url.password && url.hostname.endsWith('.vercel.app')
        && url.hostname !== staging.host, 'INVALID_DEPLOYMENT_URL');
    const deployed = checkDeployment(await vercel(`/v13/deployments/${url.hostname}?${query}`), source);
    requireThat(deployed.url === url.hostname, 'DEPLOYMENT_URL_MISMATCH');
    if (requireAssigned) requireThat(current.id === deployed.id, 'ALIAS_NOT_ASSIGNED');
    else requireThat(current.id !== deployed.id, 'ALIAS_CHANGED_BEFORE_VERIFICATION');
    return deployed;
}

async function main() {
    const mode = process.argv[2];
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (mode === 'source') {
        const source = await checkSource({ event, trustedSha: process.env.TRUSTED_SHA,
            github: apiReader('https://api.github.com', process.env.GH_TOKEN) });
        appendFileSync(process.env.GITHUB_OUTPUT,
            `sha=${source.sha}\nrunId=${source.runId}\nattempt=${source.attempt}\n`);
    } else if (['preflight', 'deployment', 'alias'].includes(mode)) {
        await checkVercel({ vercel: apiReader('https://api.vercel.com', process.env.VERCEL_TOKEN),
            deploymentUrl: mode === 'preflight' ? undefined : readFileSync(process.env.DEPLOYMENT_URL_FILE, 'utf8').trim(),
            source: { sha: process.env.SOURCE_SHA, runId: process.env.SOURCE_RUN_ID, attempt: process.env.SOURCE_ATTEMPT },
            requireAssigned: mode === 'alias' });
    } else throw new Error('INVALID_MODE');
    console.log(`staging ${mode}: PASS`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        // Unexpected errors may contain URLs/response data. Emit only known codes.
        console.error(/^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'STAGING_CHECK_FAILED');
        process.exitCode = 1;
    });
}
