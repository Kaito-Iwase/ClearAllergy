import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiReader, checkSource, checkDeployment, checkVercel, staging } from "../scripts/staging-actions.mjs";

// No HTTP calls or credentials. Responses model the documented REST contracts.
const sha = "a".repeat(40);
const trustedSha = "b".repeat(40);
function sourceFixture() {
    const repository = { id: 123, full_name: String(staging.repository) };
    const run = { id: 456, run_attempt: 2, repository, head_repository: repository,
        event: "push", head_branch: String(staging.branch), head_sha: sha,
        path: String(staging.workflow), workflow_id: 789, status: "completed", conclusion: "success" };
    const event = { action: "completed", repository, workflow_run: structuredClone(run) };
    const config = { type: "file", sha: "c".repeat(40), content: Buffer.from(JSON.stringify({
        git: { deploymentEnabled: { [staging.branch]: false } },
    })).toString("base64") };
    const data: Record<string, unknown> = {
        [`/actions/runs/${run.id}`]: run,
        "/actions/workflows/ci.yml": { id: 789, path: staging.workflow, state: "active" },
        [`/git/ref/heads/${staging.branch}`]: { object: { sha } },
        [`/branches/${encodeURIComponent(staging.branch)}`]: { protected: true },
        [`/actions/workflows/789/runs?branch=${encodeURIComponent(staging.branch)}&event=push&per_page=1`]: { workflow_runs: [run] },
        [`/contents/${staging.workflow}?ref=${sha}`]: structuredClone(config),
        [`/contents/${staging.workflow}?ref=${trustedSha}`]: structuredClone(config),
        [`/contents/vercel.json?ref=${sha}`]: structuredClone(config),
        [`/contents/vercel.json?ref=${trustedSha}`]: config,
    };
    const calls: string[] = [];
    const github = async (path: string) => {
        calls.push(path);
        const key = path.replace(`/repos/${staging.repository}`, "");
        assert.ok(key in data, `Unexpected endpoint: ${key}`);
        return data[key];
    };
    return { event, run, config, data, calls, github, trustedSha };
}

test("accepts exact successful push SHA and rereads APIs on every gate", async () => {
    const f = sourceFixture();
    assert.deepEqual(await checkSource(f), { sha, runId: "456", attempt: "2" });
    f.run.status = "in_progress"; // same run starts a new attempt during a build
    await assert.rejects(checkSource(f), /CI_NOT_ELIGIBLE/);
    assert.equal(f.calls.filter((path) => path.endsWith("/actions/runs/456")).length, 2);
});

