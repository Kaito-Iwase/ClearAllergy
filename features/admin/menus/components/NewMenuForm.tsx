"use client";

// このコンポーネントは新規メニュー作成フォームです。
// app/admin/(dashboard)/menus/new/page.tsx からアレルゲンマスタを受け取り、
// 入力値の state 管理、画像アップロード、作成 API 呼び出しまでを担当します。

import React from "react";
import { useRouter } from "next/navigation";
import {
    getUnknownAllergenNames,
    type AllergenStatus,
} from "@/lib/allergens";
import { createMenuButtonClassName } from "@/features/admin/menus/components/CreateMenuButton";
import ImageCompositionEditor from "@/features/admin/menus/components/ImageCompositionEditor";
import MenuPublishReadinessNotice from "@/features/admin/menus/components/MenuPublishReadinessNotice";
import {
    getApiErrorMessage,
    getThrownErrorMessage,
} from "@/lib/utils/api-error-message";
import {
    DEFAULT_MENU_IMAGE_FIT,
    DEFAULT_MENU_IMAGE_FRAME,
    DEFAULT_MENU_IMAGE_POSITION,
    DEFAULT_MENU_IMAGE_POSITION_X,
    DEFAULT_MENU_IMAGE_POSITION_Y,
    DEFAULT_MENU_IMAGE_ZOOM,
    type MenuImageFit,
    type MenuImageFrame,
    type MenuImagePosition,
} from "@/lib/utils/menu-image-display";

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

const CREATE_ERROR_MESSAGE =
    "作成に失敗しました。時間をおいてもう一度お試しください。";
const UPLOAD_ERROR_MESSAGE =
    "画像のアップロードに失敗しました。時間をおいてもう一度お試しください。";

