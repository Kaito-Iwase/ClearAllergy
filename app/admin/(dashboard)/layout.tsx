// この layout は /admin 配下のダッシュボード共通枠です。
// メニュー管理や店舗編集など、管理画面の各ページから自動的に使われます。
// 共通ナビゲーションやログアウト導線は AdminDashboardShell にまとめています。

import type { ReactNode } from "react";
import AdminDashboardShell from "@/components/layout/AdminDashboardShell";

export default function AdminDashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    return <AdminDashboardShell>{children}</AdminDashboardShell>;
}
