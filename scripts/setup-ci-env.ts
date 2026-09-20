import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertCiDatabaseTarget } from "./ci-environment";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { DEMO_MENUS, validateDemoMenuFixtures } from "../prisma/demo-menus";
import { DEMO_USER_EMAIL } from "../lib/auth/demo-shop";

async function main() {
    assertCiDatabaseTarget();
    validateDemoMenuFixtures();
    // ガード通過後に既存migrationを一時DBへ適用する。reset・通常seed・Clerk呼び出しはしない。
    const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { stdio: "inherit" });
    if (migration.status !== 0) throw new Error("CI専用DBのmigrationに失敗しました。");
    const prisma = new PrismaClient();
    try {
        if (await prisma.user.count() || await prisma.shop.count() || await prisma.menuItem.count()) {
            throw new Error("CI専用DBが空ではありません。既存データには変更を加えません。");
        }
        await prisma.$transaction(async (tx) => {
            // 既存migrationが追加する品目もあるため、マスタのみupsertする。
            const allergens = await Promise.all(ALLERGEN_MASTER.map((data) => tx.allergen.upsert({
                where: { slug: data.slug }, create: data, update: data,
            })));
            const user = await tx.user.create({ data: { email: DEMO_USER_EMAIL } });
            const shop = await tx.shop.create({ data: {
                userId: user.id, isActive: true, name: "【架空店舗】ClearAllergyデモカフェ",
                description: "架空の店舗・メニューを使ったUI検証用プロトタイプです。実際の飲食判断には使用しないでください。",
                address: "架空住所（実在しません）", category: "カフェ",
            } });
            for (const { allergenStatusBySlug, ...menu } of DEMO_MENUS) {
                await tx.menuItem.create({ data: { ...menu, shopId: shop.id, isPublished: true,
                    allergenLinks: { create: allergens.map((allergen) => ({
                        allergenId: allergen.id, status: allergenStatusBySlug[allergen.slug],
                    })) },
                } });
            }
        });
        console.log("CI専用の架空店舗と3メニューを作成しました。外部認証・画像保存は行っていません。");
    } finally { await prisma.$disconnect(); }
}

main().catch(() => { console.error("CI専用環境の準備に失敗しました。接続条件と空DBを確認してください。"); process.exitCode = 1; });
