"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { loadUserAllergenPreferences } from "@/lib/public-allergen-preferences";

type AllergenStatus = "CONTAINS" | "FREE" | "MAY_CONTAIN";
type BadgeKind = "danger" | "caution" | "safe";

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

const USER_ALLERGENS_UPDATED_EVENT = "clearallergy:user-allergens-updated";

function badgeClass(kind: BadgeKind): string {
    if (kind === "danger") {
        return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
    }
    if (kind === "caution") {
        return "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200";
    }
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
}

function badgeLabel(kind: BadgeKind, hasPreference: boolean): string {
    if (kind === "danger") return "含む";
    if (kind === "caution") return "可能性";
    return hasPreference ? "含まない" : "ALL FREE";
}

function formatDateTime(value: string): string {
    return new Date(value).toLocaleString("ja-JP");
}

function formatPriceYen(priceYen: number | null): string {
    if (typeof priceYen !== "number") {
        return "価格未設定";
    }
    return `${priceYen.toLocaleString("ja-JP")}円`;
}

function buildOverallSummary(args: {
    links: Array<{ status: AllergenStatus; allergen: { slug: string } }>;
    nameJaBySlug: Map<string, string>;
    rankBySlug: Map<string, number>;
}): {
    summaryText: string;
    badge: BadgeKind;
    containsCount: number;
    mayCount: number;
} {
    const { links, nameJaBySlug, rankBySlug } = args;

    const containsSlugs: string[] = [];
    const maySlugs: string[] = [];

    for (const link of links) {
        const slug = link.allergen.slug;

        if (link.status === "CONTAINS") {
            containsSlugs.push(slug);
        } else if (link.status === "MAY_CONTAIN") {
            maySlugs.push(slug);
        }
    }

    const badge: BadgeKind =
        containsSlugs.length > 0
            ? "danger"
            : maySlugs.length > 0
              ? "caution"
              : "safe";

    const byRank = (a: string, b: string) =>
        (rankBySlug.get(a) ?? 9999) - (rankBySlug.get(b) ?? 9999);

    containsSlugs.sort(byRank);
    maySlugs.sort(byRank);

    const toName = (slug: string) => nameJaBySlug.get(slug) ?? slug;
    const containsNames = containsSlugs.map(toName);
    const mayNames = maySlugs.map(toName);

    const pickedContains = containsNames.slice(0, 3);
    const remain = 3 - pickedContains.length;
    const pickedMay = remain > 0 ? mayNames.slice(0, remain) : [];

    const parts: string[] = [];
    if (pickedContains.length > 0) {
        parts.push(`${pickedContains.join("・")}（含む）`);
    }
    if (pickedMay.length > 0) {
        parts.push(`${pickedMay.join("・")}（可能性）`);
    }

    return {
        summaryText: parts.length > 0 ? parts.join(" / ") : "特記事項なし",
        badge,
        containsCount: containsSlugs.length,
        mayCount: maySlugs.length,
    };
}

function buildPersonalizedSummary(args: {
    links: Array<{ status: AllergenStatus; allergen: { slug: string } }>;
    selectedSlugs: string[];
    nameJaBySlug: Map<string, string>;
    rankBySlug: Map<string, number>;
}): {
    summaryText: string;
    badge: BadgeKind;
    containsCount: number;
    mayCount: number;
} {
    const { links, selectedSlugs, nameJaBySlug, rankBySlug } = args;

    const selectedSet = new Set(selectedSlugs);

    const containsSlugs: string[] = [];
    const maySlugs: string[] = [];

    for (const link of links) {
        const slug = link.allergen.slug;

        if (!selectedSet.has(slug)) {
            continue;
        }

        if (link.status === "CONTAINS") {
            containsSlugs.push(slug);
        } else if (link.status === "MAY_CONTAIN") {
            maySlugs.push(slug);
        }
    }

    const badge: BadgeKind =
        containsSlugs.length > 0
            ? "danger"
            : maySlugs.length > 0
              ? "caution"
              : "safe";

    const byRank = (a: string, b: string) =>
        (rankBySlug.get(a) ?? 9999) - (rankBySlug.get(b) ?? 9999);

    containsSlugs.sort(byRank);
    maySlugs.sort(byRank);

    const toName = (slug: string) => nameJaBySlug.get(slug) ?? slug;
    const containsNames = containsSlugs.map(toName);
    const mayNames = maySlugs.map(toName);

    const pickedContains = containsNames.slice(0, 3);
    const remain = 3 - pickedContains.length;
    const pickedMay = remain > 0 ? mayNames.slice(0, remain) : [];

    const parts: string[] = [];
    if (pickedContains.length > 0) {
        parts.push(`${pickedContains.join("・")}（含む）`);
    }
    if (pickedMay.length > 0) {
        parts.push(`${pickedMay.join("・")}（可能性）`);
    }

    return {
        summaryText:
            parts.length > 0
                ? parts.join(" / ")
                : "あなたの設定項目との一致なし",
        badge,
        containsCount: containsSlugs.length,
        mayCount: maySlugs.length,
    };
}

export default function ShopMenuListClient({
    shopId,
    menus,
    allergenMaster,
    q,
}: {
    shopId: string;
    menus: MenuItemCard[];
    allergenMaster: AllergenMasterItem[];
    q: string;
}) {
    const router = useRouter();

    const [selectedSlugs, setSelectedSlugs] = React.useState<string[]>([]);
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        function syncPreferences() {
            const next = loadUserAllergenPreferences();
            setSelectedSlugs(next.selectedSlugs);
            setLoaded(true);
        }

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

    const hasPreference = loaded && selectedSlugs.length > 0;

    function goToMenu(menuId: string) {
        router.push(`/shops/${shopId}/menus/${menuId}`);
    }

    return (
        <div
            id="public-menus"
            className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
        >
            <div className="mb-4 flex items-end justify-between">
                <h2 className="text-base font-extrabold">公開メニュー</h2>
                <p className="text-xs text-gray-500">{menus.length} 件</p>
            </div>

            {menus.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
                    <p className="text-sm text-gray-700">
                        {q !== ""
                            ? "検索条件に一致する公開メニューがありません。"
                            : "現在公開中のメニューはありません。"}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {menus.map((menu) => {
                        const overallSummary = buildOverallSummary({
                            links: menu.allergenLinks,
                            nameJaBySlug,
                            rankBySlug,
                        });

                        const personalizedSummary = buildPersonalizedSummary({
                            links: menu.allergenLinks,
                            selectedSlugs,
                            nameJaBySlug,
                            rankBySlug,
                        });

                        const activeSummary = hasPreference
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
                                            含む{activeSummary.containsCount}
                                            ・可能性{activeSummary.mayCount}
                                        </p>

                                        <p className="mt-2 text-sm text-gray-700">
                                            {menu.category || "カテゴリ未設定"}{" "}
                                            ・ {formatPriceYen(menu.priceYen)}
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
                                        {badgeLabel(
                                            activeSummary.badge,
                                            hasPreference,
                                        )}
                                    </span>

                                    <p className="text-right text-xs text-gray-500">
                                        更新: {formatDateTime(menu.updatedAt)}
                                    </p>
                                </div>

                                <p className="mt-2 text-xs text-gray-600">
                                    {activeSummary.summaryText}
                                </p>

                                {hasPreference ? (
                                    <p className="mt-2 text-[11px] text-gray-400">
                                        あなたの設定項目に基づく表示
                                    </p>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
