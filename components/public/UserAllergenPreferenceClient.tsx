"use client";

import React from "react";
import {
    clearUserAllergenPreferences,
    loadUserAllergenPreferences,
    saveUserAllergenPreferences,
    USER_ALLERGENS_UPDATED_EVENT,
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
    const [isOpen, setIsOpen] = React.useState(false);

    React.useEffect(() => {
        const stored = loadUserAllergenPreferences();
        setSelectedSlugs(stored.selectedSlugs);
        setLoaded(true);

        // 保存済みがあるなら最初から少し分かりやすくしたい場合は true でもよい
        // setIsOpen(stored.selectedSlugs.length > 0);
    }, []);

    function toggleSlug(slug: string) {
        setSelectedSlugs((prev) => {
            if (prev.includes(slug)) {
                return prev.filter((value) => value !== slug);
            }
            return [...prev, slug];
        });
    }

    function showMessage(text: string) {
        setMessage(text);

        window.setTimeout(() => {
            setMessage("");
        }, 2500);
    }

    function notifyUpdated() {
        window.dispatchEvent(new CustomEvent(USER_ALLERGENS_UPDATED_EVENT));
    }

    function onSave() {
        saveUserAllergenPreferences({ selectedSlugs });
        notifyUpdated();
        showMessage("この端末に設定を保存しました。");
    }

    function onClear() {
        clearUserAllergenPreferences();
        setSelectedSlugs([]);
        notifyUpdated();
        showMessage("保存済み設定を削除しました。");
    }

    if (!loaded) {
        return null;
    }

    const selectedCount = selectedSlugs.length;

    return (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                aria-expanded={isOpen}
            >
                <div>
                    <h2 className="text-lg font-bold text-gray-900">
                        あなた向けのアレルゲン設定
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                        {selectedCount > 0
                            ? `${selectedCount}件選択中`
                            : "未設定"}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {selectedCount > 0 ? (
                        <span className="rounded-full bg-[#13ec13]/15 px-3 py-1 text-xs font-bold text-green-800">
                            保存済み {selectedCount}件
                        </span>
                    ) : (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                            未設定
                        </span>
                    )}

                    <span className="text-xl text-gray-500">
                        {isOpen ? "▴" : "▾"}
                    </span>
                </div>
            </button>

            {isOpen ? (
                <div className="border-t border-gray-100 px-6 pb-6 pt-4">
                    <p className="text-sm text-gray-600">
                        避けたいアレルゲンを選ぶと、この端末では一致時に警告表示できます。
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {allergens.map((allergen) => {
                            const checked = selectedSlugs.includes(
                                allergen.slug,
                            );

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

                    <div className="mt-5 flex flex-wrap gap-2">
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

                    {message ? (
                        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                            {message}
                        </div>
                    ) : null}

                    <p className="mt-4 text-xs text-gray-500">
                        この設定はログイン不要で、このブラウザ内だけに保存されます。
                    </p>
                </div>
            ) : null}
        </section>
    );
}
