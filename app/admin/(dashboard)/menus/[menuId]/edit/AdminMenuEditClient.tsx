"use client";

import React from "react";

type Status = "FREE" | "MAY_CONTAIN" | "CONTAINS";

type Allergen = {
    slug: string;
    nameJa: string;
    nameEn: string;
    sortOrder: number;
};

export default function AdminMenuEditClient(props: {
    menuId: string;
    initialName: string;
    initialIsPublished: boolean;
    allergens: Allergen[];
    initialStatusBySlug: Record<string, Status>;
}) {
    const {
        menuId,
        initialName,
        initialIsPublished,
        allergens,
        initialStatusBySlug,
    } = props;

    const [name, setName] = React.useState(initialName);
    const [isPublished, setIsPublished] = React.useState(initialIsPublished);
    const [statusBySlug, setStatusBySlug] =
        React.useState<Record<string, Status>>(initialStatusBySlug);

    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [saved, setSaved] = React.useState(false);

    function setOne(slug: string, status: Status) {
        setStatusBySlug((prev) => ({ ...prev, [slug]: status }));
    }

    async function onSave() {
        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            const body = {
                name,
                isPublished,
                allergenStatusBySlug: statusBySlug,
            };

            const res = await fetch(`/api/admin/menus/${menuId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`保存に失敗: ${res.status} ${text}`);
            }

            setSaved(true);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-gray-900">基本情報</div>
                    <button
                        onClick={onSave}
                        disabled={saving}
                        className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                        {saving ? "保存中..." : "保存する"}
                    </button>
                </div>

                {error && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {error}
                    </div>
                )}

                {saved && (
                    <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                        保存しました
                    </div>
                )}

                <div className="mt-4">
                    <label className="text-sm font-medium text-gray-700">
                        メニュー名
                    </label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                    />
                </div>

                <div className="mt-4 flex items-center gap-2">
                    <input
                        id="pub"
                        type="checkbox"
                        checked={isPublished}
                        onChange={(e) => setIsPublished(e.target.checked)}
                    />
                    <label htmlFor="pub" className="text-sm text-gray-700">
                        公開する
                    </label>
                </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="font-bold text-gray-900">
                    アレルゲン（28品目）
                </div>
                <p className="mt-1 text-sm text-gray-600">
                    「含まない / 注意 / 含む」を選んでください。
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {allergens.map((a) => {
                        const current = statusBySlug[a.slug] ?? "FREE";

                        return (
                            <div
                                key={a.slug}
                                className="rounded-xl border border-gray-100 px-4 py-3"
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="font-medium text-gray-900">
                                            {a.nameJa}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {a.nameEn}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 sm:justify-end">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setOne(a.slug, "FREE")
                                            }
                                            className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                                                current === "FREE"
                                                    ? "bg-gray-900 text-white"
                                                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                                            }`}
                                        >
                                            含まない
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setOne(a.slug, "MAY_CONTAIN")
                                            }
                                            className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                                                current === "MAY_CONTAIN"
                                                    ? "bg-amber-500 text-white"
                                                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                                            }`}
                                        >
                                            注意
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setOne(a.slug, "CONTAINS")
                                            }
                                            className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                                                current === "CONTAINS"
                                                    ? "bg-red-600 text-white"
                                                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                                            }`}
                                        >
                                            含む
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
                    免責：調理過程での微量混入（コンタミネーション）の可能性を完全に否定するものではありません。
                </div>
            </div>
        </div>
    );
}
