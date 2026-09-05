import assert from "node:assert/strict";
import test from "node:test";
import { assertTestDatabaseTarget } from "../scripts/test-environment";

test("DB書込テストは専用Composeの接続先だけを許可する", () => {
    const url = "postgresql://clearallergy_test:local_test_only@test-db:5432/clearallergy_test";
    const env = { CLEARALLERGY_TEST_ENV: "true", DATABASE_URL: url, DIRECT_URL: url };
    assert.doesNotThrow(() => assertTestDatabaseTarget(env));
    assert.throws(() => assertTestDatabaseTarget({ ...env, CLEARALLERGY_TEST_ENV: "false" }));
    for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
        for (const invalid of ["", url.replace("test-db", "shared-db"), url.replace("/clearallergy_test", "/production")]) {
            assert.throws(() => assertTestDatabaseTarget({ ...env, [key]: invalid }));
        }
    }
});
