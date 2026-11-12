import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const build = ci.split("\n  build:\n")[1];

test("dependency audit remains in the existing required build on every supported PR", () => {
    assert.ok(build, "required build job must exist");
    assert.match(build, /name: Test, lint, typecheck, and build\n/);
    assert.doesNotMatch(ci.split("\njobs:\n")[0], /paths(?:-ignore)?:/);
    assert.match(ci, /pull_request:\n    branches: \[main, develop, test\/staging\]/);
    const step = build.split("      - name: Audit locked dependencies\n")[1]?.split("\n      - name:")[0];
    assert.ok(step, "audit step must exist in build, not only a separate workflow");
    assert.match(step, /^        timeout-minutes: 3\n        run: npm audit --ignore-scripts --audit-level=high\n/);
    assert.doesNotMatch(step, /continue-on-error:|\bif:|\|\||--omit|--production/);
    assert.doesNotMatch(build.split("    steps:")[0], /continue-on-error:|\bif:/);
    assert.ok(build.indexOf("Audit locked dependencies") < build.indexOf("      - name: Build"));
});

test("scheduled dependency audit remains a supplementary discovery path", () => {
    const audit = readFileSync(new URL("../.github/workflows/dependency-audit.yml", import.meta.url), "utf8");
    assert.match(audit, /schedule:/);
    assert.match(audit, /workflow_dispatch:/);
    assert.match(audit, /npm audit --ignore-scripts --audit-level=high/);
});