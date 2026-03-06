// app/(public)/shops/page.tsx
// 公開側：店舗一覧（layout側がヘッダーを持つので、ここではヘッダーを出さない）

import Link from "next/link";
import { prisma } from "@/lib/db";

type SearchParams = {
    q?: string;
};

export default async function PublicShopListPage({
    searchParams,
}: {
    searchParams?: SearchParams | Promise<SearchParams>;
}) {
    // 1) searchParams は Promise のことがあるので await してから使う
    const resolvedSearchParams = (await searchParams) ?? {};

    // 2) URLクエリから検索語を取り出す
    const qRaw = resolvedSearchParams.q ?? "";
    const q = qRaw.trim();

    // 3) 検索条件を作る（qが空なら undefined にして全件）
    const where =
        q === ""
            ? undefined
            : {
                  OR: [
                      {
                          name: {
                              contains: q,
                              mode: "insensitive" as const,
                          },
                      },
                      {
                          description: {
                              contains: q,
                              mode: "insensitive" as const,
                          },
                      },
                  ],
              };

    // 4) 店舗一覧を取得
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

    // 5) 表示用メッセージ
    const resultText = q !== "" ? `検索: ${q}（${shops.length}件）` : null;

    const emptyText =
        q !== ""
            ? "該当する店舗が見つかりませんでした。"
            : "公開中の店舗がありません。";

    return (
        <main className="mx-auto max-w-5xl px-4 py-8">
            <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                    <p className="text-xs text-neutral-500">AllerFree</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
                        店舗一覧
                    </h1>

                    {resultText ? (
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
                    <p className="text-sm text-neutral-700">{emptyText}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {shops.map((shop) => {
                        const descriptionText =
                            shop.description?.trim() || "説明は未登録です。";

                        return (
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

                                        <p
                                            className={`mt-1 text-sm ${
                                                shop.description
                                                    ? "line-clamp-2 text-neutral-700"
                                                    : "text-neutral-500"
                                            }`}
                                        >
                                            {descriptionText}
                                        </p>
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
                        );
                    })}
                </div>
            )}
        </main>
    );
}
