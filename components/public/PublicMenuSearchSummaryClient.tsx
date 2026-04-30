"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

type MenuSearchItem = {
    name: string;
    description: string | null;
    category: string | null;
};

export default function PublicMenuSearchSummaryClient({
    menus,
}: {
    menus: MenuSearchItem[];
}) {
    const searchParams = useSearchParams();
    const q = (searchParams.get("q") ?? "").trim();

    const resultCount = useMemo(() => {
        if (q === "") {
            return menus.length;
        }

        const needle = q.toLocaleLowerCase("ja-JP");
        return menus.filter((menu) => {
            return (
                menu.name.toLocaleLowerCase("ja-JP").includes(needle) ||
                (menu.description ?? "")
                    .toLocaleLowerCase("ja-JP")
                    .includes(needle) ||
                (menu.category ?? "")
                    .toLocaleLowerCase("ja-JP")
                    .includes(needle)
            );
        }).length;
    }, [menus, q]);

    if (q === "") {
        return null;
    }

    return (
        <p className="mt-2 text-xs font-semibold text-white/90 drop-shadow">
            検索: {q}（{resultCount}件）
        </p>
    );
}
