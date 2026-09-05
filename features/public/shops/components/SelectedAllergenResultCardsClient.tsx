"use client";

import { STORE_ALLERGEN_NOTE } from "@/lib/public-prototype";
import { getSelectedAllergenSlugs } from "@/lib/public-allergen-preferences";

// このコンポーネントは、選択中アレルゲンとメニューの登録上の判定結果だけを表示します。

import React from "react";
import {
    classifySelectedAllergenStatuses,
    type AllergenStatus,
} from "@/lib/allergens";
import { useUserAllergenPreferences } from "@/features/public/shops/components/UserAllergenPreferenceClient";

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
    storeHandledAllergenSlugs = [],
}: {
    allergens: Allergen[];
    statusBySlug: Record<string, AllergenStatus>;
    storeHandledAllergenSlugs?: string[];
}) {
    const { preferences: { highlightSlugs, excludedSlugs }, loaded } = useUserAllergenPreferences();



    if (!loaded) {
        return null;
    }

    const selectedSlugs = getSelectedAllergenSlugs({ highlightSlugs, excludedSlugs });

    if (selectedSlugs.length === 0) {
        return null;
    }

    const selectedAllergens = allergens
        .filter((allergen) => selectedSlugs.includes(allergen.slug))
        .map((allergen) => ({
            ...allergen,
            status: statusBySlug[allergen.slug] ?? "UNKNOWN",
        }));

    const selectedAllergenBySlug = new Map(
        selectedAllergens.map((allergen) => [allergen.slug, allergen]),
    );
    const groups = classifySelectedAllergenStatuses({
        statusBySlug,
        selectedSlugs: selectedAllergens.map((allergen) => allergen.slug),
    });
    const toAllergens = (slugs: string[]) =>
        slugs
            .map((slug) => selectedAllergenBySlug.get(slug))
            .filter(
                (allergen): allergen is SelectedAllergen => Boolean(allergen),
            );
    const containsAllergens = toAllergens(groups.containsSlugs);
    const mayContainAllergens = toAllergens(groups.mayContainSlugs);
    const freeAllergens = toAllergens(groups.freeSlugs);
    const storeHandledAllergens = freeAllergens.filter((allergen) => storeHandledAllergenSlugs.includes(allergen.slug));
    const unknownAllergens = toAllergens(groups.unknownSlugs);
    const hasRiskResults =
        containsAllergens.length > 0 || mayContainAllergens.length > 0 || storeHandledAllergens.length > 0;
    const hasUnknownResults = groups.unknownSlugs.length > 0;

    return (
        <div className="space-y-3">
            {containsAllergens.length > 0 ? (
                <AllergenInfoCard
                    title="選択中アレルゲンを含みます"
                    description="選択中アレルゲンのうち、このメニューで「含む」と登録されている項目です。架空の登録情報であり、実際の飲食判断には使用できません。"
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
                    title="選択中アレルゲンは含む可能性あり・要確認"
                    description="選択中アレルゲンのうち、このメニューで「含む可能性あり」と登録されている項目です。架空の登録情報であり、実際の飲食判断には使用できません。"
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

            {storeHandledAllergens.length > 0 ? (
                <AllergenInfoCard title="同店舗の別の公開登録に含む情報あり" description={STORE_ALLERGEN_NOTE}
                    className="border-amber-200 bg-amber-50" titleClassName="text-amber-900">
                    <AllergenChips allergens={storeHandledAllergens} label="別の公開登録に含む" className="border-amber-200 bg-white text-amber-900" />
                </AllergenInfoCard>
            ) : null}
            {hasUnknownResults ? (
                <AllergenInfoCard title="選択中アレルゲンに未入力・未確認の情報があります" description="含まないことを示す状態ではありません。" className="border-gray-300 bg-gray-50" titleClassName="text-gray-900">
                    <AllergenChips allergens={unknownAllergens} label="未入力・未確認" className="border-gray-300 bg-white text-gray-900" />
                </AllergenInfoCard>
            ) : null}
            {!hasRiskResults &&
            !hasUnknownResults &&
            freeAllergens.length > 0 ? (
                <AllergenInfoCard
                    title="選択中アレルゲンは原材料に含まない登録"
                    description="このメニューの原材料に含まないという架空の登録情報です。食品の安全性や摂取可否を保証するものではありません。"
                    className="border-emerald-100 bg-emerald-50"
                    titleClassName="text-emerald-800"
                >
                    <AllergenChips
                        allergens={freeAllergens}
                        label="原材料に含まない登録"
                        className="border-emerald-100 bg-white text-emerald-800"
                    />
                </AllergenInfoCard>
            ) : null}
        </div>
    );
}
