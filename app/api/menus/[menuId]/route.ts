// このファイルは公開側のメニュー詳細取得 API です。
// /api/menus/[menuId] の GET だけを担当し、公開中メニューのみ返します。
// 公開画面から読まれるため、非公開メニューは存在していても 404 扱いにします。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildAllergenRows } from "@/lib/allergens";
import { validateStoredImageUrl } from "@/lib/image-url-policy";
import {
    parseMenuImageFit,
    parseMenuImageFrame,
    parseMenuImagePosition,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
} from "@/lib/menu-image-display";

type Context = {
    // Next.js のバージョン差で params が Promise のこともあるため両対応にしています。
    params?: { menuId?: string } | Promise<{ menuId?: string }>;
};

export async function GET(req: Request, context: Context) {
    try {
        // まずは動的ルートの params から menuId を取ります。
        const paramsObj = context.params ? await context.params : undefined;
        let menuId = paramsObj?.menuId;

        // 一部環境で params が入らない時に備え、URL 末尾からも取得できるようにします。
        if (!menuId) {
            const url = new URL(req.url);
            const parts = url.pathname.split("/").filter(Boolean);
            menuId = parts[parts.length - 1];
        }

        // menuId が決まらなければリクエスト不正です。
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // 公開 API なので isPublished: true を条件に入れます。
        const menu = await prisma.menuItem.findFirst({
            where: {
                id: menuId,
                isPublished: true,
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
                createdAt: true,
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
        });

        if (!menu) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        const allergenMaster = await prisma.allergen.findMany({
            orderBy: { sortOrder: "asc" },
            select: {
                slug: true,
                nameJa: true,
                nameEn: true,
                sortOrder: true,
            },
        });

        // 29 品目を基準に正規化し、欠損しているリンクも UNKNOWN として返します。
        const allergens = buildAllergenRows(allergenMaster, menu.allergenLinks);
        const safeImageUrl = validateStoredImageUrl(menu.imageUrl, {
            kind: "menu",
            shopId: menu.shopId,
        });

        return NextResponse.json({
            menu: {
                id: menu.id,
                shopId: menu.shopId,
                name: menu.name,
                description: menu.description,
                priceYen: menu.priceYen,
                category: menu.category,
                ingredients: menu.ingredients,
                precaution: menu.precaution,
                // 公開 API でも保存済み URL をそのまま信用せず、
                // 表示してよい画像 URL だけ返します。
                imageUrl: safeImageUrl.ok ? safeImageUrl.value : null,
                imageFrame: parseMenuImageFrame(menu.imageFrame),
                imageFit: parseMenuImageFit(menu.imageFit),
                imagePosition: parseMenuImagePosition(menu.imagePosition),
                imageZoom: parseMenuImageZoom(menu.imageZoom),
                imagePositionX: parseMenuImagePositionPercent(
                    menu.imagePositionX,
                ),
                imagePositionY: parseMenuImagePositionPercent(
                    menu.imagePositionY,
                ),
                isPublished: menu.isPublished,
                createdAt: menu.createdAt,
                updatedAt: menu.updatedAt,
                allergens,
            },
        });
    } catch (e) {
        console.error(e);
        if (process.env.NODE_ENV !== "production") {
            const msg = e instanceof Error ? e.message : String(e);
            return NextResponse.json(
                { error: "Internal Server Error", message: msg },
                { status: 500 },
            );
        }
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
