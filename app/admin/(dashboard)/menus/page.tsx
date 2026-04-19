// このページは店舗管理者のメニュー一覧画面です。
// ログイン中の店舗に紐づくメニューだけを取得して表示します。
// Server Component なので DB 取得を直接ここで行い、表示用データだけを Client Component に渡します。

// app/admin/(dashboard)/menus/page.tsx

import { prisma } from "@/lib/db";
import { requireCurrentAdminContextOrRedirect } from "@/lib/admin-auth";
import MenuListPageClient from "@/components/admin/menu/MenuListPageClient";
import CreateMenuButton from "@/components/admin/menu/CreateMenuButton";
import {
    createStatusBySlug,
    getUnknownAllergenNames,
} from "@/lib/allergens";

export default async function AdminMenusPage() {
    // 管理画面なので、未ログインや店舗未作成ならここでリダイレクトします。
    const adminContext = await requireCurrentAdminContextOrRedirect();
    const shopId = adminContext.shop.id;

    // 一覧表示は Server Component で完結できるため、API を経由せず直接 DB から取得します。
    const [allergens, menus] = await Promise.all([
        prisma.allergen.findMany({
            orderBy: { sortOrder: "asc" },
            select: { slug: true, nameJa: true },
        }),
        prisma.menuItem.findMany({
            where: { shopId },
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
        }),
    ]);

    // Date 型は Client Component で扱いにくいので、文字列に変換して渡します。
    const initialMenus = menus.map((menu) => {
        const statusBySlug = createStatusBySlug(allergens, menu.allergenLinks);
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
    });

    return (
        <div className="min-h-screen bg-[#f5f7f4]">
            <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:pb-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold text-[#0f4c2f]">
                            店舗メニュー
                        </p>
                        <h1 className="mt-1 text-2xl font-extrabold text-gray-950">
                            メニュー管理
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                            公開状態、価格、アレルゲン28品目の設定状況を一覧で確認できます。未設定があるメニューはカード上で注意表示します。
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
