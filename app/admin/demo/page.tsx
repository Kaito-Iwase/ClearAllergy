import { DEMO_SHOP_WHERE } from "@/lib/auth/demo-shop";
import Link from "next/link";
import AdminDashboardShell from "@/components/layout/AdminDashboardShell";
import ShopEditClient from "@/features/admin/shop/components/ShopEditClient";
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

async function getDemoShop() {
    return prisma.shop.findFirst({
        where: {
            ...DEMO_SHOP_WHERE,
            menus: {
                some: {},
            },
        },
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            name: true,
            description: true,
            address: true,
            prefecture: true,
            city: true,
            nearestStation: true,
            category: true,
            latitude: true,
            longitude: true,
            googlePlaceId: true,
            hours: true,
            regularHoliday: true,
            phoneNumber: true,
            note: true,
            averageBudgetYen: true,
            coverImageUrl: true,
            coverImageFrame: true,
            coverImageFit: true,
            coverImagePosition: true,
            coverImageZoom: true,
            coverImagePositionX: true,
            coverImagePositionY: true,
            updatedAt: true,
            _count: {
                select: {
                    menus: {
                        where: {
                            isPublished: true,
                        },
                    },
                },
            },
        },
    });
}

export default async function AdminDemoPage() {
    const demoShop = await getDemoShop().catch(() => null);

    return (
        <AdminDashboardShell
            shopHref="/admin/demo"
            menusHref="/admin/demo/menus"
            showAuthControls={false}
        >
            <div className="space-y-6">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                    ポートフォリオ公開版のため、この管理画面は閲覧専用です。入力してもDB・画像ストレージへ保存されません。
                </div>

                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
                        店舗情報編集
                    </h1>
                    <p className="mt-2 text-sm text-gray-600">
                        通常の管理画面と同じ見た目で確認できます。保存や公開などの編集権限はなく、変更内容は反映されません。
                    </p>
                </div>

                {!demoShop ? (
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h2 className="text-lg font-extrabold">
                            デモ店舗を準備中です
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            seed データ投入後に、ここへ通常管理画面と同じデモ表示が出ます。
                        </p>
                        <Link
                            href="/admin/register"
                            className="mt-5 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50"
                        >
                            登録画面へ戻る
                        </Link>
                    </div>
                ) : (
                    <ShopEditClient
                        readOnly
                        initialShop={{
                            id: demoShop.id,
                            name: demoShop.name,
                            description: demoShop.description,
                            address: demoShop.address,
                            prefecture: demoShop.prefecture,
                            city: demoShop.city,
                            nearestStation: demoShop.nearestStation,
                            category: demoShop.category,
                            latitude: demoShop.latitude,
                            longitude: demoShop.longitude,
                            googlePlaceId: demoShop.googlePlaceId,
                            hours: demoShop.hours,
                            regularHoliday: demoShop.regularHoliday,
                            phoneNumber: demoShop.phoneNumber,
                            note: demoShop.note,
                            averageBudgetYen: demoShop.averageBudgetYen,
                            coverImageUrl: sanitizeStoredImageUrl(
                                demoShop.coverImageUrl,
                                {
                                    kind: "shop",
                                    shopId: demoShop.id,
                                },
                            ),
                            coverImageFrame: parseMenuImageFrame(
                                demoShop.coverImageFrame,
                            ),
                            coverImageFit: parseMenuImageFit(
                                demoShop.coverImageFit,
                            ),
                            coverImagePosition: parseMenuImagePosition(
                                demoShop.coverImagePosition,
                            ),
                            coverImageZoom: parseMenuImageZoom(
                                demoShop.coverImageZoom,
                            ),
                            coverImagePositionX:
                                parseMenuImagePositionPercent(
                                    demoShop.coverImagePositionX,
                                ),
                            coverImagePositionY:
                                parseMenuImagePositionPercent(
                                    demoShop.coverImagePositionY,
                                ),
                            updatedAt: demoShop.updatedAt.toISOString(),
                            publishedMenuCount: demoShop._count.menus,
                        }}
                    />
                )}
            </div>
        </AdminDashboardShell>
    );
}
