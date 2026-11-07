"use client";

import Link from "next/link";
import PublicMenuDetailBodyClient from "./PublicMenuDetailBodyClient";
import type { PublicMenuDetailData } from "@/features/public/shops/freshness/contracts";

export default function PublicMenuDetailView(data: PublicMenuDetailData) {
    const { shopId, shopName, menuName } = data;

    return (
        <main className="flex justify-center px-4 py-6 md:px-8">
            <div className="flex w-full max-w-[1024px] flex-col gap-8">
                <nav className="flex flex-wrap gap-2 text-sm">
                    <Link
                        className="text-gray-500 hover:text-[#13ec13]"
                        href="/shops"
                    >
                        店舗一覧
                    </Link>
                    <span className="text-gray-400">/</span>
                    <Link
                        className="text-gray-500 hover:text-[#13ec13]"
                        href={`/shops/${shopId}`}
                    >
                        {shopName}
                    </Link>
                    <span className="text-gray-400">/</span>
                    <span className="font-medium">{menuName}</span>
                </nav>

                <PublicMenuDetailBodyClient {...data} />

                <footer className="mt-8 border-t border-gray-200 py-10 text-center text-xs text-gray-500">
                    © 2026 ClearAllergy Project
                </footer>
            </div>
        </main>
    );
}
