import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ASSESSMENT_MARKER = "<!-- clearallergy-agent:v1 -->";
const REPOSITORY = "Kaito-Iwase/ClearAllergy";
const PRIORITIES = ["security", "safety", "regression", "bug", "blocker", "correctness", "testability", "maintainability", "ux", "feature", "optimization"];
const REQUIRED_SCRIPTS = ["lint", "typecheck", "test", "build"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const stringList = (value) => Array.isArray(value) && value.length > 0 && value.every(nonempty);
const validNumber = (value) => Number.isSafeInteger(value) && value > 0;
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
    const npm = resolve("node_modules/npm/bin/npm-cli.js");
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
        runtime: { actualNode: process.versions.node, expectedNode, matches: process.versions.node === expectedNode },
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
            if (!["--snapshot", "--base", "--output"].includes(args[i]) || !args[i + 1] || flags[args[i]]) throw new Error("Invalid arguments.");
            flags[args[i]] = args[i + 1];
        }
        const result = command === "queue" && flags["--snapshot"]
            ? assessQueue(JSON.parse(readFileSync(flags["--snapshot"], "utf8").replace(/^\uFEFF/, "")))
            : command === "verify" ? verify({ base: flags["--base"], output: flags["--output"] }) : null;
        if (!result) throw new Error("Use queue --snapshot <file> or verify --base <ref> [--output <name.json>].");
        console.log(JSON.stringify(result, null, 2));
        if (result.status === "FAIL") process.exitCode = 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
