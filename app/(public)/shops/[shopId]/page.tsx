// app/(public)/shops/[shopId]/page.tsx
// 公開側：店舗詳細（layout側がヘッダーを持つので、ここではヘッダーを出さない）
// - 公開メニュー：?q=... で検索（name/description/category）
// - 公開メニュー一覧は Client Component に切り出し、localStorage の設定を反映
// - 「あなた向けのアレルゲン設定」は右カラムの店舗情報カードの下に配置
// - 「公開メニューを見る」は最初の公開メニュー詳細へ遷移
// - N+1回避：Allergenマスタ1回 + 店舗/メニュー/links 1回
// - coverImageUrl があればヒーロー背景に表示、なければ既存グラデーション表示

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ShareShopUrlButton from "@/components/public/ShareShopUrlButton";
import ShopMenuListClient from "@/components/public/ShopMenuListClient";
import UserAllergenPreferenceClient from "@/components/public/UserAllergenPreferenceClient";

type Params = { shopId: string };
type SearchParams = { q?: string };

function formatDateTime(value: Date): string {
    return value.toLocaleString("ja-JP");
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

export default async function PublicShopDetailPage({
    params,
    searchParams,
}: {
    params: Params | Promise<Params>;
    searchParams?: SearchParams | Promise<SearchParams>;
}) {
    const { shopId } = await params;
    if (!shopId) {
        notFound();
    }

    const resolvedSearchParams = (await searchParams) ?? {};
    const qRaw = resolvedSearchParams.q ?? "";
    const q = qRaw.trim();

    const allergenMaster = await prisma.allergen.findMany({
        select: { slug: true, nameJa: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
    });

    const menuWhere = buildMenuWhere(q);

    const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: {
            id: true,
            name: true,
            description: true,
            address: true,
            hours: true,
            coverImageUrl: true,
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
                            allergen: { select: { slug: true } },
                        },
                    },
                },
            },
        },
    });

    if (!shop) {
        notFound();
    }

    const menusForClient = shop.menus.map((menu) => ({
        id: menu.id,
        name: menu.name,
        description: menu.description,
        priceYen: menu.priceYen,
        category: menu.category,
        updatedAt: menu.updatedAt.toISOString(),
        allergenLinks: menu.allergenLinks.map((link) => ({
            status: link.status,
            allergen: {
                slug: link.allergen.slug,
            },
        })),
    }));

    const allergensForClient = allergenMaster.map((allergen) => ({
        slug: allergen.slug,
        nameJa: allergen.nameJa,
    }));

    const firstPublishedMenuId = shop.menus[0]?.id ?? null;
    const publishedMenuCount = shop.menus.length;

    const heroStyle = shop.coverImageUrl
        ? {
              backgroundImage: `url("${shop.coverImageUrl}")`,
          }
        : {
              backgroundImage:
                  "linear-gradient(90deg, rgba(19,236,19,0.25) 0%, rgba(19,236,19,0.10) 55%, rgba(255,255,255,0) 100%)",
          };

    return (
        <main className="flex justify-center px-4 py-6 md:px-8">
            <div className="flex w-full max-w-[1024px] flex-col gap-6">
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

                <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div
                        className="relative h-56 w-full bg-cover bg-center bg-no-repeat md:h-64"
                        style={heroStyle}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-black/15 to-transparent" />

                        <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                <div className="relative z-10">
                                    <p className="text-sm font-semibold text-white/90 drop-shadow">
                                        公開メニュー {publishedMenuCount}件
                                    </p>
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

                                <div className="relative z-10 flex gap-3">
                                    <Link
                                        href={
                                            firstPublishedMenuId
                                                ? `/shops/${shop.id}/menus/${firstPublishedMenuId}`
                                                : "#public-menus"
                                        }
                                        className="rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-bold text-black shadow-sm transition hover:bg-[#0db80d]"
                                    >
                                        公開メニューを見る
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="flex flex-col gap-6 lg:col-span-2">
                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <h2 className="text-base font-extrabold">
                                お店の説明
                            </h2>
                            <p className="mt-2 text-sm text-gray-700">
                                {shop.description || "未設定"}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
                                <span className="rounded-full bg-gray-100 px-2 py-1">
                                    公開メニュー {publishedMenuCount}件
                                </span>
                                <span className="rounded-full bg-gray-100 px-2 py-1">
                                    アレルゲン28品目を表示
                                </span>
                                <span className="rounded-full bg-gray-100 px-2 py-1">
                                    価格表示あり
                                </span>
                            </div>
                        </div>

                        <ShopMenuListClient
                            shopId={shop.id}
                            menus={menusForClient}
                            allergenMaster={allergenMaster}
                            q={q}
                        />
                    </div>

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

                        <UserAllergenPreferenceClient
                            allergens={allergensForClient}
                        />
                    </aside>
                </section>
            </div>
        </main>
    );
}
