"use client";

// このコンポーネントは、選択中アレルゲンとメニューの登録上の判定結果だけを表示します。

import React from "react";
import { type AllergenStatus } from "@/lib/allergens";
import {
    loadUserAllergenPreferences,
    USER_ALLERGENS_UPDATED_EVENT,
} from "@/lib/public-allergen-preferences";

type Allergen = {
    slug: string;
    nameJa: string;
};

type SelectedAllergen = Allergen & {
    status: AllergenStatus;
};

function AllergenInfoCard({
    title,
    description,
    className,
    titleClassName,
    children,
}: {
    title: string;
    description: string;
    className: string;
    titleClassName: string;
    children: React.ReactNode;
}) {
    return (
        <section className={`w-full rounded-xl border px-4 py-3 shadow-sm ${className}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="md:max-w-[260px] md:shrink-0">
                    <h3 className={`text-sm font-extrabold ${titleClassName}`}>
                        {title}
                    </h3>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-gray-600">
                        {description}
                    </p>
                </div>
                <div className="md:flex-1">{children}</div>
            </div>
        </section>
    );
}

function AllergenChips({
    allergens,
    label,
    className,
}: {
    allergens: SelectedAllergen[];
    label: string;
    className: string;
}) {
    return (
        <div className="flex flex-wrap gap-2 md:justify-end">
            {allergens.map((allergen) => (
                <span
                    key={allergen.slug}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${className}`}
                >
                    {allergen.nameJa}
                    <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-extrabold leading-none">
                        {label}
                    </span>
                </span>
            ))}
        </div>
    );
}

export default function SelectedAllergenResultCardsClient({
    allergens,
    statusBySlug,
}: {
    allergens: Allergen[];
    statusBySlug: Record<string, AllergenStatus>;
}) {
    const [highlightSlugs, setHighlightSlugs] = React.useState<string[]>([]);
    const [excludedSlugs, setExcludedSlugs] = React.useState<string[]>([]);
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        function syncPreferences() {
            const stored = loadUserAllergenPreferences();
            setHighlightSlugs(stored.highlightSlugs);
            setExcludedSlugs(stored.excludedSlugs);
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

    if (!loaded) {
        return null;
    }

    const selectedSlugs = [...new Set([...highlightSlugs, ...excludedSlugs])];

    if (selectedSlugs.length === 0) {
        return null;
    }

    const selectedAllergens = allergens
        .filter((allergen) => selectedSlugs.includes(allergen.slug))
        .map((allergen) => ({
            ...allergen,
            status: statusBySlug[allergen.slug] ?? "UNKNOWN",
        }));

    const containsAllergens = selectedAllergens.filter(
        (allergen) => allergen.status === "CONTAINS",
    );
    const mayContainAllergens = selectedAllergens.filter(
        (allergen) => allergen.status === "MAY_CONTAIN",
    );
    const freeAllergens = selectedAllergens.filter(
        (allergen) => allergen.status === "FREE",
    );
    const hasRiskResults =
        containsAllergens.length > 0 || mayContainAllergens.length > 0;

    return (
        <div className="space-y-3">
            {containsAllergens.length > 0 ? (
                <AllergenInfoCard
                    title="あなた向け警告"
                    description="選択中アレルゲンのうち、このメニューで「含む」と登録されている項目です。必要に応じて店舗へ確認してください。"
                    className="border-red-200 bg-red-50"
                    titleClassName="text-red-800"
                >
                    <AllergenChips
                        allergens={containsAllergens}
                        label="含む"
                        className="border-red-200 bg-white text-red-800"
                    />
                </AllergenInfoCard>
            ) : null}

            {mayContainAllergens.length > 0 ? (
                <AllergenInfoCard
                    title="選択中アレルゲンの確認項目"
                    description="選択中アレルゲンのうち、このメニューで「含む可能性あり」と登録されている項目です。必要に応じて店舗へ確認してください。"
                    className="border-amber-200 bg-amber-50"
                    titleClassName="text-amber-900"
                >
                    <AllergenChips
                        allergens={mayContainAllergens}
                        label="可能性あり"
                        className="border-amber-200 bg-white text-amber-900"
                    />
                </AllergenInfoCard>
            ) : null}

            {!hasRiskResults && freeAllergens.length > 0 ? (
                <AllergenInfoCard
                    title="選択中アレルゲンの登録上の判定"
                    description="選択中アレルゲンについて、このメニューでは「含まない」と登録されています。表示内容は判断材料として確認してください。"
                    className="border-emerald-100 bg-emerald-50"
                    titleClassName="text-emerald-800"
                >
                    <AllergenChips
                        allergens={freeAllergens}
                        label="含まない"
                        className="border-emerald-100 bg-white text-emerald-800"
                    />
                </AllergenInfoCard>
            ) : null}
        </div>
    );
}
