import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveNpmCli } from "./npm-cli.mjs";
import { formatHarnessSummary } from "./agent-harness-output.mjs";

export const ASSESSMENT_MARKER = "<!-- clearallergy-agent:v1 -->";
const REPOSITORY = "Kaito-Iwase/ClearAllergy";
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const CI_WORKFLOW = ".github/workflows/ci.yml";
const PRIORITIES = ["security", "safety", "regression", "bug", "blocker", "correctness", "testability", "maintainability", "ux", "feature", "optimization"];
const REQUIRED_SCRIPTS = ["lint", "typecheck", "test", "build"];
const BLOCKING_LABELS = ["agent-blocked", "human-review", "duplicate", "invalid", "wontfix"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const stringList = (value) => Array.isArray(value) && value.length > 0 && value.every(nonempty);
const validNumber = (value) => Number.isSafeInteger(value) && value > 0;
const gitSha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const unique = (values) => new Set(values).size === values.length;

function currentObservation(fetchedAt, now) {
    if (typeof fetchedAt !== "string") return false;
    const age = now - Date.parse(fetchedAt);
    return Number.isFinite(age) && age >= -60_000 && age <= 15 * 60_000;
}

function hasBodyBlocker(issue) {
    const statusText = issue.body.replace(/[`*#|]/g, "")
        .replace(/(^|[^\p{L}\p{N}_])_+|_+(?=$|[^\p{L}\p{N}_])/gu, "$1");
    return /HUMAN_DECISION_REQUIRED|\[Decision\]|\[Blocked\]/i.test(issue.title)
        || /^\s*(?:[-+]\s+)?(?:状態|Status\b)\s*[:：]?\s*(?:HUMAN_DECISION_REQUIRED|BLOCKED)\b/im.test(statusText);
}
export function validScopePath(value) {
    return nonempty(value) && !value.startsWith("/") && !/[\\:\x00-\x1f]/.test(value)
        && value.replace(/\/$/, "").split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
export function scopesOverlap(left, right) {
    const a = left.replace(/\/$/, "").toLowerCase();
    const b = right.replace(/\/$/, "").toLowerCase();
    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export function definitionHash(issue) {
    return sha256(JSON.stringify([issue.number, issue.title, issue.body ?? ""]));
}

// Read only tagged JSON from comments, never instructions in arbitrary issue text.
export function assessmentFromComments(comments) {
    const latest = [...comments].reverse().find((comment) => comment.body?.includes(ASSESSMENT_MARKER));
    if (!latest) return null;
    const match = latest.body.split(ASSESSMENT_MARKER)[1]?.match(/^\s*```json\s*([\s\S]*?)\s*```\s*$/);
    if (!match) return null;
    try { return { data: JSON.parse(match[1]), author: latest.user?.login, url: latest.html_url }; }
    catch { return null; }
}

export function protectedArea(paths) {
    const scopes = ["prisma", "proxy.ts", "lib/auth", "lib/allergens.ts", "lib/db", "lib/db.ts", "features/admin", "app/api"];
    return paths.some((path) => scopes.some((scope) => scopesOverlap(path, scope))
        || /allergen|publication|invitation|privacy|terms/i.test(path));
}

// Advisory selection only. This function grants no GitHub, shell or merge authority.
export function assessQueue(snapshot, now = Date.now()) {
    if (snapshot.repository !== REPOSITORY || snapshot.version !== 1 || !nonempty(snapshot.actorLogin)
        || !/^[a-f0-9]{40}$/.test(snapshot.baseSha ?? "") || !Array.isArray(snapshot.issues) || !Array.isArray(snapshot.pullRequests)) {
        throw new Error("Invalid GitHub snapshot; do not select an issue.");
    }
    if (!currentObservation(snapshot.fetchedAt, now)) throw new Error("GitHub snapshot is stale; fetch again.");
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
        if (hasBodyBlocker(issue)) reasons.push("human decision or body blocker");
        if (issue.labels.some((label) => BLOCKING_LABELS.includes(label))) reasons.push("blocking label");
        if (!(issue.labels ?? []).includes("agent-ready")) reasons.push("not labelled agent-ready");
        if (!plan || record.author !== snapshot.actorLogin || !nonempty(record.url)) reasons.push("missing trusted assessment comment");
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
            manualMergeRequired: true, assessmentUrl: record?.url ?? null };
    });
    rows.sort((a, b) => Number(b.ready) - Number(a.ready)
        || (PRIORITIES.indexOf(a.priority) < 0 ? 99 : PRIORITIES.indexOf(a.priority)) - (PRIORITIES.indexOf(b.priority) < 0 ? 99 : PRIORITIES.indexOf(b.priority))
        || a.number - b.number);
    return { repository: snapshot.repository, fetchedAt: snapshot.fetchedAt, baseSha: snapshot.baseSha,
        selected: rows.find((row) => row.ready)?.number ?? null, issues: rows,
        nextAction: rows.some((row) => row.ready) ? "re-fetch selected issue, comments, dependencies and PRs; claim before implementation" : "one bounded repository audit; then record blockers and stop if no ready issue" };
}

function evidenceUrl(value) {
    if (!nonempty(value) || /[\s<>?]/.test(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.hash.includes("=");
    } catch { return false; }
}

function validCompletionPlan(pulls) {
    return Array.isArray(pulls) && pulls.length > 0 && pulls.every((pull) =>
        validNumber(pull?.number) && gitSha(pull.headSha) && nonempty(pull.baseRef)
        && Array.isArray(pull.deployments) && pull.deployments.every((deployment) =>
            nonempty(deployment?.target) && evidenceUrl(deployment.origin) && new URL(deployment.origin).origin === deployment.origin)
        && unique(pull.deployments.map(({ target }) => target))
        && unique(pull.deployments.map(({ origin }) => origin))
        && (pull.deployments.length > 0 || nonempty(pull.noDeploymentReason))
    ) && unique(pulls.map((pull) => pull.number));
}

function sameAcceptanceScope(left, right) {
    return left?.criterion === right.criterion && left.pullRequest === right.pullRequest && left.target === right.target;
}

function validAcceptancePlan(scopes, criteria, pulls) {
    return Array.isArray(scopes) && scopes.every((scope, index) => {
        const pull = pulls.find(({ number }) => number === scope?.pullRequest);
        return criteria.includes(scope?.criterion) && pull
            && (scope.target === null || pull.deployments.some(({ target }) => target === scope.target))
            && !scopes.slice(0, index).some((prior) => sameAcceptanceScope(prior, scope));
    }) && criteria.every((criterion) => scopes.some((scope) => scope.criterion === criterion));
}

function deploymentIncludesMerge(deployment, mergeSha) {
    const sha = deployment.commitSha;
    return gitSha(sha) && (sha === mergeSha || (deployment.comparison?.status === "ahead"
        && deployment.comparison.url === `${REPOSITORY_URL}/compare/${mergeSha}...${sha}`));
}

function validRelatedIssues(issues, issueNumber) {
    return Array.isArray(issues) && issues.every((item) => validNumber(item?.number)
        && item.number !== issueNumber && ["OPEN", "CLOSED"].includes(item.state))
        && unique(issues.map(({ number }) => number));
}

function consistentObservation(observations, key, identity) {
    const value = JSON.stringify(identity);
    if (observations.has(key)) return observations.get(key) === value;
    observations.set(key, value);
    return true;
}

// Normalize observations with live GitHub/provider reads before calling this gate.
// A passing snapshot is a proposal. The caller rechecks it before writing to GitHub.
export function assessIssueCompletion(snapshot, now = Date.now()) {
    const issue = snapshot?.issue;
    const pulls = snapshot?.pullRequests;
    if (snapshot?.repository !== REPOSITORY || snapshot.version !== 1 || !nonempty(snapshot.actorLogin)
        || !currentObservation(snapshot.fetchedAt, now) || !validNumber(issue?.number) || !nonempty(issue.title)
        || typeof issue.body !== "string" || !["OPEN", "CLOSED"].includes(issue.state)
        || !Array.isArray(issue.labels) || !issue.labels.every(nonempty)
        || !Array.isArray(issue.assignees) || !issue.assignees.every(nonempty)
        || !validRelatedIssues(issue.subIssues, issue.number) || !validRelatedIssues(issue.dependencies, issue.number)
        || !Array.isArray(pulls) || !pulls.every((pull) => validNumber(pull?.number)
            && ["OPEN", "CLOSED", "MERGED"].includes(pull.state) && Array.isArray(pull.linkedIssues) && pull.linkedIssues.every(validNumber))
        || !unique(pulls.map((pull) => pull.number)) || !Array.isArray(snapshot.acceptance)) {
        throw new Error("Invalid or stale completion snapshot; fetch live evidence again.");
    }

    const blockers = [];
    const fetchedAt = Date.parse(snapshot.fetchedAt);
    const hash = definitionHash(issue);
    const record = issue.assessment;
    const plan = record?.data;
    const criteria = plan?.acceptanceCriteria;
    const plannedPulls = plan?.completion?.pullRequests;
    const acceptancePlan = plan?.completion?.acceptance;
    if (issue.state !== "OPEN") blockers.push("issue is already closed");
    if (hasBodyBlocker(issue) || issue.labels.some((label) => BLOCKING_LABELS.includes(label))) blockers.push("human decision or blocker unresolved");
    if (issue.assignees.some((login) => login !== snapshot.actorLogin)) blockers.push("assigned to another owner");
    if ([...issue.subIssues, ...issue.dependencies].some(({ state, stateReason }) => state !== "CLOSED" || stateReason !== "completed")) {
        blockers.push("sub-issue or dependency unresolved");
    }
    if (pulls.some((pull) => pull.state === "OPEN" && pull.linkedIssues.includes(issue.number))) blockers.push("linked PR still open");

    const assessmentPrefix = `${REPOSITORY_URL}/issues/${issue.number}#issuecomment-`;
    const trustedPlan = record?.author === snapshot.actorLogin && evidenceUrl(record.url)
        && record.url.startsWith(assessmentPrefix) && /^[1-9]\d*$/.test(record.url.slice(assessmentPrefix.length))
        && plan?.state === "awaiting-review" && plan.definitionHash === hash
        && plan.productDecisionRequired === false && plan.approvalRequired === false && plan.blocker === null
        && Array.isArray(plan.dependencies) && plan.dependencies.every((number) => validNumber(number)
            && issue.dependencies.some((dependency) => dependency.number === number))
        && stringList(criteria) && unique(criteria) && validCompletionPlan(plannedPulls)
        && validAcceptancePlan(acceptancePlan, criteria, plannedPulls);
    if (!trustedPlan) blockers.push("missing trusted completion plan for the current issue");

    const mergedEvidence = [];
    const ciByUrl = new Map();
    const deploymentByUrl = new Map();
    const activeByOrigin = new Map();
    const acceptanceEvidence = [];
    if (trustedPlan) {
        for (const expected of plannedPulls) {
            const pull = pulls.find((item) => item.number === expected.number);
            const mergedAt = Date.parse(pull?.mergedAt);
            if (pull?.state !== "MERGED" || !pull.linkedIssues.includes(issue.number)
                || pull.headSha !== expected.headSha || pull.baseRef !== expected.baseRef || !gitSha(pull.mergeSha)
                || typeof pull.mergedAt !== "string" || !Number.isFinite(mergedAt) || mergedAt > fetchedAt) {
                blockers.push(`PR #${expected.number} does not match the reviewed merge`);
                continue;
            }
            const ci = pull.ci;
            const ciStartedAt = Date.parse(ci?.startedAt);
            const ciCompletedAt = Date.parse(ci?.completedAt);
            if (ci?.status !== "PASS" || ci.event !== "push" || ci.commitSha !== pull.mergeSha
                || ci.branch !== pull.baseRef || ci.workflowPath !== CI_WORKFLOW || !validNumber(ci.runAttempt)
                || typeof ci.startedAt !== "string" || !Number.isFinite(ciStartedAt) || ciStartedAt < mergedAt
                || typeof ci.completedAt !== "string" || !Number.isFinite(ciCompletedAt) || ciCompletedAt < ciStartedAt || ciCompletedAt > fetchedAt
                || !evidenceUrl(ci.url) || !ci.url.startsWith(`${REPOSITORY_URL}/actions/runs/`)
                || !/^[1-9]\d*$/.test(ci.url.slice(`${REPOSITORY_URL}/actions/runs/`.length))) {
                blockers.push(`PR #${pull.number} lacks successful CI for its merge commit`);
            } else if (!consistentObservation(ciByUrl, ci.url, [ci.branch, ci.commitSha, ci.runAttempt, ciStartedAt, ciCompletedAt])) {
                blockers.push("conflicting observations for the same CI run");
            }

            const deployments = [];
            for (const { target, origin } of expected.deployments) {
                const matches = Array.isArray(pull.deployments) ? pull.deployments.filter((item) => item?.target === target) : [];
                const deployment = matches[0];
                const verification = deployment?.verification;
                const readyAt = Date.parse(deployment?.readyAt);
                const observedAt = Date.parse(verification?.observedAt);
                if (matches.length !== 1 || deployment.state !== "READY" || deployment.active !== true
                    || !deploymentIncludesMerge(deployment, pull.mergeSha) || !evidenceUrl(deployment.url)
                    || verification?.status !== "PASS" || verification.commitSha !== deployment.commitSha
                    || !evidenceUrl(verification.url) || new URL(verification.url).origin !== origin || !nonempty(verification.summary)
                    || typeof deployment.readyAt !== "string" || !Number.isFinite(readyAt)
                    || !currentObservation(verification.observedAt, now) || observedAt < Math.max(readyAt, mergedAt) || observedAt > fetchedAt) {
                    blockers.push(`PR #${pull.number} lacks current deployment and verification for ${target}`);
                    continue;
                }
                const deploymentUrl = new URL(deployment.url).href;
                if (!consistentObservation(deploymentByUrl, deploymentUrl, [deployment.commitSha, readyAt])) {
                    blockers.push("conflicting observations for the same deployment");
                    continue;
                }
                if (!consistentObservation(activeByOrigin, origin, [deploymentUrl])) {
                    blockers.push(`conflicting active deployments for ${origin}`);
                    continue;
                }
                deployments.push({ target, origin, commitSha: deployment.commitSha, url: deployment.url, readyAt: deployment.readyAt,
                    comparisonUrl: deployment.commitSha === pull.mergeSha ? null : deployment.comparison.url,
                    verification: { observedAt: verification.observedAt, url: verification.url, summary: verification.summary } });
            }
            mergedEvidence.push({ number: pull.number, url: `${REPOSITORY_URL}/pull/${pull.number}`,
                baseRef: pull.baseRef, headSha: pull.headSha, mergeSha: pull.mergeSha, mergedAt: pull.mergedAt, ciUrl: ci?.url,
                ciRunAttempt: ci?.runAttempt,
                deployments, noDeploymentReason: expected.deployments.length === 0 ? expected.noDeploymentReason : null });
        }
        for (const scope of acceptancePlan) {
            const matching = snapshot.acceptance.filter((check) => sameAcceptanceScope(check, scope));
            const check = matching[0];
            const pull = mergedEvidence.find(({ number }) => number === scope.pullRequest);
            const deployment = pull?.deployments.find(({ target }) => target === scope.target);
            const commit = scope.target === null ? pull?.mergeSha : deployment?.commitSha;
            if (matching.length !== 1 || check.status !== "PASS" || !commit || check.commitSha !== commit
                || !evidenceUrl(check.url) || !nonempty(check.summary)
                || (deployment && (check.deploymentUrl !== deployment.url || !currentObservation(check.observedAt, now)
                    || Date.parse(check.observedAt) < Math.max(Date.parse(deployment.readyAt), Date.parse(pull.mergedAt))
                    || Date.parse(check.observedAt) > fetchedAt))) continue;
            acceptanceEvidence.push({ criterion: scope.criterion, pullRequest: scope.pullRequest, target: scope.target,
                commitSha: commit, url: check.url, summary: check.summary, deploymentUrl: deployment?.url ?? null,
                observedAt: deployment ? check.observedAt : null });
        }
        if (acceptanceEvidence.length !== acceptancePlan.length || snapshot.acceptance.length !== acceptancePlan.length) {
            blockers.push("one or more acceptance criteria lack passing evidence for the required PR and environment");
        }
    }

    const readyToClose = blockers.length === 0;
    const completionKey = readyToClose ? sha256(JSON.stringify([hash, record.url, mergedEvidence.map((pull) =>
        [pull.number, pull.baseRef, pull.headSha, pull.mergeSha, pull.ciUrl, pull.ciRunAttempt, pull.noDeploymentReason,
            pull.deployments.map(({ target, origin, commitSha, url }) => [target, origin, commitSha, url])]),
        acceptanceEvidence.map(({ criterion, pullRequest, target, commitSha, url }) => [criterion, pullRequest, target, commitSha, url])
    ])) : null;
    return { repository: REPOSITORY, number: issue.number, definitionHash: hash, fetchedAt: snapshot.fetchedAt,
        readyToClose, blockers, completionKey, evidence: readyToClose ? { assessmentUrl: record.url, pullRequests: mergedEvidence,
            acceptance: acceptanceEvidence } : null,
        nextAction: readyToClose ? "re-fetch live evidence; record completion; close and re-read the issue" : "leave the issue open; resolve the blockers" };
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
    write({ ...report, status: "VERIFYING" });
    report.publicationSafe = sameReportLocation(handle);
    report.candidateUnchanged = report.candidateUnchanged && candidateUnchanged();
    if (!report.publicationSafe || !report.candidateUnchanged) report.status = "FAIL";
    write(report); // Held descriptor cannot follow a directory/link swapped during checks.
    return report;
}

// No inherited credentials or DB target. Read-only builds use an unreachable local DB.
function checkEnvironment() {
    for (const path of [".env", ".env.local", ".env.production", ".env.production.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local", ".clerk"]) {
        if (existsSync(path)) throw new Error("Use a clean isolated worktree without environment/account files.");
    }
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|NUMBER_OF_PROCESSORS)$/i.test(key)) env[key] = value;
    }
    return { ...env, CI: "true", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused?connect_timeout=1", DIRECT_URL: "postgresql://unused:unused@127.0.0.1:1/unused?connect_timeout=1",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlYXJhbGxlcmd5LWNpLmNsZXJrLmFjY291bnRzLmRldiQ", CLERK_SECRET_KEY: "sk_test_ci_placeholder_not_a_real_key",
        PORTFOLIO_MODE: "true", ADMIN_REGISTRATION_MODE: "disabled", ENABLE_CLERK_ADMIN_AUTH: "false", NEXT_PUBLIC_APP_URL: "http://localhost:3000" };
}

