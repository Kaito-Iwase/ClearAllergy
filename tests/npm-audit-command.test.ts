import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveNpmCli } from "../scripts/npm-cli.mjs";

// Synthetic advisory service; no vulnerable package is installed or executed.
test("real npm audit fails closed for high advisories and unusable registry responses", async () => {
    const root = mkdtempSync(join(tmpdir(), "ca-audit-fixture-"));
    const cli = resolveNpmCli().path;
    const manifest = { name: "audit-fixture", version: "1.0.0", dependencies: { "fixture-package": "1.0.0" } };
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    writeFileSync(join(root, "package-lock.json"), JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: { "": manifest, "node_modules/fixture-package": { version: "1.0.0" } } }));
    try {
        for (const mode of ["clean", "high", "malformed", "unavailable"] as const) {
            const server = createServer((_req, res) => {
                _req.resume();
                res.setHeader("content-type", "application/json");
                if (_req.url === "/fixture-package") { res.end(JSON.stringify({ name: "fixture-package", versions: { "1.0.0": { name: "fixture-package", version: "1.0.0" } }, "dist-tags": { latest: "1.0.0" } })); return; }
                if (mode === "unavailable") { res.writeHead(503); res.end("{}"); return; }
                res.end(mode === "malformed" ? "not-json" : mode === "clean" ? "{}" : JSON.stringify({ "fixture-package": [{ id: 99999999, url: "https://example.invalid/synthetic-advisory", title: "Synthetic high advisory", severity: "high", vulnerable_versions: "*", cwe: [], cvss: { score: 8, vectorString: null } }] }));
            });
            await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            assert.ok(address && typeof address !== "string");
            try {
                let output = "";
                const code = await new Promise<number | null>((resolve, reject) => {
                    const child = spawn(process.execPath, [cli, "audit", "--json", "--ignore-scripts", "--audit-level=high", `--registry=http://127.0.0.1:${address.port}`, "--fetch-retries=0", "--update-notifier=false", "--proxy=null", "--https-proxy=null", "--noproxy=*", "--fetch-timeout=2000", `--cache=${join(root, mode)}`], { cwd: root, env: { ...process.env, npm_config_userconfig: join(root, "absent-npmrc") }, stdio: ["ignore", "pipe", "pipe"], timeout: 30000 });
                    child.stdout.on("data", chunk => { output += chunk.toString(); });
                    child.stderr.resume();
                    child.once("error", reject);
                    child.once("close", resolve);
                });
                if (mode === "clean") assert.equal(code, 0, mode);
                else { assert.equal(code, 1, mode); if (mode === "high") assert.equal(JSON.parse(output).metadata.vulnerabilities.high, 1, output); }
            } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
        }
    } finally { rmSync(root, { recursive: true, force: true }); }
});