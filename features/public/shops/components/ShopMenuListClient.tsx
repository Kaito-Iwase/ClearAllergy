"use client";

// このコンポーネントは店舗詳細画面の公開メニュー一覧です。
// localStorage に保存された「避けたいアレルゲン設定」を読み、
// 通常表示と個人向け表示を切り替えてカード一覧を描画します。

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createStatusBySlug, type AllergenStatus } from "@/lib/allergens";
import { formatDateTimeJa, formatPriceYenLabel } from "@/lib/utils/formatters";
import {
    loadUserAllergenPreferences,
    USER_ALLERGENS_UPDATED_EVENT,
} from "@/lib/public-allergen-preferences";

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
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
}

function badgeLabel(kind: BadgeKind): string {
    if (kind === "danger") return "含む";
    if (kind === "caution") return "含む可能性があります";
    if (kind === "unknown") return "未設定あり";
    return "含まない";
}

function buildOverallSummary(args: {
    statusBySlug: Record<string, AllergenStatus>;
    nameJaBySlug: Map<string, string>;
    rankBySlug: Map<string, number>;
}): {
    summaryText: string;
    badge: BadgeKind;
    containsCount: number;
    mayCount: number;
    unknownCount: number;
} {
    // この関数は、そのメニュー全体としての見え方を 1 行にまとめます。
    // UNKNOWN をここで落とさず残すのは、未設定なのに安全と誤解されるのを防ぐためです。
    const { statusBySlug, nameJaBySlug, rankBySlug } = args;

    const containsSlugs: string[] = [];
    const maySlugs: string[] = [];
    const unknownSlugs: string[] = [];

    for (const [slug, status] of Object.entries(statusBySlug)) {
        if (status === "CONTAINS") {
            containsSlugs.push(slug);
        } else if (status === "MAY_CONTAIN") {
            maySlugs.push(slug);
        } else if (status === "UNKNOWN") {
            unknownSlugs.push(slug);
        }
    }

    const badge: BadgeKind =
        containsSlugs.length > 0
            ? "danger"
            : maySlugs.length > 0
              ? "caution"
              : unknownSlugs.length > 0
                ? "unknown"
              : "safe";

    const byRank = (a: string, b: string) =>
        (rankBySlug.get(a) ?? 9999) - (rankBySlug.get(b) ?? 9999);

    containsSlugs.sort(byRank);
    maySlugs.sort(byRank);
    unknownSlugs.sort(byRank);

    const toName = (slug: string) => nameJaBySlug.get(slug) ?? slug;
    const containsNames = containsSlugs.map(toName);
    const mayNames = maySlugs.map(toName);
    const unknownNames = unknownSlugs.map(toName);

    const pickedContains = containsNames.slice(0, 3);
    const remain = 3 - pickedContains.length;
    const pickedMay = remain > 0 ? mayNames.slice(0, remain) : [];

    const parts: string[] = [];
    if (pickedContains.length > 0) {
        parts.push(`${pickedContains.join("・")}（含む）`);
    }
    if (pickedMay.length > 0) {
        parts.push(`${pickedMay.join("・")}（含む可能性があります）`);
    }
    if (parts.length === 0 && unknownNames.length > 0) {
        parts.push(`${unknownNames.slice(0, 3).join("・")}（未設定）`);
    } else if (unknownNames.length > 0) {
        parts.push(`未設定 ${unknownNames.length}件`);
    }

    return {
        summaryText: parts.length > 0 ? parts.join(" / ") : "該当なし",
        badge,
        containsCount: containsSlugs.length,
        mayCount: maySlugs.length,
        unknownCount: unknownSlugs.length,
    };
}

function buildPersonalizedSummary(args: {
    statusBySlug: Record<string, AllergenStatus>;
    selectedSlugs: string[];
    includeMayContain: boolean;
    nameJaBySlug: Map<string, string>;
    rankBySlug: Map<string, number>;
}): {
    summaryText: string;
    badge: BadgeKind;
    containsCount: number;
    mayCount: number;
    unknownCount: number;
} {
    // こちらは、利用者が自分で選んだアレルゲンだけを見た要約です。
    // 全体表示と同じく UNKNOWN を数えないと、重要な未確認項目が消えてしまいます。
    const {
        statusBySlug,
        selectedSlugs,
        includeMayContain,
        nameJaBySlug,
        rankBySlug,
    } = args;

    const containsSlugs: string[] = [];
    const maySlugs: string[] = [];
    const unknownSlugs: string[] = [];

    for (const slug of selectedSlugs) {
        const status = statusBySlug[slug] ?? "UNKNOWN";
        if (status === "CONTAINS") {
            containsSlugs.push(slug);
        } else if (includeMayContain && status === "MAY_CONTAIN") {
            maySlugs.push(slug);
        } else if (status === "UNKNOWN") {
            unknownSlugs.push(slug);
        }
    }

    const badge: BadgeKind =
        containsSlugs.length > 0
            ? "danger"
            : maySlugs.length > 0
              ? "caution"
              : unknownSlugs.length > 0
                ? "unknown"
              : "safe";

    const byRank = (a: string, b: string) =>
        (rankBySlug.get(a) ?? 9999) - (rankBySlug.get(b) ?? 9999);

    containsSlugs.sort(byRank);
    maySlugs.sort(byRank);
    unknownSlugs.sort(byRank);

    const toName = (slug: string) => nameJaBySlug.get(slug) ?? slug;
    const containsNames = containsSlugs.map(toName);
    const mayNames = maySlugs.map(toName);
    const unknownNames = unknownSlugs.map(toName);

    const pickedContains = containsNames.slice(0, 3);
    const remain = 3 - pickedContains.length;
    const pickedMay = remain > 0 ? mayNames.slice(0, remain) : [];

    const parts: string[] = [];
    if (pickedContains.length > 0) {
        parts.push(`${pickedContains.join("・")}（含む）`);
    }
    if (pickedMay.length > 0) {
        parts.push(`${pickedMay.join("・")}（含む可能性があります）`);
    }
    if (parts.length === 0 && unknownNames.length > 0) {
        parts.push(`${unknownNames.slice(0, 3).join("・")}（未設定）`);
    } else if (unknownNames.length > 0) {
        parts.push(`未設定 ${unknownNames.length}件`);
    }

    return {
        summaryText:
            parts.length > 0
                ? parts.join(" / ")
                : "あなたの設定項目との一致なし",
        badge,
        containsCount: containsSlugs.length,
        mayCount: maySlugs.length,
        unknownCount: unknownSlugs.length,
    };
}

