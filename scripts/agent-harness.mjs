import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveNpmCli } from "./npm-cli.mjs";
import { buildFingerprint, candidateIdentity, combinePhaseEvidence, failureDiagnostics, serverEvidenceMatches, PHASES } from "./verification-evidence.mjs";
import { inventoryComplete, readGitChanges, scopePreflight, executionPreflight, verificationOutcome, validScopePath, scopesOverlap, protectedArea } from "./harness-policy.mjs";
export { validScopePath, scopesOverlap, protectedArea } from "./harness-policy.mjs";

export const ASSESSMENT_MARKER = "<!-- clearallergy-agent:v1 -->";
const REPOSITORY = "Kaito-Iwase/ClearAllergy";
const PRIORITIES = ["security", "safety", "regression", "bug", "blocker", "correctness", "testability", "maintainability", "ux", "feature", "optimization"];
const REQUIRED_SCRIPTS = ["lint", "typecheck", "test", "build"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const stringList = (value) => Array.isArray(value) && value.length > 0 && value.every(nonempty);
const validNumber = (value) => Number.isSafeInteger(value) && value > 0;

export function definitionHash(issue) {
    return sha256(JSON.stringify([issue.number, issue.title, issue.body ?? ""]));
}

// Tagged comments are assessment data, never proof of human authorization.
export function assessmentFromComments(comments) {
    const latest = [...comments].reverse().find((comment) => comment.body?.includes(ASSESSMENT_MARKER));
    if (!latest) return null;
    const match = latest.body.split(ASSESSMENT_MARKER)[1]?.match(/^\s*```json\s*([\s\S]*?)\s*```\s*$/);
    if (!match) return null;
    try { return { data: JSON.parse(match[1]), author: latest.user?.login, url: latest.html_url }; }
    catch { return null; }
}

// Advisory selection only. This function grants no GitHub, shell or merge authority.
export function assessQueue(snapshot, now = Date.now()) {
    if (!inventoryComplete(snapshot) || snapshot.repository !== REPOSITORY || snapshot.version !== 1 || !nonempty(snapshot.actorLogin)
        || !/^[a-f0-9]{40}$/.test(snapshot.baseSha ?? "") || !Array.isArray(snapshot.issues) || !Array.isArray(snapshot.pullRequests)) {
        throw new Error("Invalid GitHub snapshot; do not select an issue.");
    }
    const age = now - Date.parse(snapshot.fetchedAt);
    if (!Number.isFinite(age) || age < -60_000 || age > 15 * 60_000) throw new Error("GitHub snapshot is stale; fetch again.");
    if (snapshot.issues.some((issue) => !nonempty(issue.title) || typeof issue.body !== "string"
        || !["OPEN", "CLOSED"].includes(issue.state) || !Array.isArray(issue.labels) || !issue.labels.every(nonempty)
        || !Array.isArray(issue.assignees) || !issue.assignees.every(nonempty))) throw new Error("Issue definition/labels/ownership unknown; fetch again.");
    if (snapshot.pullRequests.some((pull) => !validNumber(pull.number) || !["OPEN", "CLOSED", "MERGED"].includes(pull.state)
        || !Array.isArray(pull.linkedIssues) || !pull.linkedIssues.every(validNumber)
        || !Array.isArray(pull.changedFiles) || !pull.changedFiles.every(validScopePath))) throw new Error("PR state/ownership/scope unknown; fetch again.");
    const numbers = snapshot.issues.map((issue) => issue.number);
    if (numbers.some((number) => !Number.isSafeInteger(number) || number < 1) || new Set(numbers).size !== numbers.length) {
        throw new Error("Invalid or duplicate issue numbers.");
    }
    const rows = snapshot.issues.filter((issue) => issue.state === "OPEN").map((issue) => {
        const record = issue.assessment;
        const plan = record?.data;
        const reasons = [];
        const statusText = issue.body.replace(/[`*#|]/g, "")
            .replace(/(^|[^\p{L}\p{N}_])_+|_+(?=$|[^\p{L}\p{N}_])/gu, "$1");
        if (/HUMAN_DECISION_REQUIRED|\[Decision\]|\[Blocked\]/i.test(issue.title)
            || /^\s*(?:[-+]\s+)?(?:状態|Status\b)\s*[:：]?\s*(?:HUMAN_DECISION_REQUIRED|BLOCKED)\b/im.test(statusText)) reasons.push("human decision or body blocker");
        if ((issue.labels ?? []).some((label) => ["agent-blocked", "human-review", "duplicate", "invalid", "wontfix"].includes(label))) reasons.push("blocking label");
        if (!(issue.labels ?? []).includes("agent-ready")) reasons.push("not labelled agent-ready");
        if (!plan || record.author !== snapshot.actorLogin || !nonempty(record.url)) reasons.push("missing matching assessment record");
        if (plan) {
            if (plan.state !== "ready") reasons.push(`assessment state ${plan.state}`);
            if (plan.definitionHash !== definitionHash(issue) || plan.baseSha !== snapshot.baseSha) reasons.push("assessment no longer matches definition/base");
            const assessedAge = now - Date.parse(plan.assessedAt);
            if (!Number.isFinite(assessedAge) || assessedAge < -60_000 || assessedAge > 24 * 60 * 60_000) reasons.push("assessment expired");
            if (!PRIORITIES.includes(plan.priority) || !["low", "medium", "high"].includes(plan.risk)) reasons.push("missing priority/risk");
            if (!["problem", "cause", "decision"].every((key) => nonempty(plan[key]))
                || !["evidence", "candidateSolutions", "acceptanceCriteria", "paths", "verificationPlan"].every((key) => stringList(plan[key]))) reasons.push("incomplete definition/verification");
            if (plan.productDecisionRequired !== false || plan.approvalRequired !== false || plan.implementationAllowed !== true) reasons.push("implementation authority is unresolved");
            if (plan.environmentReady !== true || plan.blocker !== null) reasons.push("environment or blocker unresolved");
            if (!Array.isArray(plan.dependencies) || plan.dependencies.some((number) => !Number.isSafeInteger(number)
                || snapshot.issues.find((item) => item.number === number)?.state !== "CLOSED")) reasons.push("dependency open or unknown");
            if ((issue.assignees ?? []).some((login) => login !== snapshot.actorLogin)) reasons.push("assigned to another owner");
            if (Array.isArray(plan.paths)) {
                if (!plan.paths.every(validScopePath)) reasons.push("invalid scope path");
                for (const pull of snapshot.pullRequests.filter((pull) => pull.state === "OPEN")) {
                    if (!Array.isArray(pull.linkedIssues) || !Array.isArray(pull.changedFiles)) { reasons.push("PR ownership/scope unknown"); break; }
                    if (pull.linkedIssues.includes(issue.number)) reasons.push(`existing PR #${pull.number}`);
                    if (plan.paths.every(validScopePath) && pull.changedFiles.some((path) => plan.paths.some((scope) => scopesOverlap(path, scope)))) reasons.push(`scope overlaps PR #${pull.number}`);
                }
                for (const other of snapshot.issues) {
                    const active = other.assessment?.data;
                    if (other.number !== issue.number && other.state === "OPEN" && active?.state === "working") {
                        if (!stringList(active.paths) || !active.paths.every(validScopePath)
                            || (plan.paths.every(validScopePath) && active.paths.some((path) => plan.paths.some((scope) => scopesOverlap(path, scope))))) reasons.push(`active scope #${other.number}`);
                    }
                }
            }
        }
        const paths = Array.isArray(plan?.paths) ? plan.paths : [];
        return { number: issue.number, title: issue.title, ready: reasons.length === 0, reasons,
            priority: plan?.priority ?? null, risk: protectedArea(paths) ? "high" : plan?.risk ?? null,
            manualMergeRequired: true, implementationAuthority: "UNVERIFIED", assessmentUrl: record?.url ?? null };
    });
    rows.sort((a, b) => Number(b.ready) - Number(a.ready)
        || (PRIORITIES.indexOf(a.priority) < 0 ? 99 : PRIORITIES.indexOf(a.priority)) - (PRIORITIES.indexOf(b.priority) < 0 ? 99 : PRIORITIES.indexOf(b.priority))
        || a.number - b.number);
    return { repository: snapshot.repository, fetchedAt: snapshot.fetchedAt, baseSha: snapshot.baseSha,
        selected: rows.find((row) => row.ready)?.number ?? null, issues: rows,
        implementationAuthority: "UNVERIFIED", commentsAreLocks: false,
        nextAction: rows.some((row) => row.ready) ? "re-fetch issue/comments/dependencies/PRs; check current user authorization independently; a claim is not a lock" : "one bounded repository audit; then record blockers and stop if no ready issue" };
}

