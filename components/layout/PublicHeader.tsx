// components/layout/PublicHeader.tsx
import Link from "next/link";

export default function PublicHeader() {
    return (
        <header className="sticky top-0 z-50 w-full bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-4 sm:px-10 py-3 shadow-sm">
            <div className="max-w-7xl mx-auto flex items-center justify-between whitespace-nowrap">
                <div className="flex items-center gap-8">
                    <Link
                        href="/shops"
                        className="flex items-center gap-2 text-text-main dark:text-white"
                    >
                        <div className="size-8 text-primary flex items-center justify-center bg-primary/10 rounded-lg">
                            <span className="material-symbols-outlined text-[24px]!">
                                verified_user
                            </span>
                        </div>
                        <h2 className="text-xl font-bold leading-tight tracking-[-0.015em]">
                            AllerFree
                        </h2>
                    </Link>

                    <nav className="hidden md:flex items-center gap-9">
                        <Link
                            className="text-text-main dark:text-slate-200 text-sm font-medium hover:text-primary transition-colors"
                            href="/shops"
                        >
                            店舗一覧
                        </Link>
                        <Link
                            className="text-text-main dark:text-slate-200 text-sm font-medium hover:text-primary transition-colors"
                            href="/menus"
                        >
                            商品一覧
                        </Link>
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    <label className="hidden sm:flex flex-col min-w-40 h-10 w-64">
                        <div className="flex w-full flex-1 items-stretch rounded-lg h-full bg-gray-100 dark:bg-gray-800 group focus-within:ring-2 ring-primary/50 transition-all">
                            <div className="text-gray-500 dark:text-gray-400 flex items-center justify-center pl-4 pr-2">
                                <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 20 }}
                                >
                                    search
                                </span>
                            </div>
                            <input
                                className="flex w-full min-w-0 flex-1 bg-transparent border-none text-text-main dark:text-white placeholder:text-gray-400 focus:ring-0 text-sm"
                                placeholder="店舗やメニューを検索"
                            />
                        </div>
                    </label>
                </div>
            </div>
        </header>
    );
}
