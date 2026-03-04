import type { ReactNode } from "react";
import Link from "next/link";

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <div className="relative flex min-h-screen w-full flex-row overflow-hidden bg-background-light text-text-main">
            {/* Sidebar (Desktop) */}
            <aside className="hidden lg:flex flex-col w-64 bg-surface-light border-r border-gray-100 h-screen sticky top-0">
                <div className="p-6 flex items-center gap-3">
                    <div className="size-8 text-primary">
                        {/* Material Symbols を使うなら span を残す */}
                        <span className="material-symbols-outlined text-4xl">
                            health_and_safety
                        </span>
                    </div>
                    <h1 className="font-bold text-xl tracking-tight">
                        AllergyGuard
                    </h1>
                </div>

                <div className="px-6 py-4">
                    <nav className="flex flex-col gap-2">
                        <Link
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                            href="/admin/menus"
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

                <div className="mt-auto p-6 border-t border-gray-100">
                    <button className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                        <span className="material-symbols-outlined text-lg">
                            logout
                        </span>
                        ログアウト
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 flex flex-col h-screen overflow-y-auto bg-background-light">
                {/* Mobile Header（最短：見た目だけ） */}
                <header className="lg:hidden flex items-center justify-between p-4 bg-surface-light border-b border-gray-100 sticky top-0 z-20">
                    <div className="flex items-center gap-2 text-primary font-bold text-lg">
                        <span className="material-symbols-outlined">
                            health_and_safety
                        </span>
                        AllergyGuard
                    </div>
                    <button className="p-2 text-gray-600">
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                </header>

                <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
