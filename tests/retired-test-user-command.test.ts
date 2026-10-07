import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const mode of ["production", "development"] as const) {
    test(`旧テストユーザーコマンドは${mode}でも認証情報を使用せず拒否する`, () => {
        const result = spawnSync(process.execPath, [
            "--import", "tsx",
            fileURLToPath(new URL("../scripts/create-test-user.ts", import.meta.url)),
            "retired-fixture@example.invalid", "fixture-password-must-not-be-logged",
        ], {
            encoding: "utf8",
            timeout: 15_000,
            env: {
                ...process.env,
                NODE_ENV: mode,
                DATABASE_URL: "not-a-database-url",
                DIRECT_URL: "not-a-database-url",
                CLERK_SECRET_KEY: "sk_live_fixture_must_not_be_used",
            },
        });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /廃止しました/);
        assert.doesNotMatch(result.stderr, /retired-fixture|fixture-password|sk_live_fixture|not-a-database-url/);
    });
}
