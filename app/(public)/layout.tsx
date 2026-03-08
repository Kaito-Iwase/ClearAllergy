// app/(public)/layout.tsx
// 公開側レイアウト：ヘッダーをここに1本化
// - 「商品一覧」リンクは削除（/menus を使わない方針）
// - 検索プレースホルダーも「店舗を検索」に寄せる

import Link from "next/link";
import PublicSearchBox from "@/components/public/PublicSearchBox";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#f6f8f6] text-[#111811]">
            <header className="sticky top-0 z-50 border-b border-gray-200 bg-white px-4 py-3 shadow-sm md:px-10">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-[#13ec13]/10">
                                <span className="text-[#13ec13]">🛡️</span>
                            </div>
                            <span className="text-xl font-bold tracking-tight">
                                ClearAllergy
                            </span>
                        </Link>

                        {/* ✅ ナビは店舗一覧だけにする */}
                        <nav className="hidden items-center gap-9 md:flex">
                            <Link
                                className="text-sm font-medium text-gray-700 hover:text-[#13ec13]"
                                href="/shops"
                            >
                                店舗一覧
                            </Link>
                        </nav>
                    </div>
                    {/* ✅ 検索の意図も「店舗」に寄せる */}
                    {/* // layout.tsx の検索部分だけ差し替え */}
                    <div className="hidden w-full max-w-xs md:block">
                        <PublicSearchBox />
                    </div>
                </div>
            </header>

            {children}
        </div>
    );
}
