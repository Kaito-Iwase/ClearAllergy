import type { Prisma } from "@prisma/client";
import { foodSnapshot } from "../food-review";
import type { z } from "zod";
import type { foodReviewInputSchema } from "../schemas/menu-input";

export function validFoodReviewTime(review: z.infer<typeof foodReviewInputSchema> | undefined) {
    return !review || Date.parse(review.checkedAt) <= Date.now() + 5 * 60_000;
}

export async function flushMenuPublicationChecks(tx: Prisma.TransactionClient) {
    // Keep the existing deferred checks during link replacement, then resolve
    // them under the transaction's locks before constructing the response.
    await tx.$executeRaw`SET CONSTRAINTS "MenuItem_reconcile_publication", "MenuItemAllergen_reconcile_publication", "Allergen_reconcile_menu_publication", "ca_require_food_review" IMMEDIATE`;
}

export async function saveFoodReview(tx: Prisma.TransactionClient, args: {
    menuId: string; shopId: string; actorUserId: string;
    review: z.infer<typeof foodReviewInputSchema>;
    snapshot: ReturnType<typeof foodSnapshot>;
}) {
    const menu = await tx.menuItem.findFirstOrThrow({ where: { id: args.menuId, shopId: args.shopId }, select: { foodVersion: true } });
    await tx.menuFoodReview.create({ data: {
        menuItemId: args.menuId, foodVersion: menu.foodVersion, actorUserId: args.actorUserId,
        contentSnapshot: args.snapshot, evidenceRefs: args.review.evidenceRefs, scope: args.review.scope,
        checkedAt: new Date(args.review.checkedAt), unresolvedIssues: args.review.unresolvedIssues || null,
    } });
    await tx.menuItem.update({ where: { id: args.menuId, shopId: args.shopId }, data: {
        reviewedFoodVersion: args.review.unresolvedIssues ? null : menu.foodVersion,
    } });
}
export const foodReviewHistorySelection = {
    orderBy: { reviewSequence: "desc" as const }, take: 5,
    select: { id: true, foodVersion: true, contentSnapshot: true, evidenceRefs: true, scope: true, checkedAt: true, recordedAt: true, unresolvedIssues: true },
};
