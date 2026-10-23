import { savedMenuResponseSchema, type SavedMenu } from "./schemas/menu-response";
import { getApiErrorMessage } from "@/lib/utils/api-error-message";

export type SavedMenuRevision = Pick<SavedMenu, "version" | "foodVersion">;
export const SNAPSHOT_ERROR = "保存済み内容を読み込めませんでした。再保存せず、内容を再確認してください。";

export async function loadSavedMenu(menuId: string, expected?: SavedMenuRevision): Promise<SavedMenu> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const response = await fetch(`/api/admin/menus/${encodeURIComponent(menuId)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, SNAPSHOT_ERROR));
        const result = savedMenuResponseSchema.safeParse(await response.json().catch(() => null));
        if (!result.success || result.data.menu.id !== menuId) throw new Error(SNAPSHOT_ERROR);
        const menu = result.data.menu;
        if (expected && (menu.version !== expected.version || menu.foodVersion !== expected.foodVersion)) {
            throw new Error("別の更新が見つかりました。この保存内容では公開できません。最新内容を別タブで確認してください。");
        }
        return menu;
    } finally { clearTimeout(timeout); }
}

export function savedMenuEditorProps(menu: SavedMenu) {
    return {
        menuId: menu.id, initialVersion: menu.version, initialFoodVersion: menu.foodVersion,
        initialReviewedFoodVersion: menu.reviewedFoodVersion,
        initialPublicationConfirmedFoodVersion: menu.publicationConfirmedFoodVersion,
        initialFoodReviews: menu.foodReviews, initialName: menu.name,
        initialDescription: menu.description, initialPriceYen: menu.priceYen,
        initialCategory: menu.category, initialIngredients: menu.ingredients, initialPrecaution: menu.precaution,
        initialImageUrl: menu.imageUrl, initialImageFrame: menu.imageFrame, initialImageFit: menu.imageFit,
        initialImagePosition: menu.imagePosition, initialImageZoom: menu.imageZoom,
        initialImagePositionX: menu.imagePositionX, initialImagePositionY: menu.imagePositionY,
        initialIsPublished: menu.isPublished,
        allergens: menu.allergens.map(a => ({ ...a, nameEn: a.nameEn ?? "" })),
        initialStatusBySlug: Object.fromEntries(menu.allergens.map(a => [a.slug, a.status])),
    };
}
