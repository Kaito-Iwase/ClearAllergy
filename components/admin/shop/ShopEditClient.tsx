"use client";

// このコンポーネントは店舗情報編集フォームです。
// Server Component から受け取った初期店舗情報を state に展開し、保存と画像アップロードを担当します。
// 公開プレビューも同じ state を参照し、入力中の変化が画面で分かるようにしています。

import Link from "next/link";
import React from "react";
import ShareShopUrlButton from "@/components/public/ShareShopUrlButton";
import ShopQrCard from "@/components/admin/shop/ShopQrCard";
import ImageCompositionEditor from "@/components/admin/menu/ImageCompositionEditor";
import { formatDateTimeJa, formatPriceYenLabel } from "@/lib/formatters";
import {
    DEFAULT_SHOP_COVER_IMAGE_FIT,
    DEFAULT_SHOP_COVER_IMAGE_FRAME,
    DEFAULT_SHOP_COVER_IMAGE_POSITION,
    DEFAULT_SHOP_COVER_IMAGE_POSITION_X,
    DEFAULT_SHOP_COVER_IMAGE_POSITION_Y,
    DEFAULT_SHOP_COVER_IMAGE_ZOOM,
    type MenuImageFit,
    type MenuImageFrame,
    type MenuImagePosition,
} from "@/lib/menu-image-display";

type ShopViewModel = {
    id: string;
    name: string;
    description: string | null;
    address: string | null;
    hours: string | null;
    regularHoliday: string | null;
    phoneNumber: string | null;
    note: string | null;
    averageBudgetYen: number | null;
    coverImageUrl: string | null;
    coverImageFrame: MenuImageFrame;
    coverImageFit: MenuImageFit;
    coverImagePosition: MenuImagePosition;
    coverImageZoom: number;
    coverImagePositionX: number;
    coverImagePositionY: number;
    updatedAt: string;
    publishedMenuCount: number;
};

type BusinessHoursMode = "single" | "weekdayHoliday";

type BusinessHoursFormState = {
    mode: BusinessHoursMode;
    single: string;
    weekday: string;
    holiday: string;
};

function parseBusinessHoursText(rawHours: string | null): BusinessHoursFormState {
    const text = rawHours?.trim() ?? "";
    const weekdayMatch = text.match(/(?:^|\n)\s*平日\s*[:：]?\s*([^\n]+)/);
    const holidayMatch = text.match(
        /(?:^|\n)\s*(?:土日祝|土日|休日)\s*[:：]?\s*([^\n]+)/,
    );

    if (weekdayMatch || holidayMatch) {
        return {
            mode: "weekdayHoliday",
            single: text,
            weekday: weekdayMatch?.[1]?.trim() ?? "",
            holiday: holidayMatch?.[1]?.trim() ?? "",
        };
    }

    return {
        mode: "single",
        single: text,
        weekday: "",
        holiday: "",
    };
}

function buildBusinessHoursText({
    mode,
    single,
    weekday,
    holiday,
}: BusinessHoursFormState) {
    if (mode === "single") {
        return single.trim();
    }

    return [
        weekday.trim() ? `平日 ${weekday.trim()}` : null,
        holiday.trim() ? `土日祝 ${holiday.trim()}` : null,
    ]
        .filter(Boolean)
        .join("\n");
}

