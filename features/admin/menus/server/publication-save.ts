import { hasUnresolvedFoodIssue } from "../food-review";
import type { Prisma } from "@prisma/client";
import { createStatusBySlug, getMenuPublishValidationErrors } from "@/lib/allergens";

export class MenuPublicationBlockedError extends Error {}

// Caller has already acquired the owned row with an expectedVersion CAS write.
export async function savePublicationConfirmation(tx: Prisma.TransactionClient, args: {
    menuId: string; shopId: string; actorUserId: string;
}) {
    const menu = await tx.menuItem.findFirstOrThrow({ where: { id: args.menuId, shopId: args.shopId },
        select: { foodVersion: true, name: true,
            allergenLinks: { select: { status: true, allergen: { select: { slug: true } } } },
            foodReviews: { orderBy: { reviewSequence: "desc" }, take: 1, select: { unresolvedIssues: true, issueResolutions: { orderBy: { foodVersion: "desc" }, take: 1, select: { foodVersion: true } } } },
        } });
    const allergens = await tx.allergen.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, nameJa: true } });
    const errors = getMenuPublishValidationErrors({ name: menu.name, allergens,
        statusBySlug: createStatusBySlug(allergens, menu.allergenLinks) });
    if (errors.length) throw new MenuPublicationBlockedError(errors.join(" "));
    if (hasUnresolvedFoodIssue(menu.foodVersion, menu.foodReviews[0])) {
        throw new MenuPublicationBlockedError("保存済みの未解決事項があるため公開できません。内容を確認してください。");
    }
    await tx.menuPublicationConfirmation.create({ data: {
        menuItemId: args.menuId, foodVersion: menu.foodVersion, actorUserId: args.actorUserId,
    } });
}

// Caller holds the owned expectedVersion row lock. Resolution never publishes.
export async function saveFoodIssueResolution(tx: Prisma.TransactionClient, args: {
    menuId: string; shopId: string; actorUserId: string; foodReviewId: string; foodVersion: number;
}) {
    const menu = await tx.menuItem.findFirstOrThrow({ where: { id: args.menuId, shopId: args.shopId },
        select: { foodVersion: true, foodReviews: { orderBy: { reviewSequence: "desc" }, take: 1, select: {
            id: true, unresolvedIssues: true,
            issueResolutions: { orderBy: { foodVersion: "desc" }, take: 1, select: { foodVersion: true } },
        } } } });
    const latest = menu.foodReviews[0];
    if (args.foodVersion !== menu.foodVersion || latest?.id !== args.foodReviewId || !hasUnresolvedFoodIssue(menu.foodVersion, latest)) {
        throw new MenuPublicationBlockedError("表示した未解決事項と保存済み食品版を再確認してください。解消済み・別の記録には操作できません。");
    }
    await tx.menuFoodIssueResolution.create({ data: { menuItemId: args.menuId, foodReviewId: latest.id,
        foodVersion: menu.foodVersion, issueSnapshot: latest.unresolvedIssues!, actorUserId: args.actorUserId } });
}
