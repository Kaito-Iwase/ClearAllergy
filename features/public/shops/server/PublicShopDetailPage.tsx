// このページは公開側の店舗詳細画面です。
// 店舗情報と、その店舗の公開メニュー一覧をまとめて表示します。
// Server Component で DB 取得を行い、localStorage を使う部分だけ Client Component へ切り出しています。

import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ShareShopUrlButton from "@/features/public/shops/components/ShareShopUrlButton";
import ShopMenuListClient from "@/features/public/shops/components/ShopMenuListClient";
import UserAllergenPreferenceClient from "@/features/public/shops/components/UserAllergenPreferenceClient";
import PublicDataUnavailable from "@/features/public/shops/components/PublicDataUnavailable";
import PublicMenuSearchSummaryClient from "@/features/public/shops/components/PublicMenuSearchSummaryClient";
import { formatDateTimeJa, formatPriceYenLabel } from "@/lib/utils/formatters";
import { sanitizeStoredImageUrl } from "@/lib/storage/image-url-policy";
import { readPublicDataOrFallback } from "@/lib/public-db";
import {
    createStatusBySlug,
    isMenuPublishable,
} from "@/lib/allergens";
import {
    parseMenuImageFit,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
} from "@/lib/utils/menu-image-display";

type Params = { shopId: string };

export const revalidate = 60;
export const dynamic = "force-static";

