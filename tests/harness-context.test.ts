import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync, unlinkSync, linkSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { verify, protectedArea, assessQueue, definitionHash, readServerEvidence } from "../scripts/agent-harness.mjs";
import { candidateIdentity, combinePhaseEvidence } from "../scripts/verification-evidence.mjs";
import { readGitChanges, requiredVerification, scopePreflight, executionPreflight, verificationOutcome, scopesOverlap, INVENTORY_PARTS } from "../scripts/harness-policy.mjs";
import { checkContextLinks } from "../scripts/check-context-links.mjs";

// Only fixed, authored no-op scripts run in these tiny owned fixtures. These
// tests never run application/npm code supplied by an Issue, PR or snapshot.
type Git = (...args: string[]) => string;
function fixture(change: (root: string, git: Git) => void, check: (context: { root: string; base: string; git: Git }) => void) {
    const root = mkdtempSync(join(tmpdir(), "ca-scope-fixture-"));
    const previous = process.cwd();
    const hooks = join(root, "empty-hooks"); mkdirSync(hooks);
    const git: Git = (...args) => execFileSync("git", ["-c", "core.hooksPath=" + hooks, ...args], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
    try {
        writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: Object.fromEntries(["lint", "typecheck", "test", "build"].map(name => [name, 'node -e "process.exit(0)"'])) }));
        writeFileSync(join(root, "package-lock.json"), "{}");
        writeFileSync(join(root, ".node-version"), process.versions.node);
        writeFileSync(join(root, ".gitignore"), ".agent-runs/\nempty-hooks/\n");
        writeFileSync(join(root, "allowed.txt"), "before");
        git("init", "--quiet"); git("add", ".");
        git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
        const base = git("rev-parse", "HEAD");
        change(root, git); process.chdir(root);
        check({ root, base, git });
    } finally { process.chdir(previous); assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true }); }
}

test("verify stops a real tracked difference outside the declared edit scope", () => fixture((root) => {
    writeFileSync(join(root, "allowed.txt"), "after");
}, ({ base }) => {
    const result = verify({ base, output: "scope.json", plan: { paths: ["docs/"] } });
    assert.equal(result.status, "FAIL");
}));

test("verify includes rename destinations and untracked files in its scope guard", () => {
    for (const kind of ["rename", "untracked"]) fixture((root, git) => {
        if (kind === "rename") { renameSync(join(root, "allowed.txt"), join(root, "outside.txt")); git("add", "-A"); }
        else writeFileSync(join(root, "outside.txt"), "tiny inert data");
    }, ({ base }) => {
        const result = verify({ base, output: "scope.json", plan: { paths: ["allowed.txt"] } });
        assert.equal(result.status, "FAIL", kind);
        const paths = readGitChanges(base).flatMap((change: { paths: string[] }) => change.paths);
        assert.ok(paths.includes("outside.txt"));
        if (kind === "rename") assert.ok(paths.includes("allowed.txt"));
    });
});

test("public food display and snapshot reads cannot be classified as low risk", () => {
    for (const file of ["features/public/shops/server/PublicMenuDetailPage.tsx", "features/public/shops/server/public-read-snapshot.ts", "features/public/shops/components/PublicMenuSearchSummaryClient.tsx", "lib/public-db.ts", "lib/public-cache.ts", "app/(public)/shops/[shopId]/page.tsx"])
        assert.equal(protectedArea([file]), true, file);
    assert.equal(protectedArea(["components/ordinary-button.tsx"]), false);
});

test("four no-op command successes cannot complete a DB change without its required evidence", () => fixture((root) => {
    mkdirSync(join(root, "prisma")); writeFileSync(join(root, "prisma/constraint.sql"), "-- inert test data");
}, ({ base }) => {
    const result = verify({ base, output: "gates.json", plan: { paths: ["prisma/"] } });
    assert.equal(result.status, "UNVERIFIED");
    assert.ok(result.missingRequiredChecks.includes("db-constraints"));
    const results = ["test", "lint", "typecheck", "build", "context-links"].map(name => ({ name, status: "PASS" }));
    const outcome = verificationOutcome(requiredVerification(["prisma/constraint.sql"]), results);
    assert.equal(outcome.codeChecksStatus, "PASS"); assert.equal(outcome.status, "UNVERIFIED"); assert.equal(outcome.verificationComplete, false);
    assert.ok(outcome.missingRequiredChecks.includes("db-constraints"));
}));