export default function ShopMenuListClient({
    shopId,
    menus,
    allergenMaster,
}: {
    shopId: string;
    menus: MenuItemCard[];
    allergenMaster: AllergenMasterItem[];
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const q = (searchParams.get("q") ?? "").trim();

    // 端末に保存されたアレルゲン設定を読み込み、画面に反映します。
    const [highlightSlugs, setHighlightSlugs] = React.useState<string[]>([]);
    const [excludedSlugs, setExcludedSlugs] = React.useState<string[]>([]);
    const [includeMayContain, setIncludeMayContain] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        function syncPreferences() {
            const next = loadUserAllergenPreferences();
            setHighlightSlugs(next.highlightSlugs);
            setExcludedSlugs(next.excludedSlugs);
            setIncludeMayContain(next.includeMayContain);
            setLoaded(true);
        }

        // 初回読み込みだけでなく、別タブ変更や保存イベントにも追従します。
        syncPreferences();

        window.addEventListener("storage", syncPreferences);
        window.addEventListener("focus", syncPreferences);
        window.addEventListener(
            USER_ALLERGENS_UPDATED_EVENT,
            syncPreferences as EventListener,
        );

        return () => {
            window.removeEventListener("storage", syncPreferences);
            window.removeEventListener("focus", syncPreferences);
            window.removeEventListener(
                USER_ALLERGENS_UPDATED_EVENT,
                syncPreferences as EventListener,
            );
        };
    }, []);

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
    const hasHighlightPreference = loaded && highlightSlugs.length > 0;

    const isExcludedByPreference = React.useCallback((statusBySlug: Record<string, AllergenStatus>) => {
        return excludedSlugs.some((slug) => {
            const status = statusBySlug[slug] ?? "UNKNOWN";
            return (
                status === "CONTAINS" ||
                (includeMayContain && status === "MAY_CONTAIN")
            );
        });
    }, [excludedSlugs, includeMayContain]);

    function goToMenu(menuId: string) {
        // カード全体を押した時にメニュー詳細へ移動します。
        router.push(`/shops/${shopId}/menus/${menuId}`);
    }

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

    return (
        <div
            id="public-menus"
            className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
        >
            <div className="mb-4 flex items-end justify-between">
                <h2 className="text-base font-extrabold">公開メニュー</h2>
                <p className="text-xs text-gray-500">
                    {searchedMenus.length} 件
                </p>
            </div>

            {searchedMenus.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
                    <p className="text-sm text-gray-700">
                        {q !== ""
                            ? "検索条件に一致する公開メニューがありません。"
                            : "現在公開中のメニューはありません。"}
                    </p>
                </div>
            ) : visibleMenuItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-red-200 bg-red-50 p-6">
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
                        const overallSummary = buildOverallSummary({
                            statusBySlug,
                            nameJaBySlug,
                            rankBySlug,
                        });

                        const personalizedSummary = buildPersonalizedSummary({
                            statusBySlug,
                            selectedSlugs: highlightSlugs,
                            includeMayContain,
                            nameJaBySlug,
                            rankBySlug,
                        });

                        const activeSummary = hasHighlightPreference
                            ? personalizedSummary
                            : overallSummary;

                        return (
                            <article
                                key={menu.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => goToMenu(menu.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        goToMenu(menu.id);
                                    }
                                }}
                                className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#13ec13]/50"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-base font-extrabold text-gray-900">
                                            {menu.name}
                                        </h3>

                                        <p className="mt-1 text-xs font-semibold text-gray-600">
                                            {/* 件数表示でも UNKNOWN を明示し、要約本文と意味がずれないようにします。 */}
                                            含む {activeSummary.containsCount}{" "}
                                            件 ・ 含む可能性があります{" "}
                                            {activeSummary.mayCount} 件
                                            {activeSummary.unknownCount > 0
                                                ? ` ・ 未設定 ${activeSummary.unknownCount} 件`
                                                : ""}
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

                                <div className="mt-3 flex items-center justify-between gap-3">
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${badgeClass(
                                            activeSummary.badge,
                                        )}`}
                                    >
                                        {badgeLabel(activeSummary.badge)}
                                    </span>

                                    <p className="text-right text-xs text-gray-500">
                                        更新：{formatDateTimeJa(menu.updatedAt)}
                                    </p>
                                </div>

                                <p className="mt-2 text-xs text-gray-600">
                                    {activeSummary.summaryText}
                                </p>

                                {hasHighlightPreference ? (
                                    <p className="mt-2 text-[11px] text-gray-400">
                                        強調表示の設定に基づく表示
                                    </p>
                                ) : null}
                            </article>
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
