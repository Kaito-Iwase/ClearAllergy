import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCiLog } from "../scripts/ci-log-summary";

test("CI failure evidence keeps useful category counts without log messages or secrets", () => {
    const summary = summarizeCiLog([
        "Ready in 355ms",
        "Error: P1001 postgresql://fixture:password-value@database.invalid/private",
        "Error: P2002 email=personal@example.invalid cookie=session-value token=secret-value",
        "unhandledRejection Error: Authorization Bearer private-value",
        '{"level":"error","message":"free text that must not leave the runner"}',
        '{"event":"operation_failed","category":"external_service","requestId":"private-request-id"}',
    ].join("\n"));
    assert.equal(summary.categories.serverReady, 1);
    assert.equal(summary.categories.databaseUnavailable, 1);
    assert.equal(summary.categories.uniqueConstraint, 1);
    assert.equal(summary.categories.unhandledFailure, 1);
    assert.equal(summary.categories.externalService, 1);
    assert.equal(summary.categories.applicationError, 5);
    assert.equal(summary.rawLogIncluded, false);
    const output = JSON.stringify(summary);
    for (const secret of ["password-value", "personal@example.invalid", "session-value", "secret-value", "private-value", "free text", "postgresql:", "private-request-id"]) {
        assert.ok(!output.includes(secret));
    }
});

test("CI diagnostic evidence handles empty and unrelated logs without copying their contents", () => {
    assert.equal(summarizeCiLog("").lineCount, 0);
    const summary = summarizeCiLog("anything an attacker controls\r\n\r\n");
    assert.equal(summary.lineCount, 1);
    assert.ok(Object.values(summary.categories).every((count) => count === 0));
    assert.ok(!JSON.stringify(summary).includes("attacker"));
});
