"use client";

import React from "react";
import {
    clearUserAllergenPreferences,
    loadUserAllergenPreferences,
    saveUserAllergenPreferences,
} from "@/lib/public-allergen-preferences";

type Allergen = {
    slug: string;
    nameJa: string;
};

export default function UserAllergenPreferenceClient({
    allergens,
}: {
    allergens: Allergen[];
}) {
    const [selectedSlugs, setSelectedSlugs] = React.useState<string[]>([]);
    const [loaded, setLoaded] = React.useState(false);
    const [message, setMessage] = React.useState("");

    React.useEffect(() => {
        const stored = loadUserAllergenPreferences();
        setSelectedSlugs(stored.selectedSlugs);
        setLoaded(true);
    }, []);

    function toggleSlug(slug: string) {
        setSelectedSlugs((prev) => {
            if (prev.includes(slug)) {
                return prev.filter((value) => value !== slug);
            }
            return [...prev, slug];
        });
    }

    function onSave() {
        saveUserAllergenPreferences({ selectedSlugs });
        setMessage("この端末に設定を保存しました。");
        window.setTimeout(() => setMessage(""), 2500);
    }

    function onClear() {
        clearUserAllergenPreferences();
        setSelectedSlugs([]);
        setMessage("保存済み設定を削除しました。");
        window.setTimeout(() => setMessage(""), 2500);
    }

    if (!loaded) {
        return null;
    }

    return (
        <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">
                        あなた向けのアレルゲン設定
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                        避けたいアレルゲンを選ぶと、この端末では一致時だけ警告表示します。
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onSave}
                        className="rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-bold text-black transition hover:bg-[#0db80d]"
                    >
                        保存する
                    </button>
                    <button
                        type="button"
                        onClick={onClear}
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                    >
                        リセット
                    </button>
                </div>
            </div>

            {message ? (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    {message}
                </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
                {allergens.map((allergen) => {
                    const checked = selectedSlugs.includes(allergen.slug);

                    return (
                        <button
                            key={allergen.slug}
                            type="button"
                            onClick={() => toggleSlug(allergen.slug)}
                            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                                checked
                                    ? "bg-red-600 text-white"
                                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                            }`}
                        >
                            {allergen.nameJa}
                        </button>
                    );
                })}
            </div>

            <p className="mt-4 text-xs text-gray-500">
                この設定はログイン不要で、このブラウザ内だけに保存されます。
            </p>
        </section>
    );
}
