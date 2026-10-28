import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, unlinkSync, linkSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { verify, summarizePhases, protectedArea, assessQueue, definitionHash, readServerEvidence } from "../scripts/agent-harness.mjs";
import { candidateIdentity, combinePhaseEvidence } from "../scripts/verification-evidence.mjs";
import { acceptanceRequirements, readGitChanges, requiredVerification, scopePreflight, executionPreflight, verificationOutcome, scopesOverlap, INVENTORY_PARTS } from "../scripts/harness-policy.mjs";
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

function acceptanceFixture(baseSha = fields.baseSha, phases = [["test"], ["lint", "typecheck", "build", "context-links"]]) {
    const now = Date.now();
    const issue = { number: 1, title: "Small fictional repair", body: "Preserve the existing behavior", state: "OPEN", labels: [] as string[], assignees: [], dependencies: [] };
    const acceptanceCriteria = ["the regression passes", "the remaining required checks pass"];
    return { repository: "Kaito-Iwase/ClearAllergy", actorLogin: "Kaito-Iwase", baseSha, fetchedAt: new Date(now).toISOString(),
        collectionComplete: Object.fromEntries(INVENTORY_PARTS.map(key => [key, true])), pullRequests: [],
        issues: [{ ...issue, assessment: { author: "Kaito-Iwase", url: "https://github.com/Kaito-Iwase/ClearAllergy/issues/1#issuecomment-1",
            data: { state: "working", baseSha, definitionHash: definitionHash(issue), assessedAt: new Date(now).toISOString(), acceptanceCriteria,
                acceptanceChecks: acceptanceCriteria.map((criterion, i) => ({ criterion, phases: phases[i] })) } } }] };
}
function definition(source = acceptanceFixture()) { return acceptanceRequirements(source.issues[0], source); }
function acceptedResults(names: string[], acceptance: ReturnType<typeof definition>) {
    return names.map(name => ({ name, status: "PASS", acceptanceDefinitionSha256: acceptance.definitionSha256 }));
}

test("selected checks cannot define away an independently required acceptance check", () => {
    const selected = requiredVerification(["lib/utils/small-change.ts"]);
    const acceptance = definition(acceptanceFixture(fields.baseSha, [["test"], ["db-snapshot"]]));
    const outcome = verificationOutcome(selected, acceptedResults(selected.phases, acceptance), true, true, true, acceptance);
    assert.equal(outcome.selectedChecksStatus, "PASS"); assert.equal(outcome.acceptanceStatus, "UNVERIFIED");
    assert.equal(outcome.verificationComplete, false); assert.ok(outcome.missingAcceptanceChecks.includes("db-snapshot"));
});

test("an ordinary small repair completes its declared acceptance without unrelated DB gates", () => {
    const selected = requiredVerification(["lib/utils/small-change.ts"]), acceptance = definition();
    const outcome = verificationOutcome(selected, acceptedResults(selected.phases, acceptance), true, true, true, acceptance);
    assert.equal(outcome.status, "PASS"); assert.equal(outcome.acceptanceStatus, "PASS"); assert.equal(outcome.verificationComplete, true);
    assert.ok(!acceptance.phases.some(phase => phase.startsWith("db-")));
    assert.equal("implementationAuthority" in outcome, false, "completion grants no implementation or adoption authority");
});

test("unknown, partial, stale and held acceptance definitions never complete successful checks", () => {
    const selected = requiredVerification(["lib/utils/small-change.ts"]);
    const mutations = [
        (s: ReturnType<typeof acceptanceFixture>) => { Object.assign(s.issues[0].assessment.data, { acceptanceChecks: undefined }); },
        (s: ReturnType<typeof acceptanceFixture>) => { s.issues[0].assessment.data.acceptanceChecks.pop(); },
        (s: ReturnType<typeof acceptanceFixture>) => { s.issues[0].assessment.data.acceptanceChecks[1] = s.issues[0].assessment.data.acceptanceChecks[0]; },
        (s: ReturnType<typeof acceptanceFixture>) => { s.issues[0].assessment.data.acceptanceChecks[0].phases = ["unknown-phase"]; },
        (s: ReturnType<typeof acceptanceFixture>) => { s.issues[0].assessment.data.acceptanceChecks[0].phases = []; },
        (s: ReturnType<typeof acceptanceFixture>) => { s.issues[0].assessment.data.acceptanceCriteria = []; },
        (s: ReturnType<typeof acceptanceFixture>) => { s.issues[0].body += " changed"; },
        (s: ReturnType<typeof acceptanceFixture>) => { s.baseSha = "0".repeat(40); },
        (s: ReturnType<typeof acceptanceFixture>) => { s.issues[0].assessment.author = "other-user"; },
        (s: ReturnType<typeof acceptanceFixture>) => { Object.assign(s, { actorLogin: undefined }); },
        (s: ReturnType<typeof acceptanceFixture>) => { s.issues[0].assessment.data.assessedAt = "2020-01-01"; },
        (s: ReturnType<typeof acceptanceFixture>) => { s.fetchedAt = "2020-01-01"; },
        (s: ReturnType<typeof acceptanceFixture>) => { s.issues[0].labels = ["human-review"]; },
    ];
    for (const mutate of mutations) {
        const source = acceptanceFixture(); mutate(source); const acceptance = definition(source);
        const result = verificationOutcome(selected, acceptedResults(selected.phases, acceptance), true, true, true, acceptance);
        assert.equal(result.selectedChecksStatus, "PASS"); assert.equal(result.verificationComplete, false);
        assert.equal(acceptance.status, "UNVERIFIED");
    }
    assert.equal(verificationOutcome(selected, acceptedResults(selected.phases, definition())).verificationComplete, false);
});

