// このページは店舗管理者のメニュー一覧画面です。
// ログイン中の店舗に紐づくメニューだけを取得して表示します。
// Server Component なので DB 取得を直接ここで行い、表示用データだけを Client Component に渡します。

// app/admin/(dashboard)/menus/page.tsx

import { prisma } from "@/lib/db";
import { requireCurrentAdminContextOrRedirect } from "@/lib/admin-auth";
import MenuListPageClient from "@/components/admin/menu/MenuListPageClient";
import CreateMenuButton from "@/components/admin/menu/CreateMenuButton";

export default async function AdminMenusPage() {
    // 管理画面なので、未ログインや店舗未作成ならここでリダイレクトします。
    const adminContext = await requireCurrentAdminContextOrRedirect();
    const shopId = adminContext.shop.id;

    // 一覧表示は Server Component で完結できるため、API を経由せず直接 DB から取得します。
    const menus = await prisma.menuItem.findMany({
        where: { shopId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, isPublished: true, updatedAt: true },
    });

    // Date 型は Client Component で扱いにくいので、文字列に変換して渡します。
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