type Source = ReturnType<typeof sourceFixture>;
const rejectSources: [string, string, (f: Source) => void][] = [
    ["PR event", "CI_NOT_ELIGIBLE", (f) => { f.run.event = "pull_request"; }],
    ["manual CI", "CI_NOT_ELIGIBLE", (f) => { f.run.event = "workflow_dispatch"; }],
    ["failed CI", "CI_NOT_ELIGIBLE", (f) => { f.run.conclusion = "failure"; }],
    ["cancelled CI", "CI_NOT_ELIGIBLE", (f) => { f.run.conclusion = "cancelled"; }],
    ["different branch", "CI_NOT_ELIGIBLE", (f) => { f.run.head_branch = "main"; }],
    ["name collision", "CI_NOT_ELIGIBLE", (f) => { f.run.path = ".github/workflows/fake.yml"; }],
    ["fork trigger", "UNTRUSTED_TRIGGER", (f) => { f.event.workflow_run.head_repository.full_name = "fork/repo"; }],
    ["repository ID mismatch", "UNTRUSTED_REPOSITORY", (f) => { f.run.head_repository = { id: 999, full_name: staging.repository }; }],
    ["rerun of old attempt", "RUN_CHANGED", (f) => { f.run.run_attempt = 3; }],
    ["short SHA", "RUN_CHANGED", (f) => { f.run.head_sha = "abc123"; }],
    ["workflow ID collision", "WORKFLOW_MISMATCH", (f) => { f.run.workflow_id = 999; }],
    ["new branch head", "SUPERSEDED_HEAD", (f) => { f.data[`/git/ref/heads/${staging.branch}`] = { object: { sha: trustedSha } }; }],
    ["unprotected source", "SOURCE_BRANCH_NOT_PROTECTED", (f) => { f.data[`/branches/${encodeURIComponent(staging.branch)}`] = { protected: false }; }],
    ["newer failed or pending run", "SUPERSEDED_RUN", (f) => { f.data[`/actions/workflows/789/runs?branch=${encodeURIComponent(staging.branch)}&event=push&per_page=1`] = { workflow_runs: [{ id: 999, conclusion: "failure" }] }; }],
    ["CI edited to skip tests", "UNREVIEWED_CONFIGURATION", (f) => { f.data[`/contents/${staging.workflow}?ref=${sha}`] = { type: "file", sha: "d".repeat(40) }; }],
    ["Vercel config drift", "UNREVIEWED_CONFIGURATION", (f) => { f.data[`/contents/vercel.json?ref=${sha}`] = { type: "file", sha: "d".repeat(40) }; }],
    ["automatic Git deployment", "GIT_DEPLOYMENT_NOT_DISABLED", (f) => { f.config.content = Buffer.from(JSON.stringify({ git: { deploymentEnabled: { [staging.branch]: false, "**": true } } })).toString("base64"); }],
    ["extra alias in candidate config", "GIT_DEPLOYMENT_NOT_DISABLED", (f) => { f.config.content = Buffer.from(JSON.stringify({ alias: ["production.invalid"], git: { deploymentEnabled: { [staging.branch]: false } } })).toString("base64"); }],
];
for (const [name, reason, change] of rejectSources) {
    test(`rejects ${name}`, async () => {
        const f = sourceFixture(); change(f);
        await assert.rejects(checkSource(f), new RegExp(reason));
    });
}

const source = { sha, runId: "456", attempt: "2" };
function deploymentFixture() {
    return { id: "dpl_New", projectId: staging.project, ownerId: staging.team,
        target: null, readyState: "READY", url: "deployment.example.vercel.app",
        meta: { clearallergyCommitSha: sha, clearallergyRunId: "456", clearallergyRunAttempt: "2" } };
}
test("REST target null explicitly means Preview; omitted target fails closed", () => {
    assert.equal(checkDeployment(deploymentFixture(), source).target, null);
    assert.throws(() => checkDeployment({ ...deploymentFixture(), target: undefined }, source), /NOT_PREVIEW/);
});
test("deployment project object is accepted when account ownership is verified separately", () => {
    const deployment = { ...deploymentFixture(), projectId: undefined, ownerId: undefined,
        project: { id: staging.project } };
    assert.equal(checkDeployment(deployment, source).id, "dpl_New");
});
for (const [name, patch, reason] of [
    ["production project", { projectId: staging.productionProject }, "WRONG_DEPLOYMENT_OWNER"],
    ["other team", { ownerId: "team_other" }, "WRONG_DEPLOYMENT_OWNER"],
    ["Production", { target: "production" }, "NOT_PREVIEW"],
    ["custom target", { customEnvironment: { id: "env_other" } }, "NOT_PREVIEW"],
    ["failed deploy", { readyState: "ERROR" }, "DEPLOYMENT_NOT_READY"],
    ["different artifact", { meta: { clearallergyCommitSha: trustedSha } }, "DEPLOYMENT_SOURCE_MISMATCH"],
] as const) {
    test(`rejects deployment with ${name}`, () => {
        assert.throws(() => checkDeployment({ ...deploymentFixture(), ...patch }, source), new RegExp(reason));
    });
}

