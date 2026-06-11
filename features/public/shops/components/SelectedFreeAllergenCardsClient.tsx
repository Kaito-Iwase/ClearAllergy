"use client";

// このコンポーネントは、選択中アレルゲンの確認結果を補助カードとして見せる部品です。
// localStorage の設定がある時だけ意味を持つため、読み込み後に判定します。

import React from "react";
import {
    SPECIFIED_INGREDIENT_SLUGS,
    type AllergenStatus,
} from "@/lib/allergens";
import {
    loadUserAllergenPreferences,
    USER_ALLERGENS_UPDATED_EVENT,
} from "@/lib/public-allergen-preferences";

type Allergen = {
    slug: string;
    nameJa: string;
};

function AllergenInfoCard({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="w-full rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="md:max-w-[260px] md:shrink-0">
                    <h3 className="text-sm font-extrabold text-gray-900">
                        {title}
                    </h3>
                    {description ? (
                        <p className="mt-1 text-xs font-medium leading-relaxed text-gray-500">
                            {description}
                        </p>
                    ) : null}
                </div>
                <div className="md:flex-1">{children}</div>
            </div>
        </section>
    );
}

export default function SelectedFreeAllergenCardsClient({
    allergens,
    statusBySlug,
}: {
    allergens: Allergen[];
    statusBySlug: Record<string, AllergenStatus>;
}) {
    // 端末に保存された選択アレルゲンを画面状態として持ちます。
    const [highlightSlugs, setHighlightSlugs] = React.useState<string[]>([]);
    const [excludedSlugs, setExcludedSlugs] = React.useState<string[]>([]);
    const [includeMayContain, setIncludeMayContain] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        function syncPreferences() {
            const stored = loadUserAllergenPreferences();
            setHighlightSlugs(stored.highlightSlugs);
            setExcludedSlugs(stored.excludedSlugs);
            setIncludeMayContain(stored.includeMayContain);
            setLoaded(true);
        }

        // 保存イベントや別タブ変更にも追従できるようにします。
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

    if (!loaded) {
        return null;
    }

    const selectedSlugs = [...new Set([...highlightSlugs, ...excludedSlugs])];

    if (selectedSlugs.length === 0) {
        const specifiedRiskAllergens = allergens
            .filter((allergen) =>
                SPECIFIED_INGREDIENT_SLUGS.includes(
                    allergen.slug as (typeof SPECIFIED_INGREDIENT_SLUGS)[number],
                ),
            )
            .map((allergen) => ({
                ...allergen,
                status: statusBySlug[allergen.slug] ?? "UNKNOWN",
            }))
            .filter(
                (allergen) =>
                    allergen.status === "CONTAINS" ||
                    allergen.status === "MAY_CONTAIN",
            );

        if (specifiedRiskAllergens.length === 0) {
            return (
                <AllergenInfoCard
                    title="特定原材料9品目の注意項目"
                    description="個人設定が未選択のため、特定原材料9品目を表示しています。"
                >
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 md:text-right">
                        特定原材料9品目で「含む」「含む可能性あり」はありません。
                    </p>
                </AllergenInfoCard>
            );
        }

        return (
            <AllergenInfoCard
                title="特定原材料9品目の注意項目"
                description="個人設定が未選択のため、特定原材料9品目を表示しています。"
            >
                <div className="flex flex-wrap gap-2 md:justify-end">
                    {specifiedRiskAllergens.map((allergen) => (
                        <span
                            key={allergen.slug}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
                                allergen.status === "CONTAINS"
                                    ? "border-red-200 bg-red-50 text-red-800"
                                    : "border-amber-200 bg-amber-50 text-amber-900"
                            }`}
                        >
                            {allergen.nameJa}
                            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-extrabold leading-none">
                                {allergen.status === "CONTAINS"
                                    ? "含む"
                                    : "可能性あり"}
                            </span>
                        </span>
                    ))}
                </div>
            </AllergenInfoCard>
        );
    }

    // 選択済みアレルゲンのうち、この商品で FREE / MAY_CONTAIN のものを拾います。
    const selectedReferenceAllergens = allergens
        .filter((allergen) => selectedSlugs.includes(allergen.slug))
        .map((allergen) => ({
            ...allergen,
            status: statusBySlug[allergen.slug] ?? "UNKNOWN",
        }))
        .filter(
            (allergen) =>
                allergen.status === "FREE" ||
                (includeMayContain && allergen.status === "MAY_CONTAIN"),
        );

    if (selectedReferenceAllergens.length === 0) {
        return (
            <AllergenInfoCard
                title="選択中アレルゲンの確認項目"
                description="選択中の項目から、このメニューで含まないもの・含む可能性があるものを表示しています。"
            >
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-bold text-gray-600 md:text-right">
                    選択中アレルゲンのうち「含まない」「含む可能性があります」の項目はありません。
                </p>
            </AllergenInfoCard>
        );
    }

    return (
        <AllergenInfoCard
            title="選択中アレルゲンの確認項目"
            description="選択中の項目から、このメニューで含まないもの・含む可能性があるものを表示しています。"
        >
            <div className="flex flex-wrap gap-2 md:justify-end">
                {selectedReferenceAllergens.map((allergen) => {
                    const isMayContain = allergen.status === "MAY_CONTAIN";

                    return (
                        <span
                            key={allergen.slug}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
                                isMayContain
                                    ? "border-amber-200 bg-amber-50 text-amber-900"
                                    : "border-green-100 bg-emerald-50 text-emerald-800"
                            }`}
                        >
                            {allergen.nameJa}
                            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-extrabold leading-none">
                                {isMayContain ? "可能性あり" : "含まない"}
                            </span>
                        </span>
                    );
                })}
            </div>
        </AllergenInfoCard>
    );
}
