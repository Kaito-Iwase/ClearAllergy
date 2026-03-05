// app/(public)/shops/page.tsx
// 公開側：店舗一覧（layout側がヘッダーを持つので、ここではヘッダーを出さない）

import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function PublicShopListPage({
    searchParams,
}: {
    searchParams?: { q?: string };
}) {
    // 1) URLクエリから検索語を取り出す
    const qRaw = searchParams?.q ?? "";
    const q = qRaw.trim();

    // 2) 検索条件（qが空なら全件）
    const where =
        q === ""
            ? {}
            : {
                  OR: [
                      { name: { contains: q, mode: "insensitive" as const } },
                      {
                          description: {
                              contains: q,
                              mode: "insensitive" as const,
                          },
                      },
                  ],
              };

    // 3) 店舗一覧を取得
    const shops = await prisma.shop.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            name: true,
            description: true,
            updatedAt: true,
        },
    });

    return (
        <main className="mx-auto max-w-5xl px-4 py-8">
            <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                    <p className="text-xs text-neutral-500">AllerFree</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
                        店舗一覧
                    </h1>

                    {q !== "" ? (
                        <p className="mt-2 text-sm text-gray-600">
                            検索: <span className="font-semibold">{q}</span>（
                            {shops.length}件）
                        </p>
                    ) : null}
                </div>

                <div className="text-xs text-neutral-500">
                    {shops.length} shops
                </div>
            </div>

            {shops.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6">
                    <p className="text-sm text-neutral-700">
                        {q !== ""
                            ? "該当する店舗が見つかりませんでした。"
                            : "公開中の店舗がありません。"}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {shops.map((shop) => (
                        <Link
                            key={shop.id}
                            href={`/shops/${shop.id}`}
                            className="group rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="truncate text-base font-semibold text-neutral-900">
                                        {shop.name}
                                    </h2>

                                    {shop.description ? (
                                        <p className="mt-1 line-clamp-2 text-sm text-neutral-700">
                                            {shop.description}
                                        </p>
                                    ) : (
                                        <p className="mt-1 text-sm text-neutral-500">
                                            説明は未登録です。
                                        </p>
                                    )}
                                </div>

                                <span className="shrink-0 text-neutral-400 group-hover:text-neutral-600">
                                    →
                                </span>
                            </div>

                            <p className="mt-3 text-xs text-neutral-500">
                                更新:{" "}
                                {new Date(shop.updatedAt).toLocaleString(
                                    "ja-JP",
                                )}
                            </p>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
