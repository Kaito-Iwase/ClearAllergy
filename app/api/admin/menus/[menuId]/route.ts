// このファイルは 1 件のメニューに対する取得・更新・削除 API です。
// /api/admin/menus/[menuId] の GET / PUT / DELETE をまとめています。
// 毎回 shopId で絞り込み、「自分の店舗のメニューだけ触れる」ことを保証します。

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
import {
    buildAllergenRows,
    createStatusBySlug,
    getMenuPublishValidationErrors,
    validateAllergenStatusMap,
} from "@/lib/allergens";
import {
    parsePriceYen,
    toBooleanOrDefault,
    toRequiredTrimmedString,
    toTrimmedNullableString,
} from "@/lib/admin-validators";

// 更新用の request body です。
// shopId はクライアントから受け取らず、必ず session 側の shopId を使います。
type UpdateMenuBody = {
    name?: unknown;
    description?: unknown;
    priceYen?: unknown;
    category?: unknown;
    ingredients?: unknown;
    precaution?: unknown;
    isPublished?: unknown;
    imageUrl?: unknown;
    allergenStatusBySlug?: unknown;
};

export async function GET(req: Request, context: Context) {
    try {
        // 認証された管理者か確認し、権限判定に使う shopId を取ります。
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;

        // 動的ルートの menuId を取得します。
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // shopId を条件に入れ、他店舗の menuId を直接叩かれても取得できないようにします。
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
                            },
                        },
                    },
                },
            },
        });

        // 他店舗のデータ存在有無を推測されにくいよう、単純に 404 として返します。
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

        // 管理 API でも 28 品目を欠損なく返し、画面や外部クライアントの解釈差をなくします。
        const allergens = buildAllergenRows(allergenMaster, menu.allergenLinks);

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
        // PUT は既存メニューの保存です。
        // まず本人の店舗かどうか判定するため、認証と shopId 確認を行います。
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

        // request body が JSON として壊れていたら早めに 400 を返します。
        const body = await readJson<UpdateMenuBody>(req);
        if (!body) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        // 対象メニューが自分の店舗に属しているか確認します。
        const existing = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId: auth.shopId },
            select: {
                id: true,
                name: true,
                description: true,
                priceYen: true,
                category: true,
                ingredients: true,
                precaution: true,
                imageUrl: true,
                isPublished: true,
                allergenLinks: {
                    select: {
                        status: true,
                        allergen: {
                            select: { slug: true },
                        },
                    },
                },
            },
        });
        if (!existing) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        const priceResult = parsePriceYen(
            body.priceYen === undefined ? existing.priceYen : body.priceYen,
        );
        if (!priceResult.ok) {
            return NextResponse.json(
                { error: priceResult.message },
                { status: 400 },
            );
        }

        const allergens = await prisma.allergen.findMany({
            orderBy: { sortOrder: "asc" },
            select: { id: true, slug: true, nameJa: true },
        });

        const allergenMapResult = validateAllergenStatusMap(
            body.allergenStatusBySlug,
        );
        if (!allergenMapResult.ok) {
            return NextResponse.json(
                { error: allergenMapResult.message },
                { status: 400 },
            );
        }

        const incomingAllergenMap = allergenMapResult.value;
        const found = new Set(allergens.map((allergen) => allergen.slug));
        const missing = Object.keys(incomingAllergenMap).filter(
            (slug) => !found.has(slug),
        );
        if (missing.length > 0) {
            return NextResponse.json(
                { error: "unknown allergen slug(s)", missing },
                { status: 400 },
            );
        }

        const nextName =
            body.name === undefined
                ? existing.name
                : toRequiredTrimmedString(body.name);
        if (!nextName) {
            return NextResponse.json(
                { error: "bad request: name is required" },
                { status: 400 },
            );
        }

        const nextDescription =
            body.description === undefined
                ? existing.description
                : toTrimmedNullableString(body.description);
        const nextCategory =
            body.category === undefined
                ? existing.category
                : toTrimmedNullableString(body.category);
        const nextIngredients =
            body.ingredients === undefined
                ? existing.ingredients
                : toTrimmedNullableString(body.ingredients);
        const nextPrecaution =
            body.precaution === undefined
                ? existing.precaution
                : toTrimmedNullableString(body.precaution);
        const nextImageUrl =
            body.imageUrl === undefined
                ? existing.imageUrl
                : toTrimmedNullableString(body.imageUrl);
        const nextIsPublished =
            body.isPublished === undefined
                ? existing.isPublished
                : toBooleanOrDefault(body.isPublished, existing.isPublished);

        const nextStatusBySlug = createStatusBySlug(
            allergens,
            existing.allergenLinks,
        );
        for (const allergen of allergens) {
            const incomingStatus = incomingAllergenMap[allergen.slug];
            if (incomingStatus) {
                nextStatusBySlug[allergen.slug] = incomingStatus;
            }
        }

        if (nextIsPublished) {
            const publishErrors = getMenuPublishValidationErrors({
                name: nextName,
                ingredients: nextIngredients,
                precaution: nextPrecaution,
                allergens,
                statusBySlug: nextStatusBySlug,
            });

            if (publishErrors.length > 0) {
                return NextResponse.json(
                    { error: publishErrors.join(" ") },
                    { status: 400 },
                );
            }
        }

        const updatedMenu = await prisma.$transaction(async (tx) => {
            const updated = await tx.menuItem.update({
                where: { id: menuId },
                data: {
                    name: nextName,
                    description: nextDescription,
                    priceYen: priceResult.value,
                    category: nextCategory,
                    ingredients: nextIngredients,
                    precaution: nextPrecaution,
                    isPublished: nextIsPublished,
                    imageUrl: nextImageUrl,
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

            await tx.menuItemAllergen.deleteMany({
                where: { menuItemId: menuId },
            });

            await tx.menuItemAllergen.createMany({
                data: allergens.map((allergen) => ({
                    menuItemId: menuId,
                    allergenId: allergen.id,
                    status:
                        (nextStatusBySlug[allergen.slug] ?? "UNKNOWN") as never,
                })),
            });

            return updated;
        });

        return NextResponse.json({ menu: updatedMenu });
    } catch (e) {
        return internalError(e);
    }
}

export async function DELETE(req: Request, context: Context) {
    try {
        // DELETE でも shopId を確認し、自店舗メニュー以外は削除できないようにします。
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

        // 中間テーブルが残っていると外部キー制約で本体を消せないため、先に削除します。
        await prisma.menuItemAllergen.deleteMany({
            where: { menuItemId: menuId },
        });

        // その後で menu 本体を削除します。
        await prisma.menuItem.delete({
            where: { id: menuId },
        });

        return NextResponse.json({ ok: true });
    } catch (e) {
        return internalError(e);
    }
}
