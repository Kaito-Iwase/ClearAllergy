import assert from "node:assert/strict";
import test from "node:test";
import { assertTestDatabaseTarget } from "../scripts/test-environment";
import { assertCiDatabaseTarget } from "../scripts/ci-environment";

test("CIの初期化は明示された一時DBだけを許可し、通常環境・接続先の不一致を拒否する", () => {
    const url = "postgresql://clearallergy_ci:local_ci_only@127.0.0.1:5432/clearallergy_ci";
    const env = { CLEARALLERGY_CI_FIXTURES: "true", DATABASE_URL: url, DIRECT_URL: url };
    assert.doesNotThrow(() => assertCiDatabaseTarget(env));
    assert.throws(() => assertCiDatabaseTarget({ ...env, CLEARALLERGY_CI_FIXTURES: undefined }));
    for (const invalid of ["", url.replace("127.0.0.1", "production.example"), url.replace("/clearallergy_ci", "/production"), url.replace("local_ci_only", "other")]) {
        assert.throws(() => assertCiDatabaseTarget({ ...env, DATABASE_URL: invalid, DIRECT_URL: invalid }));
    }
    assert.throws(() => assertCiDatabaseTarget({ ...env, DIRECT_URL: url.replace("127.0.0.1", "localhost") }));
});

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
