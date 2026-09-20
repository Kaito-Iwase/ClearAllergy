// テスト環境の初期化・DB書込テストは、専用Composeの接続先だけに制限する。
export function assertTestDatabaseTarget(env: Record<string, string | undefined> = process.env) {
    if (env.CLEARALLERGY_TEST_ENV !== "true") throw new Error("専用Composeのテスト環境から実行してください。");
    for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
        let url: URL;
        try { url = new URL(env[key] ?? ""); }
        catch { throw new Error(`${key}のテストDB設定が必要です。`); }
        if (url.protocol !== "postgresql:" || url.hostname !== "test-db" || url.port !== "5432"
            || url.pathname !== "/clearallergy_test" || url.username !== "clearallergy_test") {
            throw new Error(`${key}が専用テストDBを指していないため中止しました。`);
        }
    }
}
