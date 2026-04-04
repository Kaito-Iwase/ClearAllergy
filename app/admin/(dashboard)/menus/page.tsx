// app/admin/(dashboard)/menus/page.tsx
// 管理画面：メニュー一覧（Server）
// 役割：ログイン確認→DBから一覧取得→Clientに渡す

import { prisma } from "@/lib/db";
import { requireCurrentAdminContextOrRedirect } from "@/lib/admin-auth";
import MenuListPageClient from "@/components/admin/menu/MenuListPageClient";
import CreateMenuButton from "@/components/admin/menu/CreateMenuButton";

export default async function AdminMenusPage() {
    const adminContext = await requireCurrentAdminContextOrRedirect();
    const shopId = adminContext.shop.id;

    // 3) DBから直接一覧取得（APIを挟まない：あなたの方針を維持）
    const menus = await prisma.menuItem.findMany({
        where: { shopId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, isPublished: true, updatedAt: true },
    });

    // 4) Clientに渡しやすい形へ変換（Date→string）
    const initialMenus = menus.map((menu) => ({
        ...menu,
        updatedAt: menu.updatedAt.toISOString(),
    }));

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            メニュー一覧
                        </h1>
                        <p className="mt-1 text-sm text-gray-600">
                            新規作成は `/admin/menus/new` から始まり、作成後は
                            `/admin/menus/[menuId]/edit`
                            で28品目と価格をまとめて編集できます。
                        </p>
                    </div>

                    <CreateMenuButton />
                </div>

                <div className="mt-6">
                    <MenuListPageClient initialMenus={initialMenus} />
                </div>
            </div>
        </div>
    );
}
