// 公開画面共通のレイアウトです。
// 公開側のヘッダーはここに集約し、各ページは本文だけを担当します。

import PublicHeader from "@/components/layout/PublicHeader";
import PublicFreshnessNavigation from "@/features/public/shops/components/PublicFreshnessNavigation";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#f6f8f6] text-[#111811]">
            <PublicHeader />
            <PublicFreshnessNavigation>{children}</PublicFreshnessNavigation>
        </div>
    );
}