export function verificationCommands(pkg) {
    const missing = REQUIRED_SCRIPTS.filter((name) => !nonempty(pkg.scripts?.[name]));
    if (missing.length) throw new Error(`Required scripts missing: ${missing.join(", ")}`);
    const commands = REQUIRED_SCRIPTS.map((name) => ({ name, args: ["run", name], script: pkg.scripts[name] }));
    if (pkg.devDependencies?.prisma || pkg.dependencies?.prisma) commands.unshift({ name: "prisma-generate", prisma: "generate" }, { name: "prisma-validate", prisma: "validate" });
    return commands;
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();

function fingerprint() {
    const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", windowsHide: true }).split("\0").filter(Boolean);
    return sha256(JSON.stringify([...new Set(files)].filter((path) => !path.startsWith(".agent-runs/")).sort().map((path) => [path, existsSync(path) ? sha256(readFileSync(path)) : "deleted"])));
}

function captureCandidate(baseSha) {
    return candidateIdentity({ head: git("rev-parse", "HEAD"), baseSha, fingerprint: fingerprint(),
        harnessSha256: sha256(readFileSync(new URL(import.meta.url))),
        evidenceSha256: sha256(readFileSync(new URL("./verification-evidence.mjs", import.meta.url))),
        lockSha256: sha256(readFileSync("package-lock.json")) });
}

function diagnostics(output, result) {
    const tests = git("ls-files", "tests").split(/\r?\n/).filter(path => path.endsWith(".test.ts"));
    return failureDiagnostics(output, result, tests);
}

// Only bounded, regular, single-link JSON under the evidence directory. The
// held descriptor binds the bytes read; this is not an OS sandbox guarantee.
function readEvidenceJson(name) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(name)) throw new Error("Invalid evidence filename.");
    const directory = ".agent-runs", path = join(directory, name);
    const parent = lstatSync(directory, { bigint: true });
    const initial = lstatSync(path, { bigint: true });
    if (!parent.isDirectory() || parent.isSymbolicLink() || !initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1n || initial.size > 1_000_000n) throw new Error("Unsafe evidence file.");
    const fd = openSync(path, "r");
    try {
        const held = fstatSync(fd, { bigint: true });
        if (held.ino !== initial.ino || (process.platform !== "win32" && held.dev !== initial.dev) || held.nlink !== 1n || held.size !== initial.size) throw new Error("Evidence changed while opening.");
        const bytes = readFileSync(fd);
        const after = fstatSync(fd, { bigint: true }), finalParent = lstatSync(directory, { bigint: true });
        if (bytes.length > 1_000_000 || held.size !== after.size || held.mtimeNs !== after.mtimeNs || parent.ino !== finalParent.ino || finalParent.isSymbolicLink()) throw new Error("Evidence changed while reading.");
        return { sha256: sha256(bytes), report: JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")) };
    } finally { closeSync(fd); }
}

