// app/(admin)/admin/menus/page.tsx
// 管理画面：メニュー一覧（Server）
// 役割：ログイン確認→DBから一覧取得→Clientに渡す

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import MenuListClient from "./MenuListClient";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type MenuRow = {
    id: string;
    name: string;
    isPublished: boolean;
    updatedAt: Date;
};

export default async function AdminMenusPage() {
    // 1) セッション取得（未ログインならログインへ）
    const session = await getServerSession(authOptions);
    if (!session) redirect("/admin/login");

    // 2) shopId はセッションから（安全に）
    const shopId = session.user?.shopId;
    if (!shopId) redirect("/admin/login");

    // 3) DBから直接一覧取得（APIを挟まない：あなたの方針を維持）
    const menus = await prisma.menuItem.findMany({
        where: { shopId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, isPublished: true, updatedAt: true },
    });

    // 4) Clientに渡しやすい形へ変換（Date→string）
    const initialMenus = menus.map((m) => ({
        ...m,
        updatedAt: m.updatedAt.toISOString(),
    }));

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                {/* 5) ヘッダー：タイトル + 新規作成 */}
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-2xl font-bold text-gray-900">
                        メニュー一覧
                    </h1>

                    <Link
                        href="/admin/menus/new"
                        className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                        ＋ 新規作成
                    </Link>
                </div>

                {/* 6) 検索・削除など“動くUI”はClientに任せる */}
                <div className="mt-6">
                    <MenuListClient initialMenus={initialMenus} />
                </div>
            </div>
        </div>
    );
}
