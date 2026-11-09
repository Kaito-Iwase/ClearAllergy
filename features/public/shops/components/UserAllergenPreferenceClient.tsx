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
import { filterAndGroupPreferenceItems } from "./public-allergen-preference-options";

export type UserAllergenPreferenceAllergen = { slug: string; nameJa: string };

const modeLabel = { none: "設定なし", highlight: "注目", exclude: "除外" };
const dialogTitle = "あなた向けのアレルゲン設定";
const badgeColors = { highlight: "bg-amber-100 text-amber-950", exclude: "bg-red-100 text-red-900" };
const itemColors = {
    none: "border-gray-300 bg-white text-gray-900",
    highlight: "border-amber-400 bg-amber-50 text-gray-900",
    exclude: "border-red-300 bg-red-50 text-gray-900",
};
const secondaryButton = "min-h-11 rounded-lg border border-gray-300 bg-white px-2 text-sm font-bold text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-gray-100 disabled:text-gray-600";

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
        base: UserAllergenPreferences;
        value: UserAllergenPreferences;
        previous: Partial<UserAllergenPreferences> | null;
    } | null>(null);
    const [message, setMessage] = React.useState("");
    const [isOpen, setIsOpen] = React.useState(false);
    const draft = edit?.value ?? snapshot.preferences;
    const dirty = !areAllergenPreferencesEqual(draft, snapshot.preferences);
    const conflict = edit !== null && dirty && !areAllergenPreferencesEqual(edit.base, snapshot.preferences);
    useUnsavedMenuChanges(dirty);

    function change(update: (value: UserAllergenPreferences) => UserAllergenPreferences, undo?: "items" | "all") {
        setEdit((current) => {
            const value = current?.value ?? snapshot.preferences;
            const next = update(value);
            if (areAllergenPreferencesEqual(next, value)) return current;
            const previous = undo === "all" ? value
                : undo === "items" ? { highlightSlugs: value.highlightSlugs, excludedSlugs: value.excludedSlugs }
                : current?.previous ?? null;
            return {
                base: current && !areAllergenPreferencesEqual(value, snapshot.preferences) ? current.base : snapshot.preferences,
                value: next, previous,
            };
        });
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
        onOpen: () => { setMessage(""); setIsOpen(true); },
        canUndo: edit?.previous != null,
        onChangeModes: (slugs: string[], mode: AllergenPreferenceMode) =>
            change((value) => slugs.reduce((next, slug) => setAllergenPreferenceMode(next, slug, mode), value), "items"),
        onToggleIncludeMayContain: () => change((value) => ({ ...value, includeMayContain: !value.includeMayContain })),
        onClear: () => change(() => normalizeUserAllergenPreferences(null), "all"),
        onUndo: () => {
            setEdit((current) => {
                if (!current?.previous) return current;
                const value = normalizeUserAllergenPreferences({ ...current.value, ...current.previous });
                if (areAllergenPreferencesEqual(value, current.base) || areAllergenPreferencesEqual(value, snapshot.preferences)) return null;
                return { ...current, value, previous: null };
            });
            setMessage("");
        },
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
    const dialog = React.useRef<HTMLDialogElement>(null);
    const search = React.useRef<HTMLInputElement>(null);
    const applyButton = React.useRef<HTMLButtonElement>(null);
    const [query, setQuery] = React.useState("");
    const [selectedSlugs, setSelectedSlugs] = React.useState<string[]>([]);
    React.useLayoutEffect(() => {
        const element = dialog.current;
        if (!element) return;
        if (state.isOpen && !element.open) {
            element.showModal();
            search.current?.focus();
        } else if (!state.isOpen && element.open) {
            element.close();
            trigger.current?.focus();
        }
    }, [state.isOpen]);
    if (!state.loaded) return null;

    const { saved, draft, dirty, conflict } = state;
    const groups = filterAndGroupPreferenceItems(allergens, query);
    const selected = allergens.filter(({ slug }) => selectedSlugs.includes(slug));
    const names = (slugs: string[]) => allergens.filter((allergen) => slugs.includes(allergen.slug)).map((allergen) => allergen.nameJa).join("・");
    const hasSelection = selected.length > 0;
    const canRemove = selected.some(({ slug }) => getAllergenPreferenceMode(draft, slug) !== "none");
    const focusApply = () => requestAnimationFrame(() => {
        if (!dialog.current?.open) return;
        const button = applyButton.current;
        if (button && !button.disabled) {
            button.scrollIntoView({ block: "nearest" });
            button.focus({ preventScroll: true });
        } else search.current?.focus();
    });

    function resetSelection() {
        setSelectedSlugs([]);
        setQuery("");
    }

    function cancel() {
        state.onCancel();
        resetSelection();
    }

    function toggleSelection(slug: string) {
        setSelectedSlugs((previous) => previous.includes(slug)
            ? previous.filter((value) => value !== slug)
            : [...previous, slug]);
    }

    function assign(mode: AllergenPreferenceMode) {
        state.onChangeModes(selected.map(({ slug }) => slug), mode);
        setSelectedSlugs([]);
        focusApply();
    }

    const editor = state.isOpen && (
            <div className="grid items-start gap-4 p-4 sm:p-5 @min-[48rem]:grid-cols-[minmax(0,1fr)_minmax(16rem,21rem)] @min-[48rem]:gap-x-6">
                <div className="min-w-0 rounded-xl bg-gray-100 px-3 py-2 @min-[48rem]:col-start-2 @min-[48rem]:row-start-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-2">
                        <p className="text-sm text-gray-700">{dirty ? "変更後の設定（未適用）" : "適用済みの設定"}</p>
                        {(draft.selectedSlugs.length > 0 || draft.includeMayContain) && <button type="button" onClick={() => {
                            state.onClear();
                            setSelectedSlugs([]);
                            focusApply();
                        }} className="min-h-11 px-1 text-sm font-bold underline focus-visible:outline-2">設定をすべて解除</button>}
                    </div>
                    <div role="group" aria-label="編集中の表示設定" className="space-y-1 break-words text-sm leading-6 text-gray-900">
                        <p className={"w-fit max-w-full rounded-md px-1.5 " + (draft.highlightSlugs.length ? badgeColors.highlight : "text-gray-600")}>注目：{names(draft.highlightSlugs) || "なし"}</p>
                        <p className={"w-fit max-w-full rounded-md px-1.5 " + (draft.excludedSlugs.length ? badgeColors.exclude : "text-gray-600")}>除外：{names(draft.excludedSlugs) || "なし"}</p>
                    </div>
                </div>
                <div className="min-w-0 @min-[48rem]:col-start-1 @min-[48rem]:row-start-1">
                    <label htmlFor={id + "-search"} className="block text-sm font-bold">アレルゲンを探す</label>
                    <input ref={search} id={id + "-search"} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                        placeholder="例：たまご、こむぎ" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus-visible:outline-2" />
                </div>
                <div data-allergen-preference-actions
                    className="min-w-0 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 @min-[48rem]:col-start-2 @min-[48rem]:row-start-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-900">
                        <p>{hasSelection ? "選択中 " + selected.length + "件" : "品目を選んでから設定します"}</p>
                        {selected.map(({ slug, nameJa }) => <button key={slug} type="button" aria-label={nameJa + "を選択から外す"}
                            onClick={() => { toggleSelection(slug); search.current?.focus(); }}
                            className="min-h-11 rounded-full border border-gray-300 bg-white px-3 focus-visible:outline-2">{nameJa} <span aria-hidden="true">×</span></button>)}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-1">
                        <button type="button" disabled={!hasSelection} onClick={() => assign("highlight")} className={secondaryButton}>注目にする</button>
                        <button type="button" disabled={!hasSelection} onClick={() => assign("exclude")} className={secondaryButton}>一覧から除外</button>
                        <button type="button" disabled={!canRemove} onClick={() => assign("none")} className={secondaryButton}>設定を外す</button>
                    </div>
                    <p className="text-xs leading-5 text-gray-700">「注目にする」は選んだ項目を確認対象にします。「一覧から除外」は、その項目を「含む」と登録したメニューを非表示にします。</p>
                    <label className="flex min-h-11 items-start gap-2 border-t border-gray-200 pt-2 text-sm">
                        <input type="checkbox" checked={draft.includeMayContain} onChange={state.onToggleIncludeMayContain} className="mt-1 h-5 w-5 shrink-0 accent-gray-900" />
                        <span><span className="font-bold">含む可能性があるものを除外・強調</span>
                            <span className="mt-1 block text-xs leading-5 text-gray-700">※店舗登録の「含む可能性あり・要確認」と、同じ店舗の別メニューでの使用情報にも設定を適用します。店舗登録の注意情報はOFFでも表示します。</span></span>
                    </label>
                    {conflict && <div role="alert" className="rounded-lg border border-gray-400 bg-white p-3 text-sm text-gray-900">
                        <p>別の画面で設定が変更されました。編集中の内容はまだ保存されていません。</p>
                        <button type="button" onClick={() => { state.onReload(); resetSelection(); search.current?.focus(); }}
                            className="min-h-11 font-bold underline focus-visible:outline-2">編集を破棄して最新の設定を読み直す</button>
                    </div>}
                    {state.message && <p role="status" className="rounded-lg bg-white p-3 text-sm text-gray-900">{state.message}</p>}
                    {state.canUndo && <button type="button" onClick={() => { state.onUndo(); focusApply(); }}
                        className="min-h-11 px-1 text-sm font-bold underline focus-visible:outline-2">元に戻す</button>}
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={cancel}
                            className={secondaryButton}>キャンセル</button>
                        <button ref={applyButton} type="button" onClick={() => {
                            if (state.onApply()) resetSelection();
                        }} disabled={!dirty || conflict || hasSelection}
                            className="min-h-11 rounded-lg bg-gray-900 px-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:bg-gray-200 disabled:text-gray-600">変更を適用</button>
                    </div>
                    <p className="text-xs leading-5 text-gray-700">この設定はログイン不要で、このブラウザ内だけに保存されます。</p>
                </div>
                <div data-allergen-preference-list className="min-w-0 space-y-3 @min-[48rem]:col-start-1 @min-[48rem]:row-start-2">
                    {groups.map(({ name, items }) => <section key={name} aria-label={name} className="border-t border-gray-200 pt-2">
                        <h3 className="mb-2 text-sm font-bold text-gray-700">{name}</h3>
                        <div className="flex flex-wrap gap-1.5">
                            {items.map(({ slug, nameJa }) => {
                                const mode = getAllergenPreferenceMode(draft, slug);
                                const pressed = selectedSlugs.includes(slug);
                                const modeId = id + "-mode-" + slug;
                                return <button key={slug} type="button" aria-label={nameJa} aria-pressed={pressed}
                                    aria-describedby={modeId} data-preference-mode={mode}
                                    onClick={() => toggleSelection(slug)}
                                    className={"flex min-h-11 min-w-12 max-w-full items-center gap-1 rounded-lg border px-2 text-left text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 "
                                        + (pressed ? "border-gray-900 bg-gray-900 text-white focus-visible:outline-gray-900" : itemColors[mode])}>
                                    {pressed && <span aria-hidden="true">✓</span>}
                                    <span className="break-words">{nameJa}</span>
                                    <span id={modeId} className={mode === "none" ? "sr-only" : "shrink-0 rounded px-1 text-xs " + badgeColors[mode]}>{modeLabel[mode]}</span>
                                </button>;
                            })}
                        </div>
                    </section>)}
                    {groups.length === 0 && <p role="status" className="text-sm text-gray-700">一致する項目がありません。</p>}
                </div>
            </div>
    );

    return (
        <section aria-label={dialogTitle}
            className={"min-w-0 rounded-2xl border border-gray-200 bg-white shadow-sm " + className}>
            <button ref={trigger} type="button" onClick={state.onOpen} aria-haspopup="dialog" aria-expanded={state.isOpen}
                aria-controls={id + "-dialog"}
                className="flex min-h-11 w-full scroll-mt-32 flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-left focus-visible:outline-2 sm:p-5 lg:scroll-mt-16">
                <span className="min-w-0">
                    <span className="block text-base font-bold text-gray-900">{dialogTitle}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5 break-words text-sm leading-6 text-gray-700">
                        {saved.selectedSlugs.length === 0 ? "未設定" : <>
                            {saved.highlightSlugs.length > 0 && <span className={"rounded-md px-1.5 " + badgeColors.highlight}>注目：{names(saved.highlightSlugs)}</span>}
                            {saved.excludedSlugs.length > 0 && <span className={"rounded-md px-1.5 " + badgeColors.exclude}>除外：{names(saved.excludedSlugs)}</span>}
                        </>}
                    </span>
                </span>
                <span className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-sm font-bold text-white">設定を開く</span>
            </button>
            {!state.isOpen && state.message && <p role="status" className="mx-4 mb-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-900">{state.message}</p>}
            <dialog ref={dialog} id={id + "-dialog"} aria-labelledby={id + "-title"} data-allergen-preference-dialog
                onCancel={(event) => { event.preventDefault(); cancel(); }}
                className="fixed inset-0 m-auto hidden h-dvh max-h-dvh w-full max-w-none flex-col overflow-hidden bg-white text-gray-900 open:flex backdrop:bg-gray-950/65 sm:h-auto sm:max-h-[calc(100dvh_-_3rem)] sm:w-[calc(100%_-_3rem)] sm:max-w-[1060px] sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-xl">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-2 sm:px-5">
                    <h2 id={id + "-title"} className="text-base font-bold">{dialogTitle}</h2>
                    <button type="button" aria-label="設定を閉じる" onClick={cancel}
                        className="min-h-11 min-w-11 rounded-lg text-2xl focus-visible:outline-2">×</button>
                </div>
                <div className="@container min-h-0 overflow-y-auto overscroll-contain">
                    {editor}
                </div>
            </dialog>
        </section>
    );
}

export default function UserAllergenPreferenceClient({ allergens }: { allergens: UserAllergenPreferenceAllergen[] }) {
    const state = useUserAllergenPreferenceState();
    return <UserAllergenPreferencePanel allergens={allergens} state={state} />;
}
