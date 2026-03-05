"use client";

// components/public/PublicSearchBox.tsx
// URLクエリ (?q=...) を更新する検索ボックス
// - ページのパスに応じて placeholder を自動切替
// - 入力 → router.replace でURL更新 → Server側がsearchParams.qで絞り込み

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
    // これが渡されたらそれを優先。渡されない場合は自動切替。
    placeholder?: string;
};

function autoPlaceholder(pathname: string): string {
    // 1) /shops（店舗一覧）
    if (pathname === "/shops") return "店舗を検索";

    // 2) /shops/[shopId]（店舗詳細）や /shops/[shopId]/...（メニュー詳細）
    //    → 店の中のコンテンツを探すニュアンスにする
    if (pathname.startsWith("/shops/")) return "この店舗のメニューを検索";

    // 3) その他
    return "検索";
}

export default function PublicSearchBox({ placeholder }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // 1) URLに入っている q を初期値として取り出す
    const initialQ = useMemo(() => {
        return searchParams.get("q") ?? "";
    }, [searchParams]);

    // 2) 入力欄の状態（state：画面の状態を保存する仕組み）
    const [q, setQ] = useState(initialQ);

    // 3) URL側のqが変わったとき、入力欄も同期する
    useEffect(() => {
        setQ(initialQ);
    }, [initialQ]);

    // 4) プレースホルダーを決める（props優先→なければ自動）
    const resolvedPlaceholder = useMemo(() => {
        return placeholder ?? autoPlaceholder(pathname);
    }, [placeholder, pathname]);

    // 5) 入力変更イベント
    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        setQ(next);

        const sp = new URLSearchParams(searchParams.toString());

        if (next.trim() === "") sp.delete("q");
        else sp.set("q", next);

        const queryString = sp.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    };

    // 6) クリア
    const onClear = () => {
        setQ("");
        const sp = new URLSearchParams(searchParams.toString());
        sp.delete("q");
        const queryString = sp.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    };

    return (
        <div className="relative">
            <span className="absolute inset-y-0 left-0 grid place-items-center pl-3 text-gray-500">
                🔎
            </span>

            <input
                className="block w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm placeholder:text-gray-400 focus:border-[#13ec13] focus:outline-none focus:ring-2 focus:ring-[#13ec13]/30"
                placeholder={resolvedPlaceholder}
                type="search"
                value={q}
                onChange={onChange}
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
        </div>
    );
}
