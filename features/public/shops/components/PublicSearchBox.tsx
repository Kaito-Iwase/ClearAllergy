"use client";

// このコンポーネントは公開画面共通の検索ボックスです。
// 検索送信で一覧は keyword、店舗内は q を更新し、Client Component の絞り込みへ反映します。
// Client Component なのは、入力イベントと router.replace を使うためです。

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
    placeholder?: string;
};

function autoPlaceholder(pathname: string): string {
    if (pathname === "/shops") return "店舗を検索";
    if (pathname.startsWith("/shops/")) return "この店舗のメニューを検索";
    return "検索";
}

export default function PublicSearchBox({ placeholder }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const isShopList = pathname === "/shops" || !pathname.startsWith("/shops/");
    const targetPath = isShopList ? "/shops" : pathname.split("/").slice(0, 3).join("/");
    const initialQ = isShopList
        ? searchParams.get("keyword") ?? searchParams.get("q") ?? ""
        : searchParams.get("q") ?? "";
    const [q, setQ] = useState(initialQ);
    const [previousQ, setPreviousQ] = useState(initialQ);
    if (previousQ !== initialQ) {
        setPreviousQ(initialQ);
        setQ(initialQ);
    }
    const resolvedPlaceholder = placeholder ?? autoPlaceholder(targetPath);

    function search(value: string) {
        const sp = new URLSearchParams(targetPath === pathname ? searchParams.toString() : "");
        sp.delete("q");
        sp.delete("keyword");
        sp.delete("places");
        if (value.trim()) sp.set(isShopList ? "keyword" : "q", value.trim());
        const queryString = sp.toString();
        router.replace(queryString ? `${targetPath}?${queryString}` : targetPath);
    }

    const onClear = () => {
        setQ("");
        search("");
    };

    return (
        <form role="search" className="relative" onSubmit={(event) => { event.preventDefault(); search(q); }}>
            <button type="submit" aria-label={resolvedPlaceholder} className="absolute inset-y-0 left-0 grid place-items-center pl-3 text-gray-500">
                🔎
            </button>

            <input
                className="block w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm placeholder:text-gray-400 focus:border-[#13ec13] focus:outline-none focus:ring-2 focus:ring-[#13ec13]/30"
                placeholder={resolvedPlaceholder}
                type="search"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                aria-label={resolvedPlaceholder}
            />

            {q.trim() !== "" ? (
                <button
                    type="button"
                    onClick={onClear}
                    className="absolute inset-y-0 right-0 grid place-items-center pr-3 text-gray-500 hover:text-gray-700"
                    aria-label="検索をクリア"
                    title="クリア"
                >
                    ✕
                </button>
            ) : null}
        </form>
    );
}
