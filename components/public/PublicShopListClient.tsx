"use client";

import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTimeJa } from "@/lib/formatters";
import { sanitizeStoredImageUrl } from "@/lib/image-url-policy";
import {
    parseMenuImageFit,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
} from "@/lib/menu-image-display";

export type PublicShopListShop = {
    id: string;
    name: string;
    description: string | null;
    address: string | null;
    averageBudgetYen: number | null;
    coverImageUrl: string | null;
    coverImageFit: string | null;
    coverImageZoom: number | null;
    coverImagePositionX: number | null;
    coverImagePositionY: number | null;
    updatedAt: string;
    menus: Array<{
        priceYen: number | null;
    }>;
    _count: {
        menus: number;
    };
};

function getBudgetText(
    averageBudgetYen: number | null | undefined,
    priceYen: number | null | undefined,
) {
    return typeof averageBudgetYen === "number"
        ? `平均予算 ¥${averageBudgetYen.toLocaleString("ja-JP")}前後`
        : typeof priceYen === "number"
          ? `価格例 ¥${priceYen.toLocaleString("ja-JP")}`
          : "価格情報 近日追加";
}

export default function PublicShopListClient({
    initialShops,
    isDatabaseAvailable,
}: {
    initialShops: PublicShopListShop[];
    isDatabaseAvailable: boolean;
}) {
    const searchParams = useSearchParams();
    const q = (searchParams.get("q") ?? "").trim();

    const shops = useMemo(() => {
        if (q === "") {
            return initialShops;
        }

        const needle = q.toLocaleLowerCase("ja-JP");
        return initialShops.filter((shop) => {
            return (
                shop.name.toLocaleLowerCase("ja-JP").includes(needle) ||
                (shop.description ?? "")
                    .toLocaleLowerCase("ja-JP")
                    .includes(needle)
            );
        });
    }, [initialShops, q]);

    const resultText = q !== "" ? `検索: ${q}（${shops.length}件）` : null;

    const emptyText =
        !isDatabaseAvailable
            ? "現在データベースに接続できないため、公開店舗を読み込めません。時間をおいて再度お試しください。"
            : q !== ""
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
                    各店舗ページでは公開メニュー一覧、各メニュー詳細ではアレルゲン29品目の状態を確認できます。未ログインでも閲覧できます。
                </p>
                {!isDatabaseAvailable ? (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                        現在は公開データベースに接続できないため、店舗一覧を表示できません。
                    </p>
                ) : null}
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
                    {shops.map((shop, index) => {
                        const descriptionText =
                            shop.description?.trim() || "説明は未登録です。";
                        const addressText = shop.address?.trim() || "住所未設定";
                        const budgetText = getBudgetText(
                            shop.averageBudgetYen,
                            shop.menus[0]?.priceYen,
                        );
                        const safeCoverImageUrl = sanitizeStoredImageUrl(
                            shop.coverImageUrl,
                            {
                                kind: "shop",
                                shopId: shop.id,
                            },
                        );
                        const hasCoverImage = Boolean(safeCoverImageUrl);
                        const coverImageStyle: CSSProperties = {
                            objectFit: parseMenuImageFit(shop.coverImageFit),
                            objectPosition: `${parseMenuImagePositionPercent(
                                shop.coverImagePositionX,
                            )}% ${parseMenuImagePositionPercent(
                                shop.coverImagePositionY,
                            )}%`,
                            transform: `scale(${
                                parseMenuImageZoom(shop.coverImageZoom) / 100
                            })`,
                            transformOrigin: `${parseMenuImagePositionPercent(
                                shop.coverImagePositionX,
                            )}% ${parseMenuImagePositionPercent(
                                shop.coverImagePositionY,
                            )}%`,
                        };

                        if (hasCoverImage) {
                            return (
                                <Link
                                    key={shop.id}
                                    href={`/shops/${shop.id}`}
                                    className="group relative min-h-[320px] overflow-hidden rounded-[28px] border border-neutral-200 bg-neutral-900 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                                >
                                    <div className="absolute inset-0 transition duration-500 group-hover:scale-105">
                                        <Image
                                            src={safeCoverImageUrl ?? ""}
                                            alt=""
                                            fill
                                            priority={index === 0}
                                            sizes="(min-width: 640px) 50vw, 100vw"
                                            className="h-full w-full"
                                            style={coverImageStyle}
                                        />
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/20" />
                                    <div className="relative flex h-full flex-col justify-between p-5 text-white sm:p-6">
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="inline-flex rounded-full bg-white/18 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-sm">
                                                公開メニュー {shop._count.menus}件
                                            </span>
                                            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
                                                店舗ページへ
                                            </span>
                                        </div>

                                        <div className="max-w-[520px]">
                                            <h2 className="text-2xl font-black leading-tight tracking-[-0.03em] sm:text-[2rem]">
                                                {shop.name}
                                            </h2>
                                            <p className="mt-3 line-clamp-3 text-sm leading-7 text-white/90 sm:text-base">
                                                {descriptionText}
                                            </p>

                                            <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/90">
                                                <span className="rounded-full bg-white/12 px-3 py-1.5 backdrop-blur-sm">
                                                    {budgetText}
                                                </span>
                                                <span className="rounded-full bg-white/12 px-3 py-1.5 backdrop-blur-sm">
                                                    {addressText}
                                                </span>
                                            </div>

                                            <div className="mt-5 flex items-center justify-between gap-4">
                                                <p className="text-xs text-white/75">
                                                    更新:{" "}
                                                    {formatDateTimeJa(
                                                        shop.updatedAt,
                                                    )}
                                                </p>
                                                <span className="inline-flex items-center rounded-2xl bg-[#13ec13] px-4 py-2 text-sm font-extrabold text-black transition group-hover:translate-x-0.5">
                                                    公開メニューを見る
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        }

                        return (
                            <Link
                                key={shop.id}
                                href={`/shops/${shop.id}`}
                                className="group relative min-h-[320px] overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-green-200 hover:shadow-xl"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(19,236,19,0.18),_transparent_34%),linear-gradient(135deg,_#ffffff_0%,_#f4fbf4_55%,_#ecf7ec_100%)]" />
                                <div className="absolute right-[-36px] top-[-36px] h-36 w-36 rounded-full bg-[#13ec13]/10 blur-2xl" />
                                <div className="absolute bottom-[-24px] left-[-12px] h-24 w-24 rounded-full border border-[#13ec13]/15" />

                                <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm ring-1 ring-inset ring-neutral-200">
                                            <span className="text-base leading-none">
                                                🏪
                                            </span>
                                            写真準備中
                                        </div>
                                        <span className="text-xl text-neutral-300 transition group-hover:text-neutral-500">
                                            →
                                        </span>
                                    </div>

                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-green-700">
                                            Public shop
                                        </p>
                                        <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.03em] text-neutral-900">
                                            {shop.name}
                                        </h2>
                                        <p
                                            className={`mt-3 text-sm leading-7 ${
                                                shop.description
                                                    ? "line-clamp-3 text-neutral-700"
                                                    : "text-neutral-500"
                                            }`}
                                        >
                                            {descriptionText}
                                        </p>

                                        <div className="mt-5 flex flex-wrap gap-2 text-xs text-neutral-700">
                                            <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-inset ring-neutral-200">
                                                公開メニュー {shop._count.menus}件
                                            </span>
                                            <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-inset ring-neutral-200">
                                                {budgetText}
                                            </span>
                                            <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-inset ring-neutral-200">
                                                {addressText}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex items-center justify-between gap-4 border-t border-neutral-200/80 pt-4">
                                        <p className="text-xs text-neutral-500">
                                            更新: {formatDateTimeJa(shop.updatedAt)}
                                        </p>
                                        <span className="inline-flex items-center rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-900 shadow-sm transition group-hover:border-[#13ec13]/40 group-hover:bg-[#f4fff4]">
                                            店舗ページを見る
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