const fields = { head: "a".repeat(40), baseSha: "b".repeat(40), fingerprint: "c".repeat(64), lockSha256: "d".repeat(64), harnessSha256: "e".repeat(64), evidenceSha256: "f".repeat(64) };
const candidate = candidateIdentity(fields), buildHash = "1".repeat(64), runId = "11111111-1111-4111-8111-111111111111";
function receipt(phase: string) { return { kind: "phase", phase, runId, status: "PASS", exitCode: 0, candidateBefore: candidate, candidateAfter: candidate, candidateUnchanged: true, publicationSafe: true, buildBefore: buildHash, buildAfter: buildHash }; }

test("owned public phase cannot aggregate PASS without its server evidence", () => {
    const result = combinePhaseEvidence([receipt("build"), receipt("browser-public")], ["build", "browser-public"], fields);
    assert.equal(result.status, "FAIL");
});

test("owned public phase rejects a different run's supporting evidence", () => {
    const filename = `server-public-${runId}.json`;
    const owned = { ...receipt("browser-public"), serverEvidence: filename, serverEvidenceSha256: "2".repeat(64) };
    const support = { [filename]: { sha256: "2".repeat(64), report: { kind: "server-log-summary", runId: "22222222-2222-4222-8222-222222222222", publicationSafe: true } } };
    assert.equal(combinePhaseEvidence([receipt("build"), owned], ["build", "browser-public"], fields, support).status, "FAIL");
});

test("an inventory without collection completeness cannot select work", () => {
    const now = Date.now(), baseSha = "a".repeat(40);
    const issue = { number: 1, title: "fixture", body: "inert data", state: "OPEN", labels: ["agent-ready"], assignees: [], assessment: {} };
    issue.assessment = { author: "Kaito-Iwase", url: "https://github.com/Kaito-Iwase/ClearAllergy/issues/1#issuecomment-1", data: { state: "ready", definitionHash: definitionHash(issue), baseSha, assessedAt: new Date(now).toISOString(), priority: "bug", risk: "low", problem: "fixture", cause: "fixture", decision: "fixture", evidence: ["fixture"], candidateSolutions: ["preserve"], acceptanceCriteria: ["fixture"], paths: ["components/example.tsx"], verificationPlan: ["fixture"], productDecisionRequired: false, approvalRequired: false, implementationAllowed: true, environmentReady: true, blocker: null, dependencies: [] } };
    let selected: number | null = null;
    try { selected = assessQueue({ version: 1, repository: "Kaito-Iwase/ClearAllergy", actorLogin: "Kaito-Iwase", baseSha, fetchedAt: new Date(now).toISOString(), issues: [issue], pullRequests: [] }, now).selected; } catch { /* fail closed is valid */ }
    assert.equal(selected, null);
});

test("server support has a positive control and rejects tampering, failure and wrong binding", () => {
    const filename = `server-public-${runId}.json`, digest = "2".repeat(64);
    const owned = { ...receipt("browser-public"), serverEvidence: filename, serverEvidenceSha256: digest };
    const report = { kind: "server-log-summary", runId, phase: "browser-public", candidateId: candidate.id, buildBefore: buildHash, buildAfter: buildHash,
        status: "COLLECTED", publicationSafe: true, candidateUnchanged: true, rawLogIncluded: false, outcome: { status: "PASS", exitCode: 0, serverStopped: true } };
    const combine = (support: object) => combinePhaseEvidence([receipt("build"), owned], ["build", "browser-public"], fields, { [filename]: support });
    assert.equal(combine({ sha256: digest, report }).status, "PASS");
    for (const changed of [{ runId: "22222222-2222-4222-8222-222222222222" }, { phase: "propagation" }, { candidateId: "0".repeat(64) }, { buildAfter: "0".repeat(64) }, { rawLogIncluded: true }, { publicationSafe: false }, { outcome: { status: "FAIL", exitCode: 1, serverStopped: false } }])
        assert.equal(combine({ sha256: digest, report: { ...report, ...changed } }).status, "FAIL");
    assert.equal(combine({ sha256: "0".repeat(64), report }).status, "FAIL");
});

