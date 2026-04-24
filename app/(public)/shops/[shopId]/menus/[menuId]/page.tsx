// このページは公開側のメニュー詳細画面です。
// 1 件のメニューについて、価格・原材料・アレルゲン 28 品目をまとめて表示します。
// Server Component で DB 取得を行い、localStorage を使う個人向け警告だけ Client Component に任せます。

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import PublicDataUnavailable from "@/components/public/PublicDataUnavailable";
import PublicMenuDetailBodyClient from "@/components/public/PublicMenuDetailBodyClient";
import {
    buildSpecifiedIngredientNotice,
    buildAllergenRows,
    createStatusBySlug,
} from "@/lib/allergens";
import { formatDateTimeJa, formatPriceYen } from "@/lib/formatters";
import { sanitizeStoredImageUrl } from "@/lib/image-url-policy";
import { readPublicDataOrFallback } from "@/lib/public-db";

type Params = { shopId: string; menuId: string };

export default async function PublicMenuDetailPage({
    params,
}: {
    params: Params | Promise<Params>;
}) {
    // どの店舗のどのメニューかを、動的ルートの 2 つの ID で決めます。
    const { shopId, menuId } = await params;

    if (!shopId || !menuId) {
        notFound();
    }

    const {
        data: publicMenuData,
        isDatabaseAvailable,
    } = await readPublicDataOrFallback(
        async () => {
            // 未登録品目も画面に出したいので、まず 28 品目マスタを全件取得します。
            const allergenMaster = await prisma.allergen.findMany({
                select: { slug: true, nameJa: true, sortOrder: true },
                orderBy: { sortOrder: "asc" },
            });

            // 公開中のメニューだけを対象にし、非公開データは見せません。
            const menu = await prisma.menuItem.findFirst({
                where: {
                    id: menuId,
                    shopId,
                    isPublished: true,
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    priceYen: true,
                    category: true,
                    ingredients: true,
                    precaution: true,
                    imageUrl: true,
                    imageFrame: true,
                    imageFit: true,
                    imagePosition: true,
                    imageZoom: true,
                    imagePositionX: true,
                    imagePositionY: true,
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

            return {
                allergenMaster,
                menu,
            };
        },
        {
            allergenMaster: [],
            menu: null,
        },
        { context: `public-menu-detail:${shopId}:${menuId}` },
    );

    if (!isDatabaseAvailable) {
        return (
            <PublicDataUnavailable
                title="メニュー情報を読み込めません"
                description="現在データベースへ接続できないため、このメニュー詳細を表示できません。時間をおいて再度お試しください。"
                backHref={shopId ? `/shops/${shopId}` : "/shops"}
                backLabel="店舗ページへ戻る"
            />
        );
    }

    const { allergenMaster, menu } = publicMenuData;

    if (!menu) {
        notFound();
    }

    // マスタ 28 品目を基準に rows を作り、未登録項目も UNKNOWN として常に表示します。
    const rows = buildAllergenRows(allergenMaster, menu.allergenLinks);

    // 特定原材料 8 品目は、上部の大きな注意ボックスでまとめて見せます。
    const specifiedIngredientNotice = buildSpecifiedIngredientNotice({ rows });

    const priceText = formatPriceYen(menu.priceYen);

    const safeImageUrl = sanitizeStoredImageUrl(menu.imageUrl, {
        kind: "menu",
        shopId,
    });

    // Client Component に渡すため、必要最小限の形へ整えます。
    const allergensForClient = allergenMaster.map((allergen) => ({
        slug: allergen.slug,
        nameJa: allergen.nameJa,
    }));

    // localStorage の個人設定と突き合わせるため、slug をキーにした状態表も作ります。
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

                <PublicMenuDetailBodyClient
                    shopId={shopId}
                    shopName={menu.shop.name}
                    menuName={menu.name}
                    description={menu.description}
                    category={menu.category}
                    priceText={priceText}
                    updatedAtText={formatDateTimeJa(menu.updatedAt)}
                    safeImageUrl={safeImageUrl}
                    imageFrame={menu.imageFrame}
                    imageFit={menu.imageFit}
                    imagePosition={menu.imagePosition}
                    imageZoom={menu.imageZoom}
                    imagePositionX={menu.imagePositionX}
                    imagePositionY={menu.imagePositionY}
                    ingredients={menu.ingredients}
                    precaution={menu.precaution}
                    specifiedIngredientNotice={specifiedIngredientNotice}
                    allergensForClient={allergensForClient}
                    statusBySlugForClient={statusBySlugForClient}
                    rows={rows}
                />

                <footer className="mt-8 border-t border-gray-200 py-10 text-center text-xs text-gray-500">
                    © ClearAllergy. All rights reserved.
                </footer>
            </div>
        </main>
    );
}