export default async function PublicShopDetailPage({
    params,
}: {
    params: Params | Promise<Params>;
}) {
    // 動的ルートの shopId を取得し、無ければ 404 とします。
    const { shopId } = await params;
    if (!shopId) {
        notFound();
    }

    const {
        data: publicShopData,
        isDatabaseAvailable,
    } = await readPublicDataOrFallback(
        async () => {
            const [allergenMaster, shop] = await Promise.all([
                // アレルゲンマスタは一覧カードや設定 UI の両方で使うため、1 回だけ取得します。
                prisma.allergen.findMany({
                    select: { slug: true, nameJa: true, sortOrder: true },
                    orderBy: { sortOrder: "asc" },
                }),

                // 店舗本体と公開メニューを一緒に取り、N+1 を避けます。
                prisma.shop.findFirst({
                    where: {
                        id: shopId,
                        isActive: true,
                        menus: {
                            some: {
                                isPublished: true,
                            },
                        },
                    },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        address: true,
                        prefecture: true,
                        city: true,
                        nearestStation: true,
                        category: true,
                        hours: true,
                        regularHoliday: true,
                        phoneNumber: true,
                        note: true,
                        averageBudgetYen: true,
                        coverImageUrl: true,
                        coverImageFit: true,
                        coverImageZoom: true,
                        coverImagePositionX: true,
                        coverImagePositionY: true,
                        updatedAt: true,
                        _count: {
                            select: {
                                menus: {
                                    where: {
                                        isPublished: true,
                                    },
                                },
                            },
                        },
                        menus: {
                            where: { isPublished: true },
                            orderBy: { updatedAt: "desc" },
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                priceYen: true,
                                category: true,
                                updatedAt: true,
                                allergenLinks: {
                                    select: {
                                        status: true,
                                        allergen: { select: { slug: true } },
                                    },
                                },
                            },
                        },
                    },
                }),
            ]);

            return {
                allergenMaster,
                shop,
            };
        },
        {
            allergenMaster: [],
            shop: null,
        },
        { context: `public-shop-detail:${shopId}` },
    );

    if (!isDatabaseAvailable) {
        return (
            <PublicDataUnavailable
                title="店舗情報を読み込めません"
                description="現在データベースへ接続できないため、この店舗ページを表示できません。時間をおいて再度お試しください。"
                backHref="/shops"
                backLabel="店舗一覧へ戻る"
            />
        );
    }

    const { allergenMaster, shop } = publicShopData;

    if (!shop) {
        // 公開メニューが 1 件も無い店舗は、公開準備中として 404 にします。
        // これにより、店舗情報だけ先に外部へ見えてしまう状態を防ぎます。
        notFound();
    }

    // 公開フラグだけでなく、現行マスタの全品目が確定済みかを公開時にも再確認します。
    const publishableMenus = shop.menus.filter((menu) =>
        isMenuPublishable({
            name: menu.name,
            allergens: allergenMaster,
            statusBySlug: createStatusBySlug(
                allergenMaster,
                menu.allergenLinks,
            ),
        }),
    );

    if (publishableMenus.length === 0) {
        notFound();
    }

    // Server Component で取った Date や relation を、Client Component が扱いやすい形へ変換します。
    const menusForClient = publishableMenus.map((menu) => ({
        id: menu.id,
        name: menu.name,
        description: menu.description,
        priceYen: menu.priceYen,
        category: menu.category,
        updatedAt: menu.updatedAt.toISOString(),
        allergenLinks: menu.allergenLinks.map((link) => ({
            status: link.status,
            allergen: {
                slug: link.allergen.slug,
            },
        })),
    }));

    // 右カラムの設定 UI には、slug と日本語名だけ渡せば十分です。
    const allergensForClient = allergenMaster.map((allergen) => ({
        slug: allergen.slug,
        nameJa: allergen.nameJa,
    }));

    const firstPublishedMenuId = publishableMenus[0]?.id ?? null;
    const publishedMenuCount = publishableMenus.length;
    const averageBudgetLabel =
        typeof shop.averageBudgetYen === "number"
            ? `${formatPriceYenLabel(shop.averageBudgetYen)}前後`
            : "未設定";

    // カバー画像があればそれを使い、無ければ既存のグラデーションで見た目を保ちます。
    const safeCoverImageUrl = sanitizeStoredImageUrl(shop.coverImageUrl, {
        kind: "shop",
        shopId,
    });
    const heroStyle = safeCoverImageUrl
        ? {}
        : {
              backgroundImage:
                  "linear-gradient(90deg, rgba(19,236,19,0.25) 0%, rgba(19,236,19,0.10) 55%, rgba(255,255,255,0) 100%)",
          };
    const heroImageStyle: CSSProperties = {
        objectFit: parseMenuImageFit(shop.coverImageFit),
        objectPosition: `${parseMenuImagePositionPercent(
            shop.coverImagePositionX,
        )}% ${parseMenuImagePositionPercent(shop.coverImagePositionY)}%`,
        transform: `scale(${parseMenuImageZoom(shop.coverImageZoom) / 100})`,
        transformOrigin: `${parseMenuImagePositionPercent(
            shop.coverImagePositionX,
        )}% ${parseMenuImagePositionPercent(shop.coverImagePositionY)}%`,
    };

    return (
        <main className="flex justify-center px-4 py-6 md:px-8">
            <div className="flex w-full max-w-[1024px] flex-col gap-6">
                <nav className="flex flex-wrap gap-2 text-sm">
                    <Link
                        className="text-gray-500 hover:text-[#13ec13]"
                        href="/shops"
                    >
                        店舗一覧
                    </Link>
                    <span className="text-gray-400">/</span>
                    <span className="font-medium">{shop.name}</span>
                </nav>

                <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div
                        className="relative h-56 w-full bg-cover bg-center bg-no-repeat md:h-64"
                        style={heroStyle}
                    >
                        {safeCoverImageUrl ? (
                            <Image
                                src={safeCoverImageUrl}
                                alt=""
                                fill
                                priority
                                sizes="(min-width: 768px) 1024px, 100vw"
                                className="absolute inset-0 h-full w-full"
                                style={heroImageStyle}
                            />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-black/15 to-transparent" />

                        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 md:p-8">
                            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                <div className="relative z-10">
                                    <p className="text-sm font-semibold text-white/90 drop-shadow">
                                        公開メニュー {publishedMenuCount}件
                                    </p>
                                    <h1 className="text-3xl font-extrabold text-white drop-shadow md:text-4xl">
                                        {shop.name}
                                    </h1>
                                    <p className="mt-1 text-sm font-semibold text-white/90 drop-shadow">
                                        {shop.description || "—"}
                                    </p>
                                    <Suspense fallback={null}>
                                        <PublicMenuSearchSummaryClient
                                            menus={menusForClient}
                                        />
                                    </Suspense>
                                </div>

                                <div className="relative z-10 flex gap-3">
                                    <Link
                                        href={
                                            firstPublishedMenuId
                                                ? `/shops/${shop.id}/menus/${firstPublishedMenuId}`
                                                : "#public-menus"
                                        }
                                        className="rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-bold text-black shadow-sm transition hover:bg-[#0db80d]"
                                    >
                                        公開メニューを見る
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="order-1 flex flex-col gap-6 lg:col-span-2">
                        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
                            <h2 className="text-base font-extrabold">
                                お店の説明
                            </h2>
                            <p className="mt-2 text-sm text-gray-700">
                                {shop.description || "未設定"}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
                                <span className="rounded-full bg-gray-100 px-2 py-1">
                                    公開メニュー {publishedMenuCount}件
                                </span>
                                <span className="rounded-full bg-gray-100 px-2 py-1">
                                    平均予算 {averageBudgetLabel}
                                </span>
                                <span className="rounded-full bg-gray-100 px-2 py-1">
                                    アレルゲン{allergenMaster.length}品目を表示
                                </span>
                                <span className="rounded-full bg-gray-100 px-2 py-1">
                                    価格表示あり
                                </span>
                                {shop.category ? (
                                    <span className="rounded-full bg-gray-100 px-2 py-1">
                                        {shop.category}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        <div className="lg:hidden">
                            <UserAllergenPreferenceClient
                                allergens={allergensForClient}
                            />
                        </div>

                        <Suspense
                            fallback={
                                <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-600 shadow-sm sm:p-6">
                                    公開メニューを読み込み中です。
                                </div>
                            }
                        >
                            <ShopMenuListClient
                                shopId={shop.id}
                                menus={menusForClient}
                                allergenMaster={allergenMaster}
                            />
                        </Suspense>
                    </div>

                    <aside
                        id="shop-info"
                        className="order-3 flex flex-col gap-6"
                    >
                        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
                            <h2 className="text-base font-extrabold">
                                店舗情報
                            </h2>

                            <div className="mt-4 space-y-3 text-sm text-gray-700">
                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 text-gray-500">
                                        📍
                                    </span>
                                    <div>
                                        <p className="font-semibold">住所</p>
                                        <p className="text-gray-600">
                                            {shop.address || "未設定"}
                                        </p>
                                    </div>
                                </div>

                                {shop.nearestStation ? (
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5 text-gray-500">駅</span>
                                        <div>
                                            <p className="font-semibold">最寄り駅</p>
                                            <p className="text-gray-600">{shop.nearestStation}</p>
                                        </div>
                                    </div>
                                ) : null}

                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 text-gray-500">
                                        🕒
                                    </span>
                                    <div>
                                        <p className="font-semibold">
                                            営業時間
                                        </p>
                                        <p className="whitespace-pre-wrap text-gray-600">
                                            {shop.hours || "未設定"}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 text-gray-500">
                                        休
                                    </span>
                                    <div>
                                        <p className="font-semibold">
                                            定休日
                                        </p>
                                        <p className="text-gray-600">
                                            {shop.regularHoliday || "未設定"}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 text-gray-500">
                                        TEL
                                    </span>
                                    <div>
                                        <p className="font-semibold">
                                            電話番号
                                        </p>
                                        <p className="text-gray-600">
                                            {shop.phoneNumber || "未設定"}
                                        </p>
                                    </div>
                                </div>

                                {shop.note ? (
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5 text-gray-500">
                                            ※
                                        </span>
                                        <div>
                                            <p className="font-semibold">
                                                備考
                                            </p>
                                            <p className="whitespace-pre-wrap text-gray-600">
                                                {shop.note}
                                            </p>
                                        </div>
                                    </div>
                                ) : null}

                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 text-gray-500">
                                        💴
                                    </span>
                                    <div>
                                        <p className="font-semibold">
                                            平均予算
                                        </p>
                                        <p className="text-gray-600">
                                            {averageBudgetLabel}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 text-gray-500">
                                        🔄
                                    </span>
                                    <div>
                                        <p className="font-semibold">更新</p>
                                        <p className="text-gray-600">
                                            {formatDateTimeJa(shop.updatedAt)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5">
                                <ShareShopUrlButton shopId={shop.id} />
                            </div>

                            <p className="mt-3 text-xs text-gray-500">
                                店舗ページの共有には上のボタンを利用できます。
                            </p>
                        </div>

                        <div className="hidden lg:block">
                            <UserAllergenPreferenceClient
                                allergens={allergensForClient}
                            />
                        </div>
                    </aside>
                </section>
            </div>
        </main>
    );
}