test("actual scope overlaps stop while the exact continued PR is explicitly identified", () => {
    const snapshot = { repository: "Kaito-Iwase/ClearAllergy", actorLogin: "Kaito-Iwase", fetchedAt: new Date().toISOString(), collectionComplete: Object.fromEntries(INVENTORY_PARTS.map(key => [key, true])), issues: [{ number: 100, state: "OPEN", assignees: [], dependencies: [] }],
        pullRequests: [{ number: 105, state: "OPEN", linkedIssues: [100], headSha: "a".repeat(40), changedFiles: ["scripts/agent-harness.mjs"] }] };
    const changes = [{ status: "M", paths: ["scripts/agent-harness.mjs"] }];
    assert.equal(scopePreflight({ paths: ["scripts/"], issueNumber: 100 }, changes, snapshot).status, "UNVERIFIED");
    assert.equal(scopePreflight({ paths: ["scripts/agent-harness.mjs/child"], issueNumber: 100 }, changes, snapshot).status, "FAIL");
    const continued = scopePreflight({ paths: ["scripts/"], issueNumber: 100, pullRequestNumber: 105, expectedPullRequestHead: "a".repeat(40) }, changes, snapshot);
    assert.equal(continued.status, "PASS"); assert.equal(continued.implementationAuthority, "UNVERIFIED");
    assert.equal(scopePreflight({ paths: ["scripts/"], issueNumber: 100, pullRequestNumber: 105, expectedPullRequestHead: "b".repeat(40) }, changes, snapshot).status, "UNVERIFIED");
    assert.equal(scopePreflight({ paths: ["scripts/"], issueNumber: 100 }, changes, { ...snapshot, pullRequests: [{ ...snapshot.pullRequests[0], state: "UNKNOWN" }] }).status, "UNVERIFIED");
    assert.equal(scopePreflight({ paths: ["scripts/"], issueNumber: 100 }, changes, { ...snapshot, issues: [{ ...snapshot.issues[0], assignees: ["other-owner"] }] }).status, "UNVERIFIED");
});

test("path-specific requirements avoid DB gates for an ordinary component and keep safety requirements", () => {
    assert.ok(requiredVerification(["prisma/migrations/new/migration.sql"]).phases.includes("db-constraints"));
    assert.ok(requiredVerification(["features/public/shops/server/public-read-snapshot.ts"]).phases.includes("db-snapshot"));
    assert.ok(!requiredVerification(["components/ordinary-button.tsx"]).phases.some(phase => phase.startsWith("db-")));
    assert.deepEqual(requiredVerification(["docs/guide/maintenance.md"]).phases, ["context-links"]);
    const host = executionPreflight({ CI: "true", NODE_ENV: "test" }); assert.equal(host.allowed, false); assert.equal(host.osIsolationProven, false);
    assert.equal(scopesOverlap("README.md", "readme.md"), true, "Windows ownership overlap stays conservative; edit permission is exact");
});

test("supporting JSON is actually loaded, hashed and rejected when missing, replaced or aliased", () => fixture(() => {}, ({ root }) => {
    mkdirSync(join(root, ".agent-runs"));
    const filename = `server-public-${runId}.json`, path = join(root, ".agent-runs", filename);
    const owned = { ...receipt("browser-public"), serverEvidence: filename };
    assert.equal(readServerEvidence(owned), null);
    const contents = JSON.stringify({ kind: "server-log-summary", runId });
    writeFileSync(path, contents);
    assert.equal(readServerEvidence(owned)?.sha256, createHash("sha256").update(contents).digest("hex"));
    const old = readServerEvidence(owned)?.sha256;
    writeFileSync(path, contents + " ");
    assert.notEqual(readServerEvidence(owned)?.sha256, old);
    const alias = join(root, ".agent-runs", "alias.json"); linkSync(path, alias);
    assert.equal(readServerEvidence(owned), null);
    unlinkSync(alias); unlinkSync(path);
    assert.equal(readServerEvidence(owned), null);
    assert.equal(readServerEvidence({ ...owned, serverEvidence: "../forbidden.json" }), null);
}));

test("context links check local anchors and code lines while remote links remain unverified", () => fixture((root) => {
    writeFileSync(join(root, "source.md"), "[anchor](target.md#ok) [code](code.ts#L1) [remote](https://example.invalid/missing)");
    writeFileSync(join(root, "target.md"), "# OK\n"); writeFileSync(join(root, "code.ts"), "// fixed inert data\n");
}, ({ root }) => {
    assert.equal(checkContextLinks(root, ["source.md"]).status, "PASS");
    writeFileSync(join(root, "source.md"), "[bad](target.md#absent) [bad code](code.ts#L999) [missing](absent.ts)");
    const report = checkContextLinks(root, ["source.md"]);
    assert.equal(report.status, "FAIL"); assert.equal(report.failures.length, 3);
}));
