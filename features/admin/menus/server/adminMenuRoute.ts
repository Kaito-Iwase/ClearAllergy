// このファイルは 1 件のメニューに対する取得・更新・削除 API です。
// /api/admin/menus/[menuId] の GET / PUT / DELETE をまとめています。
// 毎回 shopId で絞り込み、「自分の店舗のメニューだけ触れる」ことを保証します。

import { Hono } from "hono";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
    internalError,
    readJson,
    requireShopId,
} from "@/lib/auth/admin-api-utils";
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
} from "@/lib/validators/admin-input";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { enforceSameOriginAdminMutation } from "@/lib/auth/admin-api-security";
import { validateStoredImageUrl } from "@/lib/storage/image-url-policy";
import { requirePortfolioMutationAccessApi } from "@/lib/auth/portfolio-mode";
import { revalidatePublicMenuPaths } from "@/lib/public-cache";
import {
    parseMenuImageFit,
    parseMenuImageFrame,
    parseMenuImagePosition,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
} from "@/lib/utils/menu-image-display";

import { menuInputSchema } from "@/features/admin/menus/schemas/menu-input";

const app = new Hono();

app.get("/api/admin/menus/:menuId", async (c) => {
    const menuId = c.req.param("menuId");
    try {
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;

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

        // 管理 API でも現行マスタの全品目を欠損なく返し、画面や外部クライアントの解釈差をなくします。
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
        return internalError(e);
    }
});

app.put("/api/admin/menus/:menuId", async (c) => {
    const req = c.req.raw;
    const menuId = c.req.param("menuId");
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

        const portfolioAccess = await requirePortfolioMutationAccessApi();
        if (!portfolioAccess.ok) {
            return portfolioAccess.res;
        }

        // 対象メニュー ID は URL から取り出します。
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        const parsedBody = menuInputSchema.safeParse(await readJson<unknown>(req));
        if (!parsedBody.success) {
            return NextResponse.json(
                { error: "入力内容の形式・文字数を確認してください。" },
                { status: 400 },
            );
        }
        const body = parsedBody.data;

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
                imageFrame: true,
                imageFit: true,
                imagePosition: true,
                imageZoom: true,
                imagePositionX: true,
                imagePositionY: true,
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
        const nextImageFrame =
            body.imageFrame === undefined
                ? parseMenuImageFrame(existing.imageFrame)
                : parseMenuImageFrame(body.imageFrame);
        const nextImageFit =
            body.imageFit === undefined
                ? parseMenuImageFit(existing.imageFit)
                : parseMenuImageFit(body.imageFit);
        const nextImagePosition =
            body.imagePosition === undefined
                ? parseMenuImagePosition(existing.imagePosition)
                : parseMenuImagePosition(body.imagePosition);
        const nextImageZoom =
            body.imageZoom === undefined
                ? parseMenuImageZoom(existing.imageZoom)
                : parseMenuImageZoom(body.imageZoom);
        const nextImagePositionX =
            body.imagePositionX === undefined
                ? parseMenuImagePositionPercent(existing.imagePositionX)
                : parseMenuImagePositionPercent(body.imagePositionX);
        const nextImagePositionY =
            body.imagePositionY === undefined
                ? parseMenuImagePositionPercent(existing.imagePositionY)
                : parseMenuImagePositionPercent(body.imagePositionY);
        const requestedIsPublished =
            body.isPublished === undefined
                ? existing.isPublished
                : toBooleanOrDefault(body.isPublished, existing.isPublished);
        let nextIsPublished = requestedIsPublished;
        let forcedUnpublishReason: string | null = null;

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

        // 編集保存でも公開条件は毎回サーバーで確認します。
        // 明示的な公開要求は拒否し、既存公開メニューが不完全になった保存は
        // 対象メニューだけ非公開へ戻します。
        const publishErrors = getMenuPublishValidationErrors({
            name: nextName,
            allergens,
            statusBySlug: nextStatusBySlug,
        });

        if (publishErrors.length > 0) {
            const publishErrorMessage = publishErrors.join(" ");

            if (body.isPublished !== undefined && requestedIsPublished) {
                auditAction =
                    existing.isPublished === requestedIsPublished
                        ? "menu_update"
                        : "menu_publish";
                await writeAdminAuditLog({
                    req,
                    actorUserId: auditActorUserId,
                    actorShopId: auditShopId,
                    action: auditAction,
                    targetType: "menu",
                    targetId: auditTargetId,
                    success: false,
                    metadata: { reason: publishErrorMessage },
                });
                return NextResponse.json(
                    { error: publishErrorMessage },
                    { status: 400 },
                );
            }

            if (requestedIsPublished) {
                nextIsPublished = false;
            }

            if (requestedIsPublished || existing.isPublished) {
                forcedUnpublishReason = publishErrorMessage;
            }
        }

        auditAction =
            existing.isPublished !== nextIsPublished
                ? nextIsPublished
                    ? "menu_publish"
                    : "menu_unpublish"
                : "menu_update";

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
                    imageFrame: nextImageFrame,
                    imageFit: nextImageFit,
                    imagePosition: nextImagePosition,
                    imageZoom: nextImageZoom,
                    imagePositionX: nextImagePositionX,
                    imagePositionY: nextImagePositionY,
                },
                select: {
                    id: true,
                    shopId: true,
                    name: true,
                    isPublished: true,
                    imageUrl: true,
                    imageFrame: true,
                    imageFit: true,
                    imagePosition: true,
                    imageZoom: true,
                    imagePositionX: true,
                    imagePositionY: true,
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
                ...(forcedUnpublishReason
                    ? { reason: forcedUnpublishReason }
                    : {}),
            },
        });

        if (existing.isPublished || nextIsPublished) {
            revalidatePublicMenuPaths(auth.shopId, updatedMenu.id);
        }

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
});

app.delete("/api/admin/menus/:menuId", async (c) => {
    const req = c.req.raw;
    const menuId = c.req.param("menuId");
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

        const portfolioAccess = await requirePortfolioMutationAccessApi();
        if (!portfolioAccess.ok) {
            return portfolioAccess.res;
        }

        // 対象メニュー ID は URL から取り出します。
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }
        auditTargetId = menuId;

        // 他店舗のメニュー ID を指定されても、存在を推測されないよう 404 にします。
        const existing = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId: auth.shopId },
            select: { id: true, isPublished: true },
        });
        if (!existing) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        // 設定行削除の遅延公開チェックが、削除予定のメニューを途中状態で判定しないよう
        // 本体削除までを同じ transaction で完了します。
        await prisma.$transaction(async (tx) => {
            await tx.menuItemAllergen.deleteMany({
                where: { menuItemId: menuId },
            });

            await tx.menuItem.delete({
                where: { id: menuId },
            });
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

        if (existing.isPublished) {
            revalidatePublicMenuPaths(auth.shopId, menuId);
        }

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
});

export const GET = (req: Request) => app.fetch(req);
export const PUT = (req: Request) => app.fetch(req);
export const DELETE = (req: Request) => app.fetch(req);
