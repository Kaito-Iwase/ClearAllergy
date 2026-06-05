// このファイルは公開側のメニュー詳細取得 API です。
// /api/menus/[menuId] の GET だけを担当し、公開中メニューのみ返します。
// 公開画面から読まれるため、非公開メニューは存在していても 404 扱いにします。

import { Hono } from "hono";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildAllergenDisplayItems, buildAllergenRows } from "@/lib/allergens";
import { validateStoredImageUrl } from "@/lib/image-url-policy";
import {
    parseMenuImageFit,
    parseMenuImageFrame,
    parseMenuImagePosition,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
} from "@/lib/menu-image-display";

const app = new Hono();

app.get("/api/menus/:menuId", async (c) => {
    const req = c.req.raw;
    try {
        // まずは Hono の動的ルートから menuId を取ります。
        let menuId = c.req.param("menuId");

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
                id: true,
                slug: true,
                nameJa: true,
                nameEn: true,
                sortOrder: true,
            },
        });

        const shopAllergenLinks = await prisma.menuItemAllergen.findMany({
            where: {
                menuItem: {
                    shopId: menu.shopId,
                },
            },
            select: {
                allergenId: true,
                status: true,
            },
        });

        const storeContainsAllergenIds = new Set(
            shopAllergenLinks
                .filter((link) => link.status === "CONTAINS")
                .map((link) => link.allergenId),
        );
        const allergenSlugById = new Map(
            allergenMaster.map((allergen) => [allergen.id, allergen.slug]),
        );
        const storeHandledAllergenSlugs = new Set(
            [...storeContainsAllergenIds]
                .map((allergenId) => allergenSlugById.get(allergenId))
                .filter((slug): slug is string => Boolean(slug)),
        );

        // 29 品目を基準に正規化し、欠損しているリンクも UNKNOWN として返します。
        const allergens = buildAllergenRows(allergenMaster, menu.allergenLinks);
        const allergenDisplayItems = buildAllergenDisplayItems(
            allergens,
            storeHandledAllergenSlugs,
        );
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
                allergenDisplayItems,
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
});

export const GET = (req: Request) => app.fetch(req);
