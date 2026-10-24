import assert from "node:assert/strict";
import test from "node:test";
import { buildFingerprint, candidateIdentity, combinePhaseEvidence, failureDiagnostics } from "../scripts/verification-evidence.mjs";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";

const fields = { head: "a".repeat(40), baseSha: "b".repeat(40), fingerprint: "c".repeat(64),
    lockSha256: "d".repeat(64), harnessSha256: "e".repeat(64), evidenceSha256: "f".repeat(64) };
const candidate = candidateIdentity(fields);
function receipt(phase = "test") {
    return { kind: "phase", phase, candidateBefore: candidate, candidateAfter: candidate,
        candidateUnchanged: true, publicationSafe: true, exitCode: 0, status: "PASS" };
}

test("phase evidence requires identical head, base, source, lock and runner code", () => {
    assert.equal(combinePhaseEvidence([receipt()], ["test"], fields).status, "PASS");
    for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
        const different = candidateIdentity({ ...fields, [key]: "0".repeat(fields[key].length) });
        for (const position of ["candidateBefore", "candidateAfter"]) {
            const result = combinePhaseEvidence([{ ...receipt(), [position]: different }], ["test"], fields);
            assert.equal(result.status, "FAIL", key + " " + position);
            assert.equal(result.phases[0].candidateMatches, false);
        }
    }
    const tampered = { ...candidate, fingerprint: "0".repeat(64) };
    assert.equal(combinePhaseEvidence([{ ...receipt(), candidateAfter: tampered }], ["test"], fields).status, "FAIL");
});

test("missing, failed and unsafe evidence cannot become a complete PASS", () => {
    const result = combinePhaseEvidence([receipt()], ["test", "db-snapshot"], fields);
    assert.equal(result.status, "UNVERIFIED"); assert.deepEqual(result.missing, ["db-snapshot"]);
    assert.equal(result.independentReview, "UNVERIFIED"); assert.equal(result.remoteChecks, "UNVERIFIED");
    assert.equal(result.signedAttestation, false);
    for (const change of [{ status: "FAIL" }, { exitCode: 1 }, { candidateUnchanged: false }, { publicationSafe: false }]) {
        assert.equal(combinePhaseEvidence([{ ...receipt(), ...change }], ["test"], fields).status, "FAIL");
    }
    assert.throws(() => combinePhaseEvidence([receipt(), receipt()], ["test"], fields));
    assert.throws(() => combinePhaseEvidence([receipt("unknown")], ["test"], fields));
    assert.throws(() => combinePhaseEvidence([], [], fields));
    assert.throws(() => candidateIdentity({ ...fields, head: "not a commit" }));
});

test("browser evidence must refer to the exact successful build; cache changes do not change the build identity", () => {
    const root = mkdtempSync(join(tmpdir(), "ca-build-evidence-"));
    try {
        assert.equal(buildFingerprint(root), null);
        mkdirSync(join(root, ".next/static"), { recursive: true }); mkdirSync(join(root, ".next/server"));
        writeFileSync(join(root, ".next/BUILD_ID"), "synthetic-build");
        writeFileSync(join(root, ".next/static/app.css"), "body{}");
        writeFileSync(join(root, ".next/server/app.js"), "// synthetic server");
        const original = buildFingerprint(root);
        mkdirSync(join(root, ".next/cache")); writeFileSync(join(root, ".next/cache/transient"), "runtime cache");
        mkdirSync(join(root, ".next/server/route-cache")); writeFileSync(join(root, ".next/server/route-cache/runtime.html"), "request data");
        writeFileSync(join(root, ".next/server/prefetch-hints.json"), "{}");
        assert.equal(buildFingerprint(root), original);
        const build = { ...receipt("build"), buildAfter: original };
        const browser = { ...receipt("browser-publication"), buildBefore: original, buildAfter: original };
        assert.equal(combinePhaseEvidence([build, browser], ["browser-publication"], fields).status, "PASS");
        writeFileSync(join(root, ".next/static/app.css"), "body{color:red}");
        const different = buildFingerprint(root);
        assert.notEqual(different, original);
        writeFileSync(join(root, ".next/server/app.js"), "// changed executable server code");
        assert.notEqual(buildFingerprint(root), different);
        assert.equal(combinePhaseEvidence([build, { ...browser, buildAfter: different }], ["browser-publication"], fields).status, "FAIL");
        assert.equal(combinePhaseEvidence([build, { ...browser, buildBefore: different, buildAfter: different }], ["browser-publication"], fields).status, "FAIL");
        assert.notEqual(combinePhaseEvidence([browser], ["browser-publication"], fields).status, "PASS");
    } finally { assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true }); }
});

