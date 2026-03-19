// app/api/admin/menus/[menuId]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
    Context,
    getMenuId,
    internalError,
    readJson,
    requireShopId,
} from "@/app/api/admin/_utils";
import { type AllergenStatus } from "@/lib/allergens";

// 更新ボディ（★shopIdは受け取らない！）
type UpdateMenuBody = {
    name?: string;
    description?: string | null;
    priceYen?: number | null;
    category?: string | null;
    ingredients?: string | null;
    precaution?: string | null;
    isPublished?: boolean;

    // ★追加：画像URL（まずはこれで十分）
    imageUrl?: string | null;

    // 例：{ egg: "CONTAINS", milk: "FREE" }
    allergenStatusBySlug?: Record<string, AllergenStatus>;
};

export async function GET(req: Request, context: Context) {
    try {
        // 1) セッション確認 + shopId 取得
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;

        // 2) menuId 取得
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // 3) DBから取得（このshopのmenuだけ許可）
        const menu = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId: auth.shopId },
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

        // 4) 無ければ404（他店のIDでも同じ扱い）
        if (!menu) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        // 5) 返却用の形に整形
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
        return internalError(e);
    }
}

export async function PUT(req: Request, context: Context) {
    try {
        // 1) セッション確認 + shopId 取得
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;

        // 2) menuId 取得
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // 3) body 取得（壊れてたら400）
        const body = await readJson<UpdateMenuBody>(req);
        if (!body) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        // 4) この店のメニューか確認（他店なら404）
        const existing = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId: auth.shopId },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        // 5) メニュー本体を更新（undefinedは更新しない）
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

                // ★追加：imageUrlを更新できるようにした
                imageUrl: body.imageUrl ?? undefined,
            },
            select: {
                id: true,
                shopId: true,
                name: true,
                isPublished: true,
                imageUrl: true,
                updatedAt: true,
            },
        });

        // 6) アレルゲン状態更新（送ってきたslugだけ）
        const map = body.allergenStatusBySlug ?? {};
        const slugs = Object.keys(map);

        if (slugs.length > 0) {
            // 7) slug -> allergenId
            const allergens = await prisma.allergen.findMany({
                where: { slug: { in: slugs } },
                select: { id: true, slug: true },
            });

            // 8) 存在しないslugが混ざってたら400（黙殺しない）
            const found = new Set(allergens.map((a) => a.slug));
            const missing = slugs.filter((s) => !found.has(s));
            if (missing.length > 0) {
                return NextResponse.json(
                    { error: "unknown allergen slug(s)", missing },
                    { status: 400 },
                );
            }

            // 9) upsertをtransactionでまとめる（途中失敗で中途半端防止）
            const ops = allergens.map((a) =>
                prisma.menuItemAllergen.upsert({
                    where: {
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
                }),
            );

            await prisma.$transaction(ops);
        }

        return NextResponse.json({ menu: updatedMenu });
    } catch (e) {
        return internalError(e);
    }
}

export async function DELETE(req: Request, context: Context) {
    try {
        // 1) セッション確認 + shopId 取得
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;

        // 2) menuId 取得
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // 3) この店のメニューか確認（他店なら404）
        const existing = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId: auth.shopId },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        // 4) FK制約対策：中間テーブルを先に削除
        await prisma.menuItemAllergen.deleteMany({
            where: { menuItemId: menuId },
        });

        // 5) 本体削除
        await prisma.menuItem.delete({
            where: { id: menuId },
        });

        return NextResponse.json({ ok: true });
    } catch (e) {
        return internalError(e);
    }
}
