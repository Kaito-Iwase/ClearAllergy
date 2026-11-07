import "server-only";
import { loadStoreAllergenSupplement } from "./storeAllergenSupplement";
import { readPublicSnapshot } from "./public-read-snapshot";
import { readPublicDataOrFallback } from "@/lib/public-db";
import { sanitizeStoredImageUrl } from "@/lib/storage/image-url-policy";
import { formatDateTimeJa, formatPriceYen } from "@/lib/utils/formatters";
import {
    buildAllergenRows, buildAllergenDisplayItems, createStatusBySlug,
    isMenuPublishable, isMenuPublicationCurrent,
} from "@/lib/allergens";
import { publicMenuDetailDataSchema, type PublicResult } from "@/features/public/shops/freshness/contracts";

export async function loadPublicMenuDetail(shopId: string, menuId: string): Promise<PublicResult> {
    if (!shopId || !menuId) return { kind: "not-found" };

    const {
        data: publicMenuData,
        isDatabaseAvailable,
    } = await readPublicDataOrFallback(
        async () => readPublicSnapshot(async tx => {
            const [allergenMaster, menu] = await Promise.all([
                // 未登録品目も画面に出したいので、アレルゲンマスタを全件取得します。
                tx.allergen.findMany({
                    select: { slug: true, nameJa: true, sortOrder: true },
                    orderBy: { sortOrder: "asc" },
                }),

                // 公開中のメニューだけを対象にし、非公開データは見せません。
                tx.menuItem.findFirst({
                    where: {
                        id: menuId,
                        shopId,
                        isPublished: true,
                        shop: {
                            isActive: true,
                        },
                    },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        priceYen: true,
                        category: true,
                        ingredients: true,
                        precaution: true,
                        imageUrl: true,
                        imageFrame: true,
                        imageFit: true,
                        imagePosition: true,
                        imageZoom: true,
                        imagePositionX: true,
                        imagePositionY: true,
                        updatedAt: true,
                        shop: {
                            select: { id: true, name: true },
                        },
                        foodVersion: true,
                        reviewedFoodVersion: true, publicationConfirmedFoodVersion: true,
                        allergenLinks: {
                            select: {
                                status: true,
                                allergen: { select: { slug: true } },
                            },
                        },
                    },
                }),
            ]);

            const storeHandledAllergenSlugs = menu ? [...await loadStoreAllergenSupplement(shopId, allergenMaster, tx)] : [];
            return { allergenMaster, menu, storeHandledAllergenSlugs };
        }),
        {
            allergenMaster: [],
            menu: null,
            storeHandledAllergenSlugs: [] as string[],
        },
        { context: `public-menu-detail:${shopId}:${menuId}` },
    );

    if (!isDatabaseAvailable) return { kind: "unavailable" };

    const { allergenMaster, menu, storeHandledAllergenSlugs } = publicMenuData;

    if (!menu) {
        return { kind: "not-found" };
    }

    const statusBySlug = createStatusBySlug(
        allergenMaster,
        menu.allergenLinks,
    );
    if (
        !isMenuPublicationCurrent(menu) || !isMenuPublishable({
            name: menu.name,
            allergens: allergenMaster,
            statusBySlug,
        })
    ) {
        return { kind: "not-found" };
    }

    // 現行マスタを基準に rows を作り、未登録項目も UNKNOWN として常に表示します。
    const rows = buildAllergenDisplayItems(buildAllergenRows(allergenMaster, menu.allergenLinks), new Set(storeHandledAllergenSlugs));


    const priceText = formatPriceYen(menu.priceYen);

    const safeImageUrl = sanitizeStoredImageUrl(menu.imageUrl, {
        kind: "menu",
        shopId,
    });

    return {
        kind: "menu",
        data: publicMenuDetailDataSchema.parse({
            shopId,
            shopName: menu.shop.name,
            menuName: menu.name,
            description: menu.description,
            category: menu.category,
            priceText,
            updatedAtText: formatDateTimeJa(menu.updatedAt),
            safeImageUrl,
            imageFrame: menu.imageFrame,
            imageFit: menu.imageFit,
            imagePosition: menu.imagePosition,
            imageZoom: menu.imageZoom,
            imagePositionX: menu.imagePositionX,
            imagePositionY: menu.imagePositionY,
            ingredients: menu.ingredients,
            precaution: menu.precaution,
            allergensForClient: allergenMaster.map(({ slug, nameJa }) => ({ slug, nameJa })),
            statusBySlugForClient: statusBySlug,
            rows,
            storeHandledAllergenSlugs,
        }),
    };
}
