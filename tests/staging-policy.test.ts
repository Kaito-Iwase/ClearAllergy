import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { evaluateStagingPolicy, type StagingPolicy, type StagingEvidence } from "../scripts/staging-policy";

// All IDs, hosts and SHAs below are fictional; these are not service attestations.
function fixture(): { policy: StagingPolicy; evidence: StagingEvidence } {
    const repository = { id: 101, fullName: "fictional/clearallergy" };
    const headSha = "a".repeat(40);
    const workflowFileSha = "b".repeat(40);
    const policy: StagingPolicy = {
        version: 1, repository, branch: "test/staging", workflowId: 202,
        workflowPath: ".github/workflows/ci.yml", workflowFileSha,
        githubEnvironment: "staging", teamId: "team_fixture", stagingProjectId: "prj_stagingFixture",
        productionProjectId: "prj_productionFixture", stagingUrl: "https://staging.example.invalid",
        productionUrls: ["https://production.example.invalid"],
    };
    return { policy, evidence: {
        run: { id: 303, attempt: 1, repository, headRepository: repository,
            workflowId: 202, workflowPath: policy.workflowPath, workflowFileSha,
            event: "push", status: "completed", conclusion: "success", headBranch: policy.branch, headSha },
        latestRun: { id: 303, attempt: 1, repository, workflowId: 202, headBranch: policy.branch, headSha },
        currentHeadSha: headSha, candidateSha: headSha, checkedOutSha: headSha,
        githubEnvironment: { name: "staging", branch: policy.branch, protectionVerified: true },
        target: { teamId: policy.teamId, projectId: policy.stagingProjectId, environment: "preview",
            url: policy.stagingUrl, aliases: [policy.stagingUrl] },
        alias: { teamId: policy.teamId, projectId: policy.stagingProjectId, url: policy.stagingUrl,
            deploymentId: "dpl_fixtureOld", redirect: null },
        aliasDestination: { id: "dpl_fixtureOld", teamId: policy.teamId, projectId: policy.stagingProjectId,
            environment: "preview", branch: policy.branch, state: "READY" },
    } };
}

test("matching fictional evidence is eligible only for dry-run; evaluation leaves inputs intact", () => {
    const f = fixture();
    const before = JSON.stringify(f);
    assert.deepEqual(evaluateStagingPolicy(f.policy, f.evidence), {
        mode: "dry-run", eligible: true, deploymentAllowed: false, reasons: [],
    });
    assert.equal(JSON.stringify(f), before);
});

