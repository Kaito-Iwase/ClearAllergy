// app/admin/(dashboard)/menus/[menuId]/edit/page.tsx
// 管理画面：メニュー編集ページ（Server Component）

import AdminMenuEditClient from "@/components/admin/AdminMenuEditClient";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

type Status = "FREE" | "MAY_CONTAIN" | "CONTAINS";

type PageProps = {
    params: Promise<{ menuId: string }> | { menuId: string };
};

export default async function AdminMenuEditPage({ params }: PageProps) {
    // 1) ログイン必須
    const session = await getServerSession(authOptions);
    if (!session) {
        redirect("/admin/login");
    }

    const shopId = session.user.shopId;
    if (!shopId) {
        redirect("/admin/login");
    }

    // 2) menuId
    const { menuId } = await params;

    // 3) アレルゲンマスタ
    const allergens = await prisma.allergen.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
            slug: true,
            nameJa: true,
            nameEn: true,
            sortOrder: true,
        },
    });

    // 4) メニュー取得（この店舗のものだけ）
    const menu = await prisma.menuItem.findFirst({
        where: { id: menuId, shopId },
        select: {
            id: true,
            shopId: true,
            name: true,
            description: true,
            priceYen: true,
            category: true,
            ingredients: true,
            precaution: true,
            imageUrl: true,
            isPublished: true,
            allergenLinks: {
                select: {
                    status: true,
                    allergen: { select: { slug: true } },
                },
            },
        },
    });

    if (!menu) {
        notFound();
    }

    // 5) 初期状態：全部FREE → 既存状態で上書き
    const initialStatusBySlug: Record<string, Status> = {};
    for (const a of allergens) {
        initialStatusBySlug[a.slug] = "FREE";
    }

    for (const link of menu.allergenLinks) {
        initialStatusBySlug[link.allergen.slug] = link.status as Status;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <nav className="mb-4 text-sm text-gray-500">
                    <Link href="/admin/menus" className="hover:text-gray-900">
                        メニュー一覧
                    </Link>
                    <span className="mx-2">/</span>
                    <span className="font-medium text-gray-900">
                        編集: {menu.name}
                    </span>
                </nav>
                <h1 className="text-2xl font-bold text-gray-900">
                    メニュー編集
                </h1>
                <p className="mt-1 text-gray-600">
                    基本情報、価格、原材料名、食品画像、アレルゲン28品目を入力してください。
                </p>

                <div className="mt-6">
                    <AdminMenuEditClient
                        menuId={menu.id}
                        initialName={menu.name}
                        initialDescription={menu.description}
                        initialPriceYen={menu.priceYen}
                        initialCategory={menu.category}
                        initialIngredients={menu.ingredients}
                        initialPrecaution={menu.precaution}
                        initialImageUrl={menu.imageUrl}
                        initialIsPublished={menu.isPublished}
                        allergens={allergens}
                        initialStatusBySlug={initialStatusBySlug}
                    />
                </div>
            </div>
        </div>
    );
}
