import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { assertCiDatabaseTarget } from "./ci-environment.ts";
import { summarizeCiLog } from "./ci-log-summary.ts";
import { beginReport, publishReport } from "./agent-harness.mjs";
import { closeSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Own a fresh app process from this cwd/build. Never reuse a caller's server or
// port, and never accept another app's HTTP readiness as proof of ownership.
assertCiDatabaseTarget();
const [mode, ...extra] = process.argv.slice(2);
if (!["public", "propagation"].includes(mode) || extra.length || process.env.CI !== "true") throw new Error("Invalid isolated public phase.");
const runId = /^[a-f0-9-]{36}$/.test(process.env.CLEARALLERGY_PHASE_RUN_ID ?? "") ? process.env.CLEARALLERGY_PHASE_RUN_ID : randomUUID();
const evidence = beginReport(process.cwd(), `server-${mode}-${runId}.json`);
let raw = "", truncated = false;
const collect = chunk => { raw += chunk.toString(); if (raw.length > 1_000_000) { raw = raw.slice(-1_000_000); truncated = true; } };
const reservation = createServer();
await new Promise((yes, no) => { reservation.once("error", no); reservation.listen(0, "127.0.0.1", yes); });
const port = reservation.address().port;
await new Promise(yes => reservation.close(yes));
const env = { ...process.env, CLEARALLERGY_BROWSER_BASE_URL: `http://127.0.0.1:${port}` };
const options = { env, windowsHide: true, detached: process.platform !== "win32" };
async function stopOwned(child, exited) {
    if (child.exitCode !== null) return;
    if (process.platform === "win32") spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 10_000 });
    else { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }
    const force = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 5_000);
    try { await exited; } finally { clearTimeout(force); }
}
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { ...options, stdio: ["ignore", "pipe", "pipe"] });
const exited = once(server, "exit");
let timer;
try {
    await new Promise((yes, no) => {
        timer = setTimeout(() => no(new Error("App startup timed out.")), 60_000);
        let output = "";
        server.stdout.on("data", chunk => {
            collect(chunk);
            output = (output + chunk.toString()).slice(-4096);
            if (/Ready in /.test(output)) { clearTimeout(timer); yes(); }
        });
        server.stderr.on("data", collect);
        server.once("error", () => no(new Error("App process could not start.")));
        server.once("exit", () => no(new Error("Owned app exited before readiness.")));
    });
    if (server.exitCode !== null) throw new Error("Owned app exited.");
    const args = mode === "public" ? ["scripts/browser-runner.mjs", "public"] : ["--import", "tsx", "scripts/check-publication-propagation.ts"];
    const check = spawn(process.execPath, args, { ...options, stdio: ["ignore", "inherit", "inherit"] });
    const checkExit = once(check, "exit");
    let checkTimer;
    try {
        const outcome = await Promise.race([
            checkExit.then(([code]) => ({ check: code })),
            exited.then(() => ({ server: true })),
            new Promise(yes => { checkTimer = setTimeout(() => yes({ timeout: true }), 6 * 60_000); }),
        ]);
        if ("server" in outcome || "timeout" in outcome || server.exitCode !== null || outcome.check !== 0) throw new Error("Owned public verification failed.");
    } finally {
        clearTimeout(checkTimer);
        await stopOwned(check, checkExit);
    }
    console.log("PASS: public verification used the owned current-build app on a private loopback port");
} catch {
    console.error("Isolated public phase failed; no existing app was used and raw server logs were excluded.");
    process.exitCode = 1;
} finally {
    clearTimeout(timer);
    try { if (server.exitCode === null) await stopOwned(server, exited); }
    finally {
        try {
            const summary = publishReport(evidence, { kind: "server-log-summary", runId, status: "COLLECTED", candidateUnchanged: true,
                ...summarizeCiLog(raw), truncated }, () => true);
            if (summary.status === "FAIL" || summary.publicationSafe !== true) process.exitCode = 1;
        }
        finally { closeSync(evidence.fd); }
    }
}
