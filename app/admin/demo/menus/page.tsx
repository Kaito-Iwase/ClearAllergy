import { DEMO_SHOP_WHERE } from "@/lib/auth/demo-shop";
import CreateMenuButton from "@/features/admin/menus/components/CreateMenuButton";
import MenuListPageClient from "@/features/admin/menus/components/MenuListPageClient";
import AdminDashboardShell from "@/components/layout/AdminDashboardShell";
import { adminMenuListSelect, toAdminMenuListRow } from "@/features/admin/menus/server/menu-list-data";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getDemoShopMenus() {
    return prisma.shop.findFirst({
        where: {
            ...DEMO_SHOP_WHERE,
            menus: {
                some: {},
            },
        },
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            menus: {
                orderBy: { updatedAt: "desc" },
                select: adminMenuListSelect,
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
        demoShop?.menus.map((menu) => toAdminMenuListRow(menu, allergens)) ?? [];

    return (
        <AdminDashboardShell
            shopHref="/admin/demo"
            menusHref="/admin/demo/menus"
            showAuthControls={false}
        >
            <div className="min-h-screen bg-[#f5f7f4]">
                <div className="mx-auto max-w-6xl px-0 py-6 sm:px-4 sm:pb-8">
                    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                        ポートフォリオ公開版のため、この管理画面は閲覧専用です。作成・編集・削除ボタンを操作しても保存されません。
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
                                通常の管理画面と同じ見た目で、公開状態・価格・アレルゲン設定状況・食品確認の再確認待ちを確認できます。作成・削除などの編集権限はなく、DB には反映されません。
                            </p>
                        </div>

                        <CreateMenuButton href="/admin/demo/menus/new" />
                    </div>

                    <div className="mt-6">
                        <MenuListPageClient
                            initialMenus={initialMenus}
                            totalAllergenCount={allergens.length}
                            readOnly
                            readOnlyEditHrefBase="/admin/demo/menus"
                        />
                    </div>
                </div>
            </div>
        </AdminDashboardShell>
    );
}
