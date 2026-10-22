import type { Prisma } from "@prisma/client";
import { getStoreContainsAllergenSlugs, isMenuPublicationCurrent } from "@/lib/allergens";

export async function loadStoreAllergenSupplement(shopId: string, allergens: Array<{ slug: string; nameJa: string }>, tx: Prisma.TransactionClient) {
    const menus = await tx.menuItem.findMany({
        where: { shopId, isPublished: true, shop: { isActive: true } },
        select: { name: true, foodVersion: true, reviewedFoodVersion: true, publicationConfirmedFoodVersion: true, allergenLinks: { select: { status: true, allergen: { select: { slug: true } } } } },
    });
    return getStoreContainsAllergenSlugs(menus.filter(isMenuPublicationCurrent), allergens);
}
