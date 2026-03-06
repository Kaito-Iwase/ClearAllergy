// app/page.tsx
import Link from "next/link";

export default function HomePage() {
    return (
        <main className="min-h-screen bg-[#f6f8f6] text-[#111811]">
            <header className="sticky top-0 z-50 border-b border-gray-200 bg-white px-4 py-3 shadow-sm md:px-10">
                <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-[#13ec13]/10">
                            <span className="text-[#13ec13]">🛡️</span>
                        </div>
                        <span className="text-xl font-bold tracking-tight">
                            ClearAllergy
                        </span>
                    </Link>

                    <nav className="flex items-center gap-4">
                        <Link
                            href="/shops"
                            className="text-sm font-semibold text-gray-700 hover:text-[#13ec13]"
                        >
                            店舗一覧
                        </Link>
                        <Link
                            href="/admin/login"
                            className="rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-extrabold text-black hover:bg-[#0db80d]"
                        >
                            店舗ログイン
                        </Link>
                    </nav>
                </div>
            </header>

            <section className="bg-white">
                <div className="mx-auto max-w-[1200px] px-6 py-12 lg:py-20">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
                        <div className="flex flex-col gap-6">
                            <h1 className="text-4xl font-black leading-tight tracking-tight text-neutral-900 lg:text-5xl xl:text-6xl">
                                『聞かなくても分かる』
                                <br />
                                を増やす、
                                <br />
                                外食のアレルゲン情報。
                            </h1>

                            <p className="text-lg text-neutral-600">
                                食物アレルギーを持つ人と、それに応えたい飲食店をつなぐプラットフォーム。
                                コミュニケーションコストを減らし、安心な外食体験をサポートします。
                            </p>

                            <div className="mt-4 flex flex-wrap gap-4">
                                <Link
                                    href="/shops"
                                    className="flex h-12 items-center justify-center rounded-lg bg-[#13ec13] px-8 text-base font-bold text-neutral-900 shadow-lg shadow-[#13ec13]/20 transition-transform hover:-translate-y-0.5"
                                >
                                    <span className="mr-2">🔎</span>
                                    店舗を探す
                                </Link>

                                <Link
                                    href="/admin/login"
                                    className="flex h-12 items-center justify-center rounded-lg bg-neutral-100 px-8 text-base font-bold text-neutral-900 transition-colors hover:bg-neutral-200"
                                >
                                    <span className="mr-2">🏪</span>
                                    店舗ログイン
                                </Link>
                            </div>

                            <p className="text-sm text-neutral-500">
                                ※
                                MVP版：まずは「店舗ページでアレルゲン情報が見られる」体験に集中しています。
                            </p>
                        </div>

                        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-100 shadow-2xl">
                            <div className="absolute inset-0 bg-gradient-to-tr from-[#13ec13]/25 to-transparent" />
                            <div className="absolute inset-0 grid place-items-center p-8">
                                <div className="w-full max-w-sm rounded-2xl bg-white/70 p-6 backdrop-blur">
                                    <div className="flex items-center gap-3">
                                        <div className="grid size-10 place-items-center rounded-xl bg-[#13ec13]/15">
                                            🛡️
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-neutral-900">
                                                ClearAllergy
                                            </p>
                                            <p className="text-xs text-neutral-600">
                                                Allergen info preview
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-5 space-y-3">
                                        <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
                                            <p className="text-sm font-semibold text-neutral-900">
                                                季節の野菜カレー
                                            </p>
                                            <span className="rounded-full bg-yellow-50 px-2 py-1 text-[11px] font-bold text-yellow-800 ring-1 ring-inset ring-yellow-200">
                                                可能性
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
                                            <p className="text-sm font-semibold text-neutral-900">
                                                チキン南蛮
                                            </p>
                                            <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 ring-1 ring-inset ring-red-200">
                                                含む
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
                                            <p className="text-sm font-semibold text-neutral-900">
                                                塩むすび
                                            </p>
                                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                                ALL FREE
                                            </span>
                                        </div>
                                    </div>

                                    <p className="mt-5 text-xs text-neutral-600">
                                        例：アレルゲン情報が“見える化”されている状態
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-[#f6f8f6] py-20">
                <div className="mx-auto max-w-[800px] px-6 text-center">
                    <h2 className="mb-6 text-3xl font-bold text-neutral-900 md:text-4xl">
                        安心して食事ができる世界へ。
                    </h2>
                    <p className="mb-10 text-lg text-neutral-600">
                        まずは対応店舗のページで、アレルゲン情報を確認できます。
                    </p>

                    <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                        <Link
                            href="/shops"
                            className="flex h-14 w-full items-center justify-center rounded-lg bg-[#13ec13] px-8 text-lg font-bold text-neutral-900 shadow-xl shadow-[#13ec13]/20 transition-transform hover:scale-[1.02] sm:w-auto"
                        >
                            店舗一覧へ
                        </Link>

                        <Link
                            href="/admin/login"
                            className="flex h-14 w-full items-center justify-center rounded-lg border border-neutral-200 bg-white px-8 text-lg font-bold text-neutral-900 transition-colors hover:bg-neutral-50 sm:w-auto"
                        >
                            店舗ログイン
                        </Link>
                    </div>

                    <p className="mt-6 text-xs text-neutral-500">
                        ※
                        表示内容は店舗の登録情報に基づきます。最終確認は店舗へお願いします。
                    </p>
                </div>
            </section>

            <footer className="border-t border-neutral-100 bg-white">
                <div className="mx-auto max-w-[1200px] px-6 py-10 text-center text-sm text-neutral-400">
                    © 2026 ClearAllergy. All rights reserved.
                </div>
            </footer>
        </main>
    );
}
