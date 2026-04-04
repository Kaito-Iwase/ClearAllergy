// このコンポーネントはトップページ全体の公開 UI です。
// app/page.tsx などから呼ばれ、サービス紹介と店舗一覧 / 管理画面への導線をまとめて表示します。
// featuredShop があれば、実データを使ったメニュー例カードもここで描画します。

import Image from "next/image";
import Link from "next/link";
import BrandLogo from "@/components/layout/BrandLogo";
import { formatPriceYen } from "@/lib/formatters";

type FeaturedMenu = {
    id: string;
    name: string;
    priceYen: number | null;
    allergenLinks: Array<{
        status: string;
    }>;
};

type FeaturedShop = {
    id: string;
    name: string;
    description: string | null;
    menus: FeaturedMenu[];
    _count: {
        menus: number;
    };
} | null;

export default function HomePageView({
    featuredShop,
}: {
    featuredShop: FeaturedShop;
}) {
    return (
        <main className="min-h-screen bg-[#f6f8f6] text-[#111811]">
            <header className="sticky top-0 z-50 border-b border-gray-200 bg-white px-4 py-3 shadow-sm md:px-10">
                <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
                    <Link href="/" className="flex items-center">
                        <BrandLogo priority />
                    </Link>

                    <nav className="flex items-center gap-4">
                        <Link
                            href="/shops"
                            className="text-sm font-semibold text-gray-700 transition hover:text-[#13ec13]"
                        >
                            店舗一覧
                        </Link>
                        <Link
                            href="/admin/login"
                            className="rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-extrabold text-black transition hover:bg-[#0db80d]"
                        >
                            店舗ログイン
                        </Link>
                    </nav>
                </div>
            </header>

            <section className="bg-white">
                <div className="mx-auto max-w-[1200px] px-6 py-12 lg:py-20">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
                        <div className="flex flex-col gap-5">
                            <h1 className="text-neutral-900">
                                <span className="block text-[42px] font-black leading-[0.92] tracking-[-0.06em] xl:text-[54px]">
                                    『聞かなくても分かる』
                                </span>
                                <span className="block text-[44px] font-black leading-[0.92] tracking-[-0.06em] xl:text-[58px]">
                                    を増やす
                                </span>
                                <span className="block text-[44px] font-black leading-[0.92] tracking-[-0.06em] xl:text-[58px]">
                                    外食のアレルゲン情報
                                </span>
                            </h1>

                            <p className="text-lg leading-8 text-neutral-600">
                                食物アレルギーを持つ人と、それに応えたい飲食店をつなぐサービスです。
                                店舗ごとのメニュー情報とアレルゲン情報を見やすく整理し、
                                外食前の確認を少しでもしやすくすることを目指しています。
                            </p>

                            <div className="mt-2 flex flex-wrap gap-4">
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
                                    店舗の方はこちら
                                </Link>
                            </div>

                            <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-900">
                                <p className="font-semibold">MVP版について</p>
                                <p className="mt-1 leading-6">
                                    現在は、まず
                                    「店舗ページでメニューごとのアレルゲン情報を確認できる」
                                    体験に集中して開発しています。
                                </p>
                                {featuredShop ? (
                                    <p className="mt-2 leading-6">
                                        デモ用として
                                        <span className="font-semibold">
                                            {" "}
                                            Clear Cafe Demo と Cafe Hibi
                                        </span>
                                        を公開しています。
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-100 shadow-2xl">
                            <div className="absolute inset-0 bg-gradient-to-tr from-[#13ec13]/25 to-transparent" />
                            <div className="absolute inset-0 grid place-items-center p-8">
                                <div className="w-full max-w-sm rounded-2xl bg-white/80 p-6 backdrop-blur">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <Image
                                                src="/images/clearallergy-mark.svg"
                                                alt=""
                                                width={32}
                                                height={32}
                                                className="size-8 object-contain"
                                            />
                                            <div>
                                                <p className="text-[15px] font-extrabold tracking-[-0.03em] text-neutral-900">
                                                    ClearAllergy
                                                </p>
                                            </div>
                                        </div>

                                        <p className="text-right text-xs leading-5 text-neutral-500">
                                            Allergen info
                                            <br />
                                            preview
                                        </p>
                                    </div>

                                    <div className="mt-5 space-y-3">
                                        {featuredShop ? (
                                            featuredShop.menus.map((menu) => {
                                                // トップの例カードでは、メニュー全体の状態を 3 段階のバッジに簡略化して見せます。
                                                const hasContains =
                                                    menu.allergenLinks.some(
                                                        (link) =>
                                                            link.status ===
                                                            "CONTAINS",
                                                    );
                                                const hasMayContain =
                                                    !hasContains &&
                                                    menu.allergenLinks.some(
                                                        (link) =>
                                                            link.status ===
                                                            "MAY_CONTAIN",
                                                    );

                                                const badgeClass = hasContains
                                                    ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200"
                                                    : hasMayContain
                                                      ? "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200"
                                                      : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";

                                                const badgeText = hasContains
                                                    ? "含む"
                                                    : hasMayContain
                                                      ? "可能性"
                                                      : "含まない";

                                                return (
                                                    <div
                                                        key={menu.id}
                                                        className="rounded-xl bg-white p-3 shadow-sm"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-sm font-semibold text-neutral-900">
                                                                {menu.name}
                                                            </p>
                                                            <span
                                                                className={`rounded-full px-2 py-1 text-[11px] font-bold ${badgeClass}`}
                                                            >
                                                                {badgeText}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-xs text-neutral-500">
                                                            {formatPriceYen(
                                                                menu.priceYen,
                                                            )}
                                                        </p>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <>
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
                                            </>
                                        )}
                                    </div>

                                    <p className="mt-5 text-xs leading-5 text-neutral-600">
                                        {featuredShop
                                            ? `${featuredShop.name} の公開メニュー例。メニューごとの価格とアレルゲン状況を事前に確認できます。`
                                            : "例：店舗ごとのメニュー情報とアレルゲン情報が、事前に見やすく整理されている状態"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-[#f6f8f6] py-16">
                <div className="mx-auto grid max-w-[1200px] gap-6 px-6 md:grid-cols-3">
                    <div className="rounded-2xl bg-white p-6 shadow-sm">
                        <div className="mb-3 text-2xl">📋</div>
                        <h2 className="text-lg font-bold text-neutral-900">
                            メニューごとに確認
                        </h2>
                        <p className="mt-2 text-sm leading-7 text-neutral-600">
                            店舗単位だけではなく、メニュー単位でアレルゲン情報を確認しやすくします。
                        </p>
                    </div>

                    <div className="rounded-2xl bg-white p-6 shadow-sm">
                        <div className="mb-3 text-2xl">👀</div>
                        <h2 className="text-lg font-bold text-neutral-900">
                            見やすく整理
                        </h2>
                        <p className="mt-2 text-sm leading-7 text-neutral-600">
                            「含む」「含まない」「含む可能性があります」を見分けやすく表示します。
                        </p>
                    </div>

                    <div className="rounded-2xl bg-white p-6 shadow-sm">
                        <div className="mb-3 text-2xl">🏪</div>
                        <h2 className="text-lg font-bold text-neutral-900">
                            店舗が更新できる
                        </h2>
                        <p className="mt-2 text-sm leading-7 text-neutral-600">
                            店舗側が情報を登録・更新できることで、最新の情報に近づけることを目指します。
                        </p>
                    </div>
                </div>
            </section>

            <section className="bg-white py-20">
                <div className="mx-auto max-w-[900px] px-6">
                    <div className="mx-auto max-w-[760px] text-center">
                        <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900 md:text-3xl">
                            作成背景
                        </h2>
                        <p className="mt-6 text-base leading-8 text-neutral-600 md:text-lg">
                            外食時、食物アレルギーを持つ人にとっては<br></br>
                            毎回スタッフに確認しないと分からないことが多く
                            <br />
                            「食べられるかどうか」を判断するまでに負担がかかる場面があります。
                        </p>
                        <p className="mt-4 text-base leading-8 text-neutral-600 md:text-lg">
                            ClearAllergy は、
                            店舗ごとのメニュー情報とアレルゲン情報を事前に見やすくし
                            <br />
                            確認のしやすさを少しでも高めるために作成しています。
                        </p>
                    </div>
                </div>
            </section>

            <section className="bg-[#f6f8f6] py-20">
                <div className="mx-auto max-w-[1000px] px-6">
                    <div className="mx-auto max-w-[760px] text-center">
                        <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900 md:text-3xl">
                            ご利用にあたって
                        </h2>
                        <p className="mt-4 text-base leading-8 text-neutral-600 md:text-lg">
                            このサービスは、店舗ごとのアレルゲン情報を見やすくするためのものです。
                            <br />
                            ただし、最終的な判断は必ず店舗での確認も含めて行ってください。
                        </p>
                    </div>

                    <div className="mt-10 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                            <h3 className="text-base font-bold text-neutral-900">
                                1. 表示内容について
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-neutral-600">
                                掲載情報は店舗の登録情報に基づいています。
                                仕入れやレシピ変更、入力内容の更新タイミングによって、
                                実際の内容と異なる場合があります。
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                            <h3 className="text-base font-bold text-neutral-900">
                                2. 混入の可能性について
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-neutral-600">
                                同一厨房、同一器具、同一油などの調理環境によって、
                                意図しない混入が起こる可能性があります。
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                            <h3 className="text-base font-bold text-neutral-900">
                                3. 症状が重い場合
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-neutral-600">
                                重い症状が出る可能性がある方は、
                                この表示だけで判断せず、必ず店舗へ直接確認してください。
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                            <h3 className="text-base font-bold text-neutral-900">
                                4. 利用目的について
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-neutral-600">
                                このサービスは、外食前の確認をしやすくする補助を目的としています。
                                安全を完全に保証するものではありません。
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-white py-20">
                <div className="mx-auto max-w-[800px] px-6 text-center">
                    <h2 className="mb-6 text-3xl font-bold text-neutral-900 md:text-4xl">
                        安心して食事ができる世界へ。
                    </h2>
                    <p className="mb-10 text-lg leading-8 text-neutral-600">
                        まずは対応店舗のページで、メニューごとのアレルゲン情報を確認できます。
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

                    <p className="mt-6 text-xs leading-6 text-neutral-500">
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