export function readServerEvidence(receipt) {
    const expected = `server-${receipt.phase === "browser-public" ? "public" : "propagation"}-${receipt.runId}.json`;
    if (receipt.serverEvidence !== expected || !/^server-(?:public|propagation)-[a-f0-9-]{36}\.json$/.test(expected)) return null;
    try { return readEvidenceJson(expected); } catch { return null; }
}

export function prepareReportPath(root, output) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(output)) throw new Error("Output must be a fresh JSON filename inside .agent-runs.");
    const directory = join(root, ".agent-runs");
    if (existsSync(directory) && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) throw new Error("Unsafe report directory.");
    mkdirSync(directory, { recursive: true });
    const target = join(directory, output);
    try { lstatSync(target); }
    catch (error) { if (error.code === "ENOENT") return target; throw error; }
    throw new Error("Output already exists; choose a fresh report filename.");
}

export function beginReport(root, output) {
    const path = prepareReportPath(root, output);
    const directory = dirname(path);
    const initial = lstatSync(directory, { bigint: true });
    const fd = openSync(path, "wx");
    return { path, directory, initial, fd };
}

function sameReportLocation(handle) {
    try {
        const directory = lstatSync(handle.directory, { bigint: true });
        const file = lstatSync(handle.path, { bigint: true });
        const heldFile = fstatSync(handle.fd, { bigint: true });
        return !directory.isSymbolicLink() && directory.isDirectory() && !file.isSymbolicLink()
            && directory.dev === handle.initial.dev && directory.ino === handle.initial.ino
            // Windows path lstat and descriptor fstat can return different dev values.
            // The unchanged directory binds the volume; compare exact inode values.
            && (process.platform === "win32" || file.dev === heldFile.dev) && file.ino === heldFile.ino;
    } catch { return false; }
}

