// app/(public)/shops/[shopId]/menus/[menuId]/page.tsx
// 公開側：メニュー詳細
// - 28品目を常に表示（未登録は「含まない」として扱う）
// - localStorage の一般ユーザー設定に応じて「あなた向け警告」を表示
// - 特定原材料8品目の含有状況を明記して表示
// - ヘッダーは layout 側を使うので、このページでは出さない

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import UserAllergenPreferenceClient from "@/components/public/UserAllergenPreferenceClient";
import MenuAllergenAlertClient from "@/components/public/MenuAllergenAlertClient";
import SelectedFreeAllergenCardsClient from "@/components/public/SelectedFreeAllergenCardsClient";
import {
    buildSpecifiedIngredientNotice,
    createStatusBySlug,
    statusBadgeClass,
    statusLabelJa,
    type AllergenStatus,
} from "@/lib/allergens";
import { formatDateTimeJa, formatPriceYen } from "@/lib/formatters";

type Params = { shopId: string; menuId: string };

export default async function PublicMenuDetailPage({
    params,
}: {
    params: Params | Promise<Params>;
}) {
    const { shopId, menuId } = await params;

    if (!shopId || !menuId) {
        notFound();
    }

    const allergenMaster = await prisma.allergen.findMany({
        select: { slug: true, nameJa: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
    });

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

    if (!menu) {
        notFound();
    }

    const linkStatusBySlug = new Map<string, AllergenStatus>();
    for (const link of menu.allergenLinks) {
        linkStatusBySlug.set(link.allergen.slug, link.status as AllergenStatus);
    }

    const rows = allergenMaster.map((a) => {
        const status = linkStatusBySlug.get(a.slug) ?? "FREE";
        return {
            slug: a.slug,
            nameJa: a.nameJa,
            status,
        };
    });

    const specifiedIngredientNotice = buildSpecifiedIngredientNotice({ rows });

    const priceText = formatPriceYen(menu.priceYen);

    const imageStyle = menu.imageUrl
        ? { backgroundImage: `url("${menu.imageUrl}")` }
        : {
              backgroundImage:
                  "linear-gradient(135deg, rgba(19,236,19,0.25), rgba(0,0,0,0.05))",
          };

    const allergensForClient = allergenMaster.map((allergen) => ({
        slug: allergen.slug,
        nameJa: allergen.nameJa,
    }));

    const statusBySlugForClient = createStatusBySlug(
        allergenMaster,
        menu.allergenLinks,
    );

    return (
        <main className="flex justify-center px-4 py-6 md:px-8">
            <div className="flex w-full max-w-[1024px] flex-col gap-8">
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

                <UserAllergenPreferenceClient allergens={allergensForClient} />

                <MenuAllergenAlertClient
                    allergens={allergensForClient}
                    statusBySlug={statusBySlugForClient}
                />

                <div
                    className={`rounded-xl p-6 shadow-sm ${specifiedIngredientNotice.boxClass}`}
                >
                    <h2
                        className={`text-xl font-extrabold md:text-2xl ${specifiedIngredientNotice.titleClass}`}
                    >
                        {specifiedIngredientNotice.title}
                    </h2>

                    <p
                        className={`mt-2 text-sm font-medium ${specifiedIngredientNotice.textClass}`}
                    >
                        {specifiedIngredientNotice.desc}
                    </p>

                    <p
                        className={`mt-2 text-sm ${specifiedIngredientNotice.textClass}`}
                    >
                        判定結果：{specifiedIngredientNotice.resultText}
                    </p>
                </div>

                <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2 lg:gap-12">
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-white p-8 shadow-sm">
                        <div className="absolute right-4 top-4 z-10 flex gap-2">
                            <button
                                type="button"
                                className="rounded-full bg-white/90 p-2 shadow-sm hover:text-[#13ec13]"
                            >
                                ♡
                            </button>
                            <button
                                type="button"
                                className="rounded-full bg-white/90 p-2 shadow-sm hover:text-[#13ec13]"
                            >
                                ↗
                            </button>
                        </div>

                        <div
                            className="h-full w-full bg-contain bg-center bg-no-repeat transition-transform duration-300 hover:scale-105"
                            style={imageStyle}
                            aria-label={menu.name}
                        />
                    </div>

                    <div className="flex flex-col gap-6">
                        <div>
                            <p className="mb-2 text-sm font-semibold text-gray-500">
                                {menu.shop.name} の公開メニュー
                            </p>
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
                                    （税込）
                                </span>
                            </div>
                        </div>

                        <div>
                            <p className="mb-3 text-sm font-bold text-gray-900">
                                選択中アレルゲンのうち含まない項目
                            </p>
                            <SelectedFreeAllergenCardsClient
                                allergens={allergensForClient}
                                statusBySlug={statusBySlugForClient}
                            />
                        </div>

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
                            更新：{" "}
                            {formatDateTimeJa(menu.updatedAt)}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                    <div className="flex flex-col gap-8 lg:col-span-2">
                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                                <span className="text-[#13ec13]">🧺</span>
                                <h3 className="text-xl font-bold">原材料名</h3>
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
                                    ※ 注意事項：{menu.precaution}
                                </div>
                            ) : null}
                        </div>

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

                    <div className="flex flex-col gap-6">
                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center gap-2">
                                <span className="text-orange-500">ℹ️</span>
                                <h3 className="text-lg font-bold">注意事項</h3>
                            </div>

                            <ul className="list-disc space-y-2 pl-4 text-sm text-gray-600">
                                <li>
                                    体調や個人差により反応が異なる場合があります。
                                </li>
                                <li>
                                    コンタミネーションの可能性がある場合は店舗へ確認してください。
                                </li>
                                <li>
                                    表示内容は更新されることがあります。最終更新日時も確認してください。
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

                <footer className="mt-8 border-t border-gray-200 py-10 text-center text-xs text-gray-500">
                    © ClearAllergy. All rights reserved.
                </footer>
            </div>
        </main>
    );
}
