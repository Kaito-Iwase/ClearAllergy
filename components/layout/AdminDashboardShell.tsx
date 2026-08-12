// このコンポーネントは管理画面全体の共通レイアウトです。
// app/admin/(dashboard)/layout.tsx から呼ばれ、サイドバー・モバイルヘッダー・ログアウト導線をまとめます。
// ページ固有の中身は children として差し込まれます。

import type { ReactNode } from "react";
import Link from "next/link";
import AdminLogoutButton from "@/components/layout/AdminLogoutButton";
import BrandLogo from "@/components/layout/BrandLogo";

export default function AdminDashboardShell({
    children,
    shopHref = "/admin/shop",
    menusHref = "/admin/menus",
    showAuthControls = true,
}: {
    children: ReactNode;
    shopHref?: string;
    menusHref?: string;
    showAuthControls?: boolean;
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
                    {showAuthControls ? (
                        <AdminLogoutButton />
                    ) : (
                        <Link
                            href="/admin/register"
                            className="inline-flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50"
                        >
                            登録画面へ戻る
                        </Link>
                    )}
                </div>
            </aside>

            {/* メイン領域ではページごとの内容を表示します。 */}
            <main className="flex h-dvh flex-1 flex-col overflow-y-auto bg-background-light">
                {/* スマホではサイドバーを出さず、ヘッダーに最小限の操作だけ置きます。 */}
                <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-surface-light p-4 lg:hidden">
                    <Link href="/" className="flex items-center">
                        <BrandLogo variant="compact" priority />
                    </Link>
                    <div className="flex items-center gap-2">
                        {showAuthControls ? (
                            <div className="min-w-[108px]">
                                <AdminLogoutButton />
                            </div>
                        ) : (
                            <Link
                                href="/admin/register"
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-800 hover:bg-gray-50"
                            >
                                登録画面へ戻る
                            </Link>
                        )}
                    </div>
                </header>

                <div className="mx-auto flex w-full max-w-6xl flex-1 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-8">
                    <div className="w-full">{children}</div>
                </div>
            </main>

            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
                <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
                    <Link
                        href={shopHref}
                        className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                    >
                        <span className="material-symbols-outlined text-[22px] text-[#0f4c2f]">
                            storefront
                        </span>
                        店舗情報
                    </Link>

                    <Link
                        href={menusHref}
                        className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                    >
                        <span className="material-symbols-outlined text-[22px] text-[#0f4c2f]">
                            menu_book
                        </span>
                        メニュー管理
                    </Link>
                </div>
            </nav>
        </div>
    );
}
