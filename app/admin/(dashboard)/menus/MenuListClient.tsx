"use client";

// app/(admin)/admin/menus/MenuListClient.tsx
// 役割：検索・削除・表示（Client）

import Link from "next/link";
import { useMemo, useState } from "react";

type MenuRow = {
    id: string;
    name: string;
    isPublished: boolean;
    updatedAt: string; // ISO文字列
};

export default function MenuListClient({
    initialMenus,
}: {
    initialMenus: MenuRow[];
}) {
    // 1) 表示用メニュー一覧（削除したらここから消す）
    const [menus, setMenus] = useState<MenuRow[]>(initialMenus);

    // 2) 検索文字列
    const [q, setQ] = useState("");

    // 3) エラー表示
    const [error, setError] = useState<string | null>(null);

    // 4) 検索（名前の部分一致）
    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return menus;

        return menus.filter((m) => m.name.toLowerCase().includes(needle));
    }, [menus, q]);

    // 5) 削除処理
    const onDelete = async (menuId: string, menuName: string) => {
        // 6) エラーをクリア
        setError(null);

        // 7) 確認（誤削除防止）
        const ok = window.confirm(
            `「${menuName}」を削除します。よろしいですか？`,
        );
        if (!ok) return;

        // 8) DELETE APIを叩く（Cookieはブラウザが自動で付ける）
        const res = await fetch(`/api/admin/menus/${menuId}`, {
            method: "DELETE",
        });

        // 9) 失敗時：レスポンスを読みつつエラー表示
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(
                `削除に失敗しました（status: ${res.status}）: ${JSON.stringify(
                    data,
                )}`,
            );
            return;
        }

        // 10) 成功時：一覧から除外（即反映）
        setMenus((prev) => prev.filter((m) => m.id !== menuId));
    };

    return (
        <div className="space-y-4">
            {/* 11) エラー表示 */}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 12) 検索バー */}
            <div className="flex items-center gap-3">
                <input
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                    placeholder="検索（メニュー名）"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <div className="text-sm text-gray-600">
                    {filtered.length} 件
                </div>
            </div>

            {/* 13) 一覧 */}
            <div className="grid gap-3">
                {filtered.map((m) => (
                    <div
                        key={m.id}
                        className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-lg font-semibold text-gray-900 truncate">
                                    {m.name}
                                </div>
                                <div className="mt-1 text-sm text-gray-600">
                                    {m.isPublished ? "公開" : "非公開"} / 更新:{" "}
                                    {new Date(m.updatedAt).toLocaleString(
                                        "ja-JP",
                                    )}
                                </div>
                            </div>

                            <div className="flex shrink-0 gap-2">
                                <Link
                                    href={`/admin/menus/${m.id}/edit`}
                                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                                >
                                    編集
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => onDelete(m.id, m.name)}
                                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
                                >
                                    削除
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 14) 0件表示 */}
            {filtered.length === 0 && (
                <div className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-600">
                    該当するメニューがありません
                </div>
            )}
        </div>
    );
}
