import { prisma } from "@/lib/db";
import { MENU_TEXT_LIMITS } from "../schemas/menu-input";
import { rankMenuCategories } from "../menu-category-options";

// The callers resolve shopId from the authenticated owner's shop.
export async function getMenuCategoryOptions(shopId: string) {
    const rows = await prisma.menuItem.groupBy({
        by: ["category"],
        where: { shopId, category: { not: null } },
        _count: { _all: true },
    });
    return rankMenuCategories(rows).filter((category) => category.length <= MENU_TEXT_LIMITS.category);
}
