"use client";

// このコンポーネントはメニュー詳細上部の「あなた向け警告」表示です。
// localStorage に保存された選択アレルゲンと、現在のメニュー状態を突き合わせます。
// 個人設定が無い時は UI 自体を出さないようにして、公開情報の邪魔をしない構成です。

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

export default function MenuAllergenAlertClient({
    allergens,
    statusBySlug,
}: {
    allergens: Allergen[];
    statusBySlug: Record<string, AllergenStatus>;
}) {
    // 端末に保存された選択アレルゲンを画面状態として持ちます。
    const [highlightSlugs, setHighlightSlugs] = React.useState<string[]>([]);
    const [excludedSlugs, setExcludedSlugs] = React.useState<string[]>([]);
    const [includeMayContain, setIncludeMayContain] = React.useState(true);
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        function syncPreferences() {
            const stored = loadUserAllergenPreferences();
            setHighlightSlugs(stored.highlightSlugs);
            setExcludedSlugs(stored.excludedSlugs);
            setIncludeMayContain(stored.includeMayContain);
            setLoaded(true);
        }

        // 保存直後や別タブ変更でも警告が追従するようにイベント監視します。
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

    // slug から日本語名へ変換しやすいよう Map にします。
    const allergenNameBySlug = React.useMemo(() => {
        return new Map(
            allergens.map((allergen) => [allergen.slug, allergen.nameJa]),
        );
    }, [allergens]);

    // 選択中のアレルゲンのうち、実際に「含む」ものだけを抜き出します。
    const selectedSlugs = React.useMemo(
        () => [...new Set([...highlightSlugs, ...excludedSlugs])],
        [highlightSlugs, excludedSlugs],
    );

    const containsMatched = React.useMemo(() => {
        return selectedSlugs.filter(
            (slug) => statusBySlug[slug] === "CONTAINS",
        );
    }, [selectedSlugs, statusBySlug]);

    // 「含む可能性があります」も別扱いで集計します。
    const mayContainMatched = React.useMemo(() => {
        if (!includeMayContain) {
            return [];
        }

        return selectedSlugs.filter(
            (slug) => statusBySlug[slug] === "MAY_CONTAIN",
        );
    }, [includeMayContain, selectedSlugs, statusBySlug]);

    const unknownMatched = React.useMemo(() => {
        return selectedSlugs.filter(
            (slug) => (statusBySlug[slug] ?? "UNKNOWN") === "UNKNOWN",
        );
    }, [selectedSlugs, statusBySlug]);

    const containsNames = containsMatched
        .map((slug) => allergenNameBySlug.get(slug))
        .filter((value): value is string => Boolean(value));

    const mayContainNames = mayContainMatched
        .map((slug) => allergenNameBySlug.get(slug))
        .filter((value): value is string => Boolean(value));

    const unknownNames = unknownMatched
        .map((slug) => allergenNameBySlug.get(slug))
        .filter((value): value is string => Boolean(value));

    if (!loaded) {
        return null;
    }

    // 設定未選択なら、個人向け警告 UI 自体を出しません。
    if (selectedSlugs.length === 0) {
        return null;
    }

    if (
        containsNames.length === 0 &&
        mayContainNames.length === 0 &&
        unknownNames.length === 0
    ) {
        return (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-green-800">
                    選択中アレルゲンとの一致は見つかりませんでした
                </h3>
                <p className="mt-2 text-sm text-green-800/90">
                    この端末で選んだアレルゲンについて、現在の登録上は 「含む /
                    可能性あり」は見つかりません。
                </p>
            </div>
        );
    }

    if (unknownNames.length > 0 && containsNames.length === 0) {
        return (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 shadow-sm">
                <h3 className="text-xl font-extrabold text-gray-800 md:text-2xl">
                    あなた向け注意：{unknownNames.join("・")} は未設定です
                    {mayContainNames.length > 0
                        ? `（他：${mayContainNames.join("・")} は可能性あり）`
                        : ""}
                </h3>

                <p className="mt-3 text-sm font-medium text-gray-900/90">
                    {/* 未設定だけでも利用者にとっては重要情報なので、独立した注意として表示します。 */}
                    この商品は、あなたが選択したアレルゲンの一部がまだ未設定です。
                    公開表示だけで判断せず、必要に応じて店舗へ確認してください。
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
                    この商品は、あなたが選択したアレルゲンと一致しています。
                    必ず店舗の表示・注意事項も確認してください。
                </p>
                {unknownNames.length > 0 ? (
                    <p className="mt-2 text-sm font-medium text-red-900/90">
                        {/* 危険表示の時でも UNKNOWN を落とさず併記し、
                            「含む項目だけ見て他は安全」と誤読されるのを防ぎます。 */}
                        未設定：{unknownNames.join("・")}。未設定項目は店舗へ確認してください。
                    </p>
                ) : null}
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 shadow-sm">
            <h3 className="text-xl font-extrabold text-yellow-800 md:text-2xl">
                あなた向け注意：{mayContainNames.join("・")} は可能性があります
            </h3>

            <p className="mt-3 text-sm font-medium text-yellow-900/90">
                この商品は、あなたが選択したアレルゲンについて
                「可能性あり」として登録されています。必要に応じて店舗へ確認してください。
            </p>
            {unknownNames.length > 0 ? (
                <p className="mt-2 text-sm font-medium text-yellow-900/90">
                    未設定：{unknownNames.join("・")}。未設定項目は店舗へ確認してください。
                </p>
            ) : null}
        </div>
    );
}
