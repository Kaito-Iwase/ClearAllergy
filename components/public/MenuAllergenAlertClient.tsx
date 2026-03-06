"use client";

import React from "react";
import { loadUserAllergenPreferences } from "@/lib/public-allergen-preferences";

type AllergenStatus = "CONTAINS" | "FREE" | "MAY_CONTAIN";

type Allergen = {
    slug: string;
    nameJa: string;
};

export default function MenuAllergenAlertClient({
    allergens,
    statusBySlug,
}: {
    allergens: Allergen[];
    statusBySlug: Record<string, AllergenStatus>;
}) {
    const [selectedSlugs, setSelectedSlugs] = React.useState<string[]>([]);
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        const stored = loadUserAllergenPreferences();
        setSelectedSlugs(stored.selectedSlugs);
        setLoaded(true);
    }, []);

    const allergenNameBySlug = React.useMemo(() => {
        return new Map(
            allergens.map((allergen) => [allergen.slug, allergen.nameJa]),
        );
    }, [allergens]);

    const containsMatched = React.useMemo(() => {
        return selectedSlugs.filter(
            (slug) => statusBySlug[slug] === "CONTAINS",
        );
    }, [selectedSlugs, statusBySlug]);

    const mayContainMatched = React.useMemo(() => {
        return selectedSlugs.filter(
            (slug) => statusBySlug[slug] === "MAY_CONTAIN",
        );
    }, [selectedSlugs, statusBySlug]);

    const containsNames = containsMatched
        .map((slug) => allergenNameBySlug.get(slug))
        .filter((value): value is string => Boolean(value));

    const mayContainNames = mayContainMatched
        .map((slug) => allergenNameBySlug.get(slug))
        .filter((value): value is string => Boolean(value));

    if (!loaded) {
        return null;
    }

    if (selectedSlugs.length === 0) {
        return (
            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900">
                    あなた向けの警告表示は未設定です
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                    上のアレルゲン設定を保存すると、一致したときだけ警告表示できます。
                </p>
            </div>
        );
    }

    if (containsNames.length === 0 && mayContainNames.length === 0) {
        return (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-green-800">
                    保存済み設定との一致は見つかりませんでした
                </h3>
                <p className="mt-2 text-sm text-green-800/90">
                    この端末で選んだアレルゲンについて、現在の登録上は 「含む /
                    可能性あり」は見つかりません。
                </p>
            </div>
        );
    }

    if (containsNames.length > 0) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
                <h3 className="text-xl font-extrabold text-red-700 md:text-2xl">
                    あなた向け警告：{containsNames.join("・")} を含みます
                    {mayContainNames.length > 0
                        ? `（他：${mayContainNames.join("・")} は可能性あり）`
                        : ""}
                </h3>
                <p className="mt-3 text-sm font-medium text-red-900/90">
                    この商品は、この端末で保存したアレルゲン設定と一致しています。
                    必ず店舗の表示・注意事項も確認してください。
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 shadow-sm">
            <h3 className="text-xl font-extrabold text-yellow-800 md:text-2xl">
                あなた向け注意：{mayContainNames.join("・")} は可能性があります
            </h3>
            <p className="mt-3 text-sm font-medium text-yellow-900/90">
                この商品は、この端末で保存したアレルゲン設定について
                「可能性あり」として登録されています。必要に応じて店舗へ確認してください。
            </p>
        </div>
    );
}
