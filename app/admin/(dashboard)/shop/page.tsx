import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ShopEditClient from "./ShopEditClient";

export default async function AdminShopPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect("/admin/login");
    }

    const shopId = session.user.shopId;
    if (!shopId) {
        redirect("/admin/login");
    }

    const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: {
            id: true,
            name: true,
            description: true,
            address: true,
            hours: true,
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

    if (!shop) {
        redirect("/admin/login");
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
                    店舗情報編集
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                    公開ページに表示する店舗名・説明・住所・営業時間を更新できます。
                </p>
            </div>

            <ShopEditClient
                initialShop={{
                    id: shop.id,
                    name: shop.name,
                    description: shop.description,
                    address: shop.address,
                    hours: shop.hours,
                    updatedAt: shop.updatedAt.toISOString(),
                    publishedMenuCount: shop._count.menus,
                }}
            />
        </div>
    );
}
