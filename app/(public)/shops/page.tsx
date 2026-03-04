// app/shops/page.tsx
// 公開側：店舗一覧

import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function ShopsPage() {
    // 1) 店舗一覧をDBから取得（新しい順）
    const shops = await prisma.shop.findMany({
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            name: true,
            description: true,
            address: true,
            hours: true,
            updatedAt: true,
        },
    });

    return (
        <main className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-8">
                {/* 2) タイトル */}
                <h1 className="text-2xl font-bold text-gray-900">店舗一覧</h1>
                <p className="mt-2 text-sm text-gray-600">
                    アレルゲン情報を確認できる店舗の一覧です。
                </p>

                {/* 3) 一覧 */}
                <div className="mt-6 grid gap-3">
                    {shops.map((s) => (
                        <Link
                            key={s.id}
                            href={`/shops/${s.id}`}
                            className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    {/* 4) 店名 */}
                                    <div className="truncate text-lg font-semibold text-gray-900">
                                        {s.name}
                                    </div>

                                    {/* 5) 説明 */}
                                    <div className="mt-1 text-sm text-gray-700">
                                        {s.description ??
                                            "説明はまだありません"}
                                    </div>

                                    {/* 6) 住所 / 営業時間（任意） */}
                                    <div className="mt-2 text-xs text-gray-500">
                                        {s.address
                                            ? `住所: ${s.address}`
                                            : "住所: 未設定"}
                                        {" · "}
                                        {s.hours
                                            ? `営業時間: ${s.hours}`
                                            : "営業時間: 未設定"}
                                    </div>
                                </div>

                                {/* 7) 右側：更新日時 */}
                                <div className="shrink-0 text-xs text-gray-500">
                                    更新:{" "}
                                    {new Date(s.updatedAt).toLocaleString(
                                        "ja-JP",
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

                {/* 8) 0件のとき */}
                {shops.length === 0 && (
                    <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-600">
                        公開できる店舗がまだありません
                    </div>
                )}
            </div>
        </main>
    );
}
