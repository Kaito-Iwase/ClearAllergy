import { assertTestShopFixtureTarget, initializeTestShopFixtures, parseTestShopTarget } from "./test-shop-fixtures";

async function main() {
    const target = parseTestShopTarget(process.argv.slice(2));
    assertTestShopFixtureTarget();
    // Do not load Prisma until explicit arguments and the existing local DB guards pass.
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
        const count = await initializeTestShopFixtures(prisma, target);
        console.log(`指定された架空テスト店舗に${count}件の非公開メニューを作成しました。公開は管理画面で別に操作してください。`);
    } finally { await prisma.$disconnect(); }
}

main().catch(() => {
    // Never print SDK errors, identifiers or connection strings.
    console.error("架空テスト店舗の初期化を中止しました。明示引数・専用DB・空店舗・所有者・品目マスタを確認してください。自動再試行はしません。");
    process.exitCode = 1;
});