export default function NewMenuForm({
    allergens,
    readOnly = false,
    readOnlyPreview = false,
    backHref = "/admin/menus",
}: {
    allergens: Allergen[];
    readOnly?: boolean;
    readOnlyPreview?: boolean;
    backHref?: string;
}) {
    const router = useRouter();
    const [name, setName] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [priceYenInput, setPriceYenInput] = React.useState("");
    const [category, setCategory] = React.useState("");
    const [ingredients, setIngredients] = React.useState("");
    const [precaution, setPrecaution] = React.useState("");
    const [imageUrl, setImageUrl] = React.useState("");
    const [imageFrame, setImageFrame] = React.useState<MenuImageFrame>(
        DEFAULT_MENU_IMAGE_FRAME,
    );
    const [imageFit, setImageFit] = React.useState<MenuImageFit>(
        DEFAULT_MENU_IMAGE_FIT,
    );
    const [imagePosition, setImagePosition] =
        React.useState<MenuImagePosition>(DEFAULT_MENU_IMAGE_POSITION);
    const [imageZoom, setImageZoom] = React.useState(DEFAULT_MENU_IMAGE_ZOOM);
    const [imagePositionX, setImagePositionX] = React.useState(
        DEFAULT_MENU_IMAGE_POSITION_X,
    );
    const [imagePositionY, setImagePositionY] = React.useState(
        DEFAULT_MENU_IMAGE_POSITION_Y,
    );
    const [isPublished, setIsPublished] = React.useState(false);
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = React.useState<string | null>(
        null,
    );
    const [statusBySlug, setStatusBySlug] = React.useState<
        Record<string, AllergenStatus>
    >(() =>
        Object.fromEntries(
            allergens.map((allergen) => [allergen.slug, "UNKNOWN"]),
        ),
    );
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const unknownAllergenNames = React.useMemo(
        () => getUnknownAllergenNames({ allergens, statusBySlug }),
        [allergens, statusBySlug],
    );
    const canPublish = unknownAllergenNames.length === 0;

    React.useEffect(() => {
        // 画像プレビュー用に作った Object URL は不要になったら解放します。
        return () => {
            if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
            }
        };
    }, [localPreviewUrl]);

    function normalizeOptionalText(value: string): string | null {
        // 空欄を null に寄せ、DB で「未入力」として扱いやすくします。
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
    }

    function buildPriceYen(): number | null {
        // price の入力は文字列で来るので、保存前に数値ルールを確認します。
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
        if (status === "UNKNOWN") {
            setIsPublished(false);
        }
    }

    function togglePublished() {
        setError(null);
        if (!isPublished && !canPublish) {
            setIsPublished(false);
            setError(
                `公開するにはアレルゲン${allergens.length}品目を確定してください。未設定: ${unknownAllergenNames.length}件`,
            );
            return;
        }

        setIsPublished((prev) => !prev);
    }

    function onSelectImage(e: React.ChangeEvent<HTMLInputElement>) {
        // 選んだ画像をアップロード前にローカルプレビューできるようにします。
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
        // 画像未選択なら URL 入力欄の値だけを使います。
        if (!selectedFile) {
            return normalizeOptionalText(imageUrl);
        }

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            // 画像保存は専用 API に任せ、戻ってきた公開 URL をメニュー保存へ使います。
            const res = await fetch("/api/admin/upload-menu-image", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                throw new Error(
                    await getApiErrorMessage(res, UPLOAD_ERROR_MESSAGE),
                );
            }

            const data = (await res.json().catch(() => null)) as
                | UploadResponse
                | null;

            if (!data?.url) {
                throw new Error(UPLOAD_ERROR_MESSAGE);
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

        if (readOnly) {
            setError(
                "ポートフォリオ公開版のため、入力内容は保存されません。",
            );
            return;
        }

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
                isPublished: canPublish ? isPublished : false,
                imageUrl: uploadedImageUrl,
                imageFrame,
                imageFit,
                imagePosition,
                imageZoom,
                imagePositionX,
                imagePositionY,
                allergenStatusBySlug: statusBySlug,
            };

            // メニュー作成そのものは API に任せ、保存ルールをサーバー側へ寄せます。
            const res = await fetch("/api/admin/menus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                setError(await getApiErrorMessage(res, CREATE_ERROR_MESSAGE));
                return;
            }

            const data = (await res.json().catch(() => null)) as
                | CreateMenuResponse
                | null;

            if (!data || !("id" in data)) {
                setError(CREATE_ERROR_MESSAGE);
                return;
            }

            // 作成成功後は、そのメニューの編集画面へそのまま移動します。
            router.push(`/admin/menus/${data.id}/edit`);
        } catch (err) {
            setError(getThrownErrorMessage(err, CREATE_ERROR_MESSAGE));
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

            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-bold text-gray-900">基本情報</div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                        <button
                            type="button"
                            onClick={togglePublished}
                            disabled={
                                (readOnly && !readOnlyPreview) ||
                                isSubmitting ||
                                uploading
                            }
                            className={`min-h-11 w-full rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${
                                isPublished
                                    ? "bg-green-600"
                                    : canPublish
                                      ? "bg-gray-900"
                                      : "bg-amber-600"
                            }`}
                        >
                            {readOnly
                                ? isPublished
                                    ? "公開中（デモ）"
                                    : canPublish
                                      ? "非公開（デモ）"
                                      : "公開不可（デモ）"
                                : isPublished
                                  ? "公開中"
                                  : canPublish
                                    ? "非公開"
                                    : "公開不可"}
                        </button>

                        <button
                            type="submit"
                            disabled={
                                (readOnly && !readOnlyPreview) ||
                                isSubmitting ||
                                uploading
                            }
                            className={`${createMenuButtonClassName} min-h-11 w-full sm:w-auto`}
                        >
                            {readOnly && !readOnlyPreview
                                ? "閲覧専用"
                                : readOnly
                                  ? "保存されないデモ操作"
                                : isSubmitting
                                ? "登録中..."
                                : uploading
                                  ? "画像アップロード中..."
                                  : "メニューを登録する"}
                        </button>

                        <button
                            type="button"
                            onClick={() => router.push(backHref)}
                            className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 sm:w-auto"
                        >
                            一覧に戻る
                        </button>
                    </div>
                </div>

                <p className="mt-3 text-xs text-gray-500">
                    {readOnly
                        ? "この画面は操作確認用です。登録ボタンを押しても保存されません。"
                        : "登録後、このメニューの編集画面へ移動します。"}
                </p>

                <MenuPublishReadinessNotice
                    unknownAllergenNames={unknownAllergenNames}
                    totalAllergenCount={allergens.length}
                />

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
                            {readOnly
                                ? "デモ表示のため、この入力内容は保存されません。"
                                : "未入力なら価格なしとして保存します。"}
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
                        未入力でも保存・公開できますが、できるだけ入力をおすすめします。
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
                    <p className="mt-1 text-xs text-gray-500">
                        未入力でも保存・公開できますが、できるだけ入力をおすすめします。
                    </p>
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
                            {readOnly
                                ? "デモ表示のため、画像はアップロードされません。"
                                : "作成時に画像をアップロードしてURLを保存します。"}
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
                    <ImageCompositionEditor
                        imageSrc={localPreviewUrl || imageUrl.trim()}
                        imageAlt="メニュー画像プレビュー"
                        subjectName={name}
                        subjectKind="menu"
                        values={{
                            imageFrame,
                            imageFit,
                            imagePosition,
                            imageZoom,
                            imagePositionX,
                            imagePositionY,
                        }}
                        onChange={(next) => {
                            if (next.imageFrame) setImageFrame(next.imageFrame);
                            if (next.imageFit) setImageFit(next.imageFit);
                            if (next.imagePosition) {
                                setImagePosition(next.imagePosition);
                            }
                            if (typeof next.imageZoom === "number") {
                                setImageZoom(next.imageZoom);
                            }
                            if (typeof next.imagePositionX === "number") {
                                setImagePositionX(next.imagePositionX);
                            }
                            if (typeof next.imagePositionY === "number") {
                                setImagePositionY(next.imagePositionY);
                            }
                        }}
                    />
                )}
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <div className="font-bold text-gray-900">
                    アレルゲン{allergens.length}品目
                </div>
                <p className="mt-1 text-sm text-gray-600">
                    各品目について「未設定 / 含む / 含まない / 含む可能性があります」を選択してください。
                </p>

                <MenuPublishReadinessNotice
                    unknownAllergenNames={unknownAllergenNames}
                    totalAllergenCount={allergens.length}
                />

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {allergens.map((allergen) => {
                        const current =
                            statusBySlug[allergen.slug] ?? "UNKNOWN";

                        return (
                            <div
                                key={allergen.slug}
                                className="rounded-2xl border border-gray-200 p-3 sm:p-4"
                            >
                                <div className="mb-3">
                                    <div className="font-semibold text-gray-900">
                                        {allergen.nameJa}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {allergen.nameEn}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setOne(allergen.slug, "UNKNOWN")
                                        }
                                        className={`min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium ${
                                            current === "UNKNOWN"
                                                ? "bg-gray-700 text-white"
                                                : "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        未設定
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setOne(allergen.slug, "CONTAINS")
                                        }
                                        className={`min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium ${
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
                                        className={`min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium ${
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
                                        className={`min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium ${
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

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={
                        (readOnly && !readOnlyPreview) ||
                        isSubmitting ||
                        uploading
                    }
                    className={`${createMenuButtonClassName} min-h-11 w-full sm:w-auto`}
                >
                    {readOnly && !readOnlyPreview
                        ? "閲覧専用"
                        : readOnly
                          ? "保存されないデモ操作"
                          : isSubmitting
                            ? "登録中..."
                            : uploading
                              ? "画像アップロード中..."
                              : "この内容で登録する"}
                </button>
            </div>
        </form>
    );
}
