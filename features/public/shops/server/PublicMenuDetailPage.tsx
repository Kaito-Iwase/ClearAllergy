// このページは公開側のメニュー詳細画面です。
// 1 件のメニューについて、価格・原材料・アレルゲン 29 品目をまとめて表示します。
// Server Component で DB 取得を行い、localStorage を使う個人向け警告だけ Client Component に任せます。

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import PublicDataUnavailable from "@/features/public/shops/components/PublicDataUnavailable";
import PublicMenuDetailBodyClient from "@/features/public/shops/components/PublicMenuDetailBodyClient";
import {
    buildRecommendedIngredientNotice,
    buildSpecifiedIngredientNotice,
    buildAllergenRows,
    createStatusBySlug,
    isMenuPublishable,
} from "@/lib/allergens";
import { formatDateTimeJa, formatPriceYen } from "@/lib/utils/formatters";
import { sanitizeStoredImageUrl } from "@/lib/storage/image-url-policy";
import { readPublicDataOrFallback } from "@/lib/public-db";

type Params = { shopId: string; menuId: string };

export const revalidate = 60;
export const dynamic = "force-static";

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
            const [allergenMaster, menu] = await Promise.all([
                // 未登録品目も画面に出したいので、29 品目マスタを全件取得します。
                prisma.allergen.findMany({
                    select: { slug: true, nameJa: true, sortOrder: true },
                    orderBy: { sortOrder: "asc" },
                }),

                // 公開中のメニューだけを対象にし、非公開データは見せません。
                prisma.menuItem.findFirst({
                    where: {
                        id: menuId,
                        shopId,
                        isPublished: true,
                        shop: {
                            isActive: true,
                        },
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
                }),
            ]);

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

    const statusBySlug = createStatusBySlug(
        allergenMaster,
        menu.allergenLinks,
    );
    if (
        !isMenuPublishable({
            name: menu.name,
            allergens: allergenMaster,
            statusBySlug,
        })
    ) {
        notFound();
    }

    // マスタ 29 品目を基準に rows を作り、未登録項目も UNKNOWN として常に表示します。
    const rows = buildAllergenRows(allergenMaster, menu.allergenLinks);

    // 特定原材料9品目と特定原材料に準ずるもの20品目を、別の注意ボックスで見せます。
    const specifiedIngredientNotice = buildSpecifiedIngredientNotice({ rows });
    const recommendedIngredientNotice = buildRecommendedIngredientNotice({
        rows,
    });

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
    const statusBySlugForClient = statusBySlug;

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
                    recommendedIngredientNotice={recommendedIngredientNotice}
                    allergensForClient={allergensForClient}
                    statusBySlugForClient={statusBySlugForClient}
                    rows={rows}
                />

                <footer className="mt-8 border-t border-gray-200 py-10 text-center text-xs text-gray-500">
                    © 2026 ClearAllergy Project
                </footer>
            </div>
        </main>
    );
}
