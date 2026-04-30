import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { readPublicDataOrFallback } from "@/lib/public-db";
import PublicShopListClient from "@/components/public/PublicShopListClient";

export const revalidate = 60;
export const dynamic = "force-static";

export default async function PublicShopListPage() {
    // 公開メニューを持つ店舗だけを 60 秒単位で取得し、検索は URL q を見てクライアント側で絞ります。
    const { data: shops, isDatabaseAvailable } = await readPublicDataOrFallback(
        () =>
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
                        take: 1,
                        select: {
                            priceYen: true,
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
        [],
        { context: "public-shops:list" },
    );

    const initialShops = shops.map((shop) => ({
        ...shop,
        updatedAt: shop.updatedAt.toISOString(),
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
                isDatabaseAvailable={isDatabaseAvailable}
            />
        </Suspense>
    );
}
