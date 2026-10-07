import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveNpmCli } from "../scripts/npm-cli.mjs";

function fixture(action: (root: string, install: (path: string, name?: string) => string) => void) {
    const root = mkdtempSync(join(tmpdir(), "clearallergy-npm-cli-"));
    const install = (path: string, name = "npm") => {
        mkdirSync(join(path, "bin"), { recursive: true });
        writeFileSync(join(path, "package.json"), JSON.stringify({ name, version: "11.18.0" }));
        writeFileSync(join(path, "bin/npm-cli.js"), "// resolver fixture; never executed\n");
        return join(path, "bin/npm-cli.js");
    };
    try { action(root, install); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("npm CLI resolves Windows Node and Unix global layouts, including paths with spaces", () => {
    fixture((root, install) => {
        const windows = join(root, "Node installation");
        const cli = install(join(windows, "node_modules/npm"));
        assert.equal(resolveNpmCli({ execPath: join(windows, "node.exe"), env: {}, platform: "win32" }).path, cli);
        const unix = join(root, "unix");
        const unixCli = install(join(unix, "lib/node_modules/npm"));
        assert.equal(resolveNpmCli({ execPath: join(unix, "bin/node"), env: {}, platform: "linux" }).path, unixCli);
    });
});

test("npm lifecycle entry resolves first and unknown entries fail without a shell fallback", () => {
    fixture((root, install) => {
        const cli = install(join(root, "lifecycle/npm"));
        const execPath = join(root, "no-node-install/node");
        const result = resolveNpmCli({ execPath, env: { npm_execpath: cli }, platform: "linux" });
        assert.equal(result.version, "11.18.0");
        assert.equal(result.path, cli);
        const other = install(join(root, "other"), "another-package");
        assert.throws(() => resolveNpmCli({ execPath, env: { npm_execpath: other }, platform: "linux" }), /npm CLI was not found/);
        assert.throws(() => resolveNpmCli({ execPath, env: { npm_execpath: "relative/npm-cli.js" }, platform: "linux" }), /npm CLI was not found/);
    });
});