test("failure diagnosis identifies a known source case without copying names, messages or secrets", () => {
    const contents = [
        "not ok 17 - private-name and personal@example.invalid",
        "  ---", "  location: 'C:\\Users\\private-user\\repo\\tests\\agent-harness.test.ts:41:3'",
        "  error: 'Error: P1001 postgresql://user:secret@private.invalid/data Cookie=session-value Authorization=Bearer private-token'",
        "  code: 'ERR_ASSERTION'", "  stack: 'do not publish this free text'", "  ...",
        "not ok 18 - unknown source", "  location: '/private/private-test.ts:8:2'", "  ---",
    ].join("\n");
    const summary = failureDiagnostics(contents, { status: 1 }, ["tests/agent-harness.test.ts"]);
    assert.deepEqual(summary.failedCases, ["tests/agent-harness.test.ts:41:3"]);
    assert.ok(summary.categories.includes("databaseUnavailable")); assert.ok(summary.categories.includes("assertion"));
    assert.equal(summary.rawLogIncluded, false);
    const output = JSON.stringify(summary);
    for (const secret of ["private-name", "personal@", "private-user", "postgresql:", "secret@", "session-value", "private-token", "free text", "private-test"])
        assert.ok(!output.includes(secret), secret);
});

test("launch, timeout and uncategorized failures remain explicit without arbitrary error fields", () => {
    assert.deepEqual(failureDiagnostics("", { status: null, error: { code: "EPERM", message: "secret" } }).categories, ["filesystemPermission"]);
    assert.deepEqual(failureDiagnostics("", { status: null, error: { code: "ETIMEDOUT" } }).categories, ["timeout"]);
    assert.deepEqual(failureDiagnostics("opaque secret", { status: 2 }).categories, ["unclassifiedFailure"]);
    assert.deepEqual(failureDiagnostics("", { status: 0 }).categories, []);
    assert.equal(JSON.stringify(failureDiagnostics("", { status: 1, error: { code: "private-value" } })).includes("private-value"), false);
});

test("real phase CLI strips secrets, persists failures, and rejects old receipts after a source edit", () => {
    const root = mkdtempSync(join(tmpdir(), "ca-phase-evidence-"));
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    for (const [key, value] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)) env[key] = value;
    env.BLOB_READ_WRITE_TOKEN = "private-provider-token";
    const git = (...args: string[]) => {
        const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8", windowsHide: true });
        assert.equal(result.status, 0, result.stderr);
    };
    try {
        mkdirSync(join(root, "scripts")); mkdirSync(join(root, "tests"));
        for (const name of ["agent-harness.mjs", "verification-evidence.mjs", "npm-cli.mjs"])
            cpSync(fileURLToPath(new URL("../scripts/" + name, import.meta.url)), join(root, "scripts", name));
        writeFileSync(join(root, ".gitignore"), "node_modules/\n.agent-runs/\n");
        writeFileSync(join(root, "package.json"), "{}"); writeFileSync(join(root, "package-lock.json"), "{}");
        writeFileSync(join(root, "tests", "example.test.ts"), "// fixture source\n");
        git("init", "--quiet"); git("add", ".");
        git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
        mkdirSync(join(root, "node_modules/prisma/build"), { recursive: true });
        writeFileSync(join(root, "node_modules/prisma/build/index.js"), `
if (process.env.BLOB_READ_WRITE_TOKEN) throw new Error('inherited provider secret');
if (process.argv[2] === 'validate') {
 console.log('not ok 1 - private test name');
 console.log("  location: '/private/root/tests/example.test.ts:10:1'");
 console.log('ERR_ASSERTION P1001 token=secret-value personal@example.invalid');
 process.exitCode = 1;
}
`);
        const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/agent-harness.mjs", ...args], { cwd: root, env, encoding: "utf8", windowsHide: true });
        assert.equal(run("phase", "--base", "HEAD", "--phase", "prisma-generate").status, 0);
        assert.equal(run("phase", "--base", "HEAD", "--phase", "prisma-validate").status, 1);
        const failed = readFileSync(join(root, ".agent-runs/prisma-validate.json"), "utf8");
        const receipt = JSON.parse(failed);
        assert.equal(receipt.status, "FAIL"); assert.equal(receipt.publicationSafe, true);
        assert.deepEqual(receipt.diagnostics.failedCases, ["tests/example.test.ts:10:1"]);
        for (const secret of ["private-provider-token", "private test name", "secret-value", "personal@", "/private/root"]) assert.ok(!failed.includes(secret));
        assert.equal(run("summarize", "--base", "HEAD", "--inputs", "prisma-generate.json", "--required", "prisma-generate", "--output", "summary-before.json").status, 0);
        writeFileSync(join(root, "tests/example.test.ts"), "// changed after validation\n");
        assert.equal(run("summarize", "--base", "HEAD", "--inputs", "prisma-generate.json", "--required", "prisma-generate", "--output", "summary-after.json").status, 1);
        assert.equal(JSON.parse(readFileSync(join(root, ".agent-runs/summary-after.json"), "utf8")).status, "FAIL");
        assert.equal(run("phase", "--base", "HEAD", "--phase", "db-snapshot").status, 1, "No inherited production/dedicated DB is accepted without the explicit CI target");
    } finally {
        assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true });
    }
});

