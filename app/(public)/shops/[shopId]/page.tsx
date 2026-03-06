// app/(public)/shops/[shopId]/page.tsx
// 公開側：店舗詳細（layout側がヘッダーを持つので、ここではヘッダーを出さない）
// - 公開メニュー：?q=... で検索（name/description/category）
// - メニューカード：要約（最大3つ）＋赤/黄/緑バッジ
// - N+1回避：Allergenマスタ1回 + 店舗/メニュー/links 1回

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ShareShopUrlButton from "@/components/public/ShareShopUrlButton";

type Params = { shopId: string };
type SearchParams = { q?: string };

type AllergenStatus = "CONTAINS" | "FREE" | "MAY_CONTAIN";
type BadgeKind = "danger" | "caution" | "safe";

function badgeClass(kind: BadgeKind): string {
    if (kind === "danger") {
        return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
    }

    if (kind === "caution") {
        return "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200";
    }

    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
}

function badgeLabel(kind: BadgeKind): string {
    if (kind === "danger") return "含む";
    if (kind === "caution") return "可能性";
    return "ALL FREE";
}

function formatDateTime(value: Date): string {
    return value.toLocaleString("ja-JP");
}

function formatPriceYen(priceYen: number | null): string {
    if (typeof priceYen !== "number") {
        return "価格未設定";
    }

    return `${priceYen.toLocaleString("ja-JP")}円`;
}

function buildMenuWhere(q: string) {
    if (q === "") {
        return {
            isPublished: true,
        };
    }

    return {
        isPublished: true,
        OR: [
            {
                name: {
                    contains: q,
                    mode: "insensitive" as const,
                },
            },
            {
                description: {
                    contains: q,
                    mode: "insensitive" as const,
                },
            },
            {
                category: {
                    contains: q,
                    mode: "insensitive" as const,
                },
            },
        ],
    };
}

function buildAllergenSummary(args: {
    links: Array<{ status: AllergenStatus; allergen: { slug: string } }>;
    nameJaBySlug: Map<string, string>;
    rankBySlug: Map<string, number>;
}): {
    summaryText: string;
    badge: BadgeKind;
    containsCount: number;
    mayCount: number;
} {
    const { links, nameJaBySlug, rankBySlug } = args;

    const containsSlugs: string[] = [];
    const maySlugs: string[] = [];

    // 1) CONTAINS/MAYだけ集める（FREEは要約に出さない）
    for (const link of links) {
        const slug = link.allergen.slug;

        if (link.status === "CONTAINS") {
            containsSlugs.push(slug);
        } else if (link.status === "MAY_CONTAIN") {
            maySlugs.push(slug);
        }
    }

    // 2) バッジ判定
    const badge: BadgeKind =
        containsSlugs.length > 0
            ? "danger"
            : maySlugs.length > 0
              ? "caution"
              : "safe";

    // 3) 表示順の安定化（sortOrder由来）
    const byRank = (a: string, b: string) =>
        (rankBySlug.get(a) ?? 9999) - (rankBySlug.get(b) ?? 9999);

    containsSlugs.sort(byRank);
    maySlugs.sort(byRank);

    // 4) slug -> nameJa（無ければslug）
    const toName = (slug: string) => nameJaBySlug.get(slug) ?? slug;
    const containsNames = containsSlugs.map(toName);
    const mayNames = maySlugs.map(toName);

    // 5) 最大3つ（CONTAINS優先）
    const pickedContains = containsNames.slice(0, 3);
    const remain = 3 - pickedContains.length;
    const pickedMay = remain > 0 ? mayNames.slice(0, remain) : [];

    // 6) 表示文
    const parts: string[] = [];
    if (pickedContains.length > 0) {
        parts.push(`${pickedContains.join("・")}（含む）`);
    }
    if (pickedMay.length > 0) {
        parts.push(`${pickedMay.join("・")}（可能性）`);
    }

    const summaryText = parts.length > 0 ? parts.join(" / ") : "特記事項なし";

    return {
        summaryText,
        badge,
        containsCount: containsSlugs.length,
        mayCount: maySlugs.length,
    };
}