function vercelFixture() {
    const project = { id: staging.project, accountId: staging.team, link: null as unknown,
        env: [] as { gitBranch?: string; target?: string[] }[] };
    const alias = { alias: staging.host, projectId: String(staging.project), redirect: null as string | null, deploymentId: "dpl_Old" };
    const old = { ...deploymentFixture(), id: "dpl_Old" };
    const deployment = deploymentFixture();
    const vercel = async (path: string) => {
        assert.ok(path.includes(`teamId=${staging.team}`));
        if (path.startsWith("/v9/projects/")) return project;
        if (path.startsWith("/v10/projects/")) return { envs: project.env };
        if (path.startsWith("/v4/aliases/")) return alias;
        if (path.startsWith("/v13/deployments/dpl_Old")) return old;
        if (path.startsWith("/v13/deployments/dpl_New") || path.startsWith(`/v13/deployments/${deployment.url}`)) return deployment;
        assert.fail(`Unexpected endpoint: ${path}`);
    };
    return { project, alias, old, deployment, vercel, source, deploymentUrl: `https://${deployment.url}` };
}
test("verifies old alias before publish and exact destination afterwards", async () => {
    const f = vercelFixture();
    assert.equal((await checkVercel(f)).id, "dpl_New");
    await assert.rejects(checkVercel({ ...f, requireAssigned: true }), /ALIAS_NOT_ASSIGNED/);
    f.alias.deploymentId = "dpl_New";
    await assert.rejects(checkVercel(f), /ALIAS_CHANGED_BEFORE_VERIFICATION/);
    assert.equal((await checkVercel({ ...f, requireAssigned: true })).id, "dpl_New");
});
test("staging Git link, redirects, wrong alias owner, and invalid URL stop publishing", async () => {
    const f = vercelFixture();
    f.project.link = { type: "github" };
    await assert.rejects(checkVercel(f), /DISCONNECT_STAGING_GIT_FIRST/);
    f.project.link = null; f.alias.redirect = "https://other.invalid";
    await assert.rejects(checkVercel(f), /WRONG_ALIAS/);
    f.alias.redirect = null; f.alias.projectId = staging.productionProject;
    await assert.rejects(checkVercel(f), /WRONG_ALIAS/);
    f.alias.projectId = staging.project;
    await assert.rejects(checkVercel({ ...f, deploymentUrl: "https://evil.invalid" }), /INVALID_DEPLOYMENT_URL/);
});
test("rejects Preview branch override that would differ between build and runtime", async () => {
    const f = vercelFixture();
    f.project.env = [{ gitBranch: staging.branch, target: ["preview"] }];
    await assert.rejects(checkVercel(f), /PREVIEW_BRANCH_OVERRIDE_NOT_SUPPORTED/);
    f.project.env = [{ target: ["preview"] }];
    await checkVercel(f);
});
test("API errors do not log response bodies or follow redirects", async () => {
    const reader = apiReader("https://api.invalid", "fictional-token", async (_url, options) => {
        assert.equal(options?.redirect, "error");
        return new Response("DO_NOT_LOG_SECRET", { status: 403 });
    });
    await assert.rejects(reader("/resource"), /^Error: API_READ_FAILED_403$/);
    assert.throws(() => apiReader("https://api.invalid", ""), /MISSING_API_TOKEN/);
});
test("workflow keeps deployment off by default, serializes writers, and gates alias last", () => {
    const workflow = readFileSync(".github/workflows/staging-deploy.yml", "utf8");
    assert.ok(workflow.includes("vars.STAGING_ACTIONS_ENABLED == 'true'"));
    assert.ok(workflow.includes("cancel-in-progress: false"));
    assert.ok(!workflow.includes("--prod"));
    assert.ok(!workflow.includes("githubDeployment=1"));
    assert.ok(workflow.indexOf("Reject superseded run immediately") < workflow.indexOf("vercel\" alias set"));
    const rules = JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled;
    assert.equal(rules[staging.branch], false);
    assert.equal(rules["ci/staging-actions-20261106"], false);
    assert.ok(Object.values(rules).every((value) => value === false));
});
