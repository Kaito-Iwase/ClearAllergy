import type { Prisma } from "@prisma/client";
import { createStatusBySlug, getUnknownAllergenNames } from "@/lib/allergens";
import { getMenuFoodReviewState, type AdminMenuListRow } from "../menu-list";

export const adminMenuListSelect = {
    id: true, name: true, category: true, priceYen: true, imageUrl: true,
    isPublished: true, version: true, updatedAt: true,
    foodVersion: true, reviewedFoodVersion: true, publicationConfirmedFoodVersion: true,
    allergenLinks: { select: { status: true, allergen: { select: { slug: true } } } },
    foodReviews: {
        orderBy: { reviewSequence: "desc" }, take: 1,
        select: { foodVersion: true, unresolvedIssues: true, issueResolutions: { orderBy: { foodVersion: "desc" }, take: 1, select: { foodVersion: true } } },
    },
} satisfies Prisma.MenuItemSelect;

type MenuListData = Prisma.MenuItemGetPayload<{ select: typeof adminMenuListSelect }>;

// 根拠・操作者・snapshot・未解決本文をClientや一覧APIへ渡さない。
export function toAdminMenuListRow(menu: MenuListData, allergens: Array<{ slug: string; nameJa: string }>): AdminMenuListRow {
    return {
        id: menu.id, name: menu.name, category: menu.category, priceYen: menu.priceYen,
        imageUrl: menu.imageUrl, isPublished: menu.isPublished, version: menu.version,
        updatedAt: menu.updatedAt.toISOString(),
        unknownAllergenNames: getUnknownAllergenNames({ allergens, statusBySlug: createStatusBySlug(allergens, menu.allergenLinks) }),
        foodReviewState: getMenuFoodReviewState(menu),
    };
}
