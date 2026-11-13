import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { closeSync, existsSync, linkSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { assessIssueCompletion, assessQueue, assessmentFromComments, beginReport, definitionHash, prepareReportPath, protectedArea, publishReport, verificationCommands } from "../scripts/agent-harness.mjs";
import { formatHarnessSummary } from "../scripts/agent-harness-output.mjs";

const now = Date.parse("2026-10-04T04:00:00Z");
const baseSha = "a".repeat(40);
function ready(number = 1, priority = "correctness") {
    const issue = { number, title: "Explicit regression", body: "Existing behaviour only", state: "OPEN", labels: ["agent-ready"], assignees: [], assessment: {} };
    issue.assessment = { author: "Kaito-Iwase", url: "https://github.com/Kaito-Iwase/ClearAllergy/issues/1#issuecomment-1", data: {
        state: "ready", definitionHash: definitionHash(issue), baseSha, assessedAt: new Date(now).toISOString(), priority, risk: "low",
        problem: "Regression", cause: "Default handling", decision: "Local repair", evidence: ["code location"], candidateSolutions: ["preserve", "repair"],
        acceptanceCriteria: ["reject invalid input"], paths: ["components/example.tsx"], verificationPlan: ["regression and full gates"],
        productDecisionRequired: false, approvalRequired: false, implementationAllowed: true, environmentReady: true, blocker: null, dependencies: [] } };
    return issue;
}
function snapshot(issues = [ready()]) {
    return { version: 1, repository: "Kaito-Iwase/ClearAllergy", actorLogin: "Kaito-Iwase", baseSha, fetchedAt: new Date(now).toISOString(), issues, pullRequests: [] as { number: number; state: string; linkedIssues: number[]; changedFiles: string[] }[] };
}

function completionSnapshot(timestamp = now) {
    const repository = "Kaito-Iwase/ClearAllergy";
    const repositoryUrl = `https://github.com/${repository}`;
    type RelatedIssue = { number: number; state: string; stateReason?: string };
    const issue = { number: 7, title: "Public menu fix", body: "Verify both environments", state: "OPEN",
        labels: [] as string[], assignees: [] as string[], subIssues: [] as RelatedIssue[], dependencies: [] as RelatedIssue[] };
    const fetchedAt = new Date(timestamp).toISOString();
    const targets = [
        { number: 10, baseRef: "main", target: "production", headSha: "b".repeat(40), mergeSha: "c".repeat(40) },
        { number: 11, baseRef: "test/staging", target: "staging", headSha: "d".repeat(40), mergeSha: "e".repeat(40) },
    ];
    const pullRequests = targets.map(({ number, baseRef, target, headSha, mergeSha }) => ({
        number, baseRef, headSha, mergeSha, mergedAt: new Date(timestamp - 60_000).toISOString(),
        state: "MERGED", linkedIssues: [issue.number],
        ci: { status: "PASS", event: "push", commitSha: mergeSha, branch: baseRef, runAttempt: 1,
            startedAt: new Date(timestamp - 55_000).toISOString(), completedAt: new Date(timestamp - 35_000).toISOString(),
            workflowPath: ".github/workflows/ci.yml", url: `${repositoryUrl}/actions/runs/${number}` },
        deployments: [{ target, state: "READY", active: true, commitSha: mergeSha, url: `https://vercel.com/project/deployment-${number}`,
            readyAt: new Date(timestamp - 30_000).toISOString(),
            verification: { status: "PASS", commitSha: mergeSha, observedAt: fetchedAt,
                url: `https://${target}.example.org/shops/demo`, summary: "Opened the menu and checked the card." } }],
    }));
    const acceptanceCriteria = ["Show the registered allergen states", "Keep existing API fields"];
    const acceptancePlan = acceptanceCriteria.map((criterion, i) => ({
        criterion, pullRequest: targets[i].number, target: targets[i].target as string | null,
    }));
    const assessment = { author: "Kaito-Iwase", url: `${repositoryUrl}/issues/7#issuecomment-51`, data: {
        state: "awaiting-review", definitionHash: definitionHash(issue), productDecisionRequired: false, approvalRequired: false,
        blocker: null, dependencies: [] as number[], acceptanceCriteria, completion: {
            pullRequests: targets.map(({ number, baseRef, target, headSha }) => ({ number, baseRef, headSha,
                deployments: [{ target, origin: `https://${target}.example.org` }] })),
            acceptance: acceptancePlan,
        },
    } };
    return { version: 1, repository, actorLogin: "Kaito-Iwase", fetchedAt, issue: { ...issue, assessment }, pullRequests,
        acceptance: acceptancePlan.map((scope, i) => ({ ...scope, commitSha: targets[i].mergeSha, status: "PASS",
            deploymentUrl: pullRequests[i].deployments[0].url, observedAt: fetchedAt,
            url: `${repositoryUrl}/issues/7#issuecomment-52`, summary: "Observed the expected behavior." })) };
}

test("post-merge evidence for all required environments and criteria prepares a close proposal", () => {
    const result = assessIssueCompletion(completionSnapshot(), now);
    assert.equal(result.readyToClose, true);
    assert.equal(result.evidence?.pullRequests.length, 2);
    assert.equal(result.evidence?.acceptance.length, 2);
    assert.match(result.completionKey ?? "", /^[a-f0-9]{64}$/);
    const retry = completionSnapshot();
    retry.fetchedAt = new Date(now + 10_000).toISOString();
    assert.equal(assessIssueCompletion(retry, now + 10_000).completionKey, result.completionKey);
    retry.acceptance[0].url += "-replacement";
    const newProof = assessIssueCompletion(retry, now + 10_000);
    assert.equal(newProof.readyToClose, true);
    assert.notEqual(newProof.completionKey, result.completionKey);
    retry.pullRequests[0].ci.runAttempt = 2;
    const rerun = assessIssueCompletion(retry, now + 10_000);
    assert.equal(rerun.readyToClose, true);
    assert.notEqual(rerun.completionKey, newProof.completionKey);
    retry.pullRequests[0].deployments[0].url = "https://vercel.com/project/redeployment";
    assert.equal(assessIssueCompletion(retry, now + 10_000).readyToClose, false);
    retry.acceptance[0].deploymentUrl = retry.pullRequests[0].deployments[0].url;
    assert.notEqual(assessIssueCompletion(retry, now + 10_000).completionKey, rerun.completionKey);
});

test("CI must pass for the merge SHA, target branch and required workflow", () => {
    for (const fields of [{ event: "pull_request" }, { commitSha: "b".repeat(40) }, { branch: "other" },
        { workflowPath: ".github/workflows/other.yml" }, { status: "FAIL" }, { runAttempt: 0 },
        { startedAt: new Date(now - 65_000).toISOString() }, { completedAt: new Date(now + 1).toISOString() }]) {
        const data = completionSnapshot();
        Object.assign(data.pullRequests[0].ci, fields);
        const result = assessIssueCompletion(data, now);
        assert.equal(result.readyToClose, false);
        assert.match(result.blockers.join(), /successful CI for its merge commit/);
        assert.equal(result.evidence, null);
        assert.equal(result.completionKey, null);
    }
});

test("an open, unrelated or changed PR blocks closure", () => {
    for (const fields of [{ state: "OPEN" }, { linkedIssues: [8] }, { headSha: "f".repeat(40) }, { baseRef: "other" }]) {
        const data = completionSnapshot();
        Object.assign(data.pullRequests[0], fields);
        assert.equal(assessIssueCompletion(data, now).readyToClose, false);
    }
    const data = completionSnapshot();
    data.pullRequests.push({ ...data.pullRequests[0], number: 20, state: "OPEN" });
    assert.match(assessIssueCompletion(data, now).blockers.join(), /linked PR still open/);
});

test("deploy readiness alone, outdated live mapping and missing post-deploy checks block closure", () => {
    for (const fields of [{ active: false }, { state: "BUILDING" }, { commitSha: "f".repeat(40) }]) {
        const data = completionSnapshot();
        Object.assign(data.pullRequests[1].deployments[0], fields);
        assert.match(assessIssueCompletion(data, now).blockers.join(), /deployment and verification for staging/);
    }
    const data = completionSnapshot();
    const observation = data.pullRequests[1].deployments[0].verification;
    const correctUrl = observation.url;
    observation.url = data.pullRequests[0].deployments[0].verification.url;
    assert.equal(assessIssueCompletion(data, now).readyToClose, false);
    observation.url = correctUrl;
    observation.observedAt = new Date(now - 45_000).toISOString();
    assert.equal(assessIssueCompletion(data, now).readyToClose, false);
    observation.observedAt = new Date(now - 120_000).toISOString();
    assert.equal(assessIssueCompletion(data, now).readyToClose, false);
    observation.observedAt = data.fetchedAt;
    observation.status = "UNVERIFIED";
    assert.equal(assessIssueCompletion(data, now).readyToClose, false);
    data.pullRequests[1].deployments = [];
    assert.equal(assessIssueCompletion(data, now).readyToClose, false);
});

test("a newer active deployment needs ancestry and new app verification on that SHA", () => {
    const data = completionSnapshot();
    const pull = data.pullRequests[0];
    const deployment = pull.deployments[0];
    deployment.commitSha = "f".repeat(40);
    Object.assign(deployment, { comparison: { status: "ahead", url: `https://github.com/${data.repository}/compare/${pull.mergeSha}...${deployment.commitSha}` } });
    assert.equal(assessIssueCompletion(data, now).readyToClose, false);
    deployment.verification.commitSha = deployment.commitSha;
    assert.equal(assessIssueCompletion(data, now).readyToClose, false);
    data.acceptance[0].commitSha = deployment.commitSha;
    assert.equal(assessIssueCompletion(data, now).readyToClose, true);
});

test("the same fixed origin cannot have conflicting live deployments", () => {
    const data = completionSnapshot();
    const stagingPlan = data.issue.assessment.data.completion.pullRequests[1];
    stagingPlan.deployments[0].origin = data.issue.assessment.data.completion.pullRequests[0].deployments[0].origin;
    data.pullRequests[1].deployments[0].verification.url = data.pullRequests[0].deployments[0].verification.url;
    assert.match(assessIssueCompletion(data, now).blockers.join(), /conflicting active deployments/);
});

test("a CI run or a deployment URL cannot identify different commits", () => {
    const data = completionSnapshot();
    const [production, staging] = data.pullRequests;
    staging.ci.url = production.ci.url;
    staging.deployments[0].url = production.deployments[0].url;
    data.acceptance[1].deploymentUrl = staging.deployments[0].url;
    const result = assessIssueCompletion(data, now);
    assert.equal(result.readyToClose, false);
    assert.match(result.blockers.join(), /same CI run/);
    assert.match(result.blockers.join(), /same deployment/);
});

test("an acceptance criterion planned for two environments requires both results", () => {
    const data = completionSnapshot();
    const scope = { ...data.acceptance[1], criterion: data.acceptance[0].criterion };
    data.issue.assessment.data.completion.acceptance.push({
        criterion: scope.criterion, pullRequest: scope.pullRequest, target: scope.target,
    });
    assert.equal(assessIssueCompletion(data, now).readyToClose, false);
    data.acceptance.push(scope);
    assert.equal(assessIssueCompletion(data, now).readyToClose, true);
});

test("documented no-deploy changes can close after merge CI and acceptance verification", () => {
    const data = completionSnapshot();
    const plan = data.issue.assessment.data.completion.pullRequests[0];
    plan.deployments = [];
    assert.match(assessIssueCompletion(data, now).blockers.join(), /trusted completion plan/);
    Object.assign(plan, { noDeploymentReason: "Documentation only" });
    data.pullRequests[0].deployments = [];
    data.issue.assessment.data.completion.acceptance[0].target = null;
    data.acceptance[0].target = null;
    assert.equal(assessIssueCompletion(data, now).readyToClose, true);
});

test("incomplete acceptance, stale issue state and unresolved decisions cannot close", () => {
    for (const [index, change] of [
        (data: ReturnType<typeof completionSnapshot>) => { data.acceptance.pop(); },
        (data: ReturnType<typeof completionSnapshot>) => { data.acceptance[1].criterion = data.acceptance[0].criterion; },
        (data: ReturnType<typeof completionSnapshot>) => { data.acceptance[0].commitSha = "a".repeat(40); },
        (data: ReturnType<typeof completionSnapshot>) => { data.acceptance[1].commitSha = data.pullRequests[0].mergeSha; },
        (data: ReturnType<typeof completionSnapshot>) => { data.acceptance[1].observedAt = new Date(now - 45_000).toISOString(); },
        (data: ReturnType<typeof completionSnapshot>) => { data.acceptance[0].url += "?token=hidden"; },
        (data: ReturnType<typeof completionSnapshot>) => { data.issue.body += " Changed requirement."; },
        (data: ReturnType<typeof completionSnapshot>) => { data.issue.assessment.author = "someone-else"; },
        (data: ReturnType<typeof completionSnapshot>) => { data.issue.labels.push("human-review"); },
        (data: ReturnType<typeof completionSnapshot>) => { data.issue.subIssues.push({ number: 9, state: "OPEN" }); },
        (data: ReturnType<typeof completionSnapshot>) => { data.issue.dependencies.push({ number: 9, state: "OPEN" }); },
        (data: ReturnType<typeof completionSnapshot>) => { data.issue.assessment.data.dependencies.push(9); },
        (data: ReturnType<typeof completionSnapshot>) => { data.issue.state = "CLOSED"; },
    ].entries()) {
        const data = completionSnapshot();
        change(data);
        assert.equal(assessIssueCompletion(data, now).readyToClose, false, `variant ${index + 1}`);
    }
    assert.throws(() => assessIssueCompletion(completionSnapshot(), now + 16 * 60_000), /stale completion snapshot/);
});

test("closed related issues must be completed, not abandoned or unresolved as a duplicate", () => {
    for (const relation of ["subIssues", "dependencies"] as const) {
        const data = completionSnapshot();
        if (relation === "dependencies") data.issue.assessment.data.dependencies.push(9);
        const item = { number: 9, state: "CLOSED", stateReason: "not_planned" };
        data.issue[relation].push(item);
        for (const stateReason of ["not_planned", "duplicate", "unknown"]) {
            item.stateReason = stateReason;
            assert.equal(assessIssueCompletion(data, now).readyToClose, false);
        }
        item.stateReason = "completed";
        assert.equal(assessIssueCompletion(data, now).readyToClose, true);
    }
});

test("completion CLI reports ready, blocked and malformed snapshots with the right exit code", () => {
    const directory = mkdtempSync(join(tmpdir(), "clearallergy-completion-"));
    const file = join(directory, "snapshot.json");
    const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/agent-harness.mjs", "completion", "--snapshot", file, ...args], { encoding: "utf8" });
    try {
        const data = completionSnapshot(Date.now());
        writeFileSync(file, JSON.stringify(data));
        const ready = run();
        assert.equal(ready.status, 0, ready.stderr);
        assert.equal(JSON.parse(ready.stdout).readyToClose, true);
        assert.equal(run("--format", "json").stdout, ready.stdout);
        const summary = run("--format", "summary");
        assert.equal(summary.status, ready.status);
        assert.match(summary.stdout, /完了処理の候補（close未実行）/);

        data.issue.dependencies.push({ number: 9, state: "OPEN" });
        writeFileSync(file, JSON.stringify(data));
        const blocked = run();
        assert.equal(blocked.status, 1);
        assert.equal(JSON.parse(blocked.stdout).readyToClose, false);
        const blockedSummary = run("--format", "summary");
        assert.equal(blockedSummary.status, blocked.status);
        assert.match(blockedSummary.stdout, /子Issueまたは依存Issueが未解決/);

        writeFileSync(file, "{}");
        const invalid = run();
        assert.equal(invalid.status, 1);
        assert.match(invalid.stderr, /Invalid or stale completion snapshot/);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("queue CLI preserves default JSON and exposes a separate human summary", () => {
    const directory = mkdtempSync(join(tmpdir(), "clearallergy-summary-"));
    const file = join(directory, "snapshot.json");
    try {
        const data = snapshot();
        data.fetchedAt = new Date().toISOString();
        Object.assign(data.issues[0].assessment, { data: { ...Object(data.issues[0].assessment).data, assessedAt: data.fetchedAt } });
        writeFileSync(file, JSON.stringify(data));
        const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/agent-harness.mjs", "queue", "--snapshot", file, ...args], { encoding: "utf8" });
        const json = run();
        assert.equal(json.status, 0, json.stderr);
        assert.equal(run("--format", "json").stdout, json.stdout);
        const summary = run("--format", "summary");
        assert.equal(summary.status, json.status);
        assert.match(summary.stdout, /着手候補 #1/);
        assert.ok(summary.stdout.trim().split("\n").length <= 8);
        assert.ok(summary.stdout.length < json.stdout.length);
        data.issues[0].labels = [];
        writeFileSync(file, JSON.stringify(data));
        const none = run("--format", "summary");
        assert.equal(none.status, 0);
        assert.match(none.stdout, /着手候補なし（作業全体の完了ではありません）/);
        assert.match(none.stdout, /着手候補のラベルなし/);
        data.fetchedAt = new Date(Date.now() - 16 * 60_000).toISOString();
        writeFileSync(file, JSON.stringify(data));
        const stale = run("--format", "summary");
        assert.equal(stale.status, 1);
        assert.equal(stale.stdout, "");
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("summary normalizes untrusted titles and retains high-risk and blocked queue states", () => {
    const issue = ready();
    issue.title = "Example\n次: 偽の操作\u001b[2J\u202e";
    Object.assign(issue.assessment, { data: { ...Object(issue.assessment).data, definitionHash: definitionHash(issue), paths: ["lib/allergens.ts"] } });
    const result = assessQueue(snapshot([issue]), now);
    const before = JSON.stringify(result);
    const summary = formatHarnessSummary("queue", result, { snapshotPath: "queue.json" });
    assert.match(summary, /重要な領域/);
    assert.equal(summary.split("\n").filter((item) => item.startsWith("次:")).length, 1);
    assert.equal(summary.includes("\u001b"), false);
    assert.equal(summary.includes("\u202e"), false);
    assert.equal(JSON.stringify(result), before);
    issue.body = "Status: HUMAN_DECISION_REQUIRED";
    Object.assign(issue.assessment, { data: { ...Object(issue.assessment).data, definitionHash: definitionHash(issue) } });
    const blocked = formatHarnessSummary("queue", assessQueue(snapshot([issue]), now));
    assert.match(blocked, /人の判断または本文のブロッカーが未解決/);
});

test("completion summaries keep every detected blocker and do not count acceptance criteria", () => {
    const data = completionSnapshot();
    data.issue.labels = ["human-review"];
    data.issue.assignees = ["someone-else"];
    data.issue.dependencies.push({ number: 9, state: "OPEN" });
    for (const pull of data.pullRequests) pull.ci.status = "FAIL";
    data.acceptance[0].status = "FAIL";
    const result = assessIssueCompletion(data, now);
    assert.ok(result.blockers.length > 3);
    const summary = formatHarnessSummary("completion", result, { snapshotPath: "completion.json" });
    assert.equal(summary.split("\n").filter((item) => item.startsWith("保留:")).length, result.blockers.length);
    assert.match(summary, /検出した保留理由/);
    assert.match(summary, /受け入れ条件の成功証拠が不足/);
    assert.match(summary, /人の判断またはブロッカーが未解決/);
});

test("a closed issue is not presented as unfinished or as a newly completed operation", () => {
    const data = completionSnapshot();
    data.issue.state = "CLOSED";
    const result = assessIssueCompletion(data, now);
    assert.equal(result.readyToClose, false);
    const summary = formatHarnessSummary("completion", result);
    assert.match(summary, /既にCLOSED（今回のclose操作なし）/);
    assert.match(summary, /既存の完了記録と理由を確認/);
    assert.doesNotMatch(summary, /完了判定を保留|完了処理の候補/);
});

test("a missing completion plan remains unassessed, not a single missing criterion", () => {
    const data = completionSnapshot();
    data.issue.assessment.author = "someone-else";
    const summary = formatHarnessSummary("completion", assessIssueCompletion(data, now));
    assert.match(summary, /残り条件も未判定/);
});

function verificationResult() {
    return { status: "PASS", diffCheck: "PASS", candidateUnchanged: true, publicationSafe: true,
        runtime: { matches: true, actualNode: "22.23.5", expectedNode: "22.23.5" },
        commands: ["lint", "typecheck", "test", "build"].map((name) => ({ name, status: "PASS", exitCode: 0,
            counts: name === "test" ? { tests: 42, pass: 42, fail: 0, skipped: 0, cancelled: 0, todo: 0 } : {} })) };
}
const summaryOptions = { plannedCommands: ["lint", "typecheck", "test", "build"], reportPath: ".agent-runs/result.json" };

test("successful verification stays local and test counts are actual observations", () => {
    const result = verificationResult();
    const summary = formatHarnessSummary("verify", result, summaryOptions);
    assert.match(summary, /ローカル検証 PASS/);
    assert.match(summary, /42件 \/ 成功 42/);
    assert.match(summary, /範囲外: 実DB・ブラウザ/);
    assert.ok(summary.split("\n").length <= 8);
    result.commands[2].counts = {};
    assert.match(formatHarnessSummary("verify", result, summaryOptions), /テスト: 未確認件/);
});

test("verification summaries expose failures outside commands and suppress unsafe evidence paths", () => {
    const result = verificationResult();
    Object.assign(result, { status: "FAIL", diffCheck: "FAIL", candidateUnchanged: false, publicationSafe: false });
    result.runtime.matches = false;
    result.runtime.actualNode = "22.15.1";
    const summary = formatHarnessSummary("verify", result, summaryOptions);
    assert.match(summary, /ローカル検証 FAIL/);
    assert.match(summary, /差分検査/);
    assert.match(summary, /ファイル・HEADの同一性/);
    assert.match(summary, /保存パスは証拠として使用不可/);
    assert.match(summary, /Nodeの版が指定と不一致/);
    assert.equal(summary.includes(summaryOptions.reportPath), false);
    const mismatch = verificationResult();
    mismatch.runtime.matches = false;
    assert.match(formatHarnessSummary("verify", mismatch, summaryOptions), /注意: Node/);
});

test("a failed command lists the checks that never ran", () => {
    const result = verificationResult();
    result.status = "FAIL";
    result.commands = [{ name: "lint", status: "FAIL", exitCode: 1, counts: {} }];
    const summary = formatHarnessSummary("verify", result, summaryOptions);
    assert.match(summary, /1\/4工程を実行、0工程が成功/);
    assert.match(summary, /失敗: lint/);
    assert.match(summary, /未実施: typecheck、test、build/);
    assert.doesNotMatch(summary, /テスト: 0件/);
});

test("invalid format options fail before verification starts", () => {
    for (const args of [["--format", "brief"], ["--format"], ["--format", "json", "--format", "summary"]]) {
        const run = spawnSync(process.execPath, ["scripts/agent-harness.mjs", "verify", "--base", "--invalid-base", ...args], { encoding: "utf8" });
        assert.equal(run.status, 1);
        assert.match(run.stderr, /Use --format|Invalid arguments/);
        assert.doesNotMatch(run.stderr, /Specify an existing base|prisma-generate/);
        assert.equal(run.stdout, "");
    }
});

test("a current complete assessment enables a proposal, never merge authority", () => {
    const result = assessQueue(snapshot(), now);
    assert.equal(result.selected, 1);
    assert.equal(result.issues[0].manualMergeRequired, true);
});
test("labels alone and untrusted assessments cannot make an issue ready", () => {
    const issue = ready();
    issue.assessment = {};
    assert.equal(assessQueue(snapshot([issue]), now).selected, null);
    const untrusted = ready();
    Object.assign(untrusted.assessment, { author: "someone-else" });
    assert.equal(assessQueue(snapshot([untrusted]), now).selected, null);
});
test("body decisions and blockers override a ready label", () => {
    for (const title of ["[Decision] Choose semantics", "[Blocked] migration", "HUMAN_DECISION_REQUIRED"]) {
        const issue = ready(); issue.title = title;
        assert.equal(assessQueue(snapshot([issue]), now).selected, null);
    }
});
test("stale snapshot and incomplete inventory fail closed", () => {
    assert.throws(() => assessQueue({ ...snapshot(), fetchedAt: "2020-01-01" }, now));
    assert.throws(() => assessQueue({ ...snapshot(), pullRequests: undefined }, now));
    assert.throws(() => assessQueue(snapshot([ready(), ready()]), now));
});
test("changed issue definitions, bases and expired assessments require reassessment", () => {
    const issue = ready(); issue.body += " new scope";
    assert.equal(assessQueue(snapshot([issue]), now).selected, null);
    assert.equal(assessQueue({ ...snapshot(), baseSha: "b".repeat(40) }, now).selected, null);
    const stale = ready(); Object.assign(stale.assessment, { data: { ...Object(stale.assessment).data, assessedAt: "2020-01-01" } });
    assert.equal(assessQueue(snapshot([stale]), now).selected, null);
});
test("unknown and open dependencies block; closed dependencies unblock", () => {
    const issue = ready(); Object.assign(issue.assessment, { data: { ...Object(issue.assessment).data, dependencies: [2] } });
    assert.equal(assessQueue(snapshot([issue]), now).selected, null);
    assert.equal(assessQueue(snapshot([issue, ready(2)]), now).issues.find((row: {number: number}) => row.number === 1)?.ready, false);
    assert.equal(assessQueue(snapshot([issue, { ...ready(2), state: "CLOSED" }]), now).selected, 1);
});
test("product decisions, missing environment and active claims block implementation", () => {
    for (const fields of [{ productDecisionRequired: true }, { approvalRequired: true }, { environmentReady: false }, { state: "working" }, { blocker: "no fixture" }]) {
        const issue = ready(); Object.assign(issue.assessment, { data: { ...Object(issue.assessment).data, ...fields } });
        assert.equal(assessQueue(snapshot([issue]), now).selected, null);
    }
});
test("existing PRs and overlapping scopes block duplicate or concurrent work", () => {
    const data = snapshot();
    data.pullRequests.push({ number: 10, state: "OPEN", linkedIssues: [1], changedFiles: ["other.ts"] });
    assert.equal(assessQueue(data, now).selected, null);
    data.pullRequests[0] = { number: 10, state: "OPEN", linkedIssues: [2], changedFiles: ["components/example.tsx"] };
    assert.equal(assessQueue(data, now).selected, null);
    const working = ready(2); Object.assign(working.assessment, { data: { ...Object(working.assessment).data, state: "working" } });
    assert.equal(assessQueue(snapshot([ready(), working]), now).selected, null);
});
test("missing PR scope is unknown and blocks selection", () => {
    assert.throws(() => assessQueue({ ...snapshot(), pullRequests: [{ number: 10, state: "OPEN" }] }, now));
});
test("missing owner or PR state cannot disappear from conflict analysis", () => {
    assert.throws(() => assessQueue({ ...snapshot(), issues: [{ ...ready(), assignees: undefined }] }, now));
    assert.throws(() => assessQueue({ ...snapshot(), pullRequests: [{ number: 10, linkedIssues: [1], changedFiles: ["components/example.tsx"] }] }, now));
});
test("directory scopes with or without slash conflict, and absolute/traversal paths block", () => {
    for (const path of ["components", "components/", "COMPONENTS"]) {
        const issue = ready(); Object.assign(issue.assessment, { data: { ...Object(issue.assessment).data, paths: [path] } });
        const data = snapshot([issue]); data.pullRequests.push({ number: 10, state: "OPEN", linkedIssues: [], changedFiles: ["components/example.tsx"] });
        assert.equal(assessQueue(data, now).selected, null);
    }
    for (const path of ["C:/components/example.tsx", "../components", "/components", "components/../other", "components\\example.tsx"]) {
        const issue = ready(); Object.assign(issue.assessment, { data: { ...Object(issue.assessment).data, paths: [path] } });
        assert.equal(assessQueue(snapshot([issue]), now).selected, null);
    }
});
test("describing stop conditions is not a product decision; explicit status still blocks", () => {
    const issue = ready(); issue.body = "Preserve HUMAN_DECISION_REQUIRED and BLOCKED in other Issues";
    Object.assign(issue.assessment, { data: { ...Object(issue.assessment).data, definitionHash: definitionHash(issue) } });
    assert.equal(assessQueue(snapshot([issue]), now).selected, 1);
    for (const body of ["**状態: HUMAN_DECISION_REQUIRED。**", "**Status:** BLOCKED HD-09", "## Status: BLOCKED", "# 状態: HUMAN_DECISION_REQUIRED", "## Status\nBLOCKED", "- Status: BLOCKED", "**Status:** `BLOCKED`", "| Status | BLOCKED |", "| 状態 | `HUMAN_DECISION_REQUIRED` |", "__Status__: __BLOCKED__", "_状態_: _HUMAN_DECISION_REQUIRED_"]) {
        issue.body = body; Object.assign(issue.assessment, { data: { ...Object(issue.assessment).data, definitionHash: definitionHash(issue) } });
        assert.equal(assessQueue(snapshot([issue]), now).selected, null);
    }
});
test("a changed candidate persists FAIL evidence instead of a stale PASS", () => {
    const root = mkdtempSync(join(tmpdir(), "clearallergy-report-change-"));
    const handle = beginReport(root, "report.json");
    try {
        const result = publishReport(handle, { status: "PASS", candidateUnchanged: true }, () => false);
        assert.equal(result.status, "FAIL");
        const stored = JSON.parse(readFileSync(handle.path, "utf8"));
        assert.equal(stored.status, "FAIL"); assert.equal(stored.candidateUnchanged, false);
    } finally { closeSync(handle.fd); assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true }); }
});
test("swapping the report directory cannot write through a new junction", () => {
    const root = mkdtempSync(join(tmpdir(), "clearallergy-report-swap-"));
    const outside = mkdtempSync(join(tmpdir(), "clearallergy-swap-outside-"));
    const handle = beginReport(root, "report.json");
    try {
        const original = join(root, ".agent-runs-original");
        assert.ok(resolve(handle.directory).startsWith(resolve(root) + sep) && resolve(original).startsWith(resolve(root) + sep));
        try { renameSync(handle.directory, original); }
        catch (error) {
            // Windows may deny the move while its file descriptor is held.
            if (process.platform !== "win32" || !(error instanceof Error) || !("code" in error) || error.code !== "EPERM") throw error;
            const result = publishReport(handle, { status: "PASS", candidateUnchanged: true }, () => true);
            assert.equal(result.status, "PASS"); assert.equal(result.publicationSafe, true);
            assert.equal(existsSync(join(outside, "report.json")), false);
            return;
        }
        symlinkSync(outside, handle.directory, "junction");
        const result = publishReport(handle, { status: "PASS", candidateUnchanged: true }, () => true);
        assert.equal(result.status, "FAIL"); assert.equal(result.publicationSafe, false);
        assert.equal(existsSync(join(outside, "report.json")), false);
        assert.equal(JSON.parse(readFileSync(join(original, "report.json"), "utf8")).status, "FAIL");
    } finally {
        closeSync(handle.fd);
        for (const directory of [root, outside]) { assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true }); }
    }
});
test("report preflight preserves existing files/links and rejects directory junctions", () => {
    const root = mkdtempSync(join(tmpdir(), "clearallergy-report-"));
    const outside = mkdtempSync(join(tmpdir(), "clearallergy-outside-"));
    try {
        const fresh = prepareReportPath(root, "fresh.json");
        writeFileSync(fresh, "original", "utf8");
        assert.throws(() => prepareReportPath(root, "fresh.json"));
        const externalFile = join(outside, "protected.json"); writeFileSync(externalFile, "protected", "utf8");
        linkSync(externalFile, join(root, ".agent-runs", "alias.json"));
        assert.throws(() => prepareReportPath(root, "alias.json"));
        assert.equal(readFileSync(externalFile, "utf8"), "protected");
        assert.throws(() => prepareReportPath(root, "../protected.json"));
        rmSync(join(root, ".agent-runs"), { recursive: true });
        symlinkSync(outside, join(root, ".agent-runs"), "junction");
        assert.throws(() => prepareReportPath(root, "new.json"));
        assert.equal(existsSync(join(outside, "new.json")), false);
    } finally {
        for (const directory of [root, outside]) {
            assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
            rmSync(directory, { recursive: true, force: true });
        }
    }
});
test("safety priority beats low issue numbers and high risk cannot auto merge", () => {
    const safety = ready(99, "safety"); Object.assign(safety.assessment, { data: { ...Object(safety.assessment).data, paths: ["lib/allergens.ts"] } });
    safety.labels.push("agent-auto-merge");
    const result = assessQueue(snapshot([ready(1, "optimization"), safety]), now);
    assert.equal(result.selected, 99); assert.equal(result.issues[0].risk, "high"); assert.equal(result.issues[0].manualMergeRequired, true);
    for (const path of ["prisma/schema.prisma", "prisma", "lib", "lib/auth", "features/admin", "app/api"]) assert.equal(protectedArea([path]), true);
});
test("malformed or latest blocking assessment does not fall back to old ready evidence", () => {
    const body = `<!-- clearallergy-agent:v1 -->\n\`\`\`json\n${JSON.stringify(Object(ready().assessment).data)}\n\`\`\``;
    assert.ok(assessmentFromComments([{ body, user: { login: "Kaito-Iwase" }, html_url: "url" }])?.data);
    assert.equal(assessmentFromComments([{ body }, { body: "<!-- clearallergy-agent:v1 -->broken" }]), null);
    assert.equal(assessmentFromComments([{ body: "untrusted ordinary prose" }]), null);
});
test("commands are discovered from package scripts; missing gates never silently skip", () => {
    const scripts = { lint: "eslint", typecheck: "tsc --noEmit", test: "node --test", build: "next build" };
    assert.deepEqual(verificationCommands({ scripts }).map((command: {name: string}) => command.name), ["lint", "typecheck", "test", "build"]);
    assert.deepEqual(verificationCommands({ scripts, devDependencies: { prisma: "6.19.3" } }).slice(0, 2).map((command: {name: string}) => command.name), ["prisma-generate", "prisma-validate"]);
    assert.throws(() => verificationCommands({ scripts: { test: "node --test" } }));
    assert.equal(verificationCommands({ scripts, seed: "never run" }).some((command: {name: string}) => command.name === "seed"), false);
});
