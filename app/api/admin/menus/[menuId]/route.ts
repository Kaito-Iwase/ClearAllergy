// app/api/menus/[menuId]/route.ts
// GET /api/menus/:menuId  : 取得（アレルゲン込み）
// PUT /api/menus/:menuId  : 更新（基本情報 + アレルゲン状態）

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Context = {
    params?: { menuId?: string } | Promise<{ menuId?: string }>;
};

function getMenuIdFromUrl(req: Request) {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1];
}

// menuIdを「params優先、ダメならURL末尾」から取る
async function getMenuId(
    req: Request,
    context: Context,
): Promise<string | undefined> {
    const p = context.params ? await context.params : undefined;
    return p?.menuId ?? getMenuIdFromUrl(req);
}

// 3択の状態
type Status = "CONTAINS" | "FREE" | "MAY_CONTAIN";

// 更新ボディ
type UpdateMenuBody = {
    shopId: string;

    name?: string;
    description?: string | null;
    priceYen?: number | null;
    category?: string | null;
    ingredients?: string | null;
    precaution?: string | null;
    isPublished?: boolean;

    allergenStatusBySlug?: Record<string, Status>;
};

export async function GET(req: Request, context: Context) {
    try {
        const menuId = await getMenuId(req, context);

        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

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

export async function PUT(req: Request, context: Context) {
    try {
        console.log("HIT PUT menus/[menuId]", new Date().toISOString());
        const menuId = await getMenuId(req, context);

        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        const body = (await req.json()) as UpdateMenuBody;

        if (!body.shopId || typeof body.shopId !== "string") {
            return NextResponse.json(
                { error: "shopId is required" },
                { status: 400 },
            );
        }

        // menuが存在するか & shopId一致か（最低限の防御）
        const existing = await prisma.menuItem.findUnique({
            where: { id: menuId },
            select: { id: true, shopId: true },
        });

        if (!existing) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }
        if (existing.shopId !== body.shopId) {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
        }

        // MenuItem更新（undefinedなら更新しない）
        const updatedMenu = await prisma.menuItem.update({
            where: { id: menuId },
            data: {
                name: body.name ?? undefined,
                description: body.description ?? undefined,
                priceYen: body.priceYen ?? undefined,
                category: body.category ?? undefined,
                ingredients: body.ingredients ?? undefined,
                precaution: body.precaution ?? undefined,
                isPublished: body.isPublished ?? undefined,
            },
            select: {
                id: true,
                shopId: true,
                name: true,
                isPublished: true,
                updatedAt: true,
            },
        });

        // アレルゲン状態更新（送ってきたslugだけ）
        const map = body.allergenStatusBySlug ?? {};
        const slugs = Object.keys(map);

        if (slugs.length > 0) {
            const allergens = await prisma.allergen.findMany({
                where: { slug: { in: slugs } },
                select: { id: true, slug: true },
            });

            for (const a of allergens) {
                await prisma.menuItemAllergen.upsert({
                    where: {
                        // @@id([menuItemId, allergenId]) 前提の複合キー
                        menuItemId_allergenId: {
                            menuItemId: menuId,
                            allergenId: a.id,
                        },
                    },
                    update: { status: map[a.slug] ?? "FREE" },
                    create: {
                        menuItemId: menuId,
                        allergenId: a.id,
                        status: map[a.slug] ?? "FREE",
                    },
                });
            }
        }

        return NextResponse.json({ menu: updatedMenu });
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
