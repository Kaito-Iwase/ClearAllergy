"use client";

import React from "react";
import {
    areAllergenPreferencesEqual,
    getAllergenPreferenceMode,
    getUserAllergenPreferenceSnapshot,
    normalizeUserAllergenPreferences,
    saveUserAllergenPreferences,
    SERVER_PREFERENCE_SNAPSHOT,
    setAllergenPreferenceMode,
    subscribeUserAllergenPreferences,
    type AllergenPreferenceMode,
    type UserAllergenPreferences,
} from "@/lib/public-allergen-preferences";
import { useUnsavedMenuChanges } from "@/features/admin/menus/components/useUnsavedMenuChanges";

export type UserAllergenPreferenceAllergen = { slug: string; nameJa: string };

export function useUserAllergenPreferences() {
    return React.useSyncExternalStore(
        subscribeUserAllergenPreferences,
        getUserAllergenPreferenceSnapshot,
        () => SERVER_PREFERENCE_SNAPSHOT,
    );
}

export function useUserAllergenPreferenceState() {
    const snapshot = useUserAllergenPreferences();
    const [edit, setEdit] = React.useState<{
        base: UserAllergenPreferences; value: UserAllergenPreferences;
    } | null>(null);
    const [message, setMessage] = React.useState("");
    const [isOpen, setIsOpen] = React.useState(false);
    const draft = edit?.value ?? snapshot.preferences;
    const dirty = !areAllergenPreferencesEqual(draft, snapshot.preferences);
    const conflict = edit !== null && dirty && !areAllergenPreferencesEqual(edit.base, snapshot.preferences);
    useUnsavedMenuChanges(dirty);

    function change(update: (value: UserAllergenPreferences) => UserAllergenPreferences) {
        setEdit((current) => ({
            base: current && !areAllergenPreferencesEqual(current.value, snapshot.preferences) ? current.base : snapshot.preferences,
            value: update(current?.value ?? snapshot.preferences),
        }));
        setMessage("");
    }

    function apply() {
        // 保存直前にも再取得し、編集中の別タブ更新や読込失敗を上書きしない。
        const latest = getUserAllergenPreferenceSnapshot();
        if (!latest.storageReadable) { setMessage(latest.storageError); return; }
        if (edit && !areAllergenPreferencesEqual(edit.base, latest.preferences)) {
            setMessage("別の画面で設定が変更されました。最新の設定を読み直してから編集してください。");
            return;
        }
        const result = saveUserAllergenPreferences(draft);
        if (!result.ok) { setMessage(result.message); return; }
        setEdit(null);
        setMessage("変更を適用しました。");
        setIsOpen(false);
        return true;
    }

    return {
        saved: snapshot.preferences, draft, dirty, conflict,
        loaded: snapshot.loaded,
        message: snapshot.storageError || message,
        isOpen,
        onToggleOpen: () => setIsOpen((value) => !value),
        onChangeMode: (slug: string, mode: AllergenPreferenceMode) => change((value) => setAllergenPreferenceMode(value, slug, mode)),
        onToggleIncludeMayContain: () => change((value) => ({ ...value, includeMayContain: !value.includeMayContain })),
        onClear: () => change(() => normalizeUserAllergenPreferences(null)),
        onApply: apply,
        onCancel: () => { setEdit(null); setMessage(""); setIsOpen(false); },
        onReload: () => { setEdit(null); setMessage("最新の設定を読み直しました。"); },
    };
}

