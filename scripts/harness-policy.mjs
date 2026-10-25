import { execFileSync } from "node:child_process";

export const INVENTORY_PARTS = ["issues", "pullRequests", "comments", "dependencies", "pullRequestFiles"];
export function inventoryComplete(snapshot) {
    return INVENTORY_PARTS.every(key => snapshot?.collectionComplete?.[key] === true);
}
export function validScopePath(value) {
    return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !/[\\:\x00-\x1f]/.test(value)
        && value.replace(/\/$/, "").split("/").every(part => part && part !== "." && part !== "..");
}
export function scopesOverlap(left, right) {
    // Conflict detection is conservative on Windows. Declared edit permission
    // below still requires exact Git casing, rather than broadening permission.
    const a = left.replace(/\/$/, "").toLowerCase(), b = right.replace(/\/$/, "").toLowerCase();
    return a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
}
export function protectedArea(paths) {
    const scopes = ["prisma", "proxy.ts", "lib/auth", "lib/allergens.ts", "lib/db", "lib/db.ts", "features/admin", "app/api",
        "lib/public-db.ts", "lib/public-cache.ts", "app/(public)/shops", "features/public/shops/server", "features/public/shops/components/PublicMenuDetailBodyClient.tsx",
        "features/public/shops/components/PublicMenuSearchSummaryClient.tsx", "features/public/shops/components/ShopMenuListClient.tsx"];
    return paths.some(path => scopes.some(scope => scopesOverlap(path.toLowerCase(), scope.toLowerCase())) || /allergen|publication|invitation|privacy|terms/i.test(path));
}

// Git names only. No source/configuration contents or Issue text are executed.
export function readGitChanges(baseSha, cwd = process.cwd()) {
    if (!/^[a-f0-9]{40}$/.test(baseSha)) throw new Error("Invalid diff base.");
    const run = args => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
    const tokens = run(["diff", "--name-status", "-z", "--find-renames", baseSha, "--"]).split("\0").filter(Boolean);
    const changes = [];
    for (let i = 0; i < tokens.length;) {
        const status = tokens[i++], count = /^[RC]\d+$/.test(status) ? 2 : 1;
        if (!/^(?:[AMDUTX]|[RC]\d+)$/.test(status) || i + count > tokens.length) throw new Error("Unknown Git change format.");
        const paths = tokens.slice(i, i + count); i += count;
        if (!paths.every(validScopePath)) throw new Error("Unsupported Git path; review manually.");
        changes.push({ status, paths });
    }
    for (const path of run(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)) {
        if (!validScopePath(path)) throw new Error("Unsupported Git path; review manually.");
        changes.push({ status: "?", paths: [path] });
    }
    return changes;
}

