import Link from "next/link";
import NewMenuForm from "@/components/admin/menu/NewMenuForm";
import AdminDashboardShell from "@/components/layout/AdminDashboardShell";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminDemoMenuNewPage() {
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
        <AdminDashboardShell
            shopHref="/admin/demo"
            menusHref="/admin/demo/menus"
        >
            <div className="min-h-screen bg-gray-50">
                <div className="mx-auto max-w-6xl px-4 py-6">
                    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                        ポートフォリオ公開版のため、この画面は操作プレビューです。登録内容は保存されません。
                    </div>

                    <nav className="mb-4 text-sm text-gray-500">
                        <Link
                            href="/admin/demo/menus"
                            className="hover:text-gray-900"
                        >
                            メニュー一覧
                        </Link>
                        <span className="mx-2">/</span>
                        <span className="font-medium text-gray-900">
                            新規作成
                        </span>
                    </nav>

                    <h1 className="text-2xl font-bold text-gray-900">
                        メニュー新規作成
                    </h1>
                    <p className="mt-1 text-gray-600">
                        通常の新規作成画面と同じ項目を確認できます。登録ボタンを押してもDBには保存されません。
                    </p>

                    <div className="mt-6">
                        <NewMenuForm
                            allergens={allergens}
                            readOnly
                            readOnlyPreview
                            backHref="/admin/demo/menus"
                        />
                    </div>
                </div>
            </div>
        </AdminDashboardShell>
    );
}
