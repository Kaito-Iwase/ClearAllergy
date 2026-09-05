import { DEMO_SHOP_WHERE } from "@/lib/auth/demo-shop";
import Link from "next/link";
import { notFound } from "next/navigation";
import MenuEditClient from "@/features/admin/menus/components/MenuEditClient";
import AdminDashboardShell from "@/components/layout/AdminDashboardShell";
import { createStatusBySlug } from "@/lib/allergens";
import { prisma } from "@/lib/db";
import { sanitizeStoredImageUrl } from "@/lib/storage/image-url-policy";
import {
    parseMenuImageFit,
    parseMenuImageFrame,
    parseMenuImagePosition,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
} from "@/lib/utils/menu-image-display";

export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ menuId: string }> | { menuId: string };
};

export default async function AdminDemoMenuEditPage({ params }: PageProps) {
    const { menuId } = await params;

    const [allergens, menu] = await Promise.all([
        prisma.allergen.findMany({
            orderBy: { sortOrder: "asc" },
            select: {
                slug: true,
                nameJa: true,
                nameEn: true,
                sortOrder: true,
            },
        }),
        prisma.menuItem.findFirst({
            where: {
                id: menuId,
                shop: {
                    ...DEMO_SHOP_WHERE,
                },
            },
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

    const initialStatusBySlug = createStatusBySlug(allergens, menu.allergenLinks);

    return (
        <AdminDashboardShell
            shopHref="/admin/demo"
            menusHref="/admin/demo/menus"
            showAuthControls={false}
        >
            <div className="min-h-screen bg-gray-50">
                <div className="mx-auto max-w-6xl px-0 py-6 sm:px-4">
                    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                        ポートフォリオ公開版のため、この画面は操作プレビューです。保存・公開・削除は実行されず、DB・画像ストレージには反映されません。
                    </div>

                    <nav className="mb-4 text-sm text-gray-500">
                        <Link
                            href="/admin/demo/menus"
                            className="hover:text-gray-900"
                        >
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
                        通常の編集画面と同じ操作項目を確認できます。保存ボタンを押してもDB・画像ストレージには反映されません。
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
                            initialImageUrl={sanitizeStoredImageUrl(
                                menu.imageUrl,
                                {
                                    kind: "menu",
                                    shopId: menu.shopId,
                                },
                            )}
                            initialImageFrame={parseMenuImageFrame(
                                menu.imageFrame,
                            )}
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
                            readOnly
                            readOnlyPreview
                            readOnlyCreateHref="/admin/demo/menus/new"
                        />
                    </div>
                </div>
            </div>
        </AdminDashboardShell>
    );
}