test("acceptance declared or changed after checks cannot adopt their old success", () => {
    const selected = requiredVerification(["lib/utils/small-change.ts"]), source = acceptanceFixture(), acceptance = definition(source);
    const results = acceptedResults(selected.phases, acceptance);
    for (const digest of [null, "0".repeat(64)]) {
        assert.equal(verificationOutcome(selected, results.map(r => ({ ...r, acceptanceDefinitionSha256: digest })), true, true, true, acceptance).verificationComplete, false);
    }
    source.issues[0].assessment.data.acceptanceCriteria[0] = "a revised acceptance criterion";
    source.issues[0].assessment.data.acceptanceChecks[0].criterion = source.issues[0].assessment.data.acceptanceCriteria[0];
    const revised = definition(source);
    assert.notEqual(revised.definitionSha256, acceptance.definitionSha256);
    assert.equal(verificationOutcome(selected, results, true, true, true, revised).verificationComplete, false);
});

test("manual requirements, execution failures and empty selection cannot become completion", () => {
    const acceptance = definition(), selected = requiredVerification(["lib/utils/small-change.ts"]), results = acceptedResults(selected.phases, acceptance);
    assert.equal(verificationOutcome({ ...selected, manual: ["changed-ui-keyboard-and-states"] }, results, true, true, true, acceptance).verificationComplete, false);
    assert.equal(verificationOutcome(selected, results.map(r => ({ ...r, status: "FAIL" })), true, true, true, acceptance).status, "FAIL");
    assert.equal(verificationOutcome(selected, [], true, true, true, acceptance).verificationComplete, false);
    assert.equal(verificationOutcome(selected, results, true, false, true, acceptance).verificationComplete, false);
});

test("summary and stored JSON distinguish omitted acceptance, a positive control and wrong-SHA evidence", () => fixture(root => {
    writeFileSync(join(root, "allowed.txt"), "after");
}, ({ root, base, git }) => {
    const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
    const files = [...new Set(git("ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean))].sort();
    const current = candidateIdentity({ head: git("rev-parse", "HEAD"), baseSha: base,
        fingerprint: hash(JSON.stringify(files.map(path => [path, hash(readFileSync(join(root, path)))]))),
        lockSha256: hash(readFileSync(join(root, "package-lock.json"))),
        harnessSha256: hash(readFileSync(new URL("../scripts/agent-harness.mjs", import.meta.url))),
        evidenceSha256: hash(readFileSync(new URL("../scripts/verification-evidence.mjs", import.meta.url))) });
    const source = acceptanceFixture(base, [["context-links"], ["test"]]), acceptance = definition(source);
    mkdirSync(join(root, ".agent-runs"));
    const record = (phase: string, identity = current, digest = acceptance.definitionSha256) => ({ kind: "phase", phase, runId, status: "PASS", exitCode: 0,
        candidateBefore: identity, candidateAfter: identity, candidateUnchanged: true, publicationSafe: true, acceptanceDefinitionSha256: digest });
    const save = (name: string, data: object) => writeFileSync(join(root, ".agent-runs", name), JSON.stringify(data));
    save("context.json", record("context-links")); save("test.json", record("test"));
    const summarize = (inputs: string[], output: string) => summarizePhases({ base, inputs, required: ["context-links"], output,
        plan: { paths: ["allowed.txt"], issueNumber: 1 }, snapshot: source });
    const missing = summarize(["context.json"], "missing.json");
    assert.equal(missing.selectedChecksStatus, "PASS"); assert.equal(missing.verificationComplete, false);
    assert.ok(missing.missingAcceptanceChecks.includes("test"));
    assert.equal(JSON.parse(readFileSync(join(root, ".agent-runs", "missing.json"), "utf8")).verificationComplete, false);
    const positive = summarize(["context.json", "test.json"], "positive.json");
    assert.equal(positive.status, "PASS"); assert.equal(positive.verificationComplete, true);
    save("old.json", record("test", candidateIdentity({ ...current, head: "0".repeat(40) })));
    const old = summarize(["context.json", "old.json"], "old-summary.json");
    assert.equal(old.status, "FAIL"); assert.equal(old.verificationComplete, false);
    save("unbound.json", record("test", current, null));
    assert.equal(summarize(["context.json", "unbound.json"], "unbound-summary.json").verificationComplete, false);
}));