export function publishReport(handle, report, candidateUnchanged) {
    const write = (value) => {
        ftruncateSync(handle.fd, 0);
        writeSync(handle.fd, `${JSON.stringify(value, null, 2)}\n`, 0, "utf8");
    };
    // A crash or failed final check must never leave resumable PASS evidence.
    write({ ...report, status: "VERIFYING", verificationComplete: false });
    report.publicationSafe = sameReportLocation(handle);
    report.candidateUnchanged = report.candidateUnchanged && candidateUnchanged();
    if (!report.publicationSafe || !report.candidateUnchanged) report.status = "FAIL";
    if (Object.hasOwn(report, "verificationComplete")) report.verificationComplete = report.status === "PASS";
    write(report); // Held descriptor cannot follow a directory/link swapped during checks.
    return report;
}

// No inherited credentials or DB target. Read-only builds use an unreachable local DB.
function checkEnvironment({ database = false, browser = false } = {}) {
    for (const path of [".env", ".env.local", ".env.production", ".env.production.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local", ".clerk"]) {
        if (existsSync(path)) throw new Error("Use a clean isolated worktree without environment/account files.");
    }
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|NUMBER_OF_PROCESSORS)$/i.test(key)) env[key] = value;
    }
    const safe = { ...env, CI: "true", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused?connect_timeout=1", DIRECT_URL: "postgresql://unused:unused@127.0.0.1:1/unused?connect_timeout=1",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlYXJhbGxlcmd5LWNpLmNsZXJrLmFjY291bnRzLmRldiQ", CLERK_SECRET_KEY: "sk_test_ci_placeholder_not_a_real_key",
        PORTFOLIO_MODE: "true", ADMIN_REGISTRATION_MODE: "disabled", ENABLE_CLERK_ADMIN_AUTH: "false", NEXT_PUBLIC_APP_URL: "http://localhost:3000" };
    if (database) {
        if (process.env.CI !== "true" || process.env.CLEARALLERGY_CI_FIXTURES !== "true" || process.env.DATABASE_URL !== process.env.DIRECT_URL) throw new Error("Phase requires the isolated CI database.");
        let target;
        try { target = new URL(process.env.DATABASE_URL); } catch { throw new Error("Phase requires the isolated CI database."); }
        if (target.protocol !== "postgresql:" || !["127.0.0.1", "localhost", "ci-db"].includes(target.hostname)
            || target.pathname !== "/clearallergy_ci" || target.username !== "clearallergy_ci" || target.password !== "local_ci_only") throw new Error("Phase requires the isolated CI database.");
        Object.assign(safe, { DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL, CLEARALLERGY_CI_FIXTURES: "true" });
    }
    if (browser) {
        let base;
        try { base = new URL(process.env.CLEARALLERGY_BROWSER_BASE_URL ?? "http://127.0.0.1:3000"); } catch { throw new Error("Phase requires a loopback HTTP app."); }
        if (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname) || base.username || base.password) throw new Error("Phase requires a loopback HTTP app.");
        Object.assign(safe, { CLEARALLERGY_BROWSER_BASE_URL: base.href, CLEARALLERGY_BROWSER_OUTPUT: resolve(".agent-runs/browser"),
            CLEARALLERGY_BROWSER_PUBLIC_ONLY: "true", CLEARALLERGY_BROWSER_BLOCK_EXTERNAL: "true" });
        for (const name of ["PLAYWRIGHT_MODULE_PATH", "PLAYWRIGHT_BROWSERS_PATH", "CLEARALLERGY_BROWSER_RUNNER_DIR", "BROWSER_EXECUTABLE"]) if (process.env[name]) safe[name] = process.env[name];
    }
    return safe;
}

