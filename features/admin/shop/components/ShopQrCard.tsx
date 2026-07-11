"use client";

// 店舗編集画面から呼ばれ、公開 URL の生成・コピー・QR 表示をまとめて担当します。
// Client Component なのは、window / clipboard / QR 表示まわりをブラウザ側で扱うためです。

import Link from "next/link";
import React from "react";
import { QRCodeSVG } from "qrcode.react";

type ShopQrCardProps = {
    shopId: string;
    shopName: string;
};

const QR_SIZE_OPTIONS = [
    { label: "小さめ", sizeMm: 45, desc: "ショップカード向け" },
    { label: "標準", sizeMm: 60, desc: "卓上POP向け" },
] as const;

function formatQrSize(sizeMm: number) {
    return `約${(sizeMm / 10).toFixed(1)}cm`;
}

export default function ShopQrCard({ shopId, shopName }: ShopQrCardProps) {
    const [origin, setOrigin] = React.useState("");
    const [qrSizeMm, setQrSizeMm] = React.useState(60);

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

    const publicShopUrl = origin ? `${origin}/shops/${shopId}` : "";
    const qrSizePx = Math.round(qrSizeMm * 3.78);

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

    function handlePrintQr() {
        if (!publicShopUrl) {
            setCopiedMessage("公開URLをまだ作成できていません。");
            return;
        }

        document.body.classList.add("printing-shop-qr");

        const cleanup = () => {
            document.body.classList.remove("printing-shop-qr");
            window.removeEventListener("afterprint", cleanup);
            window.clearTimeout(cleanupTimer);
        };

        window.addEventListener("afterprint", cleanup);
        const cleanupTimer = window.setTimeout(cleanup, 30000);
        window.requestAnimationFrame(() => window.print());
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
                        店舗QRコード印刷
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                        QRコードの大きさを選んで、店頭POPやメニュー表にそのまま印刷できます。
                    </p>
                </div>

                <div className="grid gap-5 rounded-2xl border border-gray-200 bg-gray-50 p-5 lg:grid-cols-[1fr_280px]">
                    <div className="flex flex-col gap-4">
                        <div className="rounded-lg border border-green-100 bg-white p-4">
                            <p className="text-sm font-bold text-gray-900">
                                印刷サイズ
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                                用途に合わせて変更できます。印刷ボタンを押すと、選んだ大きさでQRだけ印刷します。
                            </p>

                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                {QR_SIZE_OPTIONS.map((option) => {
                                    const selected = qrSizeMm === option.sizeMm;

                                    return (
                                        <button
                                            key={option.sizeMm}
                                            type="button"
                                            onClick={() =>
                                                setQrSizeMm(option.sizeMm)
                                            }
                                            className={`rounded-lg border px-3 py-3 text-left transition ${
                                                selected
                                                    ? "border-[#0f4c2f] bg-[#ecf7ef] text-[#0f4c2f]"
                                                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            <span className="block text-sm font-bold">
                                                {option.label}
                                            </span>
                                            <span className="mt-1 block text-xs">
                                                {formatQrSize(option.sizeMm)} / {option.desc}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <label
                                htmlFor="qr-size"
                                className="mt-4 block text-xs font-bold text-gray-700"
                            >
                                細かく調整: {formatQrSize(qrSizeMm)}
                            </label>
                            <input
                                id="qr-size"
                                type="range"
                                min={35}
                                max={60}
                                step={5}
                                value={qrSizeMm}
                                onChange={(event) =>
                                    setQrSizeMm(Number(event.target.value))
                                }
                                className="mt-2 w-full accent-[#0f4c2f]"
                            />
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                            <p className="font-bold">印刷前の確認</p>
                            <p className="mt-1 leading-6">
                                印刷画面では、店舗名・QRコード・公開URLだけを表示します。用紙設定はブラウザの印刷画面で選べます。
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={handlePrintQr}
                                disabled={!publicShopUrl}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f4c2f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0b3d25] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    print
                                </span>
                                QRを印刷
                            </button>

                            <button
                                type="button"
                                onClick={handleCopyUrl}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 transition hover:bg-gray-100"
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    content_copy
                                </span>
                                URLをコピー
                            </button>

                            {publicShopUrl ? (
                                <Link
                                    href={publicShopUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 transition hover:bg-gray-100"
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        open_in_new
                                    </span>
                                    公開ページを開く
                                </Link>
                            ) : null}
                        </div>

                        {copiedMessage ? (
                            <p className="text-sm font-medium text-green-700">
                                {copiedMessage}
                            </p>
                        ) : null}
                    </div>

                    <div className="qr-print-area flex flex-col items-center gap-4 rounded-lg bg-white p-5 text-center shadow-sm">
                        <div className="qr-print-header">
                            <p className="text-xs font-bold text-[#0f4c2f]">
                                ClearAllergy
                            </p>
                            <p className="mt-1 text-base font-extrabold text-gray-900">
                                {shopName || "店舗名未設定"}
                            </p>
                        </div>

                        <div className="rounded-lg bg-white p-4 ring-1 ring-gray-100">
                            {publicShopUrl ? (
                                <QRCodeSVG
                                    value={publicShopUrl}
                                    size={qrSizePx}
                                    style={{
                                        height: `${qrSizeMm}mm`,
                                        maxWidth: "100%",
                                        width: `${qrSizeMm}mm`,
                                    }}
                                    marginSize={4}
                                    level="M"
                                    includeMargin={false}
                                />
                            ) : (
                                <div
                                    className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-center text-sm text-gray-500"
                                    style={{
                                        height: `${qrSizeMm}mm`,
                                        width: `${qrSizeMm}mm`,
                                    }}
                                >
                                    公開URLを準備中です
                                </div>
                            )}
                        </div>

                        <p className="qr-print-url max-w-full break-all text-xs text-gray-600">
                            {publicShopUrl || "公開URLを生成できていません。"}
                        </p>
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
