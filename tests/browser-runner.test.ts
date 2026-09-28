import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("browser runner refuses an unprepared environment without implicitly installing packages", () => {
    const runner = join(tmpdir(), `clearallergy-unprepared-${randomUUID()}`);
    const result = spawnSync(process.execPath, ["scripts/browser-runner.mjs", "public"], {
        encoding: "utf8", env: { ...process.env, CLEARALLERGY_BROWSER_RUNNER_DIR: runner }, windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /browser-runner\.mjs install/);
    assert.equal(existsSync(runner), false);
    assert.ok(!result.stderr.includes(runner));
});

test("browser runner help is read-only and unknown modes fail before any setup", () => {
    const runner = join(tmpdir(), `clearallergy-help-${randomUUID()}`);
    const options = { encoding: "utf8" as const, env: { ...process.env, CLEARALLERGY_BROWSER_RUNNER_DIR: runner }, windowsHide: true };
    const help = spawnSync(process.execPath, ["scripts/browser-runner.mjs", "--help"], options);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /dedicated DB, development Clerk and Blob/);
    const invalid = spawnSync(process.execPath, ["scripts/browser-runner.mjs", "install", "--unexpected"], options);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Usage:/);
    assert.equal(existsSync(runner), false);
});
