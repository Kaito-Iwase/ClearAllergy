"use client";

// Server Component から受け取った initialMenus をもとに、検索と削除だけを画面上で扱います。
// Client Component なのは、入力 state と削除ボタンのイベント処理が必要だからです。

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { getApiErrorMessage } from "@/lib/utils/api-error-message";

const DELETE_ERROR_MESSAGE =
    "削除に失敗しました。時間をおいてもう一度お試しください。";

type MenuRow = {
    id: string;
    name: string;
    category: string | null;
    priceYen: number | null;
    imageUrl: string | null;
    isPublished: boolean;
    updatedAt: string;
    unknownAllergenNames: string[];
};

type FilterKey = "all" | "published" | "draft" | "needsAllergen";

function formatUpdatedAt(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "更新日時不明";
    }

    return new Intl.DateTimeFormat("ja-JP", {
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
    initialMenus: MenuRow[];
    totalAllergenCount: number;
    readOnly?: boolean;
    readOnlyEditHrefBase?: string;
}) {
    const [menus, setMenus] = useState<MenuRow[]>(initialMenus);
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState<FilterKey>("all");
    const [error, setError] = useState<string | null>(null);

    const stats = useMemo(() => {
        const needsAllergenCount = menus.filter(
            (menu) => menu.unknownAllergenNames.length > 0,
        ).length;

        return {
            total: menus.length,
            published: menus.filter((menu) => menu.isPublished).length,
            draft: menus.filter((menu) => !menu.isPublished).length,
            needsAllergen: needsAllergenCount,
        };
    }, [menus]);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();

        return menus.filter((menu) => {
            if (filter === "published" && !menu.isPublished) return false;
            if (filter === "draft" && menu.isPublished) return false;
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

    const onDelete = async (menuId: string, menuName: string) => {
        setError(null);

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

        const res = await fetch(`/api/admin/menus/${menuId}`, {
            method: "DELETE",
        });

        if (!res.ok) {
            setError(await getApiErrorMessage(res, DELETE_ERROR_MESSAGE));
            return;
        }

        setMenus((prev) => prev.filter((menu) => menu.id !== menuId));
    };

    const filterItems: Array<{
        key: FilterKey;
        label: string;
        count: number;
    }> = [
        { key: "all", label: "すべて", count: stats.total },
        { key: "published", label: "公開中", count: stats.published },
        { key: "draft", label: "下書き", count: stats.draft },
        {
            key: "needsAllergen",
            label: "未設定あり",
            count: stats.needsAllergen,
        },
    ];

    return (
        <div className="space-y-5">
            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
                                未設定が残っているメニューは、カード内に注意表示します。編集画面でアレルゲン{totalAllergenCount}品目を設定すると公開準備が完了します。
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <div className="relative">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-400">
                        search
                    </span>
                    <input
                        className="h-12 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none transition focus:border-[#0f4c2f] focus:bg-white focus:ring-2 focus:ring-[#0f4c2f]/10"
                        placeholder="検索（メニュー名・カテゴリ・未設定アレルゲン）"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                    {filterItems.map((item) => {
                        const selected = filter === item.key;

                        return (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setFilter(item.key)}
                                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
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

                <div className="text-xs font-medium text-gray-500">
                    表示中 {filtered.length} 件 / 全 {stats.total} 件
                </div>
            </div>

            <div className="grid gap-3">
                {filtered.map((menu) => {
                    const unknownCount = menu.unknownAllergenNames.length;
                    const hasUnknown = unknownCount > 0;
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
                                hasUnknown
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
                                            {menu.isPublished ? "公開中" : "下書き"}
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
                                                    : `アレルゲン${totalAllergenCount}品目を設定すると公開準備が完了します。`}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                    {readOnly && !readOnlyEditHrefBase ? (
                                        <span
                                            className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-1 rounded-lg bg-gray-100 px-3 text-sm font-bold text-gray-500 opacity-70"
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
                                            className={`inline-flex h-10 items-center justify-center gap-1 rounded-lg px-3 text-sm font-bold transition ${
                                                hasUnknown
                                                    ? "bg-amber-600 text-white hover:bg-amber-700"
                                                    : "bg-[#0f4c2f] text-white hover:bg-[#0b3d25]"
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">
                                                {hasUnknown
                                                    ? "notification_important"
                                                    : "edit"}
                                            </span>
                                            {hasUnknown ? "アレルゲン設定" : "編集"}
                                        </Link>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() =>
                                            onDelete(menu.id, menu.name)
                                        }
                                        disabled={readOnly}
                                        className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label={`${menu.name}を削除`}
                                    >
                                        <span className="material-symbols-outlined text-[20px]">
                                            delete
                                        </span>
                                        <span className="ml-1 sm:sr-only">
                                            削除
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
