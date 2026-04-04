// このページは公開側の店舗一覧画面です。
// 公開メニューを 1 件以上持つ店舗だけを表示し、必要なら検索語でも絞り込みます。
// Server Component なので、検索条件に応じた DB 取得を直接ここで行います。

// app/(public)/shops/page.tsx

import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateTimeJa } from "@/lib/formatters";

type SearchParams = {
    q?: string;
};

export default async function PublicShopListPage({
    searchParams,
}: {
    searchParams?: SearchParams | Promise<SearchParams>;
}) {
    // App Router では searchParams が Promise のこともあるため await してから使います。
    const resolvedSearchParams = (await searchParams) ?? {};

    // URL クエリ ?q=... から検索語を取り出します。
    const qRaw = resolvedSearchParams.q ?? "";
    const q = qRaw.trim();

    // 検索語が空なら全件、入っていれば店舗名や説明文で絞り込みます。
    const where = {
        menus: {
            some: {
                isPublished: true,
            },
        },
        ...(q === ""
            ? {}
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
              }),
    };

    // 公開メニューを持つ店舗だけを取得し、カード表示に必要な項目へ絞ります。
    const shops = await prisma.shop.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            name: true,
            description: true,
            address: true,
            updatedAt: true,
            menus: {
                where: { isPublished: true },
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: {
                    priceYen: true,
                },
            },
            _count: {
                select: {
                    menus: {
                        where: {
                            isPublished: true,
                        },
                    },
                },
            },
        },
    });

    // 検索中かどうかで、見出しメッセージを出し分けます。
    const resultText = q !== "" ? `検索: ${q}（${shops.length}件）` : null;

    const emptyText =
        q !== ""
            ? "該当する店舗が見つかりませんでした。"
            : "公開中の店舗がありません。";

    return (
        <main className="mx-auto max-w-5xl px-4 py-8">
            <section className="mb-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-green-700">
                    まず試すなら
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
                    公開店舗から、メニューごとの価格とアレルゲン情報を確認できます
                </h1>
                <p className="mt-3 text-sm leading-7 text-neutral-600">
                    各店舗ページでは公開メニュー一覧、各メニュー詳細ではアレルゲン28品目の状態を確認できます。未ログインでも閲覧できます。
                </p>
            </section>

            <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                    <p className="text-xs text-neutral-500">ClearAllergy</p>
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

                                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                                            <span className="rounded-full bg-neutral-100 px-2 py-1">
                                                公開メニュー {shop._count.menus}
                                                件
                                            </span>
                                            <span className="rounded-full bg-neutral-100 px-2 py-1">
                                                {typeof shop.menus[0]?.priceYen ===
                                                "number"
                                                    ? `価格例 ¥${shop.menus[0].priceYen.toLocaleString("ja-JP")}`
                                                    : "価格例 近日追加"}
                                            </span>
                                            <span className="rounded-full bg-neutral-100 px-2 py-1">
                                                {shop.address?.trim() ||
                                                    "住所未設定"}
                                            </span>
                                        </div>
                                    </div>

                                    <span className="shrink-0 text-neutral-400 group-hover:text-neutral-600">
                                        →
                                    </span>
                                </div>

                                <p className="mt-3 text-xs text-neutral-500">
                                    更新:{" "}
                                    {formatDateTimeJa(shop.updatedAt)}
                                </p>
                            </Link>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
