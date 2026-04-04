"use client";

// このコンポーネントは店舗公開ページ用の QR コード表示カードです。
// 店舗編集画面から呼ばれ、公開 URL の生成・コピー・QR 表示をまとめて担当します。
// Client Component なのは、window / clipboard / QR 表示まわりをブラウザ側で扱うためです。

import Link from "next/link";
import React from "react";
import { QRCodeSVG } from "qrcode.react";

type ShopQrCardProps = {
    shopId: string;
    shopName: string;
};

export default function ShopQrCard({ shopId, shopName }: ShopQrCardProps) {
    // state（画面の状態）として、公開 URL とコピー結果メッセージを持ちます。
    const [origin, setOrigin] = React.useState("");

    // 2) コピー成功メッセージ表示用の状態
    const [copiedMessage, setCopiedMessage] = React.useState("");

    // 本番 URL が環境変数にあればそれを優先し、無ければ今のブラウザ origin を使います。
    React.useEffect(() => {
        const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

        if (envBaseUrl) {
            setOrigin(envBaseUrl.replace(/\/$/, ""));
            return;
        }

        if (typeof window !== "undefined") {
            setOrigin(window.location.origin);
        }
    }, []);

    // origin が決まってから店舗公開 URL を組み立てます。
    const publicShopUrl = origin ? `${origin}/shops/${shopId}` : "";

    // 共有しやすいよう、まずはクリップボードへコピーする導線を用意します。
    async function handleCopyUrl() {
        if (!publicShopUrl) {
            setCopiedMessage("公開URLをまだ作成できていません。");
            return;
        }

        try {
            await navigator.clipboard.writeText(publicShopUrl);
            setCopiedMessage("公開URLをコピーしました。");
        } catch {
            setCopiedMessage("コピーに失敗しました。");
        }
    }

    // 補助メッセージは数秒で自動的に消し、画面に残り続けないようにします。
    React.useEffect(() => {
        if (!copiedMessage) {
            return;
        }

        const timer = window.setTimeout(() => {
            setCopiedMessage("");
        }, 2500);

        return () => {
            window.clearTimeout(timer);
        };
    }, [copiedMessage]);

    return (
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4">
                <div>
                    <h3 className="text-2xl font-extrabold text-gray-900">
                        店舗QRコード
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                        店頭POPやメニュー表に掲載すると、お客様がこの店舗の公開ページをスマホですぐ開けます。
                    </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                    <div className="flex flex-col items-center gap-4">
                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            {publicShopUrl ? (
                                <QRCodeSVG
                                    value={publicShopUrl}
                                    size={220}
                                    marginSize={4}
                                    level="M"
                                    includeMargin={false}
                                />
                            ) : (
                                <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center text-sm text-gray-500">
                                    公開URLを準備中です
                                </div>
                            )}
                        </div>

                        <div className="text-center">
                            <p className="text-sm font-bold text-gray-900">
                                {shopName || "店舗名未設定"}
                            </p>
                            <p className="mt-2 break-all text-xs text-gray-600">
                                {publicShopUrl ||
                                    "公開URLを生成できていません。"}
                            </p>
                        </div>

                        <div className="flex flex-wrap justify-center gap-3">
                            <button
                                type="button"
                                onClick={handleCopyUrl}
                                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 transition hover:bg-gray-100"
                            >
                                URLをコピー
                            </button>

                            {publicShopUrl ? (
                                <Link
                                    href={publicShopUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-bold text-white transition hover:bg-black/80"
                                >
                                    公開ページを開く
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    disabled
                                    className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-bold text-white opacity-50"
                                >
                                    公開ページを開く
                                </button>
                            )}
                        </div>

                        {copiedMessage ? (
                            <p className="text-sm text-green-700">
                                {copiedMessage}
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-900">
                    <p className="font-bold">使い方</p>
                    <p className="mt-1">
                        このQRコードを店頭やメニュー表に載せると、お客様は店舗ページからメニュー一覧へ進み、各メニューのアレルゲン情報を確認できます。
                    </p>
                </div>
            </div>
        </section>
    );
}
