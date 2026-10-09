"use client";

import { STORE_ALLERGEN_NOTE } from "@/lib/public-prototype";
import { getSelectedAllergenSlugs } from "@/lib/public-allergen-preferences";

// このコンポーネントは店舗詳細画面の公開メニュー一覧です。
// localStorage に保存された「避けたいアレルゲン設定」を読み、
// 通常表示と個人向け表示を切り替えてカード一覧を描画します。

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    buildSelectedAllergenSummary,
    buildDefaultAllergenSummaries,
    createStatusBySlug,
    SPECIFIED_INGREDIENT_SLUGS,
    type AllergenStatus,
} from "@/lib/allergens";
import { formatDateTimeJa, formatPriceYenLabel } from "@/lib/utils/formatters";
import { useUserAllergenPreferences } from "@/features/public/shops/components/UserAllergenPreferenceClient";
import MenuAllergenSummary from "./MenuAllergenSummary";

type BadgeKind = "danger" | "caution" | "safe" | "unknown";

type AllergenMasterItem = {
    slug: string;
    nameJa: string;
    sortOrder: number;
};

type MenuItemCard = {
    id: string;
    name: string;
    description: string | null;
    priceYen: number | null;
    category: string | null;
    precaution: string | null;
    updatedAt: string;
    allergenLinks: Array<{
        status: AllergenStatus;
        allergen: {
            slug: string;
        };
    }>;
};

type MenuItemWithStatus = {
    menu: MenuItemCard;
    statusBySlug: Record<string, AllergenStatus>;
};

function badgeClass(kind: BadgeKind): string {
    if (kind === "danger") {
        return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
    }
    if (kind === "caution") {
        return "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200";
    }
    if (kind === "unknown") {
        return "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200";
    }
    return "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-300";
}

function badgeLabel(kind: BadgeKind): string {
    if (kind === "danger") return "含む";
    if (kind === "caution") return "要確認の情報あり";
    if (kind === "unknown") return "未入力・未確認あり";
    return "原材料に含まない";
}

