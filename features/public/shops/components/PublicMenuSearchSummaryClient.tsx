"use client";

import { usePublicApplyProof } from "../freshness/presentation";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { searchPublicMenus } from "./public-menu-search";

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
    usePublicApplyProof("shop-summary");
    const searchParams = useSearchParams();
    const q = (searchParams.get("q") ?? "").trim();

    const resultCount = useMemo(() => searchPublicMenus(menus, q).length, [menus, q]);

    if (q === "") {
        return null;
    }

    return (
        <p className="mt-2 inline-block rounded bg-white/95 px-2 py-1 text-xs font-semibold text-gray-900">
            検索: {q}（{resultCount}件）
        </p>
    );
}
