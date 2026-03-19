"use client";

import Link from "next/link";
import React from "react";
import ShareShopUrlButton from "@/components/public/ShareShopUrlButton";
import ShopQrCard from "@/components/admin/shop/ShopQrCard";
import { formatDateTimeJa } from "@/lib/formatters";

type ShopViewModel = {
    id: string;
    name: string;
    description: string | null;
    address: string | null;
    hours: string | null;
    coverImageUrl: string | null;
    updatedAt: string;
    publishedMenuCount: number;
};

export default function ShopEditClient({
    initialShop,
}: {
    initialShop: ShopViewModel;
}) {
    const [name, setName] = React.useState(initialShop.name);
    const [description, setDescription] = React.useState(
        initialShop.description ?? "",
    );
    const [address, setAddress] = React.useState(initialShop.address ?? "");
    const [hours, setHours] = React.useState(initialShop.hours ?? "");
    const [coverImageUrl, setCoverImageUrl] = React.useState(
        initialShop.coverImageUrl ?? "",
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
        return () => {
            if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
            }
        };
    }, [localPreviewUrl]);

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

        const nextPreviewUrl = URL.createObjectURL(file);

        setSelectedFile(file);
        setLocalPreviewUrl(nextPreviewUrl);
        setError(null);
        setSavedMessage("");
    }

    async function uploadSelectedImage(): Promise<string | null> {
        if (!selectedFile) {
            const trimmedUrl = coverImageUrl.trim();
            return trimmedUrl === "" ? null : trimmedUrl;
        }

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

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

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        setError(null);
        setSavedMessage("");

        const trimmedName = name.trim();
        if (!trimmedName) {
            setError("店舗名は必須です。");
            return;
        }

        setSaving(true);

        try {
            const uploadedCoverImageUrl = await uploadSelectedImage();

            const res = await fetch("/api/admin/shop", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: trimmedName,
                    description: description.trim(),
                    address: address.trim(),
                    hours: hours.trim(),
                    coverImageUrl: uploadedCoverImageUrl,
                }),
            });

            const data = (await res.json().catch(() => null)) as {
                error?: string;
                shop?: {
                    updatedAt: string;
                    coverImageUrl?: string | null;
                };
            } | null;

            if (!res.ok) {
                setError(data?.error ?? "保存に失敗しました。");
                return;
            }

            setSavedMessage("店舗情報を保存しました。");

            if (data?.shop?.coverImageUrl !== undefined) {
                setCoverImageUrl(data.shop.coverImageUrl ?? "");
            }

            if (data?.shop?.updatedAt) {
                setUpdatedAtText(
                    formatDateTimeJa(data.shop.updatedAt),
                );
            }

            setSelectedFile(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(`保存中にエラーが発生しました: ${msg}`);
        } finally {
            setSaving(false);
        }
    }

    const previewImageUrl = localPreviewUrl || coverImageUrl.trim() || "";

    return (
        <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr]">
                    <div className="relative min-h-[360px] overflow-hidden bg-gradient-to-r from-green-200 via-green-100 to-gray-50 p-8 md:p-10">
                        {previewImageUrl ? (
                            <div
                                className="absolute inset-0 bg-cover bg-center"
                                style={{
                                    backgroundImage: `url("${previewImageUrl}")`,
                                }}
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
                                        {hours.trim() || "未設定"}
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
                            className="rounded-xl bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-black/80 disabled:opacity-60"
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
                            <textarea
                                id="shop-address"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="例：愛知県名古屋市..."
                                rows={3}
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="shop-hours"
                                className="mb-2 block text-sm font-bold text-gray-900"
                            >
                                営業時間
                            </label>
                            <textarea
                                id="shop-hours"
                                value={hours}
                                onChange={(e) => setHours(e.target.value)}
                                placeholder={
                                    "例：\n平日 11:00-15:00 / 17:00-21:00\n土日祝 11:00-21:00"
                                }
                                rows={4}
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                            />
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            type="submit"
                            disabled={saving || uploading}
                            className="inline-flex items-center justify-center rounded-xl bg-[#13ec13] px-5 py-3 text-sm font-bold text-black transition hover:bg-[#0db80d] disabled:opacity-60"
                        >
                            {uploading
                                ? "画像アップロード中..."
                                : saving
                                  ? "保存中..."
                                  : "変更を保存"}
                        </button>

                        <Link
                            href="/admin/menus"
                            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-800 transition hover:bg-gray-50"
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
                                来店前に確認されやすいので、改行を使って見やすく書くのがおすすめです。
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
