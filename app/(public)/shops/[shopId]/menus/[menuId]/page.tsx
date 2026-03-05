// app/(public)/shops/[shopId]/menus/[menuId]/page.tsx
// 公開側：メニュー詳細（AllergySafeの雰囲気寄せ）
// - 28品目を常に表示（未登録はFREE）
// - 上部に警告バナー（CONTAINSなら赤 / MAYのみなら黄 / 全部FREEなら緑）
// 参考UI：ユーザー提供の code.html :contentReference[oaicite:3]{index=3}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

type Params = { shopId: string; menuId: string };
type AllergenStatus = "CONTAINS" | "FREE" | "MAY_CONTAIN";

function statusLabelJa(status: AllergenStatus): string {
    if (status === "CONTAINS") return "含む";
    if (status === "MAY_CONTAIN") return "可能性";
    return "FREE";
}

function statusBadgeClass(status: AllergenStatus): string {
    if (status === "CONTAINS")
        return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
    if (status === "MAY_CONTAIN")
        return "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200";
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
}

function topBanner(args: { contains: string[]; may: string[] }): {
    kind: "danger" | "caution" | "safe";
    title: string;
    desc: string;
    boxClass: string;
    icon: string;
} {
    const { contains, may } = args;

    // 1) CONTAINSが1つでもあれば赤
    if (contains.length > 0) {
        const first = contains[0];
        const rest = contains.slice(1);
        const restText = rest.length > 0 ? `（他：${rest.join("・")}）` : "";
        return {
            kind: "danger",
            title: `アレルゲン情報：${first}を含みます${restText}`,
            desc: "この商品はアレルゲンを含む可能性があります。必ず店舗の表示・注意事項も確認してください。",
            boxClass: "border-l-8 border-red-600 bg-red-50",
            icon: "⚠️",
        };
    }

    // 2) CONTAINSが無く、MAYがあれば黄
    if (may.length > 0) {
        const first = may[0];
        const rest = may.slice(1);
        const restText = rest.length > 0 ? `（他：${rest.join("・")}）` : "";
        return {
            kind: "caution",
            title: `アレルゲン情報：${first}（可能性）${restText}`,
            desc: "コンタミネーション等の可能性があります。心配な場合は店舗に確認してください。",
            boxClass: "border-l-8 border-yellow-500 bg-yellow-50",
            icon: "ℹ️",
        };
    }

    // 3) どちらも無ければ緑
    return {
        kind: "safe",
        title: "アレルゲン情報：登録上はすべてFREEです",
        desc: "ただし製造ラインや調理環境によって変わる可能性があります。必要に応じて店舗に確認してください。",
        boxClass: "border-l-8 border-emerald-600 bg-emerald-50",
        icon: "✅",
    };
}