export default function ShopMenuListClient({
    shopId,
    menus,
    allergenMaster,
    storeHandledAllergenSlugs = [],
}: {
    shopId: string;
    menus: MenuItemCard[];
    allergenMaster: AllergenMasterItem[];
    storeHandledAllergenSlugs?: string[];
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const q = (searchParams.get("q") ?? "").trim();

    // 端末に保存されたアレルゲン設定を読み込み、画面に反映します。
    const { preferences: { highlightSlugs, excludedSlugs, includeMayContain }, loaded } = useUserAllergenPreferences();



    // slug から日本語名や並び順をすぐ引けるよう、Map にしておきます。
    const nameJaBySlug = React.useMemo(() => {
        return new Map(
            allergenMaster.map((allergen) => [allergen.slug, allergen.nameJa]),
        );
    }, [allergenMaster]);

    const rankBySlug = React.useMemo(() => {
        return new Map(
            allergenMaster.map((allergen, index) => [allergen.slug, index]),
        );
    }, [allergenMaster]);

    const hasPreference =
        loaded && (highlightSlugs.length > 0 || excludedSlugs.length > 0);
    const selectedSlugs = getSelectedAllergenSlugs({ highlightSlugs, excludedSlugs });

    const isExcludedByPreference = React.useCallback((statusBySlug: Record<string, AllergenStatus>) => {
        return excludedSlugs.some((slug) => {
            const status = statusBySlug[slug] ?? "UNKNOWN";
            return (
                status === "CONTAINS" ||
                (includeMayContain && status === "MAY_CONTAIN")
            );
        });
    }, [excludedSlugs, includeMayContain]);

    const searchedMenus = React.useMemo(() => {
        if (q === "") {
            return menus;
        }

        const needle = q.toLocaleLowerCase("ja-JP");
        return menus.filter((menu) => {
            return (
                menu.name.toLocaleLowerCase("ja-JP").includes(needle) ||
                (menu.description ?? "")
                    .toLocaleLowerCase("ja-JP")
                    .includes(needle) ||
                (menu.category ?? "")
                    .toLocaleLowerCase("ja-JP")
                    .includes(needle)
            );
        });
    }, [menus, q]);

    const menuItems = React.useMemo<MenuItemWithStatus[]>(() => {
        return searchedMenus.map((menu) => ({
            menu,
            statusBySlug: createStatusBySlug(allergenMaster, menu.allergenLinks),
        }));
    }, [allergenMaster, searchedMenus]);

    const visibleMenuItems = React.useMemo(() => {
        if (!hasPreference) {
            return menuItems;
        }

        return menuItems.filter(
            ({ statusBySlug }) => !isExcludedByPreference(statusBySlug),
        );
    }, [hasPreference, isExcludedByPreference, menuItems]);

    const excludedMenuCount = menuItems.length - visibleMenuItems.length;

    function clearSearch() {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("q");
        const query = params.toString();
        router.replace(`/shops/${shopId}${query ? `?${query}` : ""}`);
    }

    return (
        <div
            id="public-menus"
            className="scroll-mt-32 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6"
        >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-base font-extrabold">公開メニュー</h2>
                <p className="text-xs text-gray-500">
                    表示 {visibleMenuItems.length}件 / 検索対象 {searchedMenus.length}件
                </p>
            </div>

            <p className="mb-4 text-sm leading-6 text-gray-700">店舗が登録した内容</p>

            {searchedMenus.length === 0 ? (
                <div role="status" className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
                    <p className="text-sm text-gray-700">
                        {q !== ""
                            ? "検索条件に一致する公開メニューがありません。"
                            : "現在公開中のメニューはありません。"}
                    </p>
                    {q !== "" ? (
                        <button type="button" onClick={clearSearch}
                            className="mt-3 min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-green-700">
                            メニュー検索を解除
                        </button>
                    ) : null}
                </div>
            ) : visibleMenuItems.length === 0 ? (
                <div role="status" className="rounded-xl border border-dashed border-red-200 bg-red-50 p-6">
                    <p className="text-sm font-bold text-red-800">
                        除外設定により表示できるメニューがありません。
                    </p>
                    <p className="mt-2 text-xs leading-5 text-red-700">
                        必要に応じて、あなた向けのアレルゲン設定で「除外」を外してください。
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {visibleMenuItems.map(({ menu, statusBySlug }) => {
                        const defaultSummaries = buildDefaultAllergenSummaries({
                            storeHandledAllergenSlugs: new Set(storeHandledAllergenSlugs),
                            statusBySlug,
                            nameJaBySlug,
                            rankBySlug,
                        });

                        const personalizedSummary = buildSelectedAllergenSummary({
                            storeHandledAllergenSlugs: new Set(storeHandledAllergenSlugs),
                            statusBySlug,
                            selectedSlugs,
                            includeMayContain,
                            nameJaBySlug,
                            rankBySlug,
                        });

                        const activeSummary = hasPreference
                            ? personalizedSummary
                            : defaultSummaries.specified;
                        const otherSummary = defaultSummaries.other;

                        return (
                            <Link
                                key={menu.id}
                                href={`/shops/${shopId}/menus/${menu.id}`}
                                prefetch={false}
                                className="group block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="break-words text-base font-extrabold leading-7 text-gray-900">
                                            {menu.name}
                                        </h3>

                                        <p className="mt-2 break-words text-sm leading-6 text-gray-700">
                                            {hasPreference ? `確認対象：${allergenMaster.filter((allergen) => selectedSlugs.includes(allergen.slug)).map((allergen) => allergen.nameJa).join("・")}` : `確認対象：特定原材料（${SPECIFIED_INGREDIENT_SLUGS.length}品目）`}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-700">
                                            {menu.category || "カテゴリ未設定"}{" "}
                                            ・ {formatPriceYenLabel(menu.priceYen)}
                                        </p>
                                    </div>

                                    <span className="text-gray-400 group-hover:text-gray-600">
                                        ›
                                    </span>
                                </div>

                                <div className="mt-3 flex flex-col items-start gap-2">
                                    <span
                                        className={`max-w-full rounded-lg px-3 py-1.5 text-sm font-bold leading-6 ${badgeClass(
                                            activeSummary.badge,
                                        )}`}
                                    >
                                        {hasPreference ? badgeLabel(activeSummary.badge) : `特定原材料：${badgeLabel(activeSummary.badge)}`}
                                    </span>

                                </div>

                                <MenuAllergenSummary summary={activeSummary} />

                                {!hasPreference && defaultSummaries.otherCount > 0 && otherSummary.badge !== "safe" ? (
                                    <div role="group" aria-label="その他のアレルゲン" className="mt-3 border-t border-gray-200 pt-3">
                                        <h4 className="text-sm font-bold text-gray-900">その他のアレルゲン（{defaultSummaries.otherCount}品目）</h4>
                                        <MenuAllergenSummary summary={otherSummary} />
                                    </div>
                                ) : null}
                                {activeSummary.storeHandledCount > 0 || (!hasPreference && otherSummary.storeHandledCount > 0) ? (
                                    <p className="mt-2 text-xs leading-5 text-amber-900">{STORE_ALLERGEN_NOTE}</p>
                                ) : null}
                                {menu.precaution?.trim() ? (
                                    <div role="group" aria-label="店舗の注意書き" className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                        <h4 className="text-xs font-bold leading-5 text-gray-700">店舗の注意書き</h4>
                                        <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-gray-700">{menu.precaution}</p>
                                    </div>
                                ) : null}
                                <p className="mt-3 text-xs leading-5 text-gray-600">
                                    更新：{formatDateTimeJa(menu.updatedAt)}
                                </p>
                                {hasPreference ? (
                                    <p className="mt-2 text-[11px] text-gray-600">
                                        強調・除外の設定に基づく表示
                                    </p>
                                ) : null}
                            </Link>
                        );
                    })}
                </div>
            )}
            {hasPreference ? (
                <p className="mt-4 text-xs font-medium text-gray-500">
                    除外設定に一致するメニューは一覧から非表示になります
                    {includeMayContain
                        ? "（含む可能性ありも対象）"
                        : "（含む可能性ありは対象外）"}
                    。{excludedMenuCount > 0 ? `${excludedMenuCount}件を非表示にしています。` : ""}
                </p>
            ) : null}
        </div>
    );
}
