"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type MenuRow = {
    id: string;
    name: string;
    isPublished: boolean;
    updatedAt: string;
};

export default function MenuListClient({
    initialMenus,
}: {
    initialMenus: MenuRow[];
}) {
    const [menus, setMenus] = useState<MenuRow[]>(initialMenus);
    const [q, setQ] = useState("");
    const [error, setError] = useState<string | null>(null);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return menus;

        return menus.filter((menu) =>
            menu.name.toLowerCase().includes(needle),
        );
    }, [menus, q]);

    const onDelete = async (menuId: string, menuName: string) => {
        setError(null);

        const ok = window.confirm(
            `「${menuName}」を削除します。よろしいですか？`,
        );
        if (!ok) return;

        const res = await fetch(`/api/admin/menus/${menuId}`, {
            method: "DELETE",
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(
                `削除に失敗しました（status: ${res.status}）: ${JSON.stringify(
                    data,
                )}`,
            );
            return;
        }

        setMenus((prev) => prev.filter((menu) => menu.id !== menuId));
    };

    return (
        <div className="space-y-4">
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="flex items-center gap-3">
                <input
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                    placeholder="検索（メニュー名）"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <div className="text-sm text-gray-600">{filtered.length} 件</div>
            </div>

            <div className="grid gap-3">
                {filtered.map((menu) => (
                    <div
                        key={menu.id}
                        className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="truncate text-lg font-semibold text-gray-900">
                                    {menu.name}
                                </div>
                                <div className="mt-1 text-sm text-gray-600">
                                    {menu.isPublished ? "公開" : "非公開"} / 更新:{" "}
                                    {new Date(menu.updatedAt).toLocaleString(
                                        "ja-JP",
                                    )}
                                </div>
                            </div>

                            <div className="flex shrink-0 gap-2">
                                <Link
                                    href={`/admin/menus/${menu.id}/edit`}
                                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                                >
                                    編集
                                </Link>

                                <button
                                    type="button"
                                    onClick={() =>
                                        onDelete(menu.id, menu.name)
                                    }
                                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
                                >
                                    削除
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <div className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-600">
                    該当するメニューがありません
                </div>
            )}
        </div>
    );
}