export function verify({ base, output = "verification.json" }) {
    if (!nonempty(base) || base.startsWith("-") || !/^[A-Za-z0-9_/.-]+$/.test(base)) throw new Error("Specify an existing base ref explicitly.");
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const commands = verificationCommands(pkg);
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
    const harnessBefore = sha256(readFileSync(new URL(import.meta.url)));
    const startedAt = new Date().toISOString();
    const results = [];
    for (const command of commands) {
        const start = Date.now();
        const args = command.prisma ? [prisma, command.prisma] : [npm, ...command.args];
        const result = spawnSync(process.execPath, args, { env, encoding: "utf8", windowsHide: true, timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024 });
        const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
        const counts = {};
        for (const key of ["tests", "pass", "fail", "skipped", "cancelled", "todo"]) {
            const match = combined.match(new RegExp(`^# ${key} (\\d+)$`, "m"));
            if (match) counts[key] = Number(match[1]);
        }
        results.push({ name: command.name, script: command.script ?? `prisma ${command.prisma}`, exitCode: result.status,
            status: result.status === 0 && !result.error ? "PASS" : "FAIL", elapsedMs: Date.now() - start, counts,
            errorCode: result.error?.code ?? null, outputSha256: sha256(combined) });
        console.error(`${command.name}: ${results.at(-1).status}${Object.keys(counts).length ? ` ${JSON.stringify(counts)}` : ""}`);
        if (result.status !== 0 || result.error) break;
    }
    const after = fingerprint();
    const whitespace = spawnSync("git", ["diff", "--check", baseSha], { encoding: "utf8", windowsHide: true });
    const expectedNode = readFileSync(".node-version", "utf8").trim();
    const report = { version: 1, repository: REPOSITORY, head, baseSha, startedAt, finishedAt: new Date().toISOString(),
        candidateBefore: before, candidateAfter: after, candidateUnchanged: before === after && head === git("rev-parse", "HEAD") && harnessBefore === sha256(readFileSync(new URL(import.meta.url))),
        harnessSha256: harnessBefore, lockSha256: sha256(readFileSync("package-lock.json")),
        runtime: { actualNode: process.versions.node, expectedNode, matches: process.versions.node === expectedNode, actualNpm: npmCli.version },
        commands: results, diffCheck: whitespace.status === 0 ? "PASS" : "FAIL",
        unverified: ["real PostgreSQL constraints/races", "browser and accessibility", "real Clerk/Blob", "GitHub checks", "deployment and user comprehension"] };
    report.status = results.length === commands.length && results.every((result) => result.status === "PASS") && report.candidateUnchanged && report.diffCheck === "PASS" ? "PASS" : "FAIL";
    return publishReport(handle, report, () => after === fingerprint() && head === git("rev-parse", "HEAD")
        && harnessBefore === sha256(readFileSync(new URL(import.meta.url))));
    } finally { closeSync(handle.fd); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try {
        const [command, ...args] = process.argv.slice(2);
        const flags = {};
        for (let i = 0; i < args.length; i += 2) {
            if (!["--snapshot", "--base", "--output", "--format"].includes(args[i]) || !args[i + 1] || flags[args[i]]) throw new Error("Invalid arguments.");
            flags[args[i]] = args[i + 1];
        }
        const format = flags["--format"] ?? "json";
        if (!["json", "summary"].includes(format)) throw new Error("Use --format json or --format summary.");
        const plannedCommands = command === "verify" && format === "summary"
            ? verificationCommands(JSON.parse(readFileSync("package.json", "utf8"))).map((item) => item.name) : [];
        const snapshotCommand = flags["--snapshot"] && (command === "queue" || command === "completion");
        const readSnapshot = () => JSON.parse(readFileSync(flags["--snapshot"], "utf8").replace(/^\uFEFF/, ""));
        const result = snapshotCommand ? (command === "queue" ? assessQueue(readSnapshot()) : assessIssueCompletion(readSnapshot()))
            : command === "verify" ? verify({ base: flags["--base"], output: flags["--output"] }) : null;
        if (!result) throw new Error("Use queue/completion --snapshot <file> or verify --base <ref> [--output <name.json>] [--format summary|json].");
        console.log(format === "json" ? JSON.stringify(result, null, 2) : formatHarnessSummary(command, result, {
            snapshotPath: flags["--snapshot"], reportPath: `.agent-runs/${flags["--output"] ?? "verification.json"}`, plannedCommands,
        }));
        if (result.status === "FAIL" || result.readyToClose === false) process.exitCode = 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
