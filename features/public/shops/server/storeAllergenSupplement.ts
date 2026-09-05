import { prisma } from "@/lib/db";
import { getStoreContainsAllergenSlugs } from "@/lib/allergens";

export async function loadStoreAllergenSupplement(shopId: string, allergens: Array<{ slug: string; nameJa: string }>) {
    const menus = await prisma.menuItem.findMany({
        where: { shopId, isPublished: true, shop: { isActive: true } },
        select: { name: true, allergenLinks: { select: { status: true, allergen: { select: { slug: true } } } } },
    });
    return getStoreContainsAllergenSlugs(menus, allergens);
}