export function requiredVerification(paths) {
    const docsOnly = paths.length > 0 && paths.every(path => /\.(?:md|txt|drawio|svg)$/.test(path) && !path.startsWith("app/") && !path.startsWith("public/"));
    const phases = new Set(docsOnly ? ["context-links"] : ["test", "lint", "typecheck", "build", "context-links"]);
    const manual = new Set();
    if (paths.some(path => /^(?:prisma\/|lib\/db(?:\.ts|\/))/.test(path))) {
        phases.add("db-constraints"); phases.add("db-publication");
        if (paths.some(path => path.startsWith("prisma/migrations/"))) manual.add("migration-compatibility-and-recovery");
    }
    if (paths.some(path => path.startsWith("features/admin/menus/server/") || /^lib\/.*(?:food-review|publication)/.test(path))) {
        phases.add("db-publication"); phases.add("db-owned-menu");
    }
    if (paths.some(path => path.startsWith("features/admin/shop/server/"))) phases.add("db-shop");
    if (paths.some(path => path.startsWith("features/public/shops/server/") || path === "lib/public-db.ts")) { phases.add("db-snapshot"); phases.add("browser-public"); }
    if (paths.some(path => /(?:public-cache|publication|food-review)/.test(path) && !/^(?:docs|tests)\//.test(path))) phases.add("propagation");
    if (paths.some(path => /^(?:app\/|features\/.*\/components\/|components\/)/.test(path))) { phases.add("browser-public"); manual.add("changed-ui-keyboard-and-states"); }
    if (paths.some(path => path.startsWith("lib/auth/") || path === "proxy.ts")) { phases.add("db-constraints"); manual.add("authentication-and-ownership-boundaries"); }
    return { phases: [...phases], manual: [...manual], basis: "actual Git paths; acceptance criteria may add checks, never waive these implicitly" };
}

export function verificationOutcome(requirements, results, commandsComplete = true, candidateUnchanged = true, diffClean = true) {
    const codeChecksStatus = commandsComplete && candidateUnchanged && diffClean && results.every(result => result.status === "PASS") ? "PASS" : "FAIL";
    const missingRequiredChecks = requirements.phases.filter(phase => !results.some(result => result.name === phase && result.status === "PASS"));
    const manualChecks = requirements.manual.map(check => ({ check, status: "UNVERIFIED" }));
    const status = codeChecksStatus === "FAIL" ? "FAIL" : missingRequiredChecks.length || manualChecks.length ? "UNVERIFIED" : "PASS";
    return { status, codeChecksStatus, missingRequiredChecks, manualChecks, verificationComplete: status === "PASS" };
}

/** @param {{paths?: string[], issueNumber?: number, pullRequestNumber?: number, expectedPullRequestHead?: string} | null} plan */
export function scopePreflight(plan, changes, snapshot, now = Date.now()) {
    const paths = [...new Set(changes.flatMap(change => change.paths))].sort();
    const verification = requiredVerification(paths);
    if (!Array.isArray(plan?.paths) || !plan.paths.length || !plan.paths.every(validScopePath)) return { status: "UNVERIFIED", reasons: ["declared scope missing or invalid"], paths, verification };
    if (!paths.length) return { status: "UNVERIFIED", reasons: ["no Git changes to verify"], paths, verification };
    const unexpected = paths.filter(path => !plan.paths.some(scope => path === scope.replace(/\/$/, "") || path.startsWith(scope.replace(/\/$/, "") + "/")));
    if (unexpected.length) return { status: "FAIL", reasons: ["Git changes exceed declared scope; stop for scope review"], paths, unexpected, verification };
    const age = now - Date.parse(snapshot?.fetchedAt);
    if (!inventoryComplete(snapshot) || snapshot?.repository !== "Kaito-Iwase/ClearAllergy" || !Array.isArray(snapshot.issues) || !Array.isArray(snapshot.pullRequests)
        || !Number.isFinite(age) || age < -60_000 || age > 15 * 60_000) return { status: "UNVERIFIED", reasons: ["complete current GitHub inventory required"], paths, verification };
    if (typeof snapshot.actorLogin !== "string" || !snapshot.actorLogin || !Number.isSafeInteger(plan.issueNumber)
        || snapshot.issues.some(issue => !Number.isSafeInteger(issue.number) || !["OPEN", "CLOSED"].includes(issue.state) || !Array.isArray(issue.assignees))
        || snapshot.pullRequests.some(pull => !Number.isSafeInteger(pull.number) || !["OPEN", "CLOSED", "MERGED"].includes(pull.state) || !/^[a-f0-9]{40}$/.test(pull.headSha ?? "")))
        return { status: "UNVERIFIED", reasons: ["current issue/owner/PR head inventory required"], paths, verification };
    const issue = snapshot.issues.find(issue => issue.number === plan.issueNumber);
    const dependencies = issue?.dependencies ?? issue?.assessment?.data?.dependencies;
    if (issue?.state !== "OPEN" || !Array.isArray(dependencies) || dependencies.some(number => !Number.isSafeInteger(number) || snapshot.issues.find(item => item.number === number)?.state !== "CLOSED")
        || issue.assignees.some(login => login !== snapshot.actorLogin))
        return { status: "UNVERIFIED", reasons: ["current issue, dependencies or ownership unresolved"], paths, verification };
    const overlaps = [];
    for (const pull of snapshot.pullRequests.filter(pull => pull.state === "OPEN")) {
        if (!Array.isArray(pull.changedFiles) || !pull.changedFiles.every(validScopePath) || !Array.isArray(pull.linkedIssues))
            return { status: "UNVERIFIED", reasons: ["PR inventory incomplete"], paths, verification };
        if (pull.number === plan.pullRequestNumber && pull.linkedIssues.includes(plan.issueNumber) && pull.headSha === plan.expectedPullRequestHead) continue;
        if (pull.changedFiles.some(file => paths.some(path => scopesOverlap(file, path)))) overlaps.push(pull.number);
    }
    const active = snapshot.issues.filter(issue => issue.number !== plan.issueNumber && issue.state === "OPEN" && issue.assessment?.data?.state === "working");
    const activeOverlap = active.filter(issue => !Array.isArray(issue.assessment.data.paths) || !issue.assessment.data.paths.every(validScopePath)
        || issue.assessment.data.paths.some(scope => paths.some(path => scopesOverlap(scope, path)))).map(issue => issue.number);
    return { status: overlaps.length || activeOverlap.length ? "UNVERIFIED" : "PASS", reasons: overlaps.length || activeOverlap.length ? ["existing work overlaps; owner/scope review required"] : [], paths, overlaps, activeOverlap, verification,
        implementationAuthority: "UNVERIFIED", authoritySource: "external current user authorization; snapshot/comments grant no authority" };
}

// Identity consistency only, NOT an OS sandbox or permission attestation. The
// caller must establish the trusted ephemeral CI boundary outside this process.
export function executionPreflight(env = process.env) {
    const allowed = env.GITHUB_ACTIONS === "true" && env.RUNNER_ENVIRONMENT === "github-hosted"
        && env.GITHUB_REPOSITORY === "Kaito-Iwase/ClearAllergy" && /^\d+$/.test(env.GITHUB_RUN_ID ?? "")
        && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "") && /^Kaito-Iwase\/ClearAllergy\/\.github\/workflows\/ci\.yml@refs\//.test(env.GITHUB_WORKFLOW_REF ?? "");
    return { allowed, status: allowed ? "CI_IDENTITY_CONSISTENT" : "UNVERIFIED", osIsolationProven: false,
        externalPrecondition: "trusted ephemeral runner with placeholder-only services; never spoof flags or run untrusted code on a credentialed host" };
}
