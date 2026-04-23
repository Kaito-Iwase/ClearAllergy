"use client";

// このコンポーネントは既存メニューの編集フォームです。
// Server Component から受け取った初期値を state に展開し、保存と画像アップロードを担当します。
// menuId を使って「どのメニューを更新するか」を API に伝えます。

import React from "react";
import { useRouter } from "next/navigation";
import { type AllergenStatus } from "@/lib/allergens";
import { createMenuButtonClassName } from "@/components/admin/menu/CreateMenuButton";
import ImageCompositionEditor from "@/components/admin/menu/ImageCompositionEditor";
import {
    getApiErrorMessage,
    getThrownErrorMessage,
} from "@/lib/api-error-message";
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
} from "@/lib/menu-image-display";

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

const SAVE_ERROR_MESSAGE =
    "保存に失敗しました。時間をおいてもう一度お試しください。";
const CREATE_ERROR_MESSAGE =
    "新しいメニューの作成に失敗しました。時間をおいてもう一度お試しください。";
const UPLOAD_ERROR_MESSAGE =
    "画像のアップロードに失敗しました。時間をおいてもう一度お試しください。";

export default function MenuEditClient(props: {
    menuId: string;
    initialName: string;
    initialDescription: string | null;
    initialPriceYen: number | null;
    initialCategory: string | null;
    initialIngredients: string | null;
    initialPrecaution: string | null;
    initialImageUrl: string | null;
    initialImageFrame: MenuImageFrame;
    initialImageFit: MenuImageFit;
    initialImagePosition: MenuImagePosition;
    initialImageZoom: number;
    initialImagePositionX: number;
    initialImagePositionY: number;
    initialIsPublished: boolean;
    allergens: Allergen[];
    initialStatusBySlug: Record<string, AllergenStatus>;
    readOnly?: boolean;
    readOnlyPreview?: boolean;
    readOnlyCreateHref?: string;
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
        initialImageFrame,
        initialImageFit,
        initialImagePosition,
        initialImageZoom,
        initialImagePositionX,
        initialImagePositionY,
        initialIsPublished,
        allergens,
        initialStatusBySlug,
        readOnly = false,
        readOnlyPreview = false,
        readOnlyCreateHref,
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
    const [imageFrame, setImageFrame] = React.useState<MenuImageFrame>(
        initialImageFrame ?? DEFAULT_MENU_IMAGE_FRAME,
    );
    const [imageFit, setImageFit] = React.useState<MenuImageFit>(
        initialImageFit ?? DEFAULT_MENU_IMAGE_FIT,
    );
    const [imagePosition, setImagePosition] =
        React.useState<MenuImagePosition>(
            initialImagePosition ?? DEFAULT_MENU_IMAGE_POSITION,
        );
    const [imageZoom, setImageZoom] = React.useState(
        initialImageZoom ?? DEFAULT_MENU_IMAGE_ZOOM,
    );
    const [imagePositionX, setImagePositionX] = React.useState(
        initialImagePositionX ?? DEFAULT_MENU_IMAGE_POSITION_X,
    );
    const [imagePositionY, setImagePositionY] = React.useState(
        initialImagePositionY ?? DEFAULT_MENU_IMAGE_POSITION_Y,
    );

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
        // 作成した Object URL は不要になったら解放し、メモリリークを防ぎます。
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
        // 入力欄は文字列なので、保存前に数値へ変換してルールを確認します。
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
        // 空文字を null に寄せ、未入力項目を分かりやすく扱います。
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
    }

    function onSelectImage(e: React.ChangeEvent<HTMLInputElement>) {
        // 保存前に画像を確認できるよう、ローカルプレビューを作ります。
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
        // 新しい画像が選ばれていない場合は、既存 URL をそのまま使います。
        if (!selectedFile) {
            return normalizeOptionalText(imageUrl);
        }

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            // 画像アップロード API から返ってきた URL を、そのままメニュー更新に使います。
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

    async function onSave() {
        setSaving(true);
        setError(null);
        setSaved(false);

        if (readOnly) {
            setError(
                "ポートフォリオ公開版のため、入力内容は保存されません。",
            );
            setSaving(false);
            return;
        }

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
                imageFrame,
                imageFit,
                imagePosition,
                imageZoom,
                imagePositionX,
                imagePositionY,
                isPublished,
                allergenStatusBySlug: statusBySlug,
            };

            // 保存処理そのものは API に任せ、DB 更新ルールをサーバー側に集約します。
            const res = await fetch(`/api/admin/menus/${menuId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                throw new Error(
                    await getApiErrorMessage(res, SAVE_ERROR_MESSAGE),
                );
            }

            // 保存後は server 側のデータを再取得し、最新表示へそろえます。
            setSaved(true);
            setSelectedFile(null);
            router.refresh();
        } catch (e) {
            setError(getThrownErrorMessage(e, SAVE_ERROR_MESSAGE));
        } finally {
            setSaving(false);
        }
    }

    async function handleCreateMenu() {
        // 編集中でも「次の新規メニューを作る」導線を置き、入力作業を続けやすくします。
        setCreating(true);
        setError(null);
        setSaved(false);

        if (readOnly) {
            if (readOnlyCreateHref) {
                router.push(readOnlyCreateHref);
                setCreating(false);
                return;
            }

            setError(
                "ポートフォリオ公開版のため、メニュー作成はできません。",
            );
            setCreating(false);
            return;
        }

        try {
            // 空 body で POST すると、サーバー側が下書きを作ってくれます。
            const res = await fetch("/api/admin/menus", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });

            if (!res.ok) {
                throw new Error(
                    await getApiErrorMessage(res, CREATE_ERROR_MESSAGE),
                );
            }

            const data = (await res.json().catch(() => null)) as
                | CreateMenuResponse
                | null;

            if (!data?.id) {
                throw new Error(CREATE_ERROR_MESSAGE);
            }

            router.push(`/admin/menus/${data.id}/edit`);
        } catch (e) {
            setError(getThrownErrorMessage(e, CREATE_ERROR_MESSAGE));
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
                            disabled={
                                (readOnly && !readOnlyPreview) ||
                                creating ||
                                saving ||
                                uploading
                            }
                            className={createMenuButtonClassName}
                        >
                            {readOnly && !readOnlyPreview
                                ? "閲覧専用"
                                : readOnly
                                  ? "保存されない新規作成デモ"
                                : creating
                                  ? "作成中..."
                                  : "＋ 新しいメニューを作る"}
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsPublished((prev) => !prev)}
                            disabled={
                                (readOnly && !readOnlyPreview) ||
                                creating ||
                                saving ||
                                uploading
                            }
                            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                                isPublished ? "bg-green-600" : "bg-gray-900"
                            }`}
                        >
                            {readOnly
                                ? isPublished
                                    ? "公開中（デモ）"
                                    : "非公開（デモ）"
                                : isPublished
                                  ? "公開中"
                                  : "非公開"}
                        </button>

                        <button
                            type="button"
                            onClick={onSave}
                            disabled={
                                (readOnly && !readOnlyPreview) ||
                                saving ||
                                creating ||
                                uploading
                            }
                            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                            {readOnly && !readOnlyPreview
                                ? "閲覧専用"
                                : readOnly
                                  ? "保存されないデモ操作"
                                : saving
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
                        initialValues={{
                            imageFrame: initialImageFrame,
                            imageFit: initialImageFit,
                            imagePosition: initialImagePosition,
                            imageZoom: initialImageZoom,
                            imagePositionX: initialImagePositionX,
                            imagePositionY: initialImagePositionY,
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

            <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="font-bold text-gray-900">アレルゲン28品目</div>
                <p className="mt-1 text-sm text-gray-600">
                    各品目について「未設定 / 含む / 含まない /
                    含む可能性があります」を選択してください。
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {allergens.map((a) => {
                        const current = statusBySlug[a.slug] ?? "UNKNOWN";

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
                                        onClick={() => setOne(a.slug, "UNKNOWN")}
                                        className={`rounded-xl px-3 py-2 text-sm font-medium ${
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
                        disabled={
                            (readOnly && !readOnlyPreview) ||
                            saving ||
                            creating ||
                            uploading
                        }
                        className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                        {readOnly && !readOnlyPreview
                            ? "閲覧専用"
                            : readOnly
                              ? "保存されないデモ操作"
                            : saving
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
