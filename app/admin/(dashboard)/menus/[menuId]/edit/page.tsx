// app/admin/(dashboard)/menus/[menuId]/edit/page.tsx
// 管理画面：メニュー編集ページ（Server Component）
// 役割：
// 1) セッションから shopId を取得
// 2) menuId のメニューがその shopId に属するか確認（権限チェック）
// 3) アレルゲン28品目と現在状態をDBから取得
// 4) Clientへ初期値を渡す

import AdminMenuEditClient from "./AdminMenuEditClient";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";

type Status = "FREE" | "MAY_CONTAIN" | "CONTAINS";

type PageProps = {
    params: Promise<{ menuId: string }> | { menuId: string };
};

export default async function AdminMenuEditPage({ params }: PageProps) {
    // 0) ログイン必須
    const session = await getServerSession(authOptions);
    if (!session) {
        redirect("/admin/login");
    }

    const shopId = session.user.shopId;
    if (!shopId) {
        redirect("/admin/login");
    }

    // 1) menuId
    const { menuId } = await params;

    // 2) アレルゲンマスタ（28品目）
    const allergens = await prisma.allergen.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
            slug: true,
            nameJa: true,
            nameEn: true,
            sortOrder: true,
        },
    });

    // 3) メニュー取得（shopIdで絞る＝権限チェック）
    const menu = await prisma.menuItem.findFirst({
        where: { id: menuId, shopId },
        select: {
            id: true,
            shopId: true,
            name: true,
            isPublished: true,
            allergenLinks: {
                select: {
                    status: true,
                    allergen: { select: { slug: true } },
                },
            },
        },
    });

    // 自分の店のメニューじゃない（または存在しない）なら404扱い
    if (!menu) {
        notFound();
    }

    // 4) 初期状態：全部FREE → 既存状態で上書き
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
                <h1 className="text-2xl font-bold text-gray-900">
                    メニュー編集
                </h1>
                <p className="mt-1 text-gray-600">
                    アレルゲン情報を正確に入力してください。
                </p>

                <div className="mt-6">
                    <AdminMenuEditClient
                        menuId={menu.id}
                        initialName={menu.name}
                        initialIsPublished={menu.isPublished}
                        allergens={allergens}
                        initialStatusBySlug={initialStatusBySlug}
                    />
                </div>
            </div>
        </div>
    );
}
