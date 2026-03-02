// app/api/menus/[menuId]/route.ts
// GET /api/menus/:menuId
// paramsが取れない環境でも、URLからmenuIdを確実に抜き出して動かす「保険付き」実装。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Context = {
    // Next.jsのバージョン/環境で params の形が揺れるので両対応
    params?: { menuId?: string } | Promise<{ menuId?: string }>;
};

export async function GET(req: Request, context: Context) {
    try {
        // 1) まずはcontext.paramsから取る（取れればそれが最優先）
        const paramsObj = context.params ? await context.params : undefined;
        let menuId = paramsObj?.menuId;

        // 2) 取れなかったらURLから抜く（これが最終保険）
        // 例: http://localhost:3000/api/menus/abc123 なら末尾が menuId
        if (!menuId) {
            const url = new URL(req.url);
            const parts = url.pathname.split("/").filter(Boolean);
            menuId = parts[parts.length - 1];
        }

        // 3) それでも空なら400
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // 4) DBから取得（メニュー＋アレルゲン状態）
        const menu = await prisma.menuItem.findUnique({
            where: { id: menuId },
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
                isPublished: true,
                createdAt: true,
                updatedAt: true,
                allergenLinks: {
                    select: {
                        status: true,
                        allergen: {
                            select: {
                                slug: true,
                                nameJa: true,
                                nameEn: true,
                                sortOrder: true,
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

        const allergens = menu.allergenLinks
            .map((link) => ({
                slug: link.allergen.slug,
                nameJa: link.allergen.nameJa,
                nameEn: link.allergen.nameEn,
                sortOrder: link.allergen.sortOrder,
                status: link.status,
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder);

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
                imageUrl: menu.imageUrl,
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
