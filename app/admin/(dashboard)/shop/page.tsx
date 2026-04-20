// このページは店舗情報編集画面です。
// ログイン中の店舗だけを取得し、公開画面に出る情報を編集する Client Component へ渡します。
// Server Component なので、店舗存在チェックと初期データ取得を先に行えます。

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireCurrentAdminContextOrRedirect } from "@/lib/admin-auth";
import ShopEditClient from "@/components/admin/shop/ShopEditClient";
import { sanitizeStoredImageUrl } from "@/lib/image-url-policy";
import {
    parseMenuImageFit,
    parseMenuImageFrame,
    parseMenuImagePosition,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
} from "@/lib/menu-image-display";

export default async function AdminShopPage() {
    // 認証されていない人や、店舗未作成の人をここで弾きます。
    const adminContext = await requireCurrentAdminContextOrRedirect();
    const shopId = adminContext.shop.id;

    // 画面に必要な項目だけ select し、不要な列は持ってこないようにします。
    const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: {
            id: true,
            name: true,
            description: true,
            address: true,
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

    // 店舗レコードが無い状態なら、初回登録へ戻します。
    if (!shop) {
        redirect("/admin/register");
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
                    店舗情報編集
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                    公開ページに表示する店舗名・説明・住所・営業時間・画像を更新できます。
                </p>
            </div>

            <ShopEditClient
                initialShop={{
                    id: shop.id,
                    name: shop.name,
                    description: shop.description,
                    address: shop.address,
                    hours: shop.hours,
                    regularHoliday: shop.regularHoliday,
                    phoneNumber: shop.phoneNumber,
                    note: shop.note,
                    averageBudgetYen: shop.averageBudgetYen,
                    coverImageUrl: sanitizeStoredImageUrl(shop.coverImageUrl, {
                        kind: "shop",
                        shopId,
                    }),
                    coverImageFrame: parseMenuImageFrame(shop.coverImageFrame),
                    coverImageFit: parseMenuImageFit(shop.coverImageFit),
                    coverImagePosition: parseMenuImagePosition(
                        shop.coverImagePosition,
                    ),
                    coverImageZoom: parseMenuImageZoom(shop.coverImageZoom),
                    coverImagePositionX: parseMenuImagePositionPercent(
                        shop.coverImagePositionX,
                    ),
                    coverImagePositionY: parseMenuImagePositionPercent(
                        shop.coverImagePositionY,
                    ),
                    updatedAt: shop.updatedAt.toISOString(),
                    publishedMenuCount: shop._count.menus,
                }}
            />
        </div>
    );
}
