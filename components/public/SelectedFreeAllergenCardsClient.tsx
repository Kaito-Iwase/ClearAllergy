"use client";

// このコンポーネントは、選択中アレルゲンのうち「含まない」項目だけを小さく見せる部品です。
// メニュー詳細ページで、安心材料を短く伝える補助 UI として使います。
// localStorage の設定がある時だけ意味を持つため、読み込み後に判定します。

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

export default function SelectedFreeAllergenCardsClient({
    allergens,
    statusBySlug,
}: {
    allergens: Allergen[];
    statusBySlug: Record<string, AllergenStatus>;
}) {
    // 端末に保存された選択アレルゲンを画面状態として持ちます。
    const [selectedSlugs, setSelectedSlugs] = React.useState<string[]>([]);
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        function syncPreferences() {
            const stored = loadUserAllergenPreferences();
            setSelectedSlugs(stored.selectedSlugs);
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

    // 選択済みアレルゲンのうち、この商品で FREE のものだけ拾います。
    const selectedFreeAllergens = allergens
        .filter((allergen) => selectedSlugs.includes(allergen.slug))
        .filter((allergen) => statusBySlug[allergen.slug] === "FREE")
        .slice(0, 3);

    // カード数をそろえて見た目を安定させるため、足りない分はダミーで埋めます。
    const fillerCount = Math.max(0, 3 - selectedFreeAllergens.length);

    return (
        <div className="grid grid-cols-3 gap-3">
            {selectedFreeAllergens.map((allergen) => (
                <div
                    key={allergen.slug}
                    className="flex flex-col items-center justify-center rounded-lg border border-green-100 bg-emerald-50 p-3"
                >
                    <div className="mb-1 text-emerald-700">✔</div>
                    <div className="text-center text-sm font-bold text-emerald-700">
                        {allergen.nameJa} 含まない
                    </div>
                </div>
            ))}

            {Array.from({ length: fillerCount }).map((_, i) => (
                <div
                    key={`filler-${i}`}
                    className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-3"
                >
                    <div className="mb-1 text-gray-400">—</div>
                    <div className="text-sm font-bold text-gray-500">—</div>
                </div>
            ))}
        </div>
    );
}
