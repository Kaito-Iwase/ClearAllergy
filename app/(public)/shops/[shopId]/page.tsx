// app/(public)/shops/[shopId]/page.tsx
// 公開側：店舗詳細（テンプレ風）
// 修正：params を await して shopId を使う（Turbopack対策）

import Link from "next/link";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

type Params = { shopId: string };

export default async function PublicShopDetailPage({
    params,
}: {
    params: Params | Promise<Params>;
}) {
    // 1) params が Promise の可能性があるので await してから使う
    const { shopId } = await params;

    // 2) shopId が無いなら 404
    if (!shopId) notFound();

    // 3) 店舗＋公開メニューを取得
    const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: {
            id: true,
            name: true,
            description: true,
            address: true,
            hours: true,
            updatedAt: true,
            menus: {
                where: { isPublished: true },
                orderBy: { updatedAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    priceYen: true,
                    category: true,
                    imageUrl: true,
                    updatedAt: true,
                },
            },
        },
    });

    // 4) 無ければ404
    if (!shop) notFound();

    return (
        <main className="pb-10">
            {/* Breadcrumb */}
            <div className="max-w-7xl mx-auto px-4 sm:px-10 pt-6">
                <div className="text-sm text-text-sub dark:text-slate-300">
                    <Link href="/shops" className="underline">
                        店舗一覧
                    </Link>{" "}
                    <span className="mx-2">/</span>
                    <span className="text-text-main dark:text-white">
                        {shop.name}
                    </span>
                </div>
            </div>

            {/* Hero（テンプレっぽく：グラデ + CTA） */}
            <section className="max-w-7xl mx-auto px-4 sm:px-10 mt-4">
                <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-surface-light shadow-sm">
                    <div className="h-56 sm:h-72 bg-gradient-to-r from-primary/25 via-primary/10 to-white" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/0" />

                    <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                            <div className="min-w-0">
                                <h1 className="text-2xl sm:text-3xl font-extrabold text-white drop-shadow">
                                    {shop.name}
                                </h1>
                                <p className="mt-2 text-sm sm:text-base text-white/90 line-clamp-2">
                                    {shop.description ?? "説明はまだありません"}
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <a
                                    href="#menus"
                                    className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-text-main hover:bg-primary-dark transition-colors"
                                >
                                    公開メニューを見る
                                </a>
                                <a
                                    href="#info"
                                    className="inline-flex items-center justify-center rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-text-main hover:bg-white transition-colors"
                                >
                                    店舗情報
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 本文：左=カード群 / 右=店舗情報(sticky) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-10 mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 左（2列分） */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* 説明カード */}
                        <div className="rounded-2xl border border-gray-100 bg-surface-light p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-text-main">
                                お店の説明
                            </h2>
                            <p className="mt-2 text-sm text-text-sub whitespace-pre-wrap">
                                {shop.description ?? "説明はまだありません"}
                            </p>
                        </div>

                        {/* メニュー一覧（カードグリッド） */}
                        <div
                            id="menus"
                            className="rounded-2xl border border-gray-100 bg-surface-light p-5 shadow-sm"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-lg font-bold text-text-main">
                                    公開メニュー
                                </h2>
                                <div className="text-sm text-text-sub">
                                    {shop.menus.length} 件
                                </div>
                            </div>

                            {shop.menus.length === 0 ? (
                                <div className="mt-4 rounded-xl border border-gray-100 bg-background-light p-6 text-center text-sm text-text-sub">
                                    公開中のメニューがありません
                                </div>
                            ) : (
                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {shop.menus.map((m) => (
                                        <Link
                                            key={m.id}
                                            href={`/shops/${shop.id}/menus/${m.id}`}
                                            className="group block rounded-2xl border border-gray-100 bg-white p-4 hover:shadow transition-shadow"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-text-main truncate">
                                                        {m.name}
                                                    </div>
                                                    <div className="mt-1 text-sm text-text-sub">
                                                        {(m.category ??
                                                            "カテゴリ未設定") +
                                                            " · " +
                                                            (m.priceYen != null
                                                                ? `${m.priceYen}円`
                                                                : "価格未設定")}
                                                    </div>
                                                </div>
                                                <span className="material-symbols-outlined text-text-sub group-hover:text-primary transition-colors">
                                                    chevron_right
                                                </span>
                                            </div>

                                            {m.imageUrl && (
                                                <div className="mt-2 text-xs text-gray-500 break-all">
                                                    画像URL: {m.imageUrl}
                                                </div>
                                            )}

                                            <div className="mt-3 text-xs text-gray-400">
                                                更新:{" "}
                                                {new Date(
                                                    m.updatedAt,
                                                ).toLocaleString("ja-JP")}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右（sticky店舗情報） */}
                    <aside id="info" className="lg:col-span-1">
                        <div className="lg:sticky lg:top-24 rounded-2xl border border-gray-100 bg-surface-light p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-text-main">
                                店舗情報
                            </h2>

                            <div className="mt-3 space-y-3 text-sm">
                                <div className="flex gap-2">
                                    <span className="material-symbols-outlined text-text-sub">
                                        location_on
                                    </span>
                                    <div className="text-text-sub">
                                        {shop.address ?? "住所: 未設定"}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <span className="material-symbols-outlined text-text-sub">
                                        schedule
                                    </span>
                                    <div className="text-text-sub">
                                        {shop.hours ?? "営業時間: 未設定"}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <span className="material-symbols-outlined text-text-sub">
                                        update
                                    </span>
                                    <div className="text-text-sub">
                                        更新:{" "}
                                        {new Date(
                                            shop.updatedAt,
                                        ).toLocaleString("ja-JP")}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5">
                                <Link
                                    href={`/shops/${shop.id}`}
                                    className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-text-main hover:bg-primary-dark transition-colors"
                                >
                                    この店舗のURLを共有
                                </Link>
                                <p className="mt-2 text-xs text-text-sub">
                                    ※QR表示は次で追加できます
                                </p>
                            </div>
                        </div>
                    </aside>
                </div>
            </section>
        </main>
    );
}
