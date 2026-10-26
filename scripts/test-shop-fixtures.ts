import type { PrismaClient } from "@prisma/client";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { DEMO_MENUS, validateDemoMenuFixtures } from "../prisma/demo-menus";
import { assertCiDatabaseTarget } from "./ci-environment";
import { assertTestDatabaseTarget } from "./test-environment";

export type TestShopTarget = { shopId: string; ownerClerkUserId: string };

export function parseTestShopTarget(args: string[]): TestShopTarget {
    if (args.length !== 5 || args[0] !== "--shop-id" || args[2] !== "--owner-clerk-user-id" || args[4] !== "--apply"
        || !/^[a-zA-Z0-9_-]{1,128}$/.test(args[1]) || !/^user_[a-zA-Z0-9]{1,128}$/.test(args[3])) {
        throw new Error("--shop-id <ID> --owner-clerk-user-id <ID> --apply を明示してください。");
    }
    return { shopId: args[1], ownerClerkUserId: args[3] };
}

export function assertTestShopFixtureTarget(env: Record<string, string | undefined> = process.env) {
    // Keep both existing guards intact. A remote Preview target is deliberately unsupported.
    try { assertCiDatabaseTarget(env); } catch { assertTestDatabaseTarget(env); }
}

type FixtureAllergen = { id: string; slug: string; nameJa: string; nameEn: string; sortOrder: number };

export function createTestShopMenuFixtures(allergens: FixtureAllergen[]) {
    validateDemoMenuFixtures();
    if (allergens.length !== ALLERGEN_MASTER.length || new Set(allergens.map(a => a.id)).size !== allergens.length
        || new Set(allergens.map(a => a.slug)).size !== allergens.length
        || ALLERGEN_MASTER.some(expected => !allergens.some(actual => actual.slug === expected.slug
            && actual.nameJa === expected.nameJa && actual.nameEn === expected.nameEn && actual.sortOrder === expected.sortOrder))) {
        throw new Error("品目マスタが現行の架空データ定義と一致しません。マスタは変更しません。");
    }
    return DEMO_MENUS.map(({ allergenStatusBySlug, ...menu }) => ({
        ...menu,
        isPublished: false,
        allergenLinks: { create: allergens.map(allergen => ({
            allergenId: allergen.id, status: allergenStatusBySlug[allergen.slug],
        })) },
    }));
}

export async function initializeTestShopFixtures(prisma: PrismaClient, target: TestShopTarget) {
    assertTestShopFixtureTarget();
    // Validate the same explicit identifiers even when called without the CLI.
    parseTestShopTarget(["--shop-id", target.shopId, "--owner-clerk-user-id", target.ownerClerkUserId, "--apply"]);
    return prisma.$transaction(async tx => {
        const shop = await tx.shop.findFirst({ where: {
            id: target.shopId, ownerClerkUserId: target.ownerClerkUserId,
            user: { clerkUserId: target.ownerClerkUserId }, name: { startsWith: "【架空・テスト専用】" },
            menus: { none: {} },
        }, select: { id: true } });
        if (!shop) throw new Error("所有者が一致する空の架空テスト店舗だけを初期化できます。既存データは変更しません。");
        const allergens = await tx.allergen.findMany({ select: { id: true, slug: true, nameJa: true, nameEn: true, sortOrder: true } });
        const menus = createTestShopMenuFixtures(allergens);
        for (const menu of menus) {
            await tx.menuItem.create({ data: { ...menu, shopId: shop.id } });
        }
        // No synthetic food review or publication event: publish later through the normal UI.
        return menus.length;
    }, { isolationLevel: "Serializable" });
}
