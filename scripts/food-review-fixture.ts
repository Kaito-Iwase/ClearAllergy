import type { Prisma } from "@prisma/client";
import { assertCiDatabaseTarget } from "./ci-environment";
import { assertTestDatabaseTarget } from "./test-environment";
import { createStatusBySlug } from "../lib/allergens";
import { foodSnapshot } from "../features/admin/menus/food-review";

// Fictional test data only; never synthesize food confirmation in the normal seed.
export async function publishReviewedFixture(tx: Prisma.TransactionClient, menuId: string) {
    try { assertCiDatabaseTarget(); } catch { assertTestDatabaseTarget(); }
    const menu = await tx.menuItem.findUniqueOrThrow({ where: { id: menuId }, include: { allergenLinks: { include: { allergen: true } } } });
    const master = await tx.allergen.findMany();
    await tx.menuFoodReview.create({ data: {
        menuItemId: menu.id, foodVersion: menu.foodVersion,
        contentSnapshot: foodSnapshot(menu, master, createStatusBySlug(master, menu.allergenLinks)),
        evidenceRefs: "架空テストデータの定義（実食品の確認ではない）", scope: "この架空メニューの全構成・全品目", checkedAt: new Date(), actorUserId: "synthetic-fixture",
    } });
    return tx.menuItem.update({ where: { id: menu.id }, data: { reviewedFoodVersion: menu.foodVersion, isPublished: true } });
}
