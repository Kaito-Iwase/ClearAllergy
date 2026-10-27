import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertApprovedTestPreviewOwners, assertTestPreviewDatabaseTarget, initializeTestPreviewDatabase,
    parseTestPreviewInitializationArgs, readTestPreviewMigrations } from "./test-preview-initialization";

async function main() {
    const owners = parseTestPreviewInitializationArgs(process.argv.slice(2));
    assertTestPreviewDatabaseTarget();
    assertApprovedTestPreviewOwners(owners); // reject unapproved IDs before Prisma load or any connection
    const migrations = readTestPreviewMigrations();
    const { PrismaClient } = await import("@prisma/client");
    await initializeTestPreviewDatabase(owners, {
        verifyOwners: assertApprovedTestPreviewOwners,
        connect: () => new PrismaClient(),
        migrations,
        migrate: () => {
            const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
            for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "DATABASE_URL", "DIRECT_URL"]) {
                if (process.env[key] !== undefined) env[key] = process.env[key];
            }
            const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
                { cwd: fileURLToPath(new URL("../", import.meta.url)), env, encoding: "utf8", stdio: "pipe", windowsHide: true, timeout: 120_000 });
            // Do not print Prisma output: connection strings or internal details may occur in errors.
            if (result.error || result.status !== 0) throw new Error("Migration failed. Inspect the dedicated database read-only; do not retry automatically.");
        },
    });
    console.log("専用テストDBのmigrationと品目マスタ、所有者2名・架空店舗2件・非公開メニュー6件を準備しました。公開は別操作です。");
}

main().catch(() => {
    console.error("専用Preview初期化は停止しました。明示引数・固定DB・承認済みClerk所有者・空DB・migrationを確認してください。自動再試行しません。");
    process.exitCode = 1;
});
