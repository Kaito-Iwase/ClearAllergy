"use client";

// Server Componentから受け取った一覧を検索し、公開停止と削除の確定応答を反映します。

import Link from "next/link";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { getApiErrorMessage } from "@/lib/utils/api-error-message";
import { menuFoodReviewText, type AdminMenuListRow } from "../menu-list";

const DELETE_ERROR_MESSAGE =
    "削除結果を確認できません。メニュー一覧を再読み込みして確認してください。";

type FilterKey = "all" | "published" | "draft" | "needsAllergen" | "needsFoodReview";

function formatUpdatedAt(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "更新日時不明";
    }

    return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function formatPrice(priceYen: number | null) {
    if (priceYen === null) return "価格未設定";

    return new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0,
    }).format(priceYen);
}

function buildUnknownPreview(names: string[]) {
    if (names.length === 0) return null;

    const shownNames = names.slice(0, 3).join("・");
    const restCount = names.length - 3;

    return restCount > 0 ? `${shownNames} ほか${restCount}件` : shownNames;
}

export default function MenuListPageClient({
    initialMenus,
    totalAllergenCount,
    readOnly = false,
    readOnlyEditHrefBase,
}: {
    initialMenus: AdminMenuListRow[];
    totalAllergenCount: number;
    readOnly?: boolean;
    readOnlyEditHrefBase?: string;
}) {
    const [menus, setMenus] = useState<AdminMenuListRow[]>(initialMenus);
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState<FilterKey>("all");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [stoppingMenuId, setStoppingMenuId] = useState<string | null>(null);
    const [deletingMenuId, setDeletingMenuId] = useState<string | null>(null);
    const deleting = useRef(false);

    const stats = useMemo(() => {
        const needsAllergenCount = menus.filter(
            (menu) => menu.unknownAllergenNames.length > 0,
        ).length;

        return {
            total: menus.length,
            published: menus.filter((menu) => menu.isPublished).length,
            draft: menus.filter((menu) => !menu.isPublished).length,
            needsAllergen: needsAllergenCount,
            needsFoodReview: menus.filter((menu) => menu.foodReviewState !== "current").length,
        };
    }, [menus]);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();

        return menus.filter((menu) => {
            if (filter === "published" && !menu.isPublished) return false;
            if (filter === "draft" && menu.isPublished) return false;
            if (filter === "needsFoodReview" && menu.foodReviewState === "current") return false;
            if (
                filter === "needsAllergen" &&
                menu.unknownAllergenNames.length === 0
            ) {
                return false;
            }

            if (!needle) return true;

            const searchableText = [
                menu.name,
                menu.category ?? "",
                ...menu.unknownAllergenNames,
            ]
                .join(" ")
                .toLowerCase();

            return searchableText.includes(needle);
        });
    }, [menus, q, filter]);

    const onDelete = async (menuId: string, menuName: string, version?: number) => {
        if (deleting.current) return;
        setError(null);
        setNotice(null);

        if (readOnly) {
            setError(
                "ポートフォリオ公開版のため、メニュー削除はできません。",
            );
            return;
        }

        // 取り消し不能な操作なので、まずブラウザ確認ダイアログを出します。
        const ok = window.confirm(
            `「${menuName}」を削除します。よろしいですか？`,
        );
        if (!ok) return;

        deleting.current = true;
        setDeletingMenuId(menuId);
        try {
            const res = await fetch(`/api/admin/menus/${menuId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expectedVersion: version }),
            });

            if (!res.ok) {
                setError(await getApiErrorMessage(res, DELETE_ERROR_MESSAGE));
                return;
            }

            const result = await res.json().catch(() => null);
            if (result?.ok !== true) { setError(DELETE_ERROR_MESSAGE); return; }
            setMenus((prev) => prev.filter((menu) => menu.id !== menuId));
            if (result.publicRefreshPending) setError("削除は保存されましたが、公開ページの反映は未確認です。");
        } catch {
            setError(DELETE_ERROR_MESSAGE);
        } finally {
            deleting.current = false;
            setDeletingMenuId(null);
        }
    };

    const onStop = async (menuId: string, menuName: string) => {
        if (readOnly || deleting.current) return;
        deleting.current = true;
        setStoppingMenuId(menuId);
        setError(null);
        setNotice(null);
        const unknownResult = "公開停止の結果を確認できません。一覧を再読み込みして確認してください。";
        try {
            const res = await fetch(`/api/admin/menus/${menuId}/stop`, { method: "POST" });
            if (!res.ok) {
                setError(await getApiErrorMessage(res, unknownResult));
                return;
            }
            const result = await res.json().catch(() => null);
            if (result?.ok !== true || result.menu?.id !== menuId || result.menu?.isPublished !== false || !Number.isSafeInteger(result.menu?.version) || result.menu.version < 0) {
                setError(unknownResult);
                return;
            }
            // STOP acknowledges only publication. Do not promote stale content's DELETE version.
            setMenus(prev => prev.map(menu => menu.id === menuId ? { ...menu, isPublished: false } : menu));
            setNotice(`「${menuName}」を非公開にしました。最新の内容は一覧を再読み込みして確認してください。`);
            if (result.publicRefreshPending) setError("非公開化は保存されましたが、公開ページへの反映は未確認です。公開ページを再読み込みして確認してください。");
        } catch {
            setError(unknownResult);
        } finally {
            deleting.current = false;
            setStoppingMenuId(null);
        }
    };

    const filterItems: Array<{
        key: FilterKey;
        label: string;
        count: number;
    }> = [
        { key: "all", label: "すべて", count: stats.total },
        { key: "published", label: "公開中", count: stats.published },
        { key: "draft", label: "非公開", count: stats.draft },
        {
            key: "needsAllergen",
            label: "未設定あり",
            count: stats.needsAllergen,
        },
        { key: "needsFoodReview", label: "公開前の確認待ち", count: stats.needsFoodReview },
    ];

    return (
        <div className="space-y-5">
            {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
            {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {stats.needsAllergen > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <div className="flex gap-3">
                        <span className="material-symbols-outlined mt-0.5 text-[20px] text-amber-700">
                            warning
                        </span>
                        <div>
                            <p className="font-bold">
                                アレルゲン未設定のメニューが {stats.needsAllergen} 件あります
                            </p>
                            <p className="mt-1 leading-6 text-amber-900">
                                未設定が残っているメニューは、カード内に注意表示します。公開にはアレルゲン{totalAllergenCount}品目の設定と、保存済み内容への別の公開操作が必要です。保存済みの未解決事項がある場合は公開できません。
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {stats.needsFoodReview > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-bold">公開前の確認待ちが {stats.needsFoodReview} 件あります</p>
                    <p className="mt-1 leading-6">保存済み内容への公開操作待ちと、保持した記録の未解決事項を含みます。「公開前の確認待ち」で絞り込み、各メニューの編集画面で確認してください。</p>
                </div>
            )}

            <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <div className="relative">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-400">
                        search
                    </span>
                    <input
                        type="search"
                        aria-label="管理メニューを検索"
                        className="h-12 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-3 text-base outline-none transition focus:border-[#0f4c2f] focus:bg-white focus:ring-2 focus:ring-[#0f4c2f]/10 sm:text-sm"
                        placeholder="検索（メニュー名・カテゴリ・未設定アレルゲン）"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:overflow-x-auto sm:pb-1">
                    {filterItems.map((item) => {
                        const selected = filter === item.key;

                        return (
                            <button
                                key={item.key}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setFilter(item.key)}
                                className={`inline-flex min-h-11 w-full shrink-0 items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f4c2f] sm:w-auto sm:rounded-full ${
                                    selected
                                        ? "bg-[#0f4c2f] text-white shadow-sm"
                                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                            >
                                {item.label}
                                <span
                                    className={`rounded-full px-2 py-0.5 text-xs ${
                                        selected
                                            ? "bg-white/20 text-white"
                                            : "bg-white text-gray-600"
                                    }`}
                                >
                                    {item.count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <p className="text-xs leading-5 text-gray-600">公開状態と食品版の対応は別です。公開停止だけでは食品版の対応は失効しません。</p>
                <div role="status" aria-live="polite" className="text-xs font-medium text-gray-500">
                    表示中 {filtered.length} 件 / 全 {stats.total} 件
                </div>
            </div>

            <div className="grid gap-3">
                {filtered.map((menu) => {
                    const unknownCount = menu.unknownAllergenNames.length;
                    const hasUnknown = unknownCount > 0;
                    const needsFoodReview = menu.foodReviewState !== "current";
                    const foodReview = menuFoodReviewText[menu.foodReviewState];
                    const needsAttention = hasUnknown || needsFoodReview;
                    const unknownPreview = buildUnknownPreview(
                        menu.unknownAllergenNames,
                    );
                    const editHref = readOnlyEditHrefBase
                        ? `${readOnlyEditHrefBase}/${menu.id}/edit`
                        : `/admin/menus/${menu.id}/edit`;

                    return (
                        <article
                            key={menu.id}
                            className={`rounded-lg border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${
                                needsAttention
                                    ? "border-amber-200 ring-1 ring-amber-100"
                                    : "border-gray-200"
                            }`}
                        >
                            <div className="grid gap-3 sm:grid-cols-[88px_1fr_auto] sm:items-start">
                                <div className="flex items-start gap-3 sm:block">
                                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-[88px] sm:w-[88px]">
                                        {menu.imageUrl ? (
                                            <Image
                                                src={menu.imageUrl}
                                                alt={`${menu.name}の画像`}
                                                fill
                                                sizes="88px"
                                                className="object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-gray-400">
                                                <span className="material-symbols-outlined text-[32px]">
                                                    restaurant
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0 sm:hidden">
                                        <h2 className="line-clamp-2 text-base font-extrabold leading-6 text-gray-950">
                                            {menu.name}
                                        </h2>
                                        <p className="mt-1 text-sm font-medium text-gray-500">
                                            {menu.category || "カテゴリ未設定"}
                                        </p>
                                    </div>
                                </div>

                                <div className="min-w-0">
                                    <div className="hidden min-w-0 sm:block">
                                        <h2 className="truncate text-lg font-extrabold text-gray-950">
                                            {menu.name}
                                        </h2>
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                                                menu.isPublished
                                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                                    : "bg-gray-100 text-gray-700 ring-1 ring-gray-200"
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[16px]">
                                                {menu.isPublished
                                                    ? "visibility"
                                                    : "draft"}
                                            </span>
                                            {menu.isPublished ? "公開中" : "非公開"}
                                        </span>

                                        {hasUnknown ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                                                <span className="material-symbols-outlined text-[16px]">
                                                    priority_high
                                                </span>
                                                未設定 {unknownCount}件
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-[#ecf7ef] px-2.5 py-1 text-xs font-bold text-[#0f6b3f] ring-1 ring-[#b9e6c6]">
                                                <span className="material-symbols-outlined text-[16px]">
                                                    task_alt
                                                </span>
                                                アレルゲン設定済み
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                                        <span className="hidden sm:inline">
                                            {menu.category || "カテゴリ未設定"}
                                        </span>
                                        <span>{formatPrice(menu.priceYen)}</span>
                                        <span>
                                            更新: {formatUpdatedAt(menu.updatedAt)}
                                        </span>
                                    </div>

                                    {hasUnknown && (
                                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                                            <p className="font-bold">
                                                未設定: {unknownPreview}
                                            </p>
                                            <p className="mt-1 leading-6">
                                                {menu.isPublished
                                                    ? "公開中ですが未設定があります。利用者に正確に伝えるため設定を完了してください。"
                                                : `公開にはアレルゲン${totalAllergenCount}品目の設定と、保存済み内容への別の公開操作が必要です。`}
                                            </p>
                                        </div>
                                    )}

                                    <p className={`mt-2 text-xs font-medium ${needsFoodReview ? "text-amber-900" : "text-gray-600"}`}>{foodReview.label}</p>
                                </div>

                                <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:justify-end">
                                    {readOnly && !readOnlyEditHrefBase ? (
                                        <span
                                            className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-1 rounded-lg bg-gray-100 px-3 text-sm font-bold text-gray-500 opacity-70 sm:w-auto"
                                            aria-disabled="true"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">
                                                visibility
                                            </span>
                                            閲覧専用
                                        </span>
                                    ) : (
                                        <Link
                                            href={editHref}
                                            aria-label={`${menu.name}：${needsFoodReview ? "保存済み内容を見直す" : hasUnknown ? "アレルゲン設定" : "編集"}`}
                                            className={`inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg px-3 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f4c2f] sm:w-auto ${
                                                needsAttention
                                                    ? "bg-amber-600 text-white hover:bg-amber-700"
                                                    : "bg-[#0f4c2f] text-white hover:bg-[#0b3d25]"
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">
                                                {needsAttention
                                                    ? "notification_important"
                                                    : "edit"}
                                            </span>
                                            {needsFoodReview ? "保存済み内容を見直す" : hasUnknown ? "アレルゲン設定" : "編集"}
                                        </Link>
                                    )}

                                    {menu.isPublished && <button
                                        type="button"
                                        onClick={() => onStop(menu.id, menu.name)}
                                        disabled={readOnly || deletingMenuId !== null || stoppingMenuId !== null}
                                        aria-label={`${menu.name}の公開を停止`}
                                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-bold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">visibility_off</span>
                                        {stoppingMenuId === menu.id ? "停止中…" : "公開停止"}
                                    </button>}

                                    <button
                                        type="button"
                                        onClick={() =>
                                            onDelete(menu.id, menu.name, menu.version)
                                        }
                                        disabled={readOnly || deletingMenuId !== null || stoppingMenuId !== null}
                                        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                                        aria-label={`${menu.name}を削除`}
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                                            delete
                                        </span>
                                        <span className="ml-1 sm:sr-only">
                                            {deletingMenuId === menu.id ? "削除中…" : "削除"}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>

            {filtered.length === 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 shadow-sm">
                    <span className="material-symbols-outlined text-[32px] text-gray-300">
                        search_off
                    </span>
                    <p className="mt-2 font-medium">該当するメニューがありません</p>
                </div>
            )}
        </div>
    );
}
