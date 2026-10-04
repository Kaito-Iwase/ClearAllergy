import assert from "node:assert/strict";
import test from "node:test";
import { closeSync, existsSync, linkSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { assessQueue, assessmentFromComments, beginReport, definitionHash, prepareReportPath, protectedArea, publishReport, verificationCommands } from "../scripts/agent-harness.mjs";

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