export function UserAllergenPreferencePanel({ allergens, state, className = "" }: {
    allergens: UserAllergenPreferenceAllergen[];
    state: ReturnType<typeof useUserAllergenPreferenceState>;
    className?: string;
}) {
    const id = React.useId();
    const trigger = React.useRef<HTMLButtonElement>(null);
    const [query, setQuery] = React.useState("");
    if (!state.loaded) return null;
    const { saved, draft, dirty, conflict } = state;
    const names = (slugs: string[]) => allergens.filter((a) => slugs.includes(a.slug)).map((a) => a.nameJa).join("・");
    const visibleAllergens = allergens.filter((a) => a.nameJa.includes(query.trim()));
    const selectedCount = draft.highlightSlugs.length + draft.excludedSlugs.length;

    return (
        <section aria-label="あなた向けのアレルゲン設定" className={`min-w-0 rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
            <button ref={trigger} type="button" onClick={state.onToggleOpen} aria-expanded={state.isOpen} aria-controls={state.isOpen ? `${id}-editor` : undefined}
                className="flex min-h-11 w-full items-start justify-between gap-3 rounded-2xl p-4 text-left focus-visible:outline-2 focus-visible:outline-green-700 sm:p-5">
                <span className="min-w-0">
                    <span className="block text-base font-bold text-gray-900">あなた向けのアレルゲン設定</span>
                    <span className="mt-2 block text-sm leading-6 text-gray-700">
                        {saved.selectedSlugs.length === 0 ? "未設定" : <>
                            {saved.highlightSlugs.length > 0 && <span className="block">注目：{names(saved.highlightSlugs)}</span>}
                            {saved.excludedSlugs.length > 0 && <span className="block">除外：{names(saved.excludedSlugs)}</span>}
                        </>}
                    </span>
                    {dirty && <span className="mt-1 block text-sm font-bold text-amber-900">未適用の変更あり</span>}
                </span>
                <span aria-hidden="true" className="shrink-0 text-gray-600">{state.isOpen ? "▴" : "▾"}</span>
            </button>
            {state.message && <p role="status" className="mx-4 mb-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{state.message}</p>}
            {state.isOpen && <div id={`${id}-editor`} className="border-t border-gray-100 p-4 sm:p-5">
                <p className="text-sm leading-6 text-gray-700">保存済みの設定を編集できます。最後に「変更を適用」を押してください。</p>
                <p className="mt-2 text-xs leading-5 text-gray-600">「注目して表示」は選んだ項目を確認対象にします。「一覧から除外」は、その項目を「含む」と登録したメニューを非表示にします。</p>
                <label htmlFor={`${id}-search`} className="mt-4 block text-sm font-bold">アレルゲンを探す</label>
                <input id={`${id}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                    placeholder="例：卵" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus-visible:outline-2 focus-visible:outline-green-700" />
                <div className="mt-3 grid max-h-80 overflow-y-auto rounded-xl border border-gray-200 md:grid-cols-2 lg:grid-cols-1">
                    {visibleAllergens.map((allergen) => <label key={allergen.slug} className="grid min-h-16 grid-cols-[minmax(0,1fr)_9rem] items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-0">
                        <span className="break-words text-sm font-bold text-gray-900">{allergen.nameJa}</span>
                        <select aria-label={`${allergen.nameJa}の表示設定`} value={getAllergenPreferenceMode(draft, allergen.slug)}
                            onChange={(event) => state.onChangeMode(allergen.slug, event.target.value as AllergenPreferenceMode)}
                            className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-green-700">
                            <option value="none">設定なし</option>
                            <option value="highlight">注目して表示</option>
                            <option value="exclude">一覧から除外</option>
                        </select>
                    </label>)}
                    {visibleAllergens.length === 0 && <p className="p-4 text-sm text-gray-600">一致する項目がありません。</p>}
                </div>
                <label className="mt-4 flex items-start gap-3 rounded-xl bg-gray-50 p-3 text-sm">
                    <input type="checkbox" checked={draft.includeMayContain} onChange={state.onToggleIncludeMayContain} className="mt-1 h-5 w-5 shrink-0" />
                    <span><span className="font-bold">「含む可能性あり」も除外する</span>
                        <span className="mt-1 block text-xs leading-5 text-gray-600">除外に設定した項目に適用します。オフでも注意表示は残ります。</span></span>
                </label>
                {conflict && <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <p>別の画面で設定が変更されました。編集中の内容はまだ保存されていません。</p>
                    <button type="button" onClick={state.onReload} className="mt-2 min-h-11 font-bold underline">編集を破棄して最新の設定を読み直す</button>
                </div>}
                <div className="mt-4 border-t border-gray-200 pt-3">
                    <p role="status" className="text-sm text-gray-700">{dirty ? `適用後の設定：${selectedCount}件（未適用）` : `保存済み：${selectedCount}件`}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { state.onCancel(); setQuery(""); trigger.current?.focus(); }} className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm font-bold">キャンセル</button>
                        <button type="button" onClick={() => { if (state.onApply()) { setQuery(""); trigger.current?.focus(); } }} disabled={!dirty || conflict}
                            className="min-h-11 rounded-lg bg-green-700 px-3 text-sm font-bold text-white disabled:opacity-40">変更を適用</button>
                    </div>
                    <button type="button" onClick={state.onClear} disabled={selectedCount === 0 && !draft.includeMayContain}
                        className="mt-2 min-h-11 text-sm text-gray-600 underline disabled:opacity-40">すべて設定なしにする（未適用）</button>
                    <p className="mt-2 text-xs leading-5 text-gray-500">この設定はログイン不要で、このブラウザ内だけに保存されます。</p>
                </div>
            </div>}
        </section>
    );
}

export default function UserAllergenPreferenceClient({ allergens }: { allergens: UserAllergenPreferenceAllergen[] }) {
    const state = useUserAllergenPreferenceState();
    return <UserAllergenPreferencePanel allergens={allergens} state={state} />;
}
