"use client";

import React from "react";
import {
    clearUserAllergenPreferences,
    loadUserAllergenPreferences,
    saveUserAllergenPreferences,
    USER_ALLERGENS_UPDATED_EVENT,
} from "@/lib/public-allergen-preferences";

export type UserAllergenPreferenceAllergen = {
    slug: string;
    nameJa: string;
};

type UserAllergenPreferencePanelProps = {
    allergens: UserAllergenPreferenceAllergen[];
    targetSlugs: string[];
    highlightSlugs: string[];
    excludedSlugs: string[];
    includeMayContain: boolean;
    loaded: boolean;
    message: string;
    isOpen: boolean;
    onToggleOpen: () => void;
    onToggleTargetSlug: (slug: string) => void;
    onToggleIncludeMayContain: () => void;
    onApplyHighlight: () => void;
    onApplyExclude: () => void;
    onClear: () => void;
    className?: string;
};

export function useUserAllergenPreferenceState() {
    const [targetSlugs, setTargetSlugs] = React.useState<string[]>([]);
    const [highlightSlugs, setHighlightSlugs] = React.useState<string[]>([]);
    const [excludedSlugs, setExcludedSlugs] = React.useState<string[]>([]);
    const [includeMayContain, setIncludeMayContain] = React.useState(true);
    const [loaded, setLoaded] = React.useState(false);
    const [message, setMessage] = React.useState("");
    const [isOpen, setIsOpen] = React.useState(false);

    React.useEffect(() => {
        const stored = loadUserAllergenPreferences();
        setHighlightSlugs(stored.highlightSlugs);
        setExcludedSlugs(stored.excludedSlugs);
        setTargetSlugs([]);
        setIncludeMayContain(stored.includeMayContain);
        setLoaded(true);
    }, []);

    function toggleTargetSlug(slug: string) {
        setTargetSlugs((prev) => {
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

    function persistPreferences(args: {
        nextHighlightSlugs: string[];
        nextExcludedSlugs: string[];
        nextIncludeMayContain: boolean;
    }) {
        saveUserAllergenPreferences({
            highlightSlugs: args.nextHighlightSlugs,
            excludedSlugs: args.nextExcludedSlugs,
            includeMayContain: args.nextIncludeMayContain,
            selectedSlugs: [
                ...new Set([
                    ...args.nextHighlightSlugs,
                    ...args.nextExcludedSlugs,
                ]),
            ],
        });
        notifyUpdated();
    }

    function applyHighlight() {
        if (targetSlugs.length === 0) {
            showMessage("先にアレルゲンを選択してください。");
            return;
        }

        const nextHighlightSlugs = [...new Set([...highlightSlugs, ...targetSlugs])];
        const nextExcludedSlugs = excludedSlugs.filter(
            (slug) => !targetSlugs.includes(slug),
        );

        setHighlightSlugs(nextHighlightSlugs);
        setExcludedSlugs(nextExcludedSlugs);
        setTargetSlugs([]);
        persistPreferences({
            nextHighlightSlugs,
            nextExcludedSlugs,
            nextIncludeMayContain: includeMayContain,
        });
        showMessage("選択した項目を強調表示として保存しました。");
    }

    function applyExclude() {
        if (targetSlugs.length === 0) {
            showMessage("先にアレルゲンを選択してください。");
            return;
        }

        const nextHighlightSlugs = highlightSlugs.filter(
            (slug) => !targetSlugs.includes(slug),
        );
        const nextExcludedSlugs = [...new Set([...excludedSlugs, ...targetSlugs])];

        setHighlightSlugs(nextHighlightSlugs);
        setExcludedSlugs(nextExcludedSlugs);
        setTargetSlugs([]);
        persistPreferences({
            nextHighlightSlugs,
            nextExcludedSlugs,
            nextIncludeMayContain: includeMayContain,
        });
        showMessage("選択した項目を除外として保存しました。");
    }

    function onClear() {
        clearUserAllergenPreferences();
        setTargetSlugs([]);
        setHighlightSlugs([]);
        setExcludedSlugs([]);
        setIncludeMayContain(true);
        notifyUpdated();
        showMessage("保存済み設定を削除しました。");
    }

    return {
        targetSlugs,
        highlightSlugs,
        excludedSlugs,
        includeMayContain,
        loaded,
        message,
        isOpen,
        setIsOpen,
        toggleTargetSlug,
        toggleIncludeMayContain: () => {
            const nextIncludeMayContain = !includeMayContain;

            setIncludeMayContain(nextIncludeMayContain);
            persistPreferences({
                nextHighlightSlugs: highlightSlugs,
                nextExcludedSlugs: excludedSlugs,
                nextIncludeMayContain,
            });
            showMessage(
                nextIncludeMayContain
                    ? "コンタミも対象にしました。"
                    : "コンタミを対象外にしました。",
            );
        },
        applyHighlight,
        applyExclude,
        onClear,
    };
}

export function UserAllergenPreferencePanel({
    allergens,
    targetSlugs,
    highlightSlugs,
    excludedSlugs,
    includeMayContain,
    loaded,
    message,
    isOpen,
    onToggleOpen,
    onToggleTargetSlug,
    onToggleIncludeMayContain,
    onApplyHighlight,
    onApplyExclude,
    onClear,
    className,
}: UserAllergenPreferencePanelProps) {
    if (!loaded) {
        return null;
    }

    const selectedCount = new Set([...highlightSlugs, ...excludedSlugs]).size;
    const targetCount = targetSlugs.length;

    return (
        <section
            className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${
                className ?? ""
            }`}
        >
            <button
                type="button"
                onClick={onToggleOpen}
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
                        アレルゲンを選んでから、下のボタンで強調表示または除外に設定します。
                    </p>

                    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <label className="flex cursor-pointer items-start justify-between gap-4">
                            <div>
                                <span className="text-sm font-extrabold text-gray-900">
                                    コンタミも対象にする
                                </span>
                                <p className="mt-1 text-xs leading-5 text-gray-600">
                                    「含む可能性があります」も強調・除外の対象にします。
                                </p>
                            </div>
                            <input
                                type="checkbox"
                                checked={includeMayContain}
                                onChange={onToggleIncludeMayContain}
                                className="mt-1 h-5 w-5 rounded border-gray-300 text-[#13ec13] focus:ring-[#13ec13]"
                            />
                        </label>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {allergens.map((allergen) => {
                            const selected = targetSlugs.includes(allergen.slug);
                            const highlighted = highlightSlugs.includes(
                                allergen.slug,
                            );
                            const excluded = excludedSlugs.includes(allergen.slug);

                            return (
                                <button
                                    key={allergen.slug}
                                    type="button"
                                    onClick={() => onToggleTargetSlug(allergen.slug)}
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${
                                        selected
                                            ? "border-gray-900 bg-gray-900 text-white"
                                            : excluded
                                              ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
                                              : highlighted
                                                ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                                : "border-gray-100 bg-gray-100 text-gray-800 hover:bg-gray-200"
                                    }`}
                                >
                                    {allergen.nameJa}
                                    {excluded ? (
                                        <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-red-700">
                                            除外
                                        </span>
                                    ) : highlighted ? (
                                        <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-amber-800">
                                            強調
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onApplyHighlight}
                            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-extrabold text-black transition hover:bg-amber-500"
                        >
                            強調する
                            {targetCount > 0 ? `（${targetCount}件）` : ""}
                        </button>

                        <button
                            type="button"
                            onClick={onApplyExclude}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-red-700"
                        >
                            除外する
                            {targetCount > 0 ? `（${targetCount}件）` : ""}
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

export default function UserAllergenPreferenceClient({
    allergens,
}: {
    allergens: UserAllergenPreferenceAllergen[];
}) {
    const state = useUserAllergenPreferenceState();

    return (
        <UserAllergenPreferencePanel
            allergens={allergens}
            targetSlugs={state.targetSlugs}
            highlightSlugs={state.highlightSlugs}
            excludedSlugs={state.excludedSlugs}
            includeMayContain={state.includeMayContain}
            loaded={state.loaded}
            message={state.message}
            isOpen={state.isOpen}
            onToggleOpen={() => state.setIsOpen((prev) => !prev)}
            onToggleTargetSlug={state.toggleTargetSlug}
            onToggleIncludeMayContain={state.toggleIncludeMayContain}
            onApplyHighlight={state.applyHighlight}
            onApplyExclude={state.applyExclude}
            onClear={state.onClear}
        />
    );
}
