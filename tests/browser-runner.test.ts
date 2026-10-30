import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("browser runner refuses an unprepared environment without implicitly installing packages", () => {
    const runner = join(tmpdir(), `clearallergy-unprepared-${randomUUID()}`);
    for (const mode of ["public", "issue118-live-guards"]) {
        const result = spawnSync(process.execPath, ["scripts/browser-runner.mjs", mode], {
            encoding: "utf8", env: { ...process.env, CLEARALLERGY_BROWSER_RUNNER_DIR: runner }, windowsHide: true,
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /browser-runner\.mjs install/);
        assert.ok(!result.stderr.includes(runner));
    }
    assert.equal(existsSync(runner), false);
});

test("browser runner help is read-only and unknown modes fail before any setup", () => {
    const runner = join(tmpdir(), `clearallergy-help-${randomUUID()}`);
    const options = { encoding: "utf8" as const, env: { ...process.env, CLEARALLERGY_BROWSER_RUNNER_DIR: runner }, windowsHide: true };
    const help = spawnSync(process.execPath, ["scripts/browser-runner.mjs", "--help"], options);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /dedicated DB, development Clerk and Blob/);
    assert.match(help.stdout, /issue118-live-guards/);
    const invalid = spawnSync(process.execPath, ["scripts/browser-runner.mjs", "install", "--unexpected"], options);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Usage:/);
    const liveFlag = spawnSync(process.execPath, ["scripts/browser-runner.mjs", "issue118-live-guards", "--apply"], options);
    assert.equal(liveFlag.status, 1);
    assert.match(liveFlag.stderr, /Usage:/);
    assert.ok(!liveFlag.stdout.includes("MANUAL_NORMAL_LOGIN_REQUIRED"));
    assert.equal(existsSync(runner), false);
});
