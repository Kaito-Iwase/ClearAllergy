import CreateMenuButton from "@/components/admin/menu/CreateMenuButton";
import MenuListPageClient from "@/components/admin/menu/MenuListPageClient";
import AdminDashboardShell from "@/components/layout/AdminDashboardShell";
import {
    createStatusBySlug,
    getUnknownAllergenNames,
} from "@/lib/allergens";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getDemoShopMenus() {
    return prisma.shop.findFirst({
        where: {
            OR: [
                { name: { contains: "デモ" } },
                { name: { contains: "Cafe Hibi" } },
            ],
            menus: {
                some: {},
            },
        },
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            menus: {
                orderBy: { updatedAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    category: true,
                    priceYen: true,
                    imageUrl: true,
                    isPublished: true,
                    updatedAt: true,
                    allergenLinks: {
                        select: {
                            status: true,
                            allergen: { select: { slug: true } },
                        },
                    },
                },
            },
        },
    });
}

export default async function AdminDemoMenusPage() {
    const [allergens, demoShop] = await Promise.all([
        prisma.allergen.findMany({
            orderBy: { sortOrder: "asc" },
            select: { slug: true, nameJa: true },
        }),
        getDemoShopMenus().catch(() => null),
    ]);

    const initialMenus =
        demoShop?.menus.map((menu) => {
            const statusBySlug = createStatusBySlug(
                allergens,
                menu.allergenLinks,
            );
            const unknownAllergenNames = getUnknownAllergenNames({
                allergens,
                statusBySlug,
            });

            return {
                id: menu.id,
                name: menu.name,
                category: menu.category,
                priceYen: menu.priceYen,
                imageUrl: menu.imageUrl,
                isPublished: menu.isPublished,
                updatedAt: menu.updatedAt.toISOString(),
                unknownAllergenNames,
            };
        }) ?? [];

    return (
        <AdminDashboardShell
            shopHref="/admin/demo"
            menusHref="/admin/demo/menus"
        >
            <div className="min-h-screen bg-[#f5f7f4]">
                <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:pb-8">
                    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                        ポートフォリオ公開版のため、この管理画面は閲覧専用です。
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold text-[#0f4c2f]">
                                店舗メニュー
                            </p>
                            <h1 className="mt-1 text-2xl font-extrabold text-gray-950">
                                メニュー管理
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                                通常の管理画面と同じ見た目で、公開状態・価格・アレルゲン設定状況を確認できます。作成・削除などの編集権限はありません。
                            </p>
                        </div>

                        <CreateMenuButton href="/admin/demo/menus/new" />
                    </div>

                    <div className="mt-6">
                        <MenuListPageClient
                            initialMenus={initialMenus}
                            readOnly
                            readOnlyEditHrefBase="/admin/demo/menus"
                        />
                    </div>
                </div>
            </div>
        </AdminDashboardShell>
    );
}