type Fixture = ReturnType<typeof fixture>;
const denials: [string, string, (f: Fixture) => void][] = [
    ["failed CI", "CI_NOT_SUCCESSFUL", ({ evidence: e }) => { e.run.conclusion = "failure"; }],
    ["cancelled CI", "CI_NOT_SUCCESSFUL", ({ evidence: e }) => { e.run.conclusion = "cancelled"; }],
    ["skipped CI", "CI_NOT_SUCCESSFUL", ({ evidence: e }) => { e.run.conclusion = "skipped"; }],
    ["in-progress run", "CI_NOT_SUCCESSFUL", ({ evidence: e }) => { e.run.status = "in_progress"; }],
    ["missing conclusion", "CI_NOT_SUCCESSFUL", ({ evidence: e }) => { e.run.conclusion = null; }],
    ["PR merge SHA even if candidate matches", "UNTRUSTED_EVENT", ({ evidence: e }) => { e.run.event = "pull_request"; }],
    ["pull_request_target", "UNTRUSTED_EVENT", ({ evidence: e }) => { e.run.event = "pull_request_target"; }],
    ["manual dispatch", "UNTRUSTED_EVENT", ({ evidence: e }) => { e.run.event = "workflow_dispatch"; }],
    ["fork with same repo name", "UNTRUSTED_REPOSITORY", ({ evidence: e }) => { e.run.headRepository = { ...e.run.headRepository, id: 999 }; }],
    ["different head repo name", "UNTRUSTED_REPOSITORY", ({ evidence: e }) => { e.run.headRepository = { ...e.run.headRepository, fullName: "attacker/clearallergy" }; }],
    ["different run repository", "UNTRUSTED_REPOSITORY", ({ evidence: e }) => { e.run.repository = { ...e.run.repository, id: 999 }; }],
    ["wrong branch", "BRANCH_MISMATCH", ({ evidence: e }) => { e.run.headBranch = "main"; }],
    ["workflow named CI at another path", "WORKFLOW_MISMATCH", ({ evidence: e }) => { e.run.workflowPath = ".github/workflows/other.yml"; }],
    ["same path different workflow ID", "WORKFLOW_MISMATCH", ({ evidence: e }) => { e.run.workflowId++; }],
    ["changed CI definition", "WORKFLOW_MISMATCH", ({ evidence: e }) => { e.run.workflowFileSha = "c".repeat(40); }],
    ["branch advanced after old successful run", "COMMIT_MISMATCH", ({ evidence: e }) => { e.currentHeadSha = "c".repeat(40); }],
    ["PR head selected instead of tested merge SHA", "COMMIT_MISMATCH", ({ evidence: e }) => { e.candidateSha = "c".repeat(40); }],
    ["checkout followed a moving ref", "COMMIT_MISMATCH", ({ evidence: e }) => { e.checkedOutSha = "c".repeat(40); }],
    ["newer run at same SHA", "SUPERSEDED_RUN", ({ evidence: e }) => { e.latestRun.id++; }],
    ["rerun supersedes successful attempt", "SUPERSEDED_RUN", ({ evidence: e }) => { e.latestRun.attempt++; }],
    ["latest run belongs to another workflow", "WORKFLOW_MISMATCH", ({ evidence: e }) => { e.latestRun.workflowId++; }],
    ["latest run belongs to another repo", "UNTRUSTED_REPOSITORY", ({ evidence: e }) => { e.latestRun.repository = { ...e.latestRun.repository, id: 999 }; }],
    ["latest run belongs to another branch", "BRANCH_MISMATCH", ({ evidence: e }) => { e.latestRun.headBranch = "main"; }],
    ["latest run tests another SHA", "COMMIT_MISMATCH", ({ evidence: e }) => { e.latestRun.headSha = "c".repeat(40); }],
    ["unverified environment protection", "ENVIRONMENT_NOT_VERIFIED", ({ evidence: e }) => { e.githubEnvironment.protectionVerified = false; }],
    ["empty environment", "ENVIRONMENT_NOT_VERIFIED", ({ evidence: e }) => { e.githubEnvironment.name = ""; }],
    ["production GitHub environment", "ENVIRONMENT_NOT_VERIFIED", ({ evidence: e }) => { e.githubEnvironment.name = "production"; }],
    ["environment allows different branch", "ENVIRONMENT_NOT_VERIFIED", ({ evidence: e }) => { e.githubEnvironment.branch = "main"; }],
    ["staging is production project", "PRODUCTION_PROJECT_COLLISION", ({ policy: p }) => { p.productionProjectId = p.stagingProjectId; }],
    ["staging is production URL", "PRODUCTION_URL_COLLISION", ({ policy: p }) => { p.productionUrls.push(p.stagingUrl); }],
    ["target is production project", "TARGET_MISMATCH", ({ policy: p, evidence: e }) => { e.target.projectId = p.productionProjectId; }],
    ["wrong team", "TARGET_MISMATCH", ({ evidence: e }) => { e.target.teamId = "team_other"; }],
    ["production Vercel target", "TARGET_NOT_PREVIEW", ({ evidence: e }) => { e.target.environment = "production"; }],
    ["unspecified Vercel target", "TARGET_NOT_PREVIEW", ({ evidence: e }) => { e.target.environment = ""; }],
    ["unexpected URL", "UNEXPECTED_URL_OR_ALIAS", ({ evidence: e }) => { e.target.url = "https://other.example.invalid"; }],
    ["extra alias", "UNEXPECTED_URL_OR_ALIAS", ({ evidence: e }) => { e.target.aliases.push("https://other.example.invalid"); }],
    ["missing alias", "UNEXPECTED_URL_OR_ALIAS", ({ evidence: e }) => { e.target.aliases = []; }],
    ["duplicate alias", "UNEXPECTED_URL_OR_ALIAS", ({ evidence: e }) => { e.target.aliases.push(e.target.url); }],
    ["alias owned by production", "ALIAS_MISMATCH", ({ policy: p, evidence: e }) => { e.alias.projectId = p.productionProjectId; }],
    ["alias under another team", "ALIAS_MISMATCH", ({ evidence: e }) => { e.alias.teamId = "team_other"; }],
    ["alias name mismatch", "ALIAS_MISMATCH", ({ evidence: e }) => { e.alias.url = "https://other.example.invalid"; }],
    ["alias redirects", "ALIAS_MISMATCH", ({ evidence: e }) => { e.alias.redirect = "https://other.example.invalid"; }],
    ["alias destination changed", "ALIAS_DESTINATION_MISMATCH", ({ evidence: e }) => { e.aliasDestination.id = "dpl_other"; }],
    ["alias destination in production project", "ALIAS_DESTINATION_MISMATCH", ({ policy: p, evidence: e }) => { e.aliasDestination.projectId = p.productionProjectId; }],
    ["alias destination under another team", "ALIAS_DESTINATION_MISMATCH", ({ evidence: e }) => { e.aliasDestination.teamId = "team_other"; }],
    ["alias destination is production", "ALIAS_DESTINATION_MISMATCH", ({ evidence: e }) => { e.aliasDestination.environment = "production"; }],
    ["alias destination branch is main", "ALIAS_DESTINATION_MISMATCH", ({ evidence: e }) => { e.aliasDestination.branch = "main"; }],
    ["alias destination not ready", "ALIAS_DESTINATION_MISMATCH", ({ evidence: e }) => { e.aliasDestination.state = "BUILDING"; }],
];
for (const [name, reason, change] of denials) {
    test(`deny ${name}`, () => {
        const f = fixture();
        change(f);
        const result = evaluateStagingPolicy(f.policy, f.evidence);
        assert.equal(result.eligible, false);
        assert.equal(result.deploymentAllowed, false);
        assert.ok(result.reasons.includes(reason), JSON.stringify(result));
    });
}