export default async function PublicMenuDetailPage({
    params,
}: {
    params: Params | Promise<Params>;
}) {
    // 1) Turbopack対策：paramsがPromiseでもOKにする
    const { shopId, menuId } = await params;

    // 2) パラメータが無ければ404
    if (!shopId || !menuId) notFound();

    // 3) 28品目マスタを1回取得（sortOrderで安定順）
    const allergenMaster = await prisma.allergen.findMany({
        select: { slug: true, nameJa: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
    });

    // 4) メニュー詳細を取得（Shopも一緒に）
    //    - allergenLinks で status と slug を取る
    const menu = await prisma.menuItem.findFirst({
        where: { id: menuId, shopId, isPublished: true },
        select: {
            id: true,
            name: true,
            description: true,
            priceYen: true,
            category: true,
            ingredients: true,
            precaution: true,
            imageUrl: true,
            updatedAt: true,
            shop: {
                select: { id: true, name: true },
            },
            allergenLinks: {
                select: {
                    status: true,
                    allergen: { select: { slug: true } },
                },
            },
        },
    });

    if (!menu) notFound();

    // 5) statusBySlug を作る（未登録はFREE）
    const statusBySlug = new Map<string, AllergenStatus>();
    for (const link of menu.allergenLinks) {
        statusBySlug.set(link.allergen.slug, link.status as AllergenStatus);
    }

    // 6) 28品目の表示行を作る（必ず28個出る）
    const rows = allergenMaster.map((a) => {
        const status = statusBySlug.get(a.slug) ?? "FREE";
        return {
            slug: a.slug,
            nameJa: a.nameJa,
            status,
        };
    });

    // 7) 上部バナー用に、CONTAINS/MAYの日本語名を集める
    const containsNames = rows
        .filter((r) => r.status === "CONTAINS")
        .map((r) => r.nameJa);
    const mayNames = rows
        .filter((r) => r.status === "MAY_CONTAIN")
        .map((r) => r.nameJa);

    // 8) バナー内容（赤/黄/緑）
    const banner = topBanner({ contains: containsNames, may: mayNames });

    // 9) 価格表示
    const priceText =
        typeof menu.priceYen === "number"
            ? `¥${menu.priceYen.toLocaleString("ja-JP")}`
            : "価格未設定";

    // 10) 画像URL（無い場合はプレースホルダー）
    const imageStyle = menu.imageUrl
        ? { backgroundImage: `url("${menu.imageUrl}")` }
        : {
              backgroundImage: `linear-gradient(135deg, rgba(19,236,19,0.25), rgba(0,0,0,0.05))`,
          };

    return (
        <div className="min-h-screen bg-[#f6f8f6] text-[#111811]">
            {/* Top Navigation（雰囲気寄せ：固定ヘッダー） */}
            <header className="sticky top-0 z-50 border-b border-gray-200 bg-white px-4 py-3 shadow-sm md:px-10">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-8">
                        <Link href="/shops" className="flex items-center gap-2">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-[#13ec13]/10">
                                <span className="text-[#13ec13]">🛡️</span>
                            </div>
                            <span className="text-xl font-bold tracking-tight">
                                AllerFree
                            </span>
                        </Link>

                        <nav className="hidden items-center gap-9 md:flex">
                            <Link
                                className="text-sm font-medium text-gray-700 hover:text-[#13ec13]"
                                href="/shops"
                            >
                                店舗一覧
                            </Link>
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            href={`/shops/${shopId}`}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            店舗へ戻る
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main */}
            <main className="flex justify-center px-4 py-6 md:px-8">
                <div className="flex w-full max-w-[1024px] flex-col gap-8">
                    {/* Breadcrumbs（雰囲気寄せ） */}
                    <nav className="flex flex-wrap gap-2 text-sm">
                        <Link
                            className="text-gray-500 hover:text-[#13ec13]"
                            href="/shops"
                        >
                            店舗一覧
                        </Link>
                        <span className="text-gray-400">/</span>
                        <Link
                            className="text-gray-500 hover:text-[#13ec13]"
                            href={`/shops/${shopId}`}
                        >
                            {menu.shop.name}
                        </Link>
                        <span className="text-gray-400">/</span>
                        <span className="font-medium">{menu.name}</span>
                    </nav>

                    {/* Warning Banner（最優先・雰囲気寄せ） */}
                    <div
                        className={`flex items-start gap-4 rounded-xl p-6 shadow-sm ${banner.boxClass}`}
                    >
                        <div className="shrink-0 rounded-full bg-white p-2 text-2xl">
                            {banner.icon}
                        </div>
                        <div>
                            <h1
                                className={`mb-2 text-2xl font-extrabold md:text-3xl ${
                                    banner.kind === "danger"
                                        ? "text-red-700"
                                        : banner.kind === "caution"
                                          ? "text-yellow-800"
                                          : "text-emerald-700"
                                }`}
                            >
                                {banner.title}
                            </h1>
                            <p className="font-medium text-gray-700">
                                {banner.desc}
                            </p>
                        </div>
                    </div>

                    {/* Hero（画像 + 概要） */}
                    <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2 lg:gap-12">
                        {/* Image Card */}
                        <div className="relative aspect-square overflow-hidden rounded-2xl bg-white p-8 shadow-sm">
                            <div className="absolute right-4 top-4 z-10 flex gap-2">
                                <button className="rounded-full bg-white/90 p-2 shadow-sm hover:text-[#13ec13]">
                                    ♡
                                </button>
                                <button className="rounded-full bg-white/90 p-2 shadow-sm hover:text-[#13ec13]">
                                    ↗
                                </button>
                            </div>

                            <div
                                className="h-full w-full bg-contain bg-center bg-no-repeat transition-transform duration-300 hover:scale-105"
                                style={imageStyle}
                                aria-label={menu.name}
                            />
                        </div>

                        {/* Summary */}
                        <div className="flex flex-col gap-6">
                            <div>
                                <div className="mb-2 flex items-center gap-2">
                                    {menu.category ? (
                                        <span className="rounded-full bg-[#13ec13]/20 px-2.5 py-0.5 text-xs font-bold text-green-800">
                                            {menu.category}
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700">
                                            カテゴリ未設定
                                        </span>
                                    )}
                                </div>

                                <h2 className="mb-2 text-3xl font-extrabold">
                                    {menu.name}
                                </h2>

                                {menu.description ? (
                                    <p className="mb-4 text-lg text-gray-600">
                                        {menu.description}
                                    </p>
                                ) : (
                                    <p className="mb-4 text-lg text-gray-500">
                                        説明は未登録です。
                                    </p>
                                )}

                                <div className="mb-6 flex items-baseline gap-2">
                                    <span className="text-2xl font-extrabold">
                                        {priceText}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        (税込)
                                    </span>
                                </div>
                            </div>

                            {/* Quick Status（雰囲気寄せ：小カード） */}
                            <div className="grid grid-cols-3 gap-3">
                                {/* ここは“雰囲気”用：上位3つのFREEを表示して「不使用っぽい」見せ方をする */}
                                {rows
                                    .filter((r) => r.status === "FREE")
                                    .slice(0, 3)
                                    .map((r) => (
                                        <div
                                            key={r.slug}
                                            className="flex flex-col items-center justify-center rounded-lg border border-green-100 bg-emerald-50 p-3"
                                        >
                                            <div className="mb-1 text-emerald-700">
                                                ✔
                                            </div>
                                            <div className="text-sm font-bold text-emerald-700">
                                                {r.nameJa} FREE
                                            </div>
                                        </div>
                                    ))}
                                {/* FREEが3つ未満のときの埋め */}
                                {Array.from({
                                    length: Math.max(
                                        0,
                                        3 -
                                            rows
                                                .filter(
                                                    (r) => r.status === "FREE",
                                                )
                                                .slice(0, 3).length,
                                    ),
                                }).map((_, i) => (
                                    <div
                                        key={`filler-${i}`}
                                        className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-3"
                                    >
                                        <div className="mb-1 text-gray-400">
                                            —
                                        </div>
                                        <div className="text-sm font-bold text-gray-500">
                                            —
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Actions（雰囲気寄せ：主ボタン+副ボタン） */}
                            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                <Link
                                    href={`/shops/${shopId}`}
                                    className="flex-1 rounded-lg bg-[#13ec13] px-6 py-3 text-center font-bold text-black shadow-md transition hover:bg-[#0db80d] hover:shadow-lg"
                                >
                                    店舗詳細に戻る
                                </Link>
                                <Link
                                    href={`/shops/${shopId}`}
                                    className="flex-1 rounded-lg border-2 border-[#13ec13] bg-white px-6 py-3 text-center font-bold text-[#13ec13] transition hover:bg-[#13ec13]/5"
                                >
                                    他のメニューを見る
                                </Link>
                            </div>

                            <p className="text-xs text-gray-500">
                                更新:{" "}
                                {new Date(menu.updatedAt).toLocaleString(
                                    "ja-JP",
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Details（左：原材料/アレルゲン表、右：注意事項） */}
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                        {/* Left */}
                        <div className="flex flex-col gap-8 lg:col-span-2">
                            {/* Ingredients */}
                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                                    <span className="text-[#13ec13]">🧺</span>
                                    <h3 className="text-xl font-bold">
                                        原材料名
                                    </h3>
                                </div>

                                {menu.ingredients ? (
                                    <p className="text-base leading-relaxed text-gray-700">
                                        {menu.ingredients}
                                    </p>
                                ) : (
                                    <p className="text-base text-gray-500">
                                        原材料は未登録です。
                                    </p>
                                )}

                                {menu.precaution ? (
                                    <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                                        ※ 注意：{menu.precaution}
                                    </div>
                                ) : null}
                            </div>

                            {/* Allergen Table（28品目を常に表示） */}
                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                                    <span className="text-[#13ec13]">🧾</span>
                                    <h3 className="text-xl font-bold">
                                        アレルゲン（28品目）
                                    </h3>
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {rows.map((r) => (
                                        <div
                                            key={r.slug}
                                            className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
                                        >
                                            <span className="text-sm font-medium text-gray-700">
                                                {r.nameJa}
                                            </span>
                                            <span
                                                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusBadgeClass(
                                                    r.status,
                                                )}`}
                                                title={r.slug}
                                            >
                                                {statusLabelJa(r.status)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right */}
                        <div className="flex flex-col gap-6">
                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-4 flex items-center gap-2">
                                    <span className="text-orange-500">ℹ️</span>
                                    <h3 className="text-lg font-bold">
                                        注意事項
                                    </h3>
                                </div>

                                <ul className="list-disc space-y-2 pl-4 text-sm text-gray-600">
                                    <li>
                                        体調や個人差により反応が異なる場合があります。
                                    </li>
                                    <li>
                                        コンタミネーションの可能性がある場合は店舗へ確認してください。
                                    </li>
                                    <li>
                                        表示内容は更新されることがあります（最終更新日時も確認してください）。
                                    </li>
                                </ul>
                            </div>

                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <h3 className="text-lg font-bold">店舗</h3>
                                <p className="mt-2 text-sm text-gray-600">
                                    {menu.shop.name}
                                </p>
                                <Link
                                    href={`/shops/${shopId}`}
                                    className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-bold text-black hover:bg-[#0db80d]"
                                >
                                    店舗詳細へ
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Footer（軽く雰囲気） */}
                    <footer className="mt-8 border-t border-gray-200 py-10 text-center text-xs text-gray-500">
                        © AllerFree. All rights reserved.
                    </footer>
                </div>
            </main>
        </div>
    );
}
