"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { type AllergenStatus } from "@/lib/allergens";

type Allergen = {
    slug: string;
    nameJa: string;
    nameEn: string;
    sortOrder: number;
};

type CreateMenuResponse = {
    id?: string;
    error?: string;
};

type UploadResponse = {
    url?: string;
    pathname?: string;
    error?: string;
};

export default function MenuEditClient(props: {
    menuId: string;
    initialName: string;
    initialDescription: string | null;
    initialPriceYen: number | null;
    initialCategory: string | null;
    initialIngredients: string | null;
    initialPrecaution: string | null;
    initialImageUrl: string | null;
    initialIsPublished: boolean;
    allergens: Allergen[];
    initialStatusBySlug: Record<string, AllergenStatus>;
}) {
    const router = useRouter();

    const {
        menuId,
        initialName,
        initialDescription,
        initialPriceYen,
        initialCategory,
        initialIngredients,
        initialPrecaution,
        initialImageUrl,
        initialIsPublished,
        allergens,
        initialStatusBySlug,
    } = props;

    const [name, setName] = React.useState(initialName);
    const [description, setDescription] = React.useState(
        initialDescription ?? "",
    );
    const [category, setCategory] = React.useState(initialCategory ?? "");
    const [ingredients, setIngredients] = React.useState(
        initialIngredients ?? "",
    );
    const [precaution, setPrecaution] = React.useState(initialPrecaution ?? "");
    const [imageUrl, setImageUrl] = React.useState(initialImageUrl ?? "");

    const [priceYenInput, setPriceYenInput] = React.useState(
        initialPriceYen === null ? "" : String(initialPriceYen),
    );

    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = React.useState<string | null>(
        null,
    );

    const [isPublished, setIsPublished] = React.useState(initialIsPublished);
    const [statusBySlug, setStatusBySlug] =
        React.useState<Record<string, AllergenStatus>>(initialStatusBySlug);

    const [saving, setSaving] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [saved, setSaved] = React.useState(false);

    React.useEffect(() => {
        return () => {
            if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
            }
        };
    }, [localPreviewUrl]);

    function setOne(slug: string, status: AllergenStatus) {
        setStatusBySlug((prev) => ({ ...prev, [slug]: status }));
    }

    function buildPriceYen(): number | null {
        const trimmed = priceYenInput.trim();

        if (trimmed === "") {
            return null;
        }

        const parsed = Number(trimmed);

        if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
            throw new Error("価格は数字で入力してください。");
        }

        if (!Number.isInteger(parsed)) {
            throw new Error("価格は整数（円）で入力してください。");
        }

        if (parsed < 0) {
            throw new Error("価格は0円以上で入力してください。");
        }

        return parsed;
    }

    function normalizeOptionalText(value: string): string | null {
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
    }

    function onSelectImage(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        if (!file.type.startsWith("image/")) {
            setError("画像ファイルを選択してください。");
            return;
        }

        if (localPreviewUrl) {
            URL.revokeObjectURL(localPreviewUrl);
        }

        const previewUrl = URL.createObjectURL(file);
        setSelectedFile(file);
        setLocalPreviewUrl(previewUrl);
        setError(null);
    }

    async function uploadSelectedImage(): Promise<string | null> {
        if (!selectedFile) {
            return normalizeOptionalText(imageUrl);
        }

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            const res = await fetch("/api/admin/upload-menu-image", {
                method: "POST",
                body: formData,
            });

            const data = (await res
                .json()
                .catch(() => null)) as UploadResponse | null;

            if (!res.ok || !data?.url) {
                throw new Error(
                    data?.error ?? "画像アップロードに失敗しました。",
                );
            }

            setImageUrl(data.url);
            return data.url;
        } finally {
            setUploading(false);
        }
    }

    async function onSave() {
        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            const trimmedName = name.trim();
            if (!trimmedName) {
                throw new Error("メニュー名は必須です。");
            }

            const priceYen = buildPriceYen();
            const uploadedImageUrl = await uploadSelectedImage();

            const body = {
                name: trimmedName,
                description: normalizeOptionalText(description),
                priceYen,
                category: normalizeOptionalText(category),
                ingredients: normalizeOptionalText(ingredients),
                precaution: normalizeOptionalText(precaution),
                imageUrl: uploadedImageUrl,
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
            setSelectedFile(null);
            router.refresh();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        } finally {
            setSaving(false);
        }
    }

    async function handleCreateMenu() {
        setCreating(true);
        setError(null);
        setSaved(false);

        try {
            const res = await fetch("/api/admin/menus", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });

            const data = (await res
                .json()
                .catch(() => null)) as CreateMenuResponse | null;

            if (!res.ok || !data?.id) {
                throw new Error(
                    data?.error ?? "新規メニューの作成に失敗しました。",
                );
            }

            router.push(`/admin/menus/${data.id}/edit`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        } finally {
            setCreating(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-bold text-gray-900">基本情報</div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleCreateMenu}
                            disabled={creating || saving || uploading}
                            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                            {creating ? "作成中..." : "＋ 新しいメニューを作る"}
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsPublished((prev) => !prev)}
                            disabled={creating || saving || uploading}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                                isPublished ? "bg-green-600" : "bg-gray-900"
                            }`}
                        >
                            {isPublished ? "公開中" : "非公開"}
                        </button>

                        <button
                            type="button"
                            onClick={onSave}
                            disabled={saving || creating || uploading}
                            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                            {saving
                                ? "保存中..."
                                : uploading
                                  ? "画像アップロード中..."
                                  : "保存する"}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {error}
                    </div>
                )}

                {saved && (
                    <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                        保存しました。
                    </div>
                )}

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            メニュー名
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                            placeholder="例：米粉パンケーキ"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            価格（税込・円）
                        </label>
                        <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={priceYenInput}
                            onChange={(e) => setPriceYenInput(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                            placeholder="例：1200"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            未入力なら価格なしとして保存します。
                        </p>
                    </div>
                </div>

                <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                        説明
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                        placeholder="例：米粉を使ったふわふわ食感のパンケーキです。"
                    />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            カテゴリ
                        </label>
                        <input
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                            placeholder="例：デザート"
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                        🧺 原材料名
                    </label>
                    <textarea
                        value={ingredients}
                        onChange={(e) => setIngredients(e.target.value)}
                        rows={5}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                        placeholder="例：小麦粉、卵、牛乳、砂糖、バター"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        パッケージやレシピに基づく原材料名を入力します。
                    </p>
                </div>

                <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                        注意書き
                    </label>
                    <textarea
                        value={precaution}
                        onChange={(e) => setPrecaution(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                        placeholder="例：同一厨房でえび・かに・卵を扱っています。"
                    />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            食品画像ファイル
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={onSelectImage}
                            className="block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:font-semibold file:text-gray-700"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            保存時に画像をアップロードしてURLを保存します。
                        </p>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            画像URL
                        </label>
                        <input
                            type="url"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                            placeholder="アップロード後に自動入力されます"
                        />
                    </div>
                </div>

                {(localPreviewUrl || imageUrl.trim()) && (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                        <img
                            src={localPreviewUrl || imageUrl.trim()}
                            alt="メニュー画像プレビュー"
                            className="h-56 w-full object-cover"
                        />
                    </div>
                )}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="font-bold text-gray-900">アレルゲン28品目</div>
                <p className="mt-1 text-sm text-gray-600">
                    各品目について「含む / 含まない /
                    含む可能性があります」を選択してください。
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {allergens.map((a) => {
                        const current = statusBySlug[a.slug] ?? "FREE";

                        return (
                            <div
                                key={a.slug}
                                className="rounded-2xl border border-gray-200 p-4"
                            >
                                <div className="mb-3">
                                    <div className="font-semibold text-gray-900">
                                        {a.nameJa}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {a.nameEn}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setOne(a.slug, "CONTAINS")
                                        }
                                        className={`rounded-xl px-3 py-2 text-sm font-medium ${
                                            current === "CONTAINS"
                                                ? "bg-red-600 text-white"
                                                : "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        含む
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setOne(a.slug, "FREE")}
                                        className={`rounded-xl px-3 py-2 text-sm font-medium ${
                                            current === "FREE"
                                                ? "bg-green-600 text-white"
                                                : "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        含まない
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setOne(a.slug, "MAY_CONTAIN")
                                        }
                                        className={`rounded-xl px-3 py-2 text-sm font-medium ${
                                            current === "MAY_CONTAIN"
                                                ? "bg-yellow-500 text-white"
                                                : "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        含む可能性があります
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5">
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving || creating || uploading}
                        className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                        {saving
                            ? "保存中..."
                            : uploading
                              ? "画像アップロード中..."
                              : "この内容で保存する"}
                    </button>
                </div>
            </div>
        </div>
    );
}
