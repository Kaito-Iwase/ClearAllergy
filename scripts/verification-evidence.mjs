import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const hex = /^[a-f0-9]{64}$/;
const sha = /^[a-f0-9]{40}$/;
export const PHASES = {
    "prisma-generate": ["node_modules/prisma/build/index.js", "generate"],
    "prisma-validate": ["node_modules/prisma/build/index.js", "validate"],
    lint: ["npm", "lint"], typecheck: ["npm", "typecheck"], test: ["npm", "test"], build: ["npm", "build"],
    "publication-upgrade": ["--import", "tsx", "scripts/check-publication-migration.ts"],
    "food-review-upgrade": ["--import", "tsx", "scripts/check-food-review-migration.ts"],
    "prepare-fixture": ["--import", "tsx", "scripts/setup-ci-env.ts"],
    "db-constraints": ["--import", "tsx", "scripts/check-ci-database.ts"],
    "db-publication": ["--import", "tsx", "scripts/check-publication-database.ts"],
    "db-menu-list": ["--import", "tsx", "scripts/check-admin-menu-list-database.ts"],
    "db-owned-menu": ["--import", "tsx", "scripts/check-owned-menu-database.ts"],
    "db-shop": ["--import", "tsx", "scripts/check-shop-database.ts"],
    "db-snapshot": ["--import", "tsx", "scripts/check-public-read-snapshot.ts"],
    "browser-publication": ["scripts/browser-runner.mjs", "publication"],
    "browser-public": ["--import", "tsx", "scripts/run-public-phase.mjs", "public"],
    propagation: ["--import", "tsx", "scripts/run-public-phase.mjs", "propagation"],
};

export function candidateIdentity(fields) {
    const keys = ["head", "baseSha", "fingerprint", "lockSha256", "harnessSha256", "evidenceSha256"];
    if (!fields || keys.some(key => !(key === "head" || key === "baseSha" ? sha : hex).test(fields[key]))) throw new Error("Invalid candidate identity.");
    const candidate = Object.fromEntries(keys.map(key => [key, fields[key]]));
    return { ...candidate, id: sha256(JSON.stringify(candidate)) };
}

export function buildFingerprint(root) {
    if (!existsSync(join(root, ".next/BUILD_ID"))) return null;
    const files = [];
    const visit = path => {
        // Next 16 also writes request-time caches under server/, not just cache/.
        // Preserve compiled server/static code and routing manifests in the hash.
        if (path === ".next/server/route-cache" || path === ".next/server/prefetch-hints.json") return;
        const absolute = join(root, path);
        if (!existsSync(absolute)) return;
        const stat = lstatSync(absolute);
        if (stat.isSymbolicLink()) throw new Error("Unsafe build artifact.");
        if (stat.isDirectory()) for (const name of readdirSync(absolute).sort()) visit(path + "/" + name);
        else if (stat.isFile()) files.push([path, sha256(readFileSync(absolute))]);
    };
    for (const path of [".next/BUILD_ID", ".next/build-manifest.json", ".next/server", ".next/static"]) visit(path);
    return sha256(JSON.stringify(files));
}

// Values are fixed categories or references to known source files, never log
// messages, test names, stack traces, URLs, absolute paths or environment values.
export function failureDiagnostics(contents, result = {}, knownTests = []) {
    const patterns = {
        filesystemPermission: /\b(?:EPERM|EACCES)\b/, timeout: /\b(?:ETIMEDOUT|ERR_TEST_TIMEOUT|P1008)\b/,
        processLaunch: /\b(?:ENOENT|E2BIG)\b/, outputLimit: /\bENOBUFS\b/,
        databaseUnavailable: /\b(?:P1001|P1002|P1017)\b/, databaseAuthentication: /\b(?:P1000|P1010)\b/,
        databaseSchema: /\b(?:P2021|P2022)\b/, uniqueConstraint: /\bP2002\b/,
        transactionConflict: /\b(?:P2034|55P03|40P01|40001)\b/,
        assertion: /\b(?:ERR_ASSERTION|AssertionError)\b/, typecheck: /\berror TS\d+:/,
    };
    const normalized = String(contents).replaceAll("\\", "/").replace(/\/+/g, "/");
    const failedCases = [];
    for (const block of normalized.split(/(?=^[ \t]*not ok \d+)/m).filter(block => /^[ \t]*not ok \d+/.test(block))) {
        const location = block.match(/^\s*location:\s*['"]([^'"\n]+)['"]/m)?.[1];
        if (!location) continue;
        const match = location.match(/^(.*):(\d+):(\d+)$/);
        if (!match) continue;
        const file = knownTests.find(file => match[1] === file || match[1].endsWith("/" + file));
        if (file && /^tests\/[A-Za-z0-9._/-]+\.test\.ts$/.test(file)) failedCases.push(`${file}:${Number(match[2])}:${Number(match[3])}`);
    }
    const categories = Object.entries(patterns).filter(([, pattern]) => pattern.test(contents) || pattern.test(result.error?.code ?? "")).map(([name]) => name);
    if (result.signal) categories.push("terminated");
    if ((result.status !== 0 || result.error) && categories.length === 0) categories.push("unclassifiedFailure");
    const testCounts = {};
    for (const key of ["tests", "pass", "fail", "skipped", "cancelled"]) {
        const match = String(contents).match(new RegExp(`^# ${key} (\\d+)$`, "m"));
        if (match) testCounts[key] = Number(match[1]);
    }
    return { categories, failedCases: [...new Set(failedCases)].slice(0, 100), testCounts, rawLogIncluded: false };
}

export function combinePhaseEvidence(receipts, required, current) {
    const candidate = candidateIdentity(current);
    if (!Array.isArray(required) || !required.length || new Set(required).size !== required.length || required.some(name => !Object.hasOwn(PHASES, name))) throw new Error("Invalid required phases.");
    required = [...required];
    if (required.some(name => name.startsWith("browser-") || name === "propagation") && !required.includes("build")) required.push("build");
    const phases = [];
    const build = receipts.find(receipt => receipt.phase === "build");
    for (const receipt of receipts) {
        if (receipt?.kind !== "phase" || !Object.hasOwn(PHASES, receipt.phase) || phases.some(row => row.phase === receipt.phase)) throw new Error("Invalid or duplicate phase evidence.");
        const before = candidateIdentity(receipt.candidateBefore);
        const after = candidateIdentity(receipt.candidateAfter);
        const matches = before.id === candidate.id && after.id === candidate.id && receipt.candidateBefore.id === before.id && receipt.candidateAfter.id === after.id;
        const needsBuild = receipt.phase.startsWith("browser-") || receipt.phase === "propagation";
        const buildMatches = !needsBuild || (hex.test(receipt.buildBefore) && receipt.buildBefore === receipt.buildAfter && receipt.buildAfter === build?.buildAfter);
        phases.push({ phase: receipt.phase, status: matches && buildMatches && receipt.status === "PASS" && receipt.exitCode === 0
            && receipt.candidateUnchanged === true && receipt.publicationSafe === true ? "PASS" : "FAIL", candidateMatches: matches, buildMatches });
    }
    const missing = required.filter(name => !phases.some(row => row.phase === name));
    return { candidate, required, phases, missing, status: phases.some(row => row.status === "FAIL") ? "FAIL" : missing.length ? "UNVERIFIED" : "PASS",
        independentReview: "UNVERIFIED", remoteChecks: "UNVERIFIED", signedAttestation: false };
}
