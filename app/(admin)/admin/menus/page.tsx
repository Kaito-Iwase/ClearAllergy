// app/(admin)/admin/menus/page.tsx
// 管理画面：メニュー一覧
// 目的：店舗のメニュー一覧を表示し、編集ページへ遷移できるようにする

// app/(admin)/admin/menus/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminMenusPage() {
    // 1) セッション取得（未ログインならログインへ）
    const session = await getServerSession(authOptions);
    if (!session) redirect("/admin/login");

    // 2) shopId はセッションから
    const shopId = session.user.shopId;

    // 3) DBから直接一覧取得（APIを挟まない）
    const menus = await prisma.menuItem.findMany({
        where: { shopId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, isPublished: true, updatedAt: true },
    });

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <h1 className="text-2xl font-bold text-gray-900">
                    メニュー一覧
                </h1>
                {/* <div className="mt-2 text-sm text-gray-500">
                    shopId(session): <span className="font-mono">{shopId}</span>{" "}
                    / 件数: {menus.length}
                </div> */}

                <div className="mt-6 grid gap-3">
                    {menus.map((m) => (
                        <div
                            key={m.id}
                            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-lg font-semibold text-gray-900">
                                        {m.name}
                                    </div>
                                    <div className="mt-1 text-sm text-gray-600">
                                        {m.isPublished ? "公開" : "非公開"} /
                                        更新:{" "}
                                        {new Date(m.updatedAt).toLocaleString(
                                            "ja-JP",
                                        )}
                                    </div>
                                </div>

                                <Link
                                    href={`/admin/menus/${m.id}/edit`}
                                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                                >
                                    編集
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
