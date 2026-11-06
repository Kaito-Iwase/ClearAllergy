import "server-only";
import { readPublicSnapshot } from "./public-read-snapshot";
import { createPublicAllergenLinkResolver } from "./public-allergen-links";
import { readPublicDataOrFallback } from "@/lib/public-db";
import { createStatusBySlug, isMenuPublishable, isMenuPublicationCurrent } from "@/lib/allergens";
import { publicShopListDataSchema, type PublicResult } from "@/features/public/shops/freshness/contracts";

export async function loadPublicShopList(): Promise<PublicResult> {
    // 公開メニューを持つ店舗と、検索画面で使うアレルゲン設定用マスタをアクセスごとに取得します。
    const { data: publicShopListData, isDatabaseAvailable } =
        await readPublicDataOrFallback(
            async () => readPublicSnapshot(async tx => {
                const [shops, allergenMaster] = await Promise.all([
                    tx.shop.findMany({
                        where: {
                            isActive: true,
                            menus: {
                                some: {
                                    isPublished: true,
                                },
                            },
                        },
                        orderBy: { updatedAt: "desc" },
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            address: true,
                            prefecture: true,
                            city: true,
                            nearestStation: true,
                            category: true,
                            latitude: true,
                            longitude: true,
                            googlePlaceId: true,
                            averageBudgetYen: true,
                            coverImageUrl: true,
                            coverImageFit: true,
                            coverImageZoom: true,
                            coverImagePositionX: true,
                            coverImagePositionY: true,
                            updatedAt: true,
                            menus: {
                                where: { isPublished: true },
                                orderBy: { updatedAt: "desc" },
                                select: {
                                    name: true,
                                    priceYen: true,
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
                            _count: {
                                select: {
                                    menus: {
                                        where: {
                                            isPublished: true,
                                        },
                                    },
                                },
                            },
                        },
                    }),
                    tx.allergen.findMany({
                        orderBy: { sortOrder: "asc" },
                        select: { id: true, slug: true, nameJa: true },
                    }),
                ]);

                const resolveLinks = createPublicAllergenLinkResolver(allergenMaster);
                return {
                    shops: shops.map(shop => ({
                        ...shop,
                        menus: shop.menus.map(menu => ({
                            ...menu,
                            allergenLinks: resolveLinks(menu.allergenLinks),
                        })),
                    })),
                    allergenMaster: allergenMaster.map(({ slug, nameJa }) => ({ slug, nameJa })),
                };
            }),
            {
                shops: [],
                allergenMaster: [],
            },
            { context: "public-shops:list" },
        );

    if (!isDatabaseAvailable) return { kind: "unavailable" };

    const { shops, allergenMaster } = publicShopListData;

    // isPublished が古いデータに残っていても、未設定を含むメニューは公開側へ渡しません。
    // 現行マスタに対するリンク欠損も createStatusBySlug が UNKNOWN として扱います。
    const shopsWithPublishableMenus = shops.flatMap((shop) => {
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

        if (publishableMenus.length === 0) return [];

        return [
            {
                ...shop,
                menus: publishableMenus.map(({ name, priceYen, allergenLinks }) => ({
                    name,
                    priceYen,
                    allergenLinks,
                })),
                _count: { ...shop._count, menus: publishableMenus.length },
            },
        ];
    });

    const initialShops = shopsWithPublishableMenus.map((shop) => ({
        id: shop.id,
        name: shop.name,
        description: shop.description,
        address: shop.address,
        prefecture: shop.prefecture,
        city: shop.city,
        nearestStation: shop.nearestStation,
        category: shop.category,
        latitude: shop.latitude,
        longitude: shop.longitude,
        googlePlaceId: shop.googlePlaceId,
        averageBudgetYen: shop.averageBudgetYen,
        updatedAt: shop.updatedAt.toISOString(),
        menus: shop.menus,
        _count: shop._count,
    }));
    const allergensForClient = allergenMaster.map((allergen) => ({
        slug: allergen.slug,
        nameJa: allergen.nameJa,
    }));

    return {
        kind: "list",
        data: publicShopListDataSchema.parse({
            initialShops,
            allergens: allergensForClient,
            isDatabaseAvailable: true,
        }),
    };
}
