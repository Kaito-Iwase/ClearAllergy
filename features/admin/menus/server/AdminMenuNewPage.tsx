// このページは新規メニュー作成画面です。
// 必要なアレルゲンマスタを先に取得し、入力フォームに渡します。
// Server Component なので、初期表示に必要な DB データ取得をここで行います。

import Link from "next/link";
import NewMenuForm from "@/features/admin/menus/components/NewMenuForm";
import { prisma } from "@/lib/db";
import { requireCurrentAdminContextOrRedirect } from "@/lib/auth/admin-auth";

export default async function AdminMenuNewPage() {
    // 新規作成も管理画面の操作なので、先に認証確認だけしておきます。
    await requireCurrentAdminContextOrRedirect();

    // アレルゲンの選択肢は全メニューで共通なので、マスタをまとめて読みます。
    const allergens = await prisma.allergen.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
            slug: true,
            nameJa: true,
            nameEn: true,
            sortOrder: true,
        },
    });

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-0 py-6 sm:px-4">
                <nav className="mb-4 text-sm text-gray-500">
                    <Link href="/admin/menus" className="hover:text-gray-900">
                        メニュー一覧
                    </Link>
                    <span className="mx-2">/</span>
                    <span className="font-medium text-gray-900">新規作成</span>
                </nav>

                <h1 className="text-2xl font-bold text-gray-900">
                    メニュー新規作成
                </h1>
                <p className="mt-1 text-gray-600">
                    編集画面と同じ項目を先に入力して新規作成できます。作成後はそのまま編集画面へ移動します。
                </p>

                <div className="mt-6">
                    <NewMenuForm allergens={allergens} />
                </div>
            </div>
        </div>
    );
}