export default async function PublicShopDetailPage({
    params,
    searchParams,
}: {
    params: Params | Promise<Params>;
    searchParams?: SearchParams | Promise<SearchParams>;
}) {
    // 1) params は Promise のことがあるので await してから使う
    const { shopId } = await params;
    if (!shopId) {
        notFound();
    }

    // 2) searchParams も Promise のことがあるので await してから使う
    const resolvedSearchParams = (await searchParams) ?? {};
    const qRaw = resolvedSearchParams.q ?? "";
    const q = qRaw.trim();

    // 3) Allergenマスタを1回取得（表示名＆順位）
    const allergenMaster = await prisma.allergen.findMany({
        select: {
            slug: true,
            nameJa: true,
            sortOrder: true,
        },
        orderBy: {
            sortOrder: "asc",
        },
    });

    const nameJaBySlug = new Map<string, string>();
    const rankBySlug = new Map<string, number>();

    for (let i = 0; i < allergenMaster.length; i++) {
        const allergen = allergenMaster[i];
        nameJaBySlug.set(allergen.slug, allergen.nameJa);
        rankBySlug.set(allergen.slug, i);
    }

    // 4) メニュー検索条件
    const menuWhere = buildMenuWhere(q);

    // 5) 店舗＋公開メニュー＋linksをまとめて取得（N+1回避）
    const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: {
            id: true,
            name: true,
            description: true,
            address: true,
            hours: true,
            updatedAt: true,
            menus: {
                where: menuWhere,
                orderBy: { updatedAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    priceYen: true,
                    category: true,
                    updatedAt: true,
                    allergenLinks: {
                        select: {
                            status: true,
                            allergen: {
                                select: {
                                    slug: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!shop) {
        notFound();
    }

    return (
        <main className="flex justify-center px-4 py-6 md:px-8">
            <div className="flex w-full max-w-[1024px] flex-col gap-6">
                {/* パンくず */}
                <nav className="flex flex-wrap gap-2 text-sm">
                    <Link
                        className="text-gray-500 hover:text-[#13ec13]"
                        href="/shops"
                    >
                        店舗一覧
                    </Link>
                    <span className="text-gray-400">/</span>
                    <span className="font-medium">{shop.name}</span>
                </nav>

                {/* ヒーロー */}
                <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="h-56 w-full bg-gradient-to-r from-[#13ec13]/25 via-[#13ec13]/10 to-transparent md:h-64" />

                    <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div>
                                <h1 className="text-3xl font-extrabold text-white drop-shadow md:text-4xl">
                                    {shop.name}
                                </h1>

                                <p className="mt-1 text-sm font-semibold text-white/90 drop-shadow">
                                    {shop.description || "—"}
                                </p>

                                {q !== "" ? (
                                    <p className="mt-2 text-xs font-semibold text-white/90 drop-shadow">
                                        検索: {q}（{shop.menus.length}件）
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex gap-3">
                                <a
                                    href="#public-menus"
                                    className="rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-bold text-black shadow-sm transition hover:bg-[#0db80d]"
                                >
                                    公開メニューを見る
                                </a>

                                <a
                                    href="#shop-info"
                                    className="rounded-lg bg-white/90 px-4 py-2 text-sm font-bold text-gray-800 shadow-sm transition hover:bg-white"
                                >
                                    店舗情報
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 下段 */}
                <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* 左 */}
                    <div className="flex flex-col gap-6 lg:col-span-2">
                        {/* お店の説明 */}
                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <h2 className="text-base font-extrabold">
                                お店の説明
                            </h2>
                            <p className="mt-2 text-sm text-gray-700">
                                {shop.description || "未設定"}
                            </p>
                        </div>

                        {/* 公開メニュー */}
                        <div
                            id="public-menus"
                            className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
                        >
                            <div className="mb-4 flex items-end justify-between">
                                <h2 className="text-base font-extrabold">
                                    公開メニュー
                                </h2>
                                <p className="text-xs text-gray-500">
                                    {shop.menus.length} 件
                                </p>
                            </div>

                            {shop.menus.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
                                    <p className="text-sm text-gray-700">
                                        {q !== ""
                                            ? "検索条件に一致する公開メニューがありません。"
                                            : "現在公開中のメニューはありません。"}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {shop.menus.map((menu) => {
                                        const {
                                            summaryText,
                                            badge,
                                            containsCount,
                                            mayCount,
                                        } = buildAllergenSummary({
                                            links: menu.allergenLinks as Array<{
                                                status: AllergenStatus;
                                                allergen: { slug: string };
                                            }>,
                                            nameJaBySlug,
                                            rankBySlug,
                                        });

                                        const priceText = formatPriceYen(
                                            menu.priceYen,
                                        );

                                        return (
                                            <Link
                                                key={menu.id}
                                                href={`/shops/${shop.id}/menus/${menu.id}`}
                                                className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <h3 className="truncate text-base font-extrabold text-gray-900">
                                                            {menu.name}
                                                        </h3>

                                                        <p className="mt-1 text-xs font-semibold text-gray-600">
                                                            含む{containsCount}
                                                            ・可能性{mayCount}
                                                        </p>

                                                        <p className="mt-2 text-sm text-gray-700">
                                                            {menu.category ||
                                                                "カテゴリ未設定"}{" "}
                                                            ・ {priceText}
                                                        </p>
                                                    </div>

                                                    <span className="text-gray-400 group-hover:text-gray-600">
                                                        ›
                                                    </span>
                                                </div>

                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                    <span
                                                        className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${badgeClass(
                                                            badge,
                                                        )}`}
                                                    >
                                                        {badgeLabel(badge)}
                                                    </span>

                                                    <p className="text-right text-xs text-gray-500">
                                                        更新:{" "}
                                                        {formatDateTime(
                                                            menu.updatedAt,
                                                        )}
                                                    </p>
                                                </div>

                                                <p className="mt-2 text-xs text-gray-600">
                                                    {summaryText}
                                                </p>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右：店舗情報 */}
                    <aside id="shop-info" className="flex flex-col gap-6">
                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <h2 className="text-base font-extrabold">
                                店舗情報
                            </h2>

                            <div className="mt-4 space-y-3 text-sm text-gray-700">
                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 text-gray-500">
                                        📍
                                    </span>
                                    <div>
                                        <p className="font-semibold">住所</p>
                                        <p className="text-gray-600">
                                            {shop.address || "未設定"}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 text-gray-500">
                                        🕒
                                    </span>
                                    <div>
                                        <p className="font-semibold">
                                            営業時間
                                        </p>
                                        <p className="text-gray-600">
                                            {shop.hours || "未設定"}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 text-gray-500">
                                        🔄
                                    </span>
                                    <div>
                                        <p className="font-semibold">更新</p>
                                        <p className="text-gray-600">
                                            {formatDateTime(shop.updatedAt)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5">
                                <ShareShopUrlButton shopId={shop.id} />
                            </div>

                            <p className="mt-3 text-xs text-gray-500">
                                ※QR表示は次で追加できます
                            </p>
                        </div>
                    </aside>
                </section>
            </div>
        </main>
    );
}
