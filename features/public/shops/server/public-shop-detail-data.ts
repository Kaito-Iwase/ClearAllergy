import "server-only";
import { readPublicSnapshot } from "./public-read-snapshot";
import { createPublicAllergenLinkResolver } from "./public-allergen-links";
import { readPublicDataOrFallback } from "@/lib/public-db";
import { sanitizeStoredImageUrl } from "@/lib/storage/image-url-policy";
import {
    createStatusBySlug, getStoreContainsAllergenSlugs,
    isMenuPublishable, isMenuPublicationCurrent,
} from "@/lib/allergens";
import { publicShopDetailDataSchema, type PublicMenuImages, type PublicResult } from "@/features/public/shops/freshness/contracts";

export async function loadPublicShopDetail(shopId: string): Promise<PublicResult> {
    return (await loadPublicShopDetailPageData(shopId, false)).result;
}

export async function loadPublicShopDetailPageData(shopId: string, includeMenuImages = true): Promise<{
    result: PublicResult;
    menuImages?: PublicMenuImages;
}> {
    if (!shopId) return { result: { kind: "not-found" } };

    const {
        data: publicShopData,
        isDatabaseAvailable,
    } = await readPublicDataOrFallback(
        async () => readPublicSnapshot(async tx => {
            const [allergenMaster, shop] = await Promise.all([
                // アレルゲンマスタは一覧カードや設定 UI の両方で使うため、1 回だけ取得します。
                tx.allergen.findMany({
                    select: { id: true, slug: true, nameJa: true, sortOrder: true },
                    orderBy: { sortOrder: "asc" },
                }),

                // 店舗本体と公開メニューを一緒に取り、N+1 を避けます。
                tx.shop.findFirst({
                    where: {
                        id: shopId,
                        isActive: true,
                        menus: {
                            some: {
                                isPublished: true,
                            },
                        },
                    },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        address: true,
                        prefecture: true,
                        city: true,
                        nearestStation: true,
                        category: true,
                        hours: true,
                        regularHoliday: true,
                        phoneNumber: true,
                        note: true,
                        averageBudgetYen: true,
                        coverImageUrl: true,
                        coverImageFit: true,
                        coverImageZoom: true,
                        coverImagePositionX: true,
                        coverImagePositionY: true,
                        updatedAt: true,
                        _count: {
                            select: {
                                menus: {
                                    where: {
                                        isPublished: true,
                                    },
                                },
                            },
                        },
                        menus: {
                            where: { isPublished: true },
                            orderBy: { updatedAt: "desc" },
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                priceYen: true,
                                category: true,
                                precaution: true,
                                ...(includeMenuImages ? {
                                    imageUrl: true,
                                    imageFrame: true,
                                    imageFit: true,
                                    imageZoom: true,
                                    imagePositionX: true,
                                    imagePositionY: true,
                                } : {}),
                                updatedAt: true,
                                foodVersion: true,
                                reviewedFoodVersion: true, publicationConfirmedFoodVersion: true,
                                allergenLinks: {
                                    select: {
                                        status: true,
                                        allergenId: true,
                                    },
                                },
                            },
                        },
                    },
                }),
            ]);

            const resolveLinks = createPublicAllergenLinkResolver(allergenMaster);
            return {
                allergenMaster: allergenMaster.map(({ slug, nameJa, sortOrder }) => ({ slug, nameJa, sortOrder })),
                shop: shop ? {
                    ...shop,
                    menus: shop.menus.map(menu => ({
                        ...menu,
                        allergenLinks: resolveLinks(menu.allergenLinks),
                    })),
                } : null,
            };
        }),
        {
            allergenMaster: [],
            shop: null,
        },
        { context: `public-shop-detail:${shopId}` },
    );

    if (!isDatabaseAvailable) return { result: { kind: "unavailable" } };

    const { allergenMaster, shop } = publicShopData;

    if (!shop) {
        // 公開メニューが 1 件も無い店舗は、公開準備中として 404 にします。
        // これにより、店舗情報だけ先に外部へ見えてしまう状態を防ぎます。
        return { result: { kind: "not-found" } };
    }

    // 公開フラグだけでなく、現行マスタの全品目が確定済みかを公開時にも再確認します。
    const publishableMenus = shop.menus.filter((menu) =>
        isMenuPublicationCurrent(menu) && isMenuPublishable({
            name: menu.name,
            allergens: allergenMaster,
            statusBySlug: createStatusBySlug(
                allergenMaster,
                menu.allergenLinks,
            ),
        }),
    );

    if (publishableMenus.length === 0) {
        return { result: { kind: "not-found" } };
    }

    const storeHandledAllergenSlugs = [...getStoreContainsAllergenSlugs(publishableMenus, allergenMaster)];

    // Server Component で取った Date や relation を、Client Component が扱いやすい形へ変換します。
    const menusForClient = publishableMenus.map((menu) => ({
        id: menu.id,
        name: menu.name,
        description: menu.description,
        priceYen: menu.priceYen,
        category: menu.category,
        precaution: menu.precaution,
        updatedAt: menu.updatedAt.toISOString(),
        allergenLinks: menu.allergenLinks.map((link) => ({
            status: link.status,
            allergen: {
                slug: link.allergen.slug,
            },
        })),
    }));

    const safeCoverImageUrl = sanitizeStoredImageUrl(shop.coverImageUrl, { kind: "shop", shopId });
    const menuImages = includeMenuImages ? Object.fromEntries(publishableMenus.flatMap(menu => {
        const safeImageUrl = sanitizeStoredImageUrl(menu.imageUrl, { kind: "menu", shopId });
        return safeImageUrl ? [[menu.id, {
            updatedAt: menu.updatedAt.toISOString(),
            safeImageUrl,
            imageFrame: menu.imageFrame,
            imageFit: menu.imageFit,
            imageZoom: menu.imageZoom,
            imagePositionX: menu.imagePositionX,
            imagePositionY: menu.imagePositionY,
        }]] : [];
    })) : undefined;

    return {
        menuImages,
        result: { kind: "shop", data: publicShopDetailDataSchema.parse({
            shop: {
                id: shop.id,
                name: shop.name,
                description: shop.description,
                address: shop.address,
                nearestStation: shop.nearestStation,
                category: shop.category,
                hours: shop.hours,
                regularHoliday: shop.regularHoliday,
                phoneNumber: shop.phoneNumber,
                note: shop.note,
                averageBudgetYen: shop.averageBudgetYen,
                updatedAt: shop.updatedAt.toISOString(),
                coverImageFit: shop.coverImageFit,
                coverImageZoom: shop.coverImageZoom,
                coverImagePositionX: shop.coverImagePositionX,
                coverImagePositionY: shop.coverImagePositionY,
            },
            safeCoverImageUrl,
            menusForClient,
            allergenMaster,
            storeHandledAllergenSlugs,
        }) },
    };
}
