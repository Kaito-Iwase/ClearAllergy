// このページはメニュー編集画面です。
// menuId に対応する 1 件のメニューを取得し、編集用の初期値を作って Client Component へ渡します。
// Server Component なので、他店舗メニューのアクセス制御と初期データ取得を先に行えます。

import MenuEditClient from "@/components/admin/menu/MenuEditClient";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createStatusBySlug } from "@/lib/allergens";
import { requireCurrentAdminContextOrRedirect } from "@/lib/admin-auth";
import { sanitizeStoredImageUrl } from "@/lib/image-url-policy";
import {
    parseMenuImageFit,
    parseMenuImageFrame,
    parseMenuImagePosition,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
} from "@/lib/menu-image-display";

type PageProps = {
    params: Promise<{ menuId: string }> | { menuId: string };
};

export default async function AdminMenuEditPage({ params }: PageProps) {
    // menuId が正しくても他店舗データは見せないため、最初に管理者文脈を確定します。
    const adminContext = await requireCurrentAdminContextOrRedirect();
    const shopId = adminContext.shop.id;

    // 動的ルートの menuId を使って、どのメニューを編集中か決めます。
    const { menuId } = await params;

    const [allergens, menu] = await Promise.all([
        // 編集フォームの選択肢として使うアレルゲンマスタを取得します。
        prisma.allergen.findMany({
            orderBy: { sortOrder: "asc" },
            select: {
                slug: true,
                nameJa: true,
                nameEn: true,
                sortOrder: true,
            },
        }),

        // where に shopId を含め、他店舗のメニュー ID を直接入力されても取れないようにします。
        prisma.menuItem.findFirst({
            where: { id: menuId, shopId },
            select: {
                id: true,
                shopId: true,
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
                isPublished: true,
                allergenLinks: {
                    select: {
                        status: true,
                        allergen: { select: { slug: true } },
                    },
                },
            },
        }),
    ]);

    if (!menu) {
        notFound();
    }

    // 未登録アレルゲンも含めて 29 品目を常に表示したいので、
    // まず UNKNOWN で埋めてから既存の保存状態で上書きします。
    const initialStatusBySlug = createStatusBySlug(allergens, menu.allergenLinks);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <nav className="mb-4 text-sm text-gray-500">
                    <Link href="/admin/menus" className="hover:text-gray-900">
                        メニュー一覧
                    </Link>
                    <span className="mx-2">/</span>
                    <span className="font-medium text-gray-900">
                        編集: {menu.name}
                    </span>
                </nav>
                <h1 className="text-2xl font-bold text-gray-900">
                    メニュー編集
                </h1>
                <p className="mt-1 text-gray-600">
                    基本情報、価格、原材料名、食品画像、アレルゲン29品目を入力してください。
                </p>

                <div className="mt-6">
                    <MenuEditClient
                        menuId={menu.id}
                        initialName={menu.name}
                        initialDescription={menu.description}
                        initialPriceYen={menu.priceYen}
                        initialCategory={menu.category}
                        initialIngredients={menu.ingredients}
                        initialPrecaution={menu.precaution}
                        initialImageUrl={sanitizeStoredImageUrl(menu.imageUrl, {
                            kind: "menu",
                            shopId,
                        })}
                        initialImageFrame={parseMenuImageFrame(menu.imageFrame)}
                        initialImageFit={parseMenuImageFit(menu.imageFit)}
                        initialImagePosition={parseMenuImagePosition(
                            menu.imagePosition,
                        )}
                        initialImageZoom={parseMenuImageZoom(menu.imageZoom)}
                        initialImagePositionX={parseMenuImagePositionPercent(
                            menu.imagePositionX,
                        )}
                        initialImagePositionY={parseMenuImagePositionPercent(
                            menu.imagePositionY,
                        )}
                        initialIsPublished={menu.isPublished}
                        allergens={allergens}
                        initialStatusBySlug={initialStatusBySlug}
                    />
                </div>
            </div>
        </div>
    );
}
