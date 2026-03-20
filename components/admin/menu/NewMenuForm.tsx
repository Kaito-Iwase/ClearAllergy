"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { type AllergenStatus } from "@/lib/allergens";
import { createMenuButtonClassName } from "@/components/admin/menu/CreateMenuButton";

type Allergen = {
    slug: string;
    nameJa: string;
    nameEn: string;
    sortOrder: number;
};

type CreateMenuResponse = { id: string } | { error: string; message?: string };

type UploadResponse = {
    url?: string;
    pathname?: string;
    error?: string;
};

export default function NewMenuForm({ allergens }: { allergens: Allergen[] }) {
    const router = useRouter();
    const [name, setName] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [priceYenInput, setPriceYenInput] = React.useState("");
    const [category, setCategory] = React.useState("");
    const [ingredients, setIngredients] = React.useState("");
    const [precaution, setPrecaution] = React.useState("");
    const [imageUrl, setImageUrl] = React.useState("");
    const [isPublished, setIsPublished] = React.useState(false);
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = React.useState<string | null>(
        null,
    );
    const [statusBySlug, setStatusBySlug] = React.useState<
        Record<string, AllergenStatus>
    >(() =>
        Object.fromEntries(allergens.map((allergen) => [allergen.slug, "FREE"])),
    );
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        return () => {
            if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
            }
        };
    }, [localPreviewUrl]);

    function normalizeOptionalText(value: string): string | null {
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
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

    function setOne(slug: string, status: AllergenStatus) {
        setStatusBySlug((prev) => ({ ...prev, [slug]: status }));
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

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);

        const trimmed = name.trim();
        if (!trimmed) {
            setError("名前は必須です。");
            return;
        }

        setIsSubmitting(true);

        try {
            const priceYen = buildPriceYen();
            const uploadedImageUrl = await uploadSelectedImage();

            const body = {
                name: trimmed,
                description: normalizeOptionalText(description),
                priceYen,
                category: normalizeOptionalText(category),
                ingredients: normalizeOptionalText(ingredients),
                precaution: normalizeOptionalText(precaution),
                isPublished,
                imageUrl: uploadedImageUrl,
                allergenStatusBySlug: statusBySlug,
            };

            const res = await fetch("/api/admin/menus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = (await res
                .json()
                .catch(() => ({}))) as CreateMenuResponse;

            if (!res.ok) {
                const msg =
                    "error" in data
                        ? data.error + (data.message ? `: ${data.message}` : "")
                        : `作成に失敗しました（status: ${res.status}）`;
                setError(msg);
                return;
            }

            if (!("id" in data)) {
                setError(
                    "作成は成功したはずですが、idが返ってきませんでした。",
                );
                return;
            }

            router.push(`/admin/menus/${data.id}/edit`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(`予期せぬエラー: ${msg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={onSubmit} className="space-y-6">
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                </div>
            )}

            <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-bold text-gray-900">基本情報</div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setIsPublished((prev) => !prev)}
                            disabled={isSubmitting || uploading}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                                isPublished ? "bg-green-600" : "bg-gray-900"
                            }`}
                        >
                            {isPublished ? "公開中" : "非公開"}
                        </button>

                        <button
                            type="submit"
                            disabled={isSubmitting || uploading}
                            className={createMenuButtonClassName}
                        >
                            {isSubmitting
                                ? "作成中..."
                                : uploading
                                  ? "画像アップロード中..."
                                  : "＋ 作成して編集へ"}
                        </button>

                        <button
                            type="button"
                            onClick={() => router.push("/admin/menus")}
                            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                            一覧に戻る
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            メニュー名
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                            placeholder="例：季節の野菜カレー"
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
                            作成時に画像をアップロードしてURLを保存します。
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
                    各品目について「含む / 含まない / 含む可能性があります」を選択してください。
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {allergens.map((allergen) => {
                        const current = statusBySlug[allergen.slug] ?? "FREE";

                        return (
                            <div
                                key={allergen.slug}
                                className="rounded-2xl border border-gray-200 p-4"
                            >
                                <div className="mb-3">
                                    <div className="font-semibold text-gray-900">
                                        {allergen.nameJa}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {allergen.nameEn}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setOne(allergen.slug, "CONTAINS")
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
                                        onClick={() =>
                                            setOne(allergen.slug, "FREE")
                                        }
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
                                            setOne(
                                                allergen.slug,
                                                "MAY_CONTAIN",
                                            )
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
            </div>
        </form>
    );
}
