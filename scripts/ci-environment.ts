// 通常のseedとは分離する。CI専用の空DB以外へ初期データを書かない。
export function assertCiDatabaseTarget(env: Record<string, string | undefined> = process.env) {
    if (env.CLEARALLERGY_CI_FIXTURES !== "true") throw new Error("CI専用データの明示指定が必要です。");
    for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
        let url: URL;
        try { url = new URL(env[key] ?? ""); }
        catch { throw new Error(`${key}のCI専用DB設定が必要です。`); }
        if (url.protocol !== "postgresql:" || !["127.0.0.1", "localhost", "ci-db"].includes(url.hostname)
            || url.pathname !== "/clearallergy_ci" || url.username !== "clearallergy_ci"
            || url.password !== "local_ci_only") {
            throw new Error(`${key}がCI専用DBを指していないため中止しました。`);
        }
    }
    if (env.DATABASE_URL !== env.DIRECT_URL) throw new Error("CIのDB接続先が一致していません。");
}
