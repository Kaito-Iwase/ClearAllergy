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
import { writeAdminAuditLog } from "@/lib/audit-log";
import { enforceSameOriginAdminMutation } from "@/lib/admin-api-security";
import { validateStoredImageUrl } from "@/lib/image-url-policy";

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
        const safeImageUrl = validateStoredImageUrl(menu.imageUrl, {
            kind: "menu",
            shopId: auth.shopId,
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
                imageUrl: safeImageUrl.ok ? safeImageUrl.value : null,
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
    let auditActorUserId: string | null = null;
    let auditShopId: string | null = null;
    let auditTargetId: string | null = null;
    let auditAction:
        | "menu_update"
        | "menu_publish"
        | "menu_unpublish" = "menu_update";
    try {
        const originError = enforceSameOriginAdminMutation(req);
        if (originError) {
            return originError;
        }

        // PUT は既存メニューの保存です。
        // まず本人の店舗かどうか判定するため、認証と shopId 確認を行います。
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;
        auditActorUserId = auth.appUser.id;
        auditShopId = auth.shopId;

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
        auditTargetId = menuId;

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
        const imageUrlResult = validateStoredImageUrl(nextImageUrl, {
            kind: "menu",
            shopId: auth.shopId,
        });
        if (!imageUrlResult.ok) {
            await writeAdminAuditLog({
                req,
                actorUserId: auditActorUserId,
                actorShopId: auditShopId,
                action: auditAction,
                targetType: "menu",
                targetId: auditTargetId,
                success: false,
                metadata: { reason: imageUrlResult.message, imageUrlProvided: true },
            });
            return NextResponse.json(
                { error: imageUrlResult.message },
                { status: 400 },
            );
        }
        const nextIsPublished =
            body.isPublished === undefined
                ? existing.isPublished
                : toBooleanOrDefault(body.isPublished, existing.isPublished);
        auditAction =
            existing.isPublished !== nextIsPublished
                ? nextIsPublished
                    ? "menu_publish"
                    : "menu_unpublish"
                : "menu_update";

        const nextStatusBySlug = createStatusBySlug(
            allergens,
            existing.allergenLinks,
        );
        // 更新 API は「来た項目だけ差し替える」ので、
        // 既存状態を土台にしてから入力分だけ上書きします。
        for (const allergen of allergens) {
            const incomingStatus = incomingAllergenMap[allergen.slug];
            if (incomingStatus) {
                nextStatusBySlug[allergen.slug] = incomingStatus;
            }
        }

        if (nextIsPublished) {
            // 編集保存でも公開条件は毎回サーバーで確認します。
            // これにより、既存の不完全データを公開へ切り替える抜け道を防ぎます。
            const publishErrors = getMenuPublishValidationErrors({
                name: nextName,
                ingredients: nextIngredients,
                precaution: nextPrecaution,
                allergens,
                statusBySlug: nextStatusBySlug,
            });

            if (publishErrors.length > 0) {
                await writeAdminAuditLog({
                    req,
                    actorUserId: auditActorUserId,
                    actorShopId: auditShopId,
                    action: auditAction,
                    targetType: "menu",
                    targetId: auditTargetId,
                    success: false,
                    metadata: { reason: publishErrors.join(" ") },
                });
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
                    imageUrl: imageUrlResult.value,
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

        await writeAdminAuditLog({
            req,
            actorUserId: auditActorUserId,
            actorShopId: auditShopId,
            action: auditAction,
            targetType: "menu",
            targetId: updatedMenu.id,
            success: true,
            metadata: {
                wasPublished: existing.isPublished,
                isPublished: nextIsPublished,
                imageChanged: existing.imageUrl !== imageUrlResult.value,
            },
        });

        return NextResponse.json({ menu: updatedMenu });
    } catch (e) {
        if (auditShopId) {
            await writeAdminAuditLog({
                req,
                actorUserId: auditActorUserId,
                actorShopId: auditShopId,
                action: auditAction,
                targetType: "menu",
                targetId: auditTargetId,
                success: false,
                metadata: { reason: "internal_error" },
            });
        }
        return internalError(e);
    }
}

export async function DELETE(req: Request, context: Context) {
    let auditActorUserId: string | null = null;
    let auditShopId: string | null = null;
    let auditTargetId: string | null = null;
    try {
        const originError = enforceSameOriginAdminMutation(req);
        if (originError) {
            return originError;
        }

        // DELETE でも shopId を確認し、自店舗メニュー以外は削除できないようにします。
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;
        auditActorUserId = auth.appUser.id;
        auditShopId = auth.shopId;

        // 2) menuId 取得
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }
        auditTargetId = menuId;

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

        await writeAdminAuditLog({
            req,
            actorUserId: auditActorUserId,
            actorShopId: auditShopId,
            action: "menu_delete",
            targetType: "menu",
            targetId: auditTargetId,
            success: true,
        });

        return NextResponse.json({ ok: true });
    } catch (e) {
        if (auditShopId) {
            await writeAdminAuditLog({
                req,
                actorUserId: auditActorUserId,
                actorShopId: auditShopId,
                action: "menu_delete",
                targetType: "menu",
                targetId: auditTargetId,
                success: false,
                metadata: { reason: "internal_error" },
            });
        }
        return internalError(e);
    }
}
