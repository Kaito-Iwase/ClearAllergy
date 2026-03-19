// app/(public)/layout.tsx
// 公開側レイアウト：ヘッダーをここに1本化
// - 「商品一覧」リンクは削除（/menus を使わない方針）
// - 検索プレースホルダーも「店舗を検索」に寄せる

import PublicHeader from "@/components/layout/PublicHeader";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#f6f8f6] text-[#111811]">
            <PublicHeader />
            {children}
        </div>
    );
}
