// このコンポーネントは管理画面全体の共通レイアウトです。
// app/admin/(dashboard)/layout.tsx から呼ばれ、サイドバー・モバイルヘッダー・ログアウト導線をまとめます。
// ページ固有の中身は children として差し込まれます。

import type { ReactNode } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import AdminLogoutButton from "@/components/admin/common/AdminLogoutButton";
import BrandLogo from "@/components/layout/BrandLogo";

export default function AdminDashboardShell({
    children,
    shopHref = "/admin/shop",
    menusHref = "/admin/menus",
}: {
    children: ReactNode;
    shopHref?: string;
    menusHref?: string;
}) {
    return (
        <div className="relative flex min-h-screen w-full flex-row overflow-hidden bg-background-light text-text-main">
            {/* PC では左サイドバーを固定表示し、主要な管理導線をまとめます。 */}
            <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-gray-100 bg-surface-light lg:sticky lg:top-0 lg:flex">
                <div className="p-6">
                    <Link href="/" className="flex items-center">
                        <BrandLogo priority />
                    </Link>
                </div>

                <div className="px-6 py-4">
                    <nav className="flex flex-col gap-2">
                        <Link
                            href={shopHref}
                            className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50"
                        >
                            <span className="material-symbols-outlined text-text-sub group-hover:text-primary">
                                storefront
                            </span>
                            <span className="text-sm font-medium">
                                店舗情報
                            </span>
                        </Link>

                        <Link
                            href={menusHref}
                            className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50"
                        >
                            <span className="material-symbols-outlined text-text-sub group-hover:text-primary">
                                menu_book
                            </span>
                            <span className="text-sm font-medium">
                                メニュー管理
                            </span>
                        </Link>
                    </nav>
                </div>

                {/* 管理画面認証は Clerk に一本化したため、アカウント表示とログアウトは Clerk 前提です。 */}
                <div className="mt-auto border-t border-gray-100 p-6">
                    <div className="mb-4 flex justify-center">
                        <UserButton />
                    </div>
                    <AdminLogoutButton />
                </div>
            </aside>

            {/* メイン領域ではページごとの内容を表示します。 */}
            <main className="flex h-screen flex-1 flex-col overflow-y-auto bg-background-light">
                {/* スマホではサイドバーを出さず、ヘッダーに最小限の操作だけ置きます。 */}
                <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-surface-light p-4 lg:hidden">
                    <Link href="/" className="flex items-center">
                        <BrandLogo variant="compact" priority />
                    </Link>
                    <div className="flex items-center gap-2">
                        <UserButton />
                        <div className="min-w-[108px]">
                            <AdminLogoutButton />
                        </div>
                    </div>
                </header>

                <div className="mx-auto flex w-full max-w-6xl flex-1 p-4 md:p-8">
                    <div className="w-full">{children}</div>
                </div>
            </main>
        </div>
    );
}