export default function ShopEditClient({
    initialShop,
}: {
    initialShop: ShopViewModel;
}) {
    const initialBusinessHours = React.useMemo(
        () => parseBusinessHoursText(initialShop.hours),
        [initialShop.hours],
    );

    // フォーム入力値と UI 状態を state として持ちます。
    const [name, setName] = React.useState(initialShop.name);
    const [description, setDescription] = React.useState(
        initialShop.description ?? "",
    );
    const [address, setAddress] = React.useState(initialShop.address ?? "");
    const [hoursMode, setHoursMode] = React.useState<BusinessHoursMode>(
        initialBusinessHours.mode,
    );
    const [hoursSingle, setHoursSingle] = React.useState(
        initialBusinessHours.single,
    );
    const [hoursWeekday, setHoursWeekday] = React.useState(
        initialBusinessHours.weekday,
    );
    const [hoursHoliday, setHoursHoliday] = React.useState(
        initialBusinessHours.holiday,
    );
    const [regularHoliday, setRegularHoliday] = React.useState(
        initialShop.regularHoliday ?? "",
    );
    const [phoneNumber, setPhoneNumber] = React.useState(
        initialShop.phoneNumber ?? "",
    );
    const [note, setNote] = React.useState(initialShop.note ?? "");
    const [averageBudgetYen, setAverageBudgetYen] = React.useState(
        initialShop.averageBudgetYen?.toString() ?? "",
    );
    const [coverImageUrl, setCoverImageUrl] = React.useState(
        initialShop.coverImageUrl ?? "",
    );
    const [coverImageFrame, setCoverImageFrame] =
        React.useState<MenuImageFrame>(
            initialShop.coverImageFrame ?? DEFAULT_SHOP_COVER_IMAGE_FRAME,
        );
    const [coverImageFit, setCoverImageFit] = React.useState<MenuImageFit>(
        initialShop.coverImageFit ?? DEFAULT_SHOP_COVER_IMAGE_FIT,
    );
    const [coverImagePosition, setCoverImagePosition] =
        React.useState<MenuImagePosition>(
            initialShop.coverImagePosition ??
                DEFAULT_SHOP_COVER_IMAGE_POSITION,
        );
    const [coverImageZoom, setCoverImageZoom] = React.useState(
        initialShop.coverImageZoom ?? DEFAULT_SHOP_COVER_IMAGE_ZOOM,
    );
    const [coverImagePositionX, setCoverImagePositionX] = React.useState(
        initialShop.coverImagePositionX ??
            DEFAULT_SHOP_COVER_IMAGE_POSITION_X,
    );
    const [coverImagePositionY, setCoverImagePositionY] = React.useState(
        initialShop.coverImagePositionY ??
            DEFAULT_SHOP_COVER_IMAGE_POSITION_Y,
    );

    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = React.useState<string | null>(
        null,
    );

    const [saving, setSaving] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [savedMessage, setSavedMessage] = React.useState("");
    const [updatedAtText, setUpdatedAtText] = React.useState(
        formatDateTimeJa(initialShop.updatedAt),
    );

    React.useEffect(() => {
        // プレビュー用 Object URL は不要になったら解放し、メモリを圧迫しないようにします。
        return () => {
            if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
            }
        };
    }, [localPreviewUrl]);

    function onSelectImage(e: React.ChangeEvent<HTMLInputElement>) {
        // 選んだ画像を保存前に確認できるよう、ローカルプレビューを作ります。
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

        const nextPreviewUrl = URL.createObjectURL(file);

        setSelectedFile(file);
        setLocalPreviewUrl(nextPreviewUrl);
        setError(null);
        setSavedMessage("");
    }

    async function uploadSelectedImage(): Promise<string | null> {
        // 新しい画像未選択なら、入力欄にある URL をそのまま使います。
        if (!selectedFile) {
            const trimmedUrl = coverImageUrl.trim();
            return trimmedUrl === "" ? null : trimmedUrl;
        }

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            // 店舗画像は専用 API にアップロードし、返ってきた URL を保存へ使います。
            const res = await fetch("/api/admin/upload-shop-image", {
                method: "POST",
                body: formData,
            });

            const data = (await res.json().catch(() => null)) as {
                url?: string;
                error?: string;
            } | null;

            if (!res.ok || !data?.url) {
                throw new Error(
                    data?.error ?? "画像アップロードに失敗しました。",
                );
            }

            setCoverImageUrl(data.url);
            return data.url;
        } finally {
            setUploading(false);
        }
    }

    function handleCoverCompositionChange(next: Partial<{
        imageFrame: MenuImageFrame;
        imageFit: MenuImageFit;
        imagePosition: MenuImagePosition;
        imageZoom: number;
        imagePositionX: number;
        imagePositionY: number;
    }>) {
        if (next.imageFrame) setCoverImageFrame(next.imageFrame);
        if (next.imageFit) setCoverImageFit(next.imageFit);
        if (next.imagePosition) setCoverImagePosition(next.imagePosition);
        if (typeof next.imageZoom === "number") {
            setCoverImageZoom(next.imageZoom);
        }
        if (typeof next.imagePositionX === "number") {
            setCoverImagePositionX(next.imagePositionX);
        }
        if (typeof next.imagePositionY === "number") {
            setCoverImagePositionY(next.imagePositionY);
        }
    }

    function changeBusinessHoursMode(nextMode: BusinessHoursMode) {
        if (nextMode === hoursMode) {
            return;
        }

        if (
            nextMode === "weekdayHoliday" &&
            !hoursWeekday.trim() &&
            !hoursHoliday.trim() &&
            hoursSingle.trim()
        ) {
            setHoursWeekday(hoursSingle.trim());
            setHoursHoliday(hoursSingle.trim());
        }

        if (nextMode === "single" && !hoursSingle.trim()) {
            setHoursSingle(
                buildBusinessHoursText({
                    mode: "weekdayHoliday",
                    single: hoursSingle,
                    weekday: hoursWeekday,
                    holiday: hoursHoliday,
                }),
            );
        }

        setHoursMode(nextMode);
    }

    async function saveShop() {
        setError(null);
        setSavedMessage("");

        // 店舗名だけは必須なので、空なら API を呼ばずに止めます。
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError("店舗名は必須です。");
            return;
        }

        setSaving(true);

        try {
            // 画像アップロードが必要なら先に終わらせ、その URL を店舗更新 API に送ります。
            const uploadedCoverImageUrl = await uploadSelectedImage();

            // 保存処理そのものは API に任せ、DB 更新ロジックはサーバー側へ集約します。
            const res = await fetch("/api/admin/shop", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: trimmedName,
                    description: description.trim(),
                    address: address.trim(),
                    hours: buildBusinessHoursText({
                        mode: hoursMode,
                        single: hoursSingle,
                        weekday: hoursWeekday,
                        holiday: hoursHoliday,
                    }),
                    regularHoliday: regularHoliday.trim(),
                    phoneNumber: phoneNumber.trim(),
                    note: note.trim(),
                    averageBudgetYen: averageBudgetYen.trim(),
                    coverImageUrl: uploadedCoverImageUrl,
                    coverImageFrame,
                    coverImageFit,
                    coverImagePosition,
                    coverImageZoom,
                    coverImagePositionX,
                    coverImagePositionY,
                }),
            });

            const data = (await res.json().catch(() => null)) as {
                error?: string;
                shop?: {
                    updatedAt: string;
                    hours?: string | null;
                    regularHoliday?: string | null;
                    phoneNumber?: string | null;
                    note?: string | null;
                    averageBudgetYen?: number | null;
                    coverImageUrl?: string | null;
                    coverImageFrame?: MenuImageFrame;
                    coverImageFit?: MenuImageFit;
                    coverImagePosition?: MenuImagePosition;
                    coverImageZoom?: number;
                    coverImagePositionX?: number;
                    coverImagePositionY?: number;
                };
            } | null;

            if (!res.ok) {
                setError(data?.error ?? "保存に失敗しました。");
                return;
            }

            // API が返した最新の updatedAt と coverImageUrl を画面にも反映します。
            setSavedMessage("店舗情報を保存しました。");

            if (data?.shop?.coverImageUrl !== undefined) {
                setCoverImageUrl(data.shop.coverImageUrl ?? "");
            }
            if (data?.shop?.hours !== undefined) {
                const savedHours = data.shop.hours ?? "";
                if (hoursMode === "single") {
                    setHoursSingle(savedHours);
                } else {
                    const parsedHours = parseBusinessHoursText(savedHours);
                    setHoursWeekday(parsedHours.weekday);
                    setHoursHoliday(parsedHours.holiday);
                }
            }
            if (data?.shop?.regularHoliday !== undefined) {
                setRegularHoliday(data.shop.regularHoliday ?? "");
            }
            if (data?.shop?.phoneNumber !== undefined) {
                setPhoneNumber(data.shop.phoneNumber ?? "");
            }
            if (data?.shop?.note !== undefined) {
                setNote(data.shop.note ?? "");
            }
            if (data?.shop?.coverImageFrame) {
                setCoverImageFrame(data.shop.coverImageFrame);
            }
            if (data?.shop?.coverImageFit) {
                setCoverImageFit(data.shop.coverImageFit);
            }
            if (data?.shop?.coverImagePosition) {
                setCoverImagePosition(data.shop.coverImagePosition);
            }
            if (typeof data?.shop?.coverImageZoom === "number") {
                setCoverImageZoom(data.shop.coverImageZoom);
            }
            if (typeof data?.shop?.coverImagePositionX === "number") {
                setCoverImagePositionX(data.shop.coverImagePositionX);
            }
            if (typeof data?.shop?.coverImagePositionY === "number") {
                setCoverImagePositionY(data.shop.coverImagePositionY);
            }

            if (data?.shop?.averageBudgetYen !== undefined) {
                setAverageBudgetYen(
                    data.shop.averageBudgetYen?.toString() ?? "",
                );
            }

            if (data?.shop?.updatedAt) {
                setUpdatedAtText(
                    formatDateTimeJa(data.shop.updatedAt),
                );
            }

            setSelectedFile(null);
            if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
                setLocalPreviewUrl(null);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(`保存中にエラーが発生しました: ${msg}`);
        } finally {
            setSaving(false);
        }
    }

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        // フォーム既定の再読み込みを止め、画面内で成功・失敗を表示します。
        e.preventDefault();
        await saveShop();
    }

    // プレビュー領域では「ローカルプレビュー > 入力済み URL > 空」の順に表示します。
    const previewImageUrl = localPreviewUrl || coverImageUrl.trim() || "";
    const coverImageStyle: React.CSSProperties = {
        objectFit: coverImageFit,
        objectPosition: `${coverImagePositionX}% ${coverImagePositionY}%`,
        transform: `scale(${coverImageZoom / 100})`,
        transformOrigin: `${coverImagePositionX}% ${coverImagePositionY}%`,
    };
    const businessHoursText = buildBusinessHoursText({
        mode: hoursMode,
        single: hoursSingle,
        weekday: hoursWeekday,
        holiday: hoursHoliday,
    });
    const averageBudgetLabel =
        averageBudgetYen.trim() === ""
            ? "未設定"
            : formatPriceYenLabel(Number(averageBudgetYen));

    return (
        <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr]">
                    <div className="relative min-h-[360px] overflow-hidden bg-gradient-to-r from-green-200 via-green-100 to-gray-50 p-8 md:p-10">
                        {previewImageUrl ? (
                            <img
                                src={previewImageUrl}
                                alt=""
                                className="absolute inset-0 h-full w-full"
                                style={coverImageStyle}
                            />
                        ) : null}

                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.45),transparent_35%)]" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-white/10" />

                        <div className="relative z-10 flex h-full flex-col justify-between">
                            <div>
                                <p className="text-sm font-semibold text-white/90 drop-shadow">
                                    公開プレビュー
                                </p>
                                <h2 className="mt-6 text-4xl font-extrabold tracking-tight text-white drop-shadow md:text-5xl">
                                    {name.trim() || "店舗名未設定"}
                                </h2>
                                <p className="mt-4 max-w-xl text-base font-medium text-white/90 md:text-lg">
                                    {description.trim() ||
                                        "店舗説明は未設定です。"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 bg-white p-6 lg:border-l lg:border-t-0">
                        <h3 className="text-2xl font-extrabold text-gray-900">
                            店舗情報
                        </h3>

                        <div className="mt-6 space-y-5 text-sm text-gray-700">
                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 text-pink-500">📍</span>
                                <div>
                                    <p className="font-bold text-gray-900">
                                        住所
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap">
                                        {address.trim() || "未設定"}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 text-gray-500">🕒</span>
                                <div>
                                    <p className="font-bold text-gray-900">
                                        営業時間
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap">
                                        {businessHoursText || "未設定"}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 text-gray-500">休</span>
                                <div>
                                    <p className="font-bold text-gray-900">
                                        定休日
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap">
                                        {regularHoliday.trim() || "未設定"}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 text-gray-500">TEL</span>
                                <div>
                                    <p className="font-bold text-gray-900">
                                        電話番号
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap">
                                        {phoneNumber.trim() || "未設定"}
                                    </p>
                                </div>
                            </div>

                            {note.trim() ? (
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 text-gray-500">
                                        ※
                                    </span>
                                    <div>
                                        <p className="font-bold text-gray-900">
                                            備考
                                        </p>
                                        <p className="mt-1 whitespace-pre-wrap">
                                            {note.trim()}
                                        </p>
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 text-amber-500">
                                    💴
                                </span>
                                <div>
                                    <p className="font-bold text-gray-900">
                                        平均予算
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap">
                                        {averageBudgetLabel}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 text-blue-500">🪪</span>
                                <div>
                                    <p className="font-bold text-gray-900">
                                        公開メニュー
                                    </p>
                                    <p className="mt-1">
                                        {initialShop.publishedMenuCount}件
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 text-blue-500">🔄</span>
                                <div>
                                    <p className="font-bold text-gray-900">
                                        更新
                                    </p>
                                    <p className="mt-1">{updatedAtText}</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8">
                            <ShareShopUrlButton shopId={initialShop.id} />
                        </div>

                        <p className="mt-3 text-xs text-gray-500">
                            ※ QR表示は下のカードで確認できます
                        </p>
                    </div>
                </div>
            </section>

            <ShopQrCard
                shopId={initialShop.id}
                shopName={name.trim() || initialShop.name}
            />

            {previewImageUrl ? (
                <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 className="text-2xl font-extrabold text-gray-900">
                                店舗画像の見え方調整
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-gray-600">
                                公開店舗ページや一覧カードで、カバー写真がどう見えるかを大きく確認できます。
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={saveShop}
                            disabled={saving || uploading}
                            className="rounded-xl bg-[#13ec13] px-5 py-3 text-sm font-bold text-black transition hover:bg-[#0db80d] disabled:opacity-60"
                        >
                            {uploading
                                ? "画像アップロード中..."
                                : saving
                                  ? "保存中..."
                                  : "この画像設定を保存"}
                        </button>
                    </div>

                    <ImageCompositionEditor
                        imageSrc={previewImageUrl}
                        imageAlt="店舗カバー画像プレビュー"
                        subjectName={name}
                        subjectKind="shop"
                        surface="plain"
                        values={{
                            imageFrame: coverImageFrame,
                            imageFit: coverImageFit,
                            imagePosition: coverImagePosition,
                            imageZoom: coverImageZoom,
                            imagePositionX: coverImagePositionX,
                            imagePositionY: coverImagePositionY,
                        }}
                        initialValues={{
                            imageFrame: initialShop.coverImageFrame,
                            imageFit: initialShop.coverImageFit,
                            imagePosition: initialShop.coverImagePosition,
                            imageZoom: initialShop.coverImageZoom,
                            imagePositionX: initialShop.coverImagePositionX,
                            imagePositionY: initialShop.coverImagePositionY,
                        }}
                        onChange={handleCoverCompositionChange}
                    />

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
                        <p className="text-xs leading-5 text-gray-500">
                            画像の位置・ズーム・表示方法は、保存すると公開ページにも反映されます。
                        </p>
                        <button
                            type="button"
                            onClick={saveShop}
                            disabled={saving || uploading}
                            className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-black/80 disabled:opacity-60"
                        >
                            {uploading
                                ? "画像アップロード中..."
                                : saving
                                  ? "保存中..."
                                  : "変更を保存"}
                        </button>
                    </div>
                </section>
            ) : null}

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <form
                    onSubmit={onSubmit}
                    className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-2xl font-extrabold text-gray-900">
                                編集フォーム
                            </h3>
                            <p className="mt-1 text-sm text-gray-600">
                                公開ページに見える内容をここで更新します。
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={saving || uploading}
                            className="rounded-xl bg-[#13ec13] px-5 py-3 text-sm font-extrabold text-black shadow-sm transition hover:bg-[#0db80d] disabled:opacity-60"
                        >
                            {uploading
                                ? "画像アップロード中..."
                                : saving
                                  ? "保存中..."
                                  : "保存する"}
                        </button>
                    </div>

                    {error ? (
                        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            {error}
                        </div>
                    ) : null}

                    {savedMessage ? (
                        <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                            {savedMessage}
                        </div>
                    ) : null}

                    <div className="mt-6 space-y-5">
                        <div>
                            <label
                                htmlFor="shop-name"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                店舗名（必須）
                            </label>
                            <input
                                id="shop-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="例：Clear Cafe"
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                                required
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="shop-description"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                お店の説明
                            </label>
                            <textarea
                                id="shop-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="例：アレルゲン情報を確認しやすい、やさしい食堂です。"
                                rows={5}
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="shop-average-budget"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                平均予算（円）
                            </label>
                            <input
                                id="shop-average-budget"
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                value={averageBudgetYen}
                                onChange={(e) =>
                                    setAverageBudgetYen(e.target.value)
                                }
                                placeholder="例：1200"
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                店舗全体の目安金額を入れると、公開一覧で価格感が伝わりやすくなります。
                            </p>
                        </div>

                        <div>
                            <label
                                htmlFor="shop-cover-image-file"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                店舗画像ファイル
                            </label>
                            <input
                                id="shop-cover-image-file"
                                type="file"
                                accept="image/*"
                                onChange={onSelectImage}
                                className="block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:font-bold file:text-gray-700 hover:file:bg-gray-200"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                保存時に画像をアップロードし、取得したURLを店舗情報に保存します。
                            </p>
                        </div>

                        <div>
                            <label
                                htmlFor="shop-cover-image-url"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                現在の画像URL
                            </label>
                            <input
                                id="shop-cover-image-url"
                                type="url"
                                value={coverImageUrl}
                                onChange={(e) =>
                                    setCoverImageUrl(e.target.value)
                                }
                                placeholder="アップロード後に自動入力されます"
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                通常は自動更新されます。必要な場合のみ手動で変更してください。
                            </p>
                        </div>

                        <div>
                            <label
                                htmlFor="shop-address"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                住所
                            </label>
                            <input
                                id="shop-address"
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="例：愛知県名古屋市天白区○○ 1-2-3"
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                公開ページにそのまま表示される住所です。建物名まで必要なら続けて入力してください。
                            </p>
                        </div>

                        <div>
                            <div className="mb-2 block text-sm font-bold text-gray-900">
                                営業時間
                            </div>
                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                <p className="text-xs font-bold text-gray-700">
                                    設定方法
                                </p>
                                <div
                                    className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
                                    role="radiogroup"
                                    aria-label="営業時間の設定方法"
                                >
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={hoursMode === "single"}
                                        onClick={() =>
                                            changeBusinessHoursMode("single")
                                        }
                                        className={`rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                                            hoursMode === "single"
                                                ? "bg-white text-gray-950 shadow-sm ring-2 ring-green-400"
                                                : "bg-transparent text-gray-600 hover:bg-white"
                                        }`}
                                    >
                                        一括入力
                                    </button>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={
                                            hoursMode === "weekdayHoliday"
                                        }
                                        onClick={() =>
                                            changeBusinessHoursMode(
                                                "weekdayHoliday",
                                            )
                                        }
                                        className={`rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                                            hoursMode === "weekdayHoliday"
                                                ? "bg-white text-gray-950 shadow-sm ring-2 ring-green-400"
                                                : "bg-transparent text-gray-600 hover:bg-white"
                                        }`}
                                    >
                                        平日 / 土日祝
                                    </button>
                                </div>
                                <p className="mt-3 text-xs leading-5 text-gray-500">
                                    {hoursMode === "single"
                                        ? "営業時間が毎日ほぼ同じ場合はこちらを使います。"
                                        : "平日と土日祝で営業時間が異なる場合に使います。"}
                                </p>
                            </div>

                            {hoursMode === "single" ? (
                                <div className="mt-3">
                                    <label
                                        htmlFor="shop-hours"
                                        className="mb-2 block text-sm font-bold text-gray-900"
                                    >
                                        営業時間
                                    </label>
                                    <input
                                        id="shop-hours"
                                        type="text"
                                        value={hoursSingle}
                                        onChange={(e) =>
                                            setHoursSingle(e.target.value)
                                        }
                                        placeholder="例：11:00〜20:00"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                                    />
                                    <p className="mt-2 text-xs text-gray-500">
                                        営業している時間帯だけを入力します。定休日や電話番号は下の専用欄に分けてください。
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label
                                            htmlFor="shop-hours-weekday"
                                            className="mb-2 block text-sm font-bold text-gray-900"
                                        >
                                            平日
                                        </label>
                                        <input
                                            id="shop-hours-weekday"
                                            type="text"
                                            value={hoursWeekday}
                                            onChange={(e) =>
                                                setHoursWeekday(e.target.value)
                                            }
                                            placeholder="例：11:00〜20:00"
                                            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="shop-hours-holiday"
                                            className="mb-2 block text-sm font-bold text-gray-900"
                                        >
                                            土日祝
                                        </label>
                                        <input
                                            id="shop-hours-holiday"
                                            type="text"
                                            value={hoursHoliday}
                                            onChange={(e) =>
                                                setHoursHoliday(e.target.value)
                                            }
                                            placeholder="例：11:00〜21:00"
                                            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                                        />
                                    </div>
                                    <p className="text-xs leading-5 text-gray-500 sm:col-span-2">
                                        保存時は「平日 {hoursWeekday.trim() || "11:00〜20:00"}」
                                        と「土日祝 {hoursHoliday.trim() || "11:00〜21:00"}」
                                        の形式で公開ページに表示されます。
                                    </p>
                                </div>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="shop-regular-holiday"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                定休日
                            </label>
                            <input
                                id="shop-regular-holiday"
                                type="text"
                                value={regularHoliday}
                                onChange={(e) =>
                                    setRegularHoliday(e.target.value)
                                }
                                placeholder="例：水曜日"
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                不定休の場合は「不定休」など、来店前に分かる表現で入力してください。
                            </p>
                        </div>

                        <div>
                            <label
                                htmlFor="shop-phone-number"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                電話番号
                            </label>
                            <input
                                id="shop-phone-number"
                                type="tel"
                                inputMode="tel"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="例：052-123-4567"
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                公開してよい店舗の問い合わせ番号だけを入力してください。
                            </p>
                        </div>

                        <div>
                            <label
                                htmlFor="shop-note"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                備考
                            </label>
                            <textarea
                                id="shop-note"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="例：ラストオーダーは閉店30分前"
                                rows={3}
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                営業時間だけでは伝わりにくい案内がある場合に使います。
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            type="submit"
                            disabled={saving || uploading}
                            className="inline-flex items-center justify-center rounded-xl bg-[#13ec13] px-6 py-3 text-sm font-extrabold text-black shadow-sm transition hover:bg-[#0db80d] disabled:opacity-60"
                        >
                            {uploading
                                ? "画像アップロード中..."
                                : saving
                                  ? "保存中..."
                                  : "変更を保存"}
                        </button>

                        <Link
                            href="/admin/menus"
                            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                        >
                            メニュー管理へ戻る
                        </Link>
                    </div>
                </form>

                <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="text-2xl font-extrabold text-gray-900">
                        入力のヒント
                    </h3>

                    <div className="mt-5 space-y-4 text-sm text-gray-700">
                        <div className="rounded-2xl bg-gray-50 p-4">
                            <p className="font-bold text-gray-900">
                                平均予算
                            </p>
                            <p className="mt-1">
                                ランチ中心のお店なら目安の価格帯を入れておくと、初見の人にも選びやすくなります。
                            </p>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4">
                            <p className="font-bold text-gray-900">店舗画像</p>
                            <p className="mt-1">
                                横長で明るすぎない写真だと、店名の白文字が読みやすくなります。まずはWebPかJPGがおすすめです。
                            </p>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4">
                            <p className="font-bold text-gray-900">店舗名</p>
                            <p className="mt-1">
                                公開ページの一番目立つ位置に表示されます。
                            </p>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4">
                            <p className="font-bold text-gray-900">
                                お店の説明
                            </p>
                            <p className="mt-1">
                                お店の特徴や、アレルゲン対応の姿勢が伝わる一文があると良いです。
                            </p>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4">
                            <p className="font-bold text-gray-900">
                                住所・営業時間
                            </p>
                            <p className="mt-1">
                                営業時間、定休日、電話番号は別々の欄に分けると、公開ページで読みやすく表示できます。
                            </p>
                        </div>

                        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-900">
                            <p className="font-bold">注意</p>
                            <p className="mt-1">
                                店舗情報は公開ページにそのまま表示されるため、誤字や古い情報がないか確認してから保存してください。
                            </p>
                        </div>
                    </div>
                </section>
            </section>
        </div>
    );
}
