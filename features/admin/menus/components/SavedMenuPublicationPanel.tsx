"use client";

import React from "react";
import type { SavedMenu } from "../schemas/menu-response";
import { hasUnresolvedFoodIssue } from "../food-review";

const buttonClass = "min-h-11 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-60";

export default function SavedMenuPublicationPanel({ menu, loading, error, busy, blocked = false, savedNow = true, onPublish, onClose, onEdit, onRetry }: {
    menu: SavedMenu | null; loading: boolean; error: string | null; busy: boolean; blocked?: boolean; savedNow?: boolean;
    onPublish: () => void; onClose: () => void; onEdit: (unknown?: boolean) => void; onRetry: () => void;
}) {
    const heading = React.useRef<HTMLHeadingElement>(null);
    const titleId = React.useId();
    React.useEffect(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: "nearest" }); }, []);
    const unknown = menu?.allergens.filter(a => a.status === "UNKNOWN") ?? [];
    const unresolved = menu && hasUnresolvedFoodIssue(menu.foodVersion, menu.foodReviews[0]);
    const canPublish = menu && !menu.isPublished && unknown.length === 0 && !unresolved && !blocked;
    return <section aria-labelledby={titleId} aria-busy={loading || busy}
        onKeyDown={event => { if (event.key === "Escape" && !busy && !loading) { event.preventDefault(); onClose(); } }}
        className="min-w-0 space-y-4 rounded-2xl border border-green-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
            <div><h2 id={titleId} ref={heading} tabIndex={-1} className="text-lg font-bold text-gray-900 outline-none">{savedNow ? "保存しました" : "保存済み内容の確認"}</h2>
                <p className="mt-1 text-sm text-gray-700">{menu?.isPublished ? "現在は公開中です。" : menu ? "現在は非公開です。" : "公開状態を確認しています。"}</p></div>
            <button type="button" aria-label="公開の確認を閉じる" disabled={loading || busy} onClick={onClose} className={`${buttonClass} border border-gray-300 text-gray-700`}>閉じる</button>
        </div>
        {loading && <p role="status" className="text-sm text-gray-700">保存済み内容を読み込んでいます…</p>}
        {error && <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>{error}</p>
            {!menu && <button type="button" disabled={loading || busy} onClick={onRetry} className={`${buttonClass} border border-red-300`}>保存済み内容を再確認する</button>}</div>}
        {menu && <>
            <p className="break-words text-xl font-bold text-gray-900">{menu.name}</p>
            {canPublish && <p className="font-semibold text-gray-900">この内容で公開しますか？</p>}
            <dl className="space-y-3 text-sm">
                {([ ["CONTAINS", "含む"], ["MAY_CONTAIN", "含む可能性あり・要確認"] ] as const).map(([status, label]) => <div key={status} className={`rounded-xl border p-3 ${status === "CONTAINS" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                    <dt className="font-semibold text-gray-900">{label}</dt><dd className="mt-1 break-words text-gray-800">{menu.allergens.filter(a => a.status === status).map(a => a.nameJa).join("、") || "該当する登録なし"}</dd>
                </div>)}
                <div><dt className="font-semibold text-gray-900">店舗の注意書き</dt><dd className="mt-1 whitespace-pre-wrap break-words text-gray-800">{menu.precaution || "記載なし"}</dd></div>
            </dl>
            <details className="rounded-xl border border-gray-200 p-3 text-sm text-gray-800"><summary className="min-h-11 cursor-pointer py-2 font-semibold focus-visible:outline-2 focus-visible:outline-green-700">その他の登録内容・全{menu.allergens.length}品目</summary>
                <dl className="space-y-2"><div><dt className="font-semibold">原材料名</dt><dd className="whitespace-pre-wrap break-words">{menu.ingredients || "記載なし"}</dd></div>
                    <div><dt className="font-semibold">説明</dt><dd className="whitespace-pre-wrap break-words">{menu.description || "記載なし"}</dd></div>
                    <div><dt className="font-semibold">カテゴリ・価格</dt><dd>{menu.category || "未登録"} / {menu.priceYen === null ? "価格未登録" : `${menu.priceYen}円`}</dd></div></dl>
                <ul className="mt-3 space-y-2">{menu.allergens.map(a => <li key={a.slug} className="break-words">{a.nameJa}：{{ CONTAINS: "含む", MAY_CONTAIN: "含む可能性あり・要確認", FREE: "原材料に含まない登録", UNKNOWN: "未設定" }[a.status]}</li>)}</ul>
            </details>
            {unknown.length > 0 && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">未設定が{unknown.length}品目あるため公開できません。</p><p className="mt-1 break-words">{unknown.map(a => a.nameJa).join("、")}</p><p className="mt-1">非公開で保存されています。各品目を確認して入力し、もう一度保存してください。</p></div>}
            {unresolved && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">保存済みの未解決事項があるため公開できません。</p><p className="whitespace-pre-wrap break-words">{menu.foodReviews[0]?.unresolvedIssues}</p><p>内容を修正するか、編集画面で対応後の解消操作を行ってください。</p></div>}
            <p className="text-xs text-gray-600">登録内容の確認です。公開や「原材料に含まない登録」は、摂取の安全性や混入がないことの保証ではありません。</p>
        </>}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
            {canPublish && <button type="button" disabled={busy || loading} onClick={onPublish} className={`${buttonClass} bg-green-600 text-white`}>{busy ? "公開処理中…" : "この内容で公開"}</button>}
            {unknown.length > 0 && <button type="button" disabled={busy || loading} onClick={() => onEdit(true)} className={`${buttonClass} bg-green-600 text-white`}>未設定項目を入力する</button>}
            <div><button type="button" disabled={busy || loading} onClick={onClose} className={`${buttonClass} w-full border border-gray-300 text-gray-800`}>保存</button><p className="mt-1 text-xs text-gray-600">{menu?.isPublished ? "保存済み内容の確認を終了します" : "公開せずに保存します"}</p></div>
            {menu && <button type="button" disabled={busy || loading} onClick={() => onEdit(false)} className={`${buttonClass} text-green-800 underline`}>内容を修正</button>}
        </div>
    </section>;
}