function prepareVerification(base, plan, snapshot) {
    const baseSha = resolveBase(base);
    const changes = readGitChanges(baseSha);
    const scope = scopePreflight(plan, changes, snapshot);
    if (scope.status === "PASS" && snapshot.baseSha !== baseSha) { scope.status = "UNVERIFIED"; scope.reasons.push("GitHub snapshot base differs from actual diff base"); }
    return { baseSha, changes, scope, execution: executionPreflight() };
}

function reportPreflight(preflight, output) {
    const head = git("rev-parse", "HEAD");
    const before = sha256(JSON.stringify(preflight.changes));
    const handle = beginReport(process.cwd(), output);
    try {
        return publishReport(handle, { version: 3, kind: "preflight", head, baseSha: preflight.baseSha,
            status: preflight.scope.status === "FAIL" ? "FAIL" : "UNVERIFIED", scope: preflight.scope, execution: preflight.execution,
            commands: [], codeChecksStatus: "NOT_RUN", sourceIdentityCaptured: false, candidateUnchanged: true,
            missingRequiredChecks: preflight.scope.verification.phases, manualChecks: preflight.scope.verification.manual,
            implementationAuthority: "UNVERIFIED" }, () => head === git("rev-parse", "HEAD") && before === sha256(JSON.stringify(readGitChanges(preflight.baseSha))));
    } finally { closeSync(handle.fd); }
}

/** @param {{base: string, phase: string, output?: string, plan?: any, snapshot?: any}} options */
export function runPhase({ base, phase, output, plan = null, snapshot = null }) {
    if (!Object.hasOwn(PHASES, phase)) throw new Error("Unknown verification phase.");
    const preflight = prepareVerification(base, plan, snapshot);
    if (preflight.scope.status !== "PASS" || !preflight.execution.allowed) return reportPreflight(preflight, output ?? `${phase}.json`);
    const baseSha = preflight.baseSha;
    const browser = phase.startsWith("browser-") || phase === "propagation";
    const database = phase.startsWith("db-") || phase.endsWith("-upgrade") || ["prepare-fixture", "browser-public", "propagation"].includes(phase);
    const env = checkEnvironment({ database, browser });
    const runId = randomUUID();
    env.CLEARALLERGY_PHASE_RUN_ID = runId;
    const before = captureCandidate(baseSha);
    const buildBefore = buildFingerprint(process.cwd());
    env.CLEARALLERGY_PHASE_CANDIDATE_ID = before.id;
    const handle = beginReport(process.cwd(), output ?? `${phase}.json`);
    try {
        const spec = PHASES[phase];
        const args = spec[0] === "npm" ? [resolveNpmCli().path, "run", spec[1]] : spec;
        const start = Date.now();
        const result = spawnSync(process.execPath, args, { env, encoding: "utf8", windowsHide: true, timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024 });
        const contents = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
        const after = captureCandidate(baseSha);
        const buildAfter = buildFingerprint(process.cwd());
        const buildUnchanged = !browser || (buildBefore !== null && buildBefore === buildAfter);
        const report = { version: 2, kind: "phase", phase, runId, head: before.head, baseSha, startedAt: new Date(start).toISOString(), finishedAt: new Date().toISOString(),
            candidateBefore: before, candidateAfter: after, candidateUnchanged: before.id === after.id,
            exitCode: result.status, elapsedMs: Date.now() - start, outputSha256: sha256(contents), diagnostics: diagnostics(contents, result), buildBefore, buildAfter,
            completedCheckpoints: contents.split(/\r?\n/).filter(line => line.startsWith("PASS:")).length,
            serverEvidence: ["browser-public", "propagation"].includes(phase) ? `server-${phase === "browser-public" ? "public" : "propagation"}-${runId}.json` : null,
            runtime: { node: process.versions.node, platform: process.platform, arch: process.arch, npm: spec[0] === "npm" ? resolveNpmCli().version : null,
                fixture: database ? "fictional-ci" : "no-database" },
            ci: { sha: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") ? process.env.GITHUB_SHA : null },
            status: result.status === 0 && !result.error && buildUnchanged && (phase !== "build" || buildAfter !== null) ? "PASS" : "FAIL" };
        if (["browser-public", "propagation"].includes(phase)) {
            const support = readServerEvidence(report);
            report.serverEvidenceSha256 = support?.sha256 ?? null;
            if (!serverEvidenceMatches(report, support, before)) report.status = "FAIL";
        }
        return publishReport(handle, report, () => captureCandidate(baseSha).id === before.id);
    } finally { closeSync(handle.fd); }
}

function resolveBase(base) {
    if (!nonempty(base) || base.startsWith("-") || !/^[A-Za-z0-9_/.-]+$/.test(base)) throw new Error("Specify an existing base ref explicitly.");
    return git("rev-parse", "--verify", `${base}^{commit}`);
}

/** @param {{base: string, inputs: string[], required: string[], output?: string, plan?: any, snapshot?: any}} options */
export function summarizePhases({ base, inputs, required, output, plan = null, snapshot = null }) {
    const preflight = prepareVerification(base, plan, snapshot);
    if (preflight.scope.status !== "PASS") return reportPreflight(preflight, output ?? "phase-summary.json");
    const baseSha = preflight.baseSha;
    const before = captureCandidate(baseSha);
    const receipts = inputs.map(name => {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(name)) throw new Error("Invalid phase evidence filename.");
        if (!existsSync(join(".agent-runs", name))) return null;
        try { return readEvidenceJson(name).report; } catch { throw new Error("Invalid or unsafe phase evidence JSON."); }
    }).filter(Boolean);
    const supports = {};
    for (const receipt of receipts) {
        if (!["browser-public", "propagation"].includes(receipt.phase)) continue;
        const support = readServerEvidence(receipt);
        if (support) supports[receipt.serverEvidence] = support;
    }
    const needed = [...new Set([...required, ...preflight.scope.verification.phases])];
    const report = { version: 3, kind: "summary", ...combinePhaseEvidence(receipts, needed, before, supports), scope: preflight.scope, candidateUnchanged: true,
        manualChecks: preflight.scope.verification.manual.map(check => ({ check, status: "UNVERIFIED" })) };
    if (report.status === "PASS" && report.manualChecks.length) report.status = "UNVERIFIED";
    report.verificationComplete = report.status === "PASS";
    const handle = beginReport(process.cwd(), output ?? "phase-summary.json");
    try { return publishReport(handle, report, () => captureCandidate(baseSha).id === before.id); }
    finally { closeSync(handle.fd); }
}

