"use client";

import React from "react";

export default function ShareShopUrlButton({ shopId }: { shopId: string }) {
    // 1) 初回は server/client で同じ値にする
    const [shopUrl, setShopUrl] = React.useState<string | null>(null);

    // 2) 共有メッセージ
    const [message, setMessage] = React.useState("");

    // 3) マウント後にだけブラウザの origin を使ってURLを作る
    React.useEffect(() => {
        const origin = window.location.origin;
        setShopUrl(`${origin}/shops/${shopId}`);
    }, [shopId]);

    // 4) 一時メッセージを消す
    function showMessage(text: string) {
        setMessage(text);

        window.setTimeout(() => {
            setMessage("");
        }, 2500);
    }

    // 5) ボタンを押したときの処理
    async function onClick() {
        if (!shopUrl) {
            return;
        }

        try {
            // 5-1) 共有APIが使える端末なら共有UIを開く
            if (navigator.share) {
                await navigator.share({
                    title: "ClearAllergy 店舗ページ",
                    text: "この店舗のアレルゲン情報ページです。",
                    url: shopUrl,
                });
                return;
            }

            // 5-2) 共有APIが使えない場合はクリップボードへコピー
            await navigator.clipboard.writeText(shopUrl);
            showMessage("店舗URLをコピーしました。");
        } catch (error) {
            // 5-3) ユーザーキャンセル時は何もしない
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }

            // 5-4) フォールバック：prompt で見せる
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
