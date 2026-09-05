// このコンポーネントはトップページ全体の公開 UI です。
// app/page.tsx などから呼ばれ、サービス紹介と店舗一覧 / 管理画面への導線をまとめて表示します。
// featuredShop があれば、実データを使ったメニュー例カードもここで描画します。

import Image from "next/image";
import Link from "next/link";
import BrandLogo from "@/components/layout/BrandLogo";
import { formatPriceYen } from "@/lib/utils/formatters";

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
    isDatabaseAvailable,
}: {
    featuredShop: FeaturedShop;
    isDatabaseAvailable: boolean;
}) {
    return (
        <main className="min-h-screen bg-[#f6f8f6] text-[#111811]">
            <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white shadow-sm">
                <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6 md:px-10">
                    <Link href="/" className="flex min-w-0 items-center">
                        <BrandLogo variant="publicHeader" priority />
                    </Link>

                    <nav className="flex shrink-0 items-center gap-2 sm:gap-4">
                        <Link
                            href="/shops"
                            className="hidden text-sm font-semibold leading-tight text-gray-700 transition hover:text-[#13ec13] sm:inline"
                        >
                            店舗一覧
                        </Link>
                        <Link
                            href="/terms"
                            className="hidden text-sm font-semibold leading-tight text-gray-600 transition hover:text-[#13ec13] sm:inline"
                        >
                            利用規約
                        </Link>
                        <Link
                            href="/admin/login"
                            className="shrink-0 whitespace-nowrap rounded-lg bg-[#13ec13] px-3 py-1.5 text-xs font-extrabold leading-none text-black transition hover:bg-[#0db80d] sm:px-4 sm:py-2 sm:text-sm"
                        >
                            <span className="sm:hidden">ログイン</span>
                            <span className="hidden sm:inline">店舗ログイン</span>
                        </Link>
                    </nav>
                </div>
            </header>

            <section className="bg-white">
                <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 lg:py-16">
                    <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-8">
                        <div className="flex flex-col gap-5">
                            <h1 className="text-neutral-900">
                                <span className="block text-[36px] font-black leading-[1.08] tracking-[-0.04em] sm:text-[56px] sm:leading-[1.02] sm:tracking-[-0.05em] lg:text-[54px] xl:text-[62px]">
                                    外食前に、
                                </span>
                                <span className="block text-[36px] font-black leading-[1.08] tracking-[-0.04em] sm:text-[56px] sm:leading-[1.02] sm:tracking-[-0.05em] lg:text-[54px] xl:text-[62px]">
                                    登録情報を確認できる。
                                </span>
                                <span className="block text-[36px] font-black leading-[1.08] tracking-[-0.04em] sm:text-[56px] sm:leading-[1.02] sm:tracking-[-0.05em] lg:text-[54px] xl:text-[62px]">
                                    アレルゲン情報を
                                </span>
                                <span className="block text-[36px] font-black leading-[1.08] tracking-[-0.04em] sm:text-[56px] sm:leading-[1.02] sm:tracking-[-0.05em] lg:text-[54px] xl:text-[62px]">
                                    見やすく届ける。
                                </span>
                            </h1>

                            <p className="text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
                                食物アレルギーを持つ人と、それに応えたい飲食店をつなぐサービスです。
                                店舗ごとのメニュー情報とアレルゲン情報を見やすく整理し、
                                外食前の確認を少しでもしやすくすることを目指しています。
                            </p>

                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                                <p className="font-bold">
                                    このサイトは ClearAllergy
                                    のポートフォリオ公開版です
                                </p>
                                <p className="mt-1 leading-6">
                                    掲載する店舗・メニューは架空です。アレルゲン情報の見え方と操作を検証するためのプロトタイプです。
                                </p>
                            </div>

                            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                                <Link
                                    href="/shops"
                                    className="flex h-12 w-full items-center justify-center rounded-lg bg-[#13ec13] px-4 text-base font-bold text-neutral-900 shadow-lg shadow-[#13ec13]/20 transition-transform hover:-translate-y-0.5 sm:w-auto sm:px-8"
                                >
                                    <span className="mr-2">🔎</span>
                                    店舗を探す
                                </Link>

                                <Link
                                    href="/admin/login"
                                    className="flex h-12 w-full items-center justify-center rounded-lg bg-neutral-100 px-4 text-base font-bold text-neutral-900 transition-colors hover:bg-neutral-200 sm:w-auto sm:px-8"
                                >
                                    <span className="mr-2">🏪</span>
                                    店舗の方はこちら
                                </Link>
                            </div>
                        </div>

                        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-100 shadow-2xl">
                            <div className="absolute inset-0 bg-gradient-to-tr from-[#13ec13]/25 to-transparent" />
                            <div className="absolute inset-0 grid place-items-center p-4 sm:p-8">
                                <div className="w-full max-w-sm rounded-2xl bg-white/80 p-4 backdrop-blur sm:p-6">
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
                                                      : "詳細確認";

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

                    <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-8">
                        <div className="h-full rounded-2xl border border-green-100 bg-green-50 px-5 py-4 text-sm text-green-900">
                            <p className="font-semibold">現在の提供範囲</p>
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
                                        Cafe Hibi
                                    </span>
                                    を公開しています。
                                </p>
                            ) : null}
                            {!isDatabaseAvailable ? (
                                <p className="mt-2 leading-6 text-amber-800">
                                    現在は公開データの読み込みに失敗しているため、
                                    画面はサンプル表示に切り替えています。
                                </p>
                            ) : null}
                        </div>

                        <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-sm text-neutral-700 shadow-sm">
                            <p className="font-semibold text-neutral-900">
                                利用者向けのご案内
                            </p>
                            <p className="mt-1 leading-6">
                                アレルゲン情報を確認する際は、実際の利用前に店舗へ直接ご確認ください。
                                新規登録・編集機能の一般公開は今後調整予定です。
                            </p>
                            <Link
                                href="/terms"
                                className="mt-auto inline-flex pt-2 text-sm font-semibold text-green-800 underline-offset-4 hover:underline"
                            >
                                利用規約を確認する
                            </Link>
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
                            「含む」「原材料に含まない登録」「含む可能性あり・要確認」を見分けやすく表示します。
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
                            架空情報のため、実際の飲食判断には使用しないでください。
                        </p>
                    </div>

                    <div className="mt-10 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                            <h3 className="text-base font-bold text-neutral-900">
                                1. 表示内容について
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-neutral-600">
                                架空店舗が管理する登録情報を想定したデモです。
                                表示の分かりやすさと入力・更新操作を確認できます。
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                            <h3 className="text-base font-bold text-neutral-900">
                                2. 要確認の表示について
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-neutral-600">
                                「含む可能性あり・要確認」は、含む可能性があり確認が必要な状態です。
                                他メニューからの補足は厨房での確認結果ではありません。
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                            <h3 className="text-base font-bold text-neutral-900">
                                3. 実際の飲食判断には使用しない
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-neutral-600">
                                このデモは食品の安全性や摂取可否を判断しません。
                                架空の登録内容を実際の食品の情報として扱わないでください。
                            </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                            <h3 className="text-base font-bold text-neutral-900">
                                4. 利用目的について
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-neutral-600">
                                このプロトタイプは情報の表示・操作を検証するものです。
                                食品の安全性や摂取可否を判定・保証するものではありません。
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-white py-20">
                <div className="mx-auto max-w-[800px] px-6 text-center">
                    <h2 className="mb-6 text-3xl font-bold text-neutral-900 md:text-4xl">
                        アレルゲン情報を、誤認されにくい表示へ。
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
                <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-center gap-3 px-6 py-10 text-center text-sm text-neutral-400 sm:flex-row">
                    <span>© 2026 ClearAllergy Project</span>
                    <Link
                        href="/terms"
                        className="font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline"
                    >
                        利用規約
                    </Link>
                </div>
            </footer>
        </main>
    );
}