test("empty, malformed and unknown configuration or evidence fails closed", () => {
    const { policy, evidence } = fixture();
    for (const input of [null, {}, [], "", { ...policy, workflowId: null }, { ...policy, teamId: "" },
        { ...policy, productionUrls: [] }, { ...policy, workflowFileSha: "" }, { ...policy, enabled: true }]) {
        assert.deepEqual(evaluateStagingPolicy(input, evidence).reasons, ["INVALID_POLICY"]);
    }
    for (const input of [null, {}, [], { ...evidence, githubEnvironment: undefined },
        { ...evidence, candidateSha: "main" }, { ...evidence, token: "never-echo-this" }]) {
        assert.deepEqual(evaluateStagingPolicy(policy, input).reasons, ["INVALID_EVIDENCE"]);
    }
    for (const url of ["http://staging.example.invalid", "https://staging.example.invalid/", "https://user:pass@staging.example.invalid", "https://staging.example.invalid?x=1", "https://staging.example.invalid/#x"]) {
        assert.deepEqual(evaluateStagingPolicy({ ...policy, stagingUrl: url }, evidence).reasons, ["INVALID_POLICY"]);
    }
});

test("CLI reports eligible/blocked/invalid input without echoing secrets or enabling deployment", () => {
    const dir = mkdtempSync(join(tmpdir(), "clearallergy-staging-policy-"));
    const policyPath = join(dir, "policy.json");
    const evidencePath = join(dir, "evidence.json");
    const { policy, evidence } = fixture();
    const invoke = (args = ["--policy", policyPath, "--evidence", evidencePath]) => spawnSync(process.execPath,
        ["--import", "tsx", "scripts/staging-dry-run.ts", ...args], { cwd: process.cwd(), encoding: "utf8" });
    try {
        writeFileSync(policyPath, JSON.stringify(policy), "utf8");
        writeFileSync(evidencePath, JSON.stringify(evidence), "utf8");
        const success = invoke();
        assert.equal(success.status, 0, success.stderr);
        assert.equal(JSON.parse(success.stdout).deploymentAllowed, false);
        writeFileSync(policyPath, "{}", "utf8");
        assert.equal(invoke().status, 1);
        writeFileSync(policyPath, "secret-not-valid-json", "utf8");
        const malformed = invoke();
        assert.equal(malformed.status, 2);
        assert.ok(!malformed.stdout.includes("secret-not-valid-json"));
        writeFileSync(policyPath, "x".repeat(256 * 1024 + 1), "utf8");
        assert.equal(invoke().status, 2);
        assert.equal(invoke(["--deploy"]).status, 2);
        assert.equal(invoke(["--policy", join(dir, "missing"), "--evidence", evidencePath]).status, 2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
