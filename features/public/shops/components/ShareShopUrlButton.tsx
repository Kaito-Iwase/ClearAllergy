"use client";

// このコンポーネントは店舗ページ URL の共有ボタンです。
// 管理画面と公開画面の両方で使え、共有 API があればそれを使い、無ければコピーへフォールバックします。
// Client Component なのは、window / navigator.share / clipboard を使うためです。

import React from "react";

export default function ShareShopUrlButton({ shopId }: { shopId: string }) {
    // 初回は server / client で同じ描画にしたいので、URL は null から始めます。
    const [shopUrl, setShopUrl] = React.useState<string | null>(null);

    const [message, setMessage] = React.useState("");

    // ブラウザでしか origin が取れないため、マウント後に公開 URL を組み立てます。
    React.useEffect(() => {
        const origin = window.location.origin;
        setShopUrl(`${origin}/shops/${shopId}`);
    }, [shopId]);

    function showMessage(text: string) {
        setMessage(text);

        window.setTimeout(() => {
            setMessage("");
        }, 2500);
    }

    // 共有 API が使える端末ではそれを優先し、無ければコピーに切り替えます。
    async function onClick() {
        if (!shopUrl) {
            return;
        }

        try {
            if (navigator.share) {
                await navigator.share({
                    title: "ClearAllergy 店舗ページ",
                    text: "この店舗のアレルゲン情報ページです。",
                    url: shopUrl,
                });
                return;
            }

            await navigator.clipboard.writeText(shopUrl);
            showMessage("店舗URLをコピーしました。");
        } catch (error) {
            // 共有ダイアログのキャンセルはエラー扱いせず静かに終えます。
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }

            // 最後の手段として URL を見せ、手動コピーできるようにします。
            window.prompt("このURLをコピーしてください", shopUrl);
        }
    }

    const disabled = shopUrl === null;
    const title = shopUrl ?? "URL取得中...";

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                title={title}
                className="w-full rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-extrabold text-black shadow-sm transition hover:bg-[#0db80d] disabled:cursor-not-allowed disabled:opacity-60"
            >
                この店舗のURLを共有
            </button>

            {message ? (
                <p className="text-xs text-gray-600">{message}</p>
            ) : null}
        </div>
    );
}
