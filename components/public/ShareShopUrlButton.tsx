"use client";

// components/public/ShareShopUrlButton.tsx
// 「この店舗のURLを共有」ボタン
// - 対応ブラウザ：Web Share APIがあれば share()、無ければ clipboard にコピー

import { useMemo, useState } from "react";

export default function ShareShopUrlButton({ shopId }: { shopId: string }) {
    const [copied, setCopied] = useState(false);

    // 1) 現在のオリジン（例：http://localhost:3000）を使ってURLを組み立てる
    //    windowはクライアントでのみ存在するので useMemo 内で参照する
    const url = useMemo(() => {
        if (typeof window === "undefined") return "";
        return `${window.location.origin}/shops/${shopId}`;
    }, [shopId]);

    const onClick = async () => {
        try {
            // 2) Web Share APIがあれば優先（スマホで自然）
            if (navigator.share) {
                await navigator.share({
                    title: "店舗URL",
                    url,
                });
                return;
            }

            // 3) 無ければclipboardにコピー
            await navigator.clipboard.writeText(url);
            setCopied(true);

            // 4) 1.5秒後に表示を戻す
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // 5) 失敗しても落とさない（何もしない）
            setCopied(false);
        }
    };

    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-extrabold text-black shadow-sm transition hover:bg-[#0db80d]"
            disabled={!url}
            title={url ? url : "URL取得中..."}
        >
            {copied ? "コピーしました" : "この店舗のURLを共有"}
        </button>
    );
}
