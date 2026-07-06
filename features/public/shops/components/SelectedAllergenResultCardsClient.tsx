"use client";

// このコンポーネントは、選択中アレルゲンに対するメニュー判定結果だけを表示します。
// 分類別の全体警告ではなく、localStorage の個人設定と現在のメニュー状態を突き合わせます。

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

type SelectedAllergenResult = Allergen & {
    status: AllergenStatus;
};

function ResultCard({
    title,
    description,
    tone,
    children,
}: {
    title: string;
    description: string;
    tone: "danger" | "caution" | "quiet";
    children: React.ReactNode;
}) {
    const toneClass = {
        danger: {
            section: "border-red-200 bg-red-50",
            title: "text-red-700",
            description: "text-red-900/90",
        },
        caution: {
            section: "border-amber-200 bg-amber-50",
            title: "text-amber-900",
            description: "text-amber-950/85",
        },
        quiet: {
            section: "border-gray-100 bg-white",
            title: "text-gray-900",
            description: "text-gray-500",
        },
    }[tone];

    return (
        <section
            className={`w-full rounded-xl border px-4 py-3 shadow-sm ${toneClass.section}`}
        >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="md:max-w-[280px] md:shrink-0">
                    <h3 className={`text-sm font-extrabold ${toneClass.title}`}>
                        {title}
                    </h3>
                    <p
                        className={`mt-1 text-xs font-medium leading-relaxed ${toneClass.description}`}
                    >
                        {description}
                    </p>
                </div>
                <div className="md:flex-1">{children}</div>
            </div>
        </section>
    );
}

function ResultChips({
    allergens,
    tone,
    label,
}: {
    allergens: SelectedAllergenResult[];
    tone: "danger" | "caution" | "quiet";
    label: string;
}) {
    const chipClass = {
        danger: "border-red-200 bg-white/80 text-red-800",
        caution: "border-amber-200 bg-white/80 text-amber-900",
        quiet: "border-emerald-100 bg-emerald-50 text-emerald-800",
    }[tone];

    return (
        <div className="flex flex-wrap gap-2 md:justify-end">
            {allergens.map((allergen) => (
                <span
                    key={allergen.slug}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${chipClass}`}
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

    const selectedResults = allergens
        .filter((allergen) => selectedSlugs.includes(allergen.slug))
        .map((allergen) => ({
            ...allergen,
            status: statusBySlug[allergen.slug] ?? "UNKNOWN",
        }));

    const containsResults = selectedResults.filter(
        (allergen) => allergen.status === "CONTAINS",
    );
    const mayContainResults = selectedResults.filter(
        (allergen) => allergen.status === "MAY_CONTAIN",
    );
    const freeResults = selectedResults.filter(
        (allergen) => allergen.status === "FREE",
    );

    if (containsResults.length > 0 || mayContainResults.length > 0) {
        return (
            <div className="space-y-3">
                {containsResults.length > 0 ? (
                    <ResultCard
                        title="あなた向け警告"
                        description="選択中アレルゲンのうち、このメニューで「含む」と登録されている項目です。店舗の表示・注意事項も確認してください。"
                        tone="danger"
                    >
                        <ResultChips
                            allergens={containsResults}
                            tone="danger"
                            label="含む"
                        />
                    </ResultCard>
                ) : null}

                {mayContainResults.length > 0 ? (
                    <ResultCard
                        title="選択中アレルゲンの確認項目"
                        description="選択中アレルゲンのうち、このメニューで「含む可能性があります」と登録されている項目です。必要に応じて店舗へ確認してください。"
                        tone="caution"
                    >
                        <ResultChips
                            allergens={mayContainResults}
                            tone="caution"
                            label="可能性あり"
                        />
                    </ResultCard>
                ) : null}
            </div>
        );
    }

    if (
        selectedResults.length > 0 &&
        freeResults.length === selectedResults.length
    ) {
        return (
            <ResultCard
                title="選択中アレルゲンの確認項目"
                description="選択中アレルゲンは、このメニューの登録上すべて「含まない」とされています。"
                tone="quiet"
            >
                <ResultChips
                    allergens={freeResults}
                    tone="quiet"
                    label="含まない"
                />
            </ResultCard>
        );
    }

    return null;
}
