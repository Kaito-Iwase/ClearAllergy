// Extracted unchanged staging constants, requireThat, and checkSource from PR #132.
// No network adapter or CLI is included; caller supplies an in-memory reader.
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
    requireThat(run.id === trigger.id, 'RUN_ID_MISMATCH');
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
