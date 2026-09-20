import { DEMO_USER_EMAIL } from "../lib/auth/demo-shop";
import { DEMO_MENUS, validateDemoMenuFixtures } from "./demo-menus";
import { loadEnvConfig } from "@next/env";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { syncLegacyUserToClerk } from "../lib/auth/clerkAdminCore";
import {
    ALLERGEN_MASTER,
} from "../lib/constants/allergen-master";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const ALLERGENS = ALLERGEN_MASTER;

const DEMO_USER_PASSWORD = "demo1234";
const DEMO_SHOP_NAME = "[デモ店舗]Cafe Hibi（カフェ ヒビ）";

async function seedAllergenMaster() {
    const oldMatsutake = await prisma.allergen.findUnique({
        where: { slug: "matsutake" },
        select: { id: true },
    });

    if (oldMatsutake) {
        await prisma.$transaction(async (tx) => {
            await tx.menuItemAllergen.deleteMany({
                where: { allergenId: oldMatsutake.id },
            });

            await tx.allergen.delete({
                where: { slug: "matsutake" },
            });
        });
    }

    for (const allergen of ALLERGENS) {
        await prisma.allergen.upsert({
            where: { slug: allergen.slug },
            update: {
                nameJa: allergen.nameJa,
                nameEn: allergen.nameEn,
                sortOrder: allergen.sortOrder,
            },
            create: allergen,
        });
    }
}

async function seedDemoShop() {
    // デモユーザーでも平文保存はせず、本番と同じくハッシュ化して保存します。
    const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);

    const user = await prisma.user.upsert({
        where: { email: DEMO_USER_EMAIL },
        update: { passwordHash },
        create: {
            email: DEMO_USER_EMAIL,
            passwordHash,
        },
        select: {
            id: true,
            email: true,
            clerkUserId: true,
            passwordHash: true,
            createdAt: true,
        },
    });

    const shop = await prisma.shop.upsert({
        where: { userId: user.id },
        update: {
            name: DEMO_SHOP_NAME,
            ownerClerkUserId: user.clerkUserId,
            isActive: true,
            description:
                "日々の食事を安心して選べるように、メニューごとの価格とアレルゲン情報を公開しているデモ店舗です。",
            address: "東京都渋谷区ヒビ1-2-3",
            prefecture: "東京都",
            city: "渋谷区",
            nearestStation: "渋谷駅",
            category: "カフェ",
            hours: "平日 11:00-18:00 / 土日祝 10:00-19:00",
            regularHoliday: "水曜日",
            phoneNumber: "052-123-4567",
            note: "ラストオーダーは閉店30分前です。",
            coverImageUrl: null,
        },
        create: {
            userId: user.id,
            ownerClerkUserId: user.clerkUserId,
            isActive: true,
            name: DEMO_SHOP_NAME,
            description:
                "日々の食事を安心して選べるように、メニューごとの価格とアレルゲン情報を公開しているデモ店舗です。",
            address: "東京都渋谷区ヒビ1-2-3",
            prefecture: "東京都",
            city: "渋谷区",
            nearestStation: "渋谷駅",
            category: "カフェ",
            hours: "平日 11:00-18:00 / 土日祝 10:00-19:00",
            regularHoliday: "水曜日",
            phoneNumber: "052-123-4567",
            note: "ラストオーダーは閉店30分前です。",
            coverImageUrl: null,
        },
        select: { id: true },
    });

    const allergenBySlug = new Map(
        (
            await prisma.allergen.findMany({
                select: { id: true, slug: true },
            })
        ).map((allergen) => [allergen.slug, allergen.id]),
    );

    for (const menu of DEMO_MENUS) {
        const existing = await prisma.menuItem.findFirst({
            where: {
                shopId: shop.id,
                name: menu.name,
            },
            select: { id: true },
        });

        const statuses = Object.entries(
            menu.allergenStatusBySlug,
        );

        // 公開状態の更新と全設定行の作り直しを同じ transaction に入れ、
        // 遅延公開チェックが完成後の状態だけを判定できるようにします。
        await prisma.$transaction(async (tx) => {
            const savedMenu = existing
                ? await tx.menuItem.update({
                      where: { id: existing.id },
                      data: {
                          name: menu.name,
                          description: menu.description,
                          category: menu.category,
                          priceYen: menu.priceYen,
                          ingredients: menu.ingredients,
                          precaution: menu.precaution,
                          imageUrl: null,
                          isPublished: true,
                      },
                      select: { id: true },
                  })
                : await tx.menuItem.create({
                      data: {
                          shopId: shop.id,
                          name: menu.name,
                          description: menu.description,
                          category: menu.category,
                          priceYen: menu.priceYen,
                          ingredients: menu.ingredients,
                          precaution: menu.precaution,
                          imageUrl: null,
                          isPublished: true,
                      },
                      select: { id: true },
                  });

            await tx.menuItemAllergen.deleteMany({
                where: { menuItemId: savedMenu.id },
            });

            // ここで現行マスタの全品目を作っておくことで、
            // 公開 API や画面が「欠損なし前提」で安全に確認できます。
            await tx.menuItemAllergen.createMany({
                data: statuses.map(([slug, status]) => {
                    const allergenId = allergenBySlug.get(slug);
                    if (!allergenId) {
                        throw new Error(
                            `Unknown allergen slug in seed: ${slug}`,
                        );
                    }

                    return {
                        menuItemId: savedMenu.id,
                        allergenId,
                        status,
                    };
                }),
            });
        });
    }

    if (process.env.CLERK_SECRET_KEY) {
        try {
            const synced = await syncLegacyUserToClerk(user);
            console.log("Seed demo user synced to Clerk:", synced);
        } catch (error) {
            console.warn(
                "Demo user was created locally, but Clerk sync failed. Run `npm run auth:migrate:clerk demo@clearallergy.local` after fixing Clerk connectivity.",
            );
            console.warn(error);
        }
    } else {
        console.log(
            "CLERK_SECRET_KEY is not set, so demo user was only created locally. Run `npm run auth:migrate:clerk demo@clearallergy.local` after configuring Clerk.",
        );
    }
}

async function main() {
    // 不完全な架空データは、DBの変更に入る前に拒否する。
    validateDemoMenuFixtures();
    await seedAllergenMaster();
    await seedDemoShop();
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