/** @param {{base: string, output?: string, plan?: any, snapshot?: any}} options */
export function verify({ base, output = "verification.json", plan = null, snapshot = null }) {
    if (!nonempty(base) || base.startsWith("-") || !/^[A-Za-z0-9_/.-]+$/.test(base)) throw new Error("Specify an existing base ref explicitly.");
    const preflight = prepareVerification(base, plan, snapshot);
    if (preflight.scope.status !== "PASS" || !preflight.execution.allowed) return reportPreflight(preflight, output);
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const commands = verificationCommands(pkg).filter(command => command.prisma ? preflight.scope.verification.phases.includes("build") : preflight.scope.verification.phases.includes(command.name));
    commands.push({ name: "context-links", args: ["scripts/check-context-links.mjs"], nodeScript: true });
    const env = checkEnvironment();
    const npmCli = resolveNpmCli();
    const npm = npmCli.path;
    const prisma = resolve("node_modules/prisma/build/index.js");
    if (!existsSync(npm) || (commands.some((command) => command.prisma) && !existsSync(prisma))) throw new Error("Locked local dependencies are missing; inspect before installing.");
    const handle = beginReport(process.cwd(), output);
    try {
    const head = git("rev-parse", "HEAD");
    const baseSha = git("rev-parse", "--verify", `${base}^{commit}`);
    const before = fingerprint();
    const candidate = captureCandidate(baseSha);
    const harnessBefore = sha256(readFileSync(new URL(import.meta.url)));
    const startedAt = new Date().toISOString();
    const results = [];
    for (const command of commands) {
        const phaseBefore = captureCandidate(baseSha);
        const start = Date.now();
        const args = command.prisma ? [prisma, command.prisma] : command.nodeScript ? command.args : [npm, ...command.args];
        const result = spawnSync(process.execPath, args, { env, encoding: "utf8", windowsHide: true, timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024 });
        const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
        const phaseAfter = captureCandidate(baseSha);
        const counts = {};
        for (const key of ["tests", "pass", "fail", "skipped", "cancelled", "todo"]) {
            const match = combined.match(new RegExp(`^# ${key} (\\d+)$`, "m"));
            if (match) counts[key] = Number(match[1]);
        }
        results.push({ name: command.name, commandDefinitionSha256: sha256(command.nodeScript ? "node scripts/check-context-links.mjs" : command.script ?? `prisma ${command.prisma}`), exitCode: result.status,
            status: result.status === 0 && !result.error && phaseBefore.id === candidate.id && phaseAfter.id === candidate.id ? "PASS" : "FAIL", elapsedMs: Date.now() - start, counts,
            diagnostics: diagnostics(combined, result), candidateBefore: phaseBefore.id, candidateAfter: phaseAfter.id,
            errorCode: result.error?.code ?? null, outputSha256: sha256(combined) });
        console.error(`${command.name}: ${results.at(-1).status}${Object.keys(counts).length ? ` ${JSON.stringify(counts)}` : ""}`);
        if (results.at(-1).status !== "PASS") break;
    }
    const after = fingerprint();
    const whitespace = spawnSync("git", ["diff", "--check", baseSha], { encoding: "utf8", windowsHide: true });
    const expectedNode = readFileSync(".node-version", "utf8").trim();
    const report = { version: 2, repository: REPOSITORY, head, baseSha, candidate, startedAt, finishedAt: new Date().toISOString(),
        candidateBefore: before, candidateAfter: after, candidateUnchanged: before === after && head === git("rev-parse", "HEAD") && harnessBefore === sha256(readFileSync(new URL(import.meta.url))),
        harnessSha256: harnessBefore, lockSha256: sha256(readFileSync("package-lock.json")),
        runtime: { actualNode: process.versions.node, expectedNode, matches: process.versions.node === expectedNode, actualNpm: npmCli.version },
        commands: results, diffCheck: whitespace.status === 0 ? "PASS" : "FAIL",
        scope: preflight.scope, execution: preflight.execution, implementationAuthority: "UNVERIFIED",
        unverified: ["real Clerk/Blob", "GitHub checks", "deployment and user comprehension"] };
    Object.assign(report, verificationOutcome(preflight.scope.verification, results, results.length === commands.length, report.candidateUnchanged, report.diffCheck === "PASS"));
    return publishReport(handle, report, () => after === fingerprint() && head === git("rev-parse", "HEAD")
        && harnessBefore === sha256(readFileSync(new URL(import.meta.url))));
    } finally { closeSync(handle.fd); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try {
        const [command, ...args] = process.argv.slice(2);
        const flags = {};
        for (let i = 0; i < args.length; i += 2) {
            if (!["--snapshot", "--plan", "--base", "--output", "--phase", "--inputs", "--required"].includes(args[i]) || !args[i + 1] || flags[args[i]]) throw new Error("Invalid arguments.");
            flags[args[i]] = args[i + 1];
        }
        const data = value => {
            if (!value) return null;
            const name = value.replaceAll("\\", "/").replace(/^\.agent-runs\//, "");
            return readEvidenceJson(name).report;
        };
        const plan = data(flags["--plan"]), snapshot = data(flags["--snapshot"]);
        const result = command === "queue" && snapshot ? assessQueue(snapshot)
            : command === "verify" ? verify({ base: flags["--base"], output: flags["--output"], plan, snapshot })
                : command === "phase" ? runPhase({ base: flags["--base"], phase: flags["--phase"], output: flags["--output"], plan, snapshot })
                    : command === "summarize" ? summarizePhases({ base: flags["--base"], inputs: (flags["--inputs"] ?? "").split(","), required: (flags["--required"] ?? "").split(","), output: flags["--output"], plan, snapshot }) : null;
        if (!result) throw new Error("Use queue --snapshot <file> or verify --base <ref> [--output <name.json>].");
        console.log(JSON.stringify(result, null, 2));
        if (["FAIL", "UNVERIFIED"].includes(result.status)) process.exitCode = 1;
    } catch { console.error("Harness refused invalid/unsafe input or an unavailable precondition; raw errors were not printed."); process.exitCode = 1; }
}
