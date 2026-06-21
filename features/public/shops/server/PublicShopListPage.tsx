import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { readPublicDataOrFallback } from "@/lib/public-db";
import PublicShopListClient from "@/features/public/shops/components/PublicShopListClient";
import { createStatusBySlug, isMenuPublishable } from "@/lib/allergens";

export const revalidate = 60;
export const dynamic = "force-static";

export default async function PublicShopListPage() {
    // 公開メニューを持つ店舗と、検索画面で使うアレルゲン設定用マスタを 60 秒単位で取得します。
    const { data: publicShopListData, isDatabaseAvailable } =
        await readPublicDataOrFallback(
            async () => {
                const [shops, allergenMaster] = await Promise.all([
                    prisma.shop.findMany({
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
                                    allergenLinks: {
                                        select: {
                                            status: true,
                                            allergen: {
                                                select: { slug: true },
                                            },
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
                    prisma.allergen.findMany({
                        orderBy: { sortOrder: "asc" },
                        select: { slug: true, nameJa: true },
                    }),
                ]);

                return { shops, allergenMaster };
            },
            {
                shops: [],
                allergenMaster: [],
            },
            { context: "public-shops:list" },
        );

    const { shops, allergenMaster } = publicShopListData;

    // isPublished が古いデータに残っていても、未設定を含むメニューは公開側へ渡しません。
    // 29 品目のリンク欠損も createStatusBySlug が UNKNOWN として扱います。
    const shopsWithPublishableMenus = shops.flatMap((shop) => {
        const publishableMenus = shop.menus.filter((menu) =>
            isMenuPublishable({
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
                menus: publishableMenus,
                _count: { ...shop._count, menus: publishableMenus.length },
            },
        ];
    });

    const initialShops = shopsWithPublishableMenus.map((shop) => ({
        ...shop,
        updatedAt: shop.updatedAt.toISOString(),
    }));
    const allergensForClient = allergenMaster.map((allergen) => ({
        slug: allergen.slug,
        nameJa: allergen.nameJa,
    }));

    return (
        <Suspense
            fallback={
                <main className="mx-auto max-w-5xl px-4 py-8">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
                        店舗一覧を読み込み中です。
                    </div>
                </main>
            }
        >
            <PublicShopListClient
                initialShops={initialShops}
                allergens={allergensForClient}
                isDatabaseAvailable={isDatabaseAvailable}
            />
        </Suspense>
    );
}