test("public phase owns its current-build server and ignores a caller's existing app", async () => {
    const root = mkdtempSync(join(tmpdir(), "ca-owned-app-"));
    let oldRequests = 0;
    const old = createServer((_req, res) => { oldRequests++; res.end('{"marker":"old"}'); });
    await new Promise<void>(yes => old.listen(0, "127.0.0.1", yes));
    const address = old.address(); assert.ok(address && typeof address === "object");
    try {
        mkdirSync(join(root, "scripts")); mkdirSync(join(root, "node_modules/next/dist/bin"), { recursive: true });
        for (const name of ["run-public-phase.mjs", "ci-environment.ts", "ci-log-summary.ts", "agent-harness.mjs", "verification-evidence.mjs", "npm-cli.mjs"])
            cpSync(fileURLToPath(new URL("../scripts/" + name, import.meta.url)), join(root, "scripts", name));
        writeFileSync(join(root, "node_modules/next/dist/bin/next"), `
const http = require('node:http');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
http.createServer((req,res)=>res.end(JSON.stringify({marker:'owned',pid:process.pid}))).listen(port,'127.0.0.1',()=>{console.log('Ready in 1ms');console.error('P1001 postgresql://private-user:private-secret@private.invalid/data');});
`);
        writeFileSync(join(root, "scripts/browser-runner.mjs"), `
const response = await fetch(process.env.CLEARALLERGY_BROWSER_BASE_URL);
const body = await response.json();
if(body.marker !== 'owned') process.exitCode=1;
console.log('OWNED_PID '+body.pid);
`);
        const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
        for (const [key, value] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)) env[key] = value;
        Object.assign(env, { CI: "true", CLEARALLERGY_CI_FIXTURES: "true", DATABASE_URL: "postgresql://clearallergy_ci:local_ci_only@127.0.0.1:1/clearallergy_ci",
            DIRECT_URL: "postgresql://clearallergy_ci:local_ci_only@127.0.0.1:1/clearallergy_ci", CLEARALLERGY_BROWSER_BASE_URL: `http://127.0.0.1:${address.port}` });
        const loader = createRequire(import.meta.url).resolve("tsx");
        const result = spawnSync(process.execPath, ["--import", pathToFileURL(loader).href, "scripts/run-public-phase.mjs", "public"], { cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 20_000 });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /OWNED_PID \d+/);
        assert.equal(oldRequests, 0);
        const summaries = readdirSync(join(root, ".agent-runs")).filter(name => name.startsWith("server-public-"));
        assert.equal(summaries.length, 1);
        const summary = readFileSync(join(root, ".agent-runs", summaries[0]), "utf8");
        assert.equal(JSON.parse(summary).categories.databaseUnavailable, 1);
        for (const secret of ["private-user", "private-secret", "private.invalid", "postgresql:"]) assert.ok(!summary.includes(secret));
        // Simulate the publisher detecting a path replacement after holding its
        // descriptor. The driver must propagate its refusal to the phase exit.
        writeFileSync(join(root, "scripts/agent-harness.mjs"), `
import {mkdirSync,openSync} from 'node:fs'; import {join} from 'node:path';
export function beginReport(root,name){mkdirSync(join(root,'.agent-runs'),{recursive:true});return {fd:openSync(join(root,'.agent-runs',name),'wx')};}
export function publishReport(){return {status:'FAIL',publicationSafe:false};}
`);
        const refused = spawnSync(process.execPath, ["--import", pathToFileURL(loader).href, "scripts/run-public-phase.mjs", "public"], { cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 20_000 });
        assert.equal(refused.status, 1, "A rejected diagnostic publication must fail the parent phase");
    } finally {
        await new Promise<void>(yes => old.close(() => yes()));
        assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true });
    }
});
