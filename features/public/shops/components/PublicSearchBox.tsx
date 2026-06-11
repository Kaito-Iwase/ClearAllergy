"use client";

// このコンポーネントは公開画面共通の検索ボックスです。
// URL クエリ (?q=...) を更新し、その結果を Server Component 側の絞り込みに反映させます。
// Client Component なのは、入力イベントと router.replace を使うためです。

import { useEffect, useMemo, useState } from "react";
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

    const initialQ = useMemo(() => {
        return searchParams.get("q") ?? "";
    }, [searchParams]);

    const [q, setQ] = useState(initialQ);

    // 戻る / 進む などで URL の q が変わった時も入力欄を同期します。
    useEffect(() => {
        setQ(initialQ);
    }, [initialQ]);

    const resolvedPlaceholder = useMemo(() => {
        return placeholder ?? autoPlaceholder(pathname);
    }, [placeholder, pathname]);

    // 入力のたびに URL の q を更新し、Server Component 側の検索結果も変わるようにします。
    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        setQ(next);

        const sp = new URLSearchParams(searchParams.toString());

        if (next.trim() === "") sp.delete("q");
        else sp.set("q", next);
        sp.delete("places");

        const queryString = sp.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    };

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
