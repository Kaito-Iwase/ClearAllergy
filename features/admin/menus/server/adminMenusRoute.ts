// このファイルは管理画面のメニュー一覧取得と新規作成 API です。
// /api/admin/menus の GET は一覧、POST は新規作成を担当します。
// どちらも requireShopId() を通し、ログイン中の店舗だけを対象にします。

import { Hono } from "hono";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { foodSnapshot } from "../food-review";
import { saveFoodReview, validFoodReviewTime, flushMenuPublicationChecks } from "./food-review-save";
import { handleUnhandledApiError, logOperationalError } from "@/lib/observability";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, readJson, requireShopId } from "@/lib/auth/admin-api-utils";
import { enforceSameOriginAdminMutation } from "@/lib/auth/admin-api-security";
import {
    parsePriceYen,
    toBooleanOrDefault,
    toRequiredTrimmedString,
    toTrimmedNullableString,
} from "@/lib/validators/admin-input";
import {
    createStatusBySlug,
    getMenuPublishValidationErrors,
    validateAllergenStatusMap,
} from "@/lib/allergens";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { validateStoredImageUrl } from "@/lib/storage/image-url-policy";
import { requirePortfolioMutationAccessApi } from "@/lib/auth/portfolio-mode";
import {
    revalidatePublicMenuPaths,
    revalidatePublicShopPaths,
} from "@/lib/public-cache";
import {
    parseMenuImageFit,
    parseMenuImageFrame,
    parseMenuImagePosition,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
} from "@/lib/utils/menu-image-display";

import { menuInputSchema } from "@/features/admin/menus/schemas/menu-input";

const app = new Hono();
function creationReplay(shopId: string, menuId: string) {
    try { revalidatePublicMenuPaths(shopId, menuId); }
    catch (error) { logOperationalError(error, { operation: "public_menu_refresh_after_commit" }); return NextResponse.json({ id: menuId, publicRefreshPending: true }, { status: 201 }); }
    return NextResponse.json({ id: menuId }, { status: 201 });
}
app.onError(handleUnhandledApiError);

// GET は保存済みメニュー一覧の取得です。
// 管理画面トップで表示するため、必要な列だけ絞って返します。
app.get("/api/admin/menus", async () => {
    try {
        // 認証済みかつ shopId を持つ管理者だけに絞ります。
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        // shopId で絞ることで、他店舗のメニューが混ざらないようにします。
        const menus = await prisma.menuItem.findMany({
            where: { shopId: auth.shopId },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                name: true,
                priceYen: true,
                category: true,
                imageUrl: true,
                imageFrame: true,
                imageFit: true,
                imagePosition: true,
                imageZoom: true,
                imagePositionX: true,
                imagePositionY: true,
                isPublished: true,
                version: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({
            menus: menus.map((menu) => {
                const safeImageUrl = validateStoredImageUrl(menu.imageUrl, {
                    kind: "menu",
                    shopId: auth.shopId,
                });

                return {
                    ...menu,
                    imageUrl: safeImageUrl.ok ? safeImageUrl.value : null,
                };
            }),
        });
    } catch (e) {
        return internalError(e);
    }
});

// POST は新規メニュー作成です。
// 編集画面にすぐ遷移できるよう、最小情報でも下書きを作れるようにしています。
app.post("/api/admin/menus", async (c) => {
    const req = c.req.raw;
    let auditActorUserId: string | null = null;
    let auditShopId: string | null = null;
    let operationId: string | undefined;
    let requestHash: string | undefined;
    try {
        const originError = enforceSameOriginAdminMutation(req);
        if (originError) {
            return originError;
        }

        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }
        auditActorUserId = auth.appUser.id;
        auditShopId = auth.shopId;

        const portfolioAccess = await requirePortfolioMutationAccessApi();
        if (!portfolioAccess.ok) {
            return portfolioAccess.res;
        }

        const parsedBody = menuInputSchema.safeParse(await readJson<unknown>(req));
        if (!parsedBody.success) {
            return NextResponse.json(
                { error: "入力内容の形式・文字数を確認してください。" },
                { status: 400 },
            );
        }
        const body = parsedBody.data;
        operationId = body.operationId;
        requestHash = createHash("sha256").update(JSON.stringify({ ...body, operationId: undefined })).digest("hex");
        if (!validFoodReviewTime(body.foodReview)) return NextResponse.json({ error: "食品確認日時は現在より5分を超える未来には指定できません。" }, { status: 400 });

        if (operationId) {
            const replay = await prisma.menuItem.findFirst({ where: { shopId: auth.shopId, creationOperationId: operationId }, select: { id: true, creationRequestHash: true } });
            if (replay) return replay.creationRequestHash === requestHash ? creationReplay(auth.shopId, replay.id) : NextResponse.json({ error: "同じ作成操作で異なる入力を再送できません。保存済みのメニューを確認してください。" }, { status: 409 });
        }


        // 下書き作成では、名前未入力でも既定タイトルで進められるようにします。
        const name = toRequiredTrimmedString(body?.name) ?? "新しいメニュー";

        // 価格だけは数値ルールが多いので専用 helper で検証します。
        const priceResult = parsePriceYen(body?.priceYen);
        if (!priceResult.ok) {
            return NextResponse.json(
                { error: priceResult.message },
                { status: 400 },
            );
        }

        const description = toTrimmedNullableString(body?.description);
        const category = toTrimmedNullableString(body?.category);
        const ingredients = toTrimmedNullableString(body?.ingredients);
        const precaution = toTrimmedNullableString(body?.precaution);
        const imageUrl = toTrimmedNullableString(body?.imageUrl);
        const imageFrame = parseMenuImageFrame(body?.imageFrame);
        const imageFit = parseMenuImageFit(body?.imageFit);
        const imagePosition = parseMenuImagePosition(body?.imagePosition);
        const imageZoom = parseMenuImageZoom(body?.imageZoom);
        const imagePositionX = parseMenuImagePositionPercent(
            body?.imagePositionX,
        );
        const imagePositionY = parseMenuImagePositionPercent(
            body?.imagePositionY,
        );
        const imageUrlResult = validateStoredImageUrl(imageUrl, {
            kind: "menu",
            shopId: auth.shopId,
        });
        if (!imageUrlResult.ok) {
            await writeAdminAuditLog({
                req,
                actorUserId: auditActorUserId,
                actorShopId: auditShopId,
                action: "menu_create",
                targetType: "menu",
                targetId: null,
                success: false,
                metadata: { reason: imageUrlResult.message, imageUrlProvided: true },
            });
            return NextResponse.json(
                { error: imageUrlResult.message },
                { status: 400 },
            );
        }
        // 新規作成直後は誤公開を防ぐため、既定は非公開です。
        const isPublished = toBooleanOrDefault(body?.isPublished, false);
        const allergenMapResult = validateAllergenStatusMap(
            body?.allergenStatusBySlug,
        );
        if (!allergenMapResult.ok) {
            return NextResponse.json(
                { error: allergenMapResult.message },
                { status: 400 },
            );
        }
        const allergenMap = allergenMapResult.value;

        const allergens = await prisma.allergen.findMany({
            orderBy: { sortOrder: "asc" },
            select: { id: true, slug: true, nameJa: true },
        });

        // 送られてきた slug が本当にマスタに存在するか確認します。
        const found = new Set(allergens.map((allergen) => allergen.slug));
        const missing = Object.keys(allergenMap).filter((slug) => !found.has(slug));

        if (missing.length > 0) {
            return NextResponse.json(
                { error: "unknown allergen slug(s)", missing },
                { status: 400 },
            );
        }

        const completeAllergenMap = createStatusBySlug(allergens, []);
        for (const allergen of allergens) {
            const incomingStatus = allergenMap[allergen.slug];
            if (incomingStatus) {
                completeAllergenMap[allergen.slug] = incomingStatus;
            }
        }

        if (isPublished) {
            if (!body.foodReview || body.foodReview.unresolvedIssues) return NextResponse.json({ error: "公開するには未解決事項のない食品確認記録が必要です。" }, { status: 400 });
            // 公開時だけは、サーバー側で必須条件を必ず再確認します。
            // UI が壊れても API 直打ちでも、この壁を越えない限り公開できません。
            const publishErrors = getMenuPublishValidationErrors({
                name,
                allergens,
                statusBySlug: completeAllergenMap,
            });

            if (publishErrors.length > 0) {
                await writeAdminAuditLog({
                    req,
                    actorUserId: auditActorUserId,
                    actorShopId: auditShopId,
                    action: "menu_create",
                    targetType: "menu",
                    targetId: null,
                    success: false,
                    metadata: { reason: publishErrors.join(" "), isPublished },
                });
                return NextResponse.json(
                    { error: publishErrors.join(" ") },
                    { status: 400 },
                );
            }
        }

        // MenuItem と中間テーブルを同時に保存するため transaction を使います。
        // 途中で失敗したら両方とも取り消され、中途半端なデータを防げます。
        const created = await prisma.$transaction(async (tx) => {
            const menu = await tx.menuItem.create({
                data: {
                    shopId: auth.shopId,
                    creationOperationId: operationId,
                    creationRequestHash: operationId ? requestHash : undefined,
                    name,
                    description,
                    priceYen: priceResult.value,
                    category,
                    ingredients,
                    precaution,
                    isPublished: false,
                    imageUrl: imageUrlResult.value,
                    imageFrame,
                    imageFit,
                    imagePosition,
                    imageZoom,
                    imagePositionX,
                    imagePositionY,
                },
                select: {
                    id: true,
                },
            });

            await tx.menuItemAllergen.createMany({
                data: allergens.map((allergen) => ({
                    menuItemId: menu.id,
                    allergenId: allergen.id,
                    status:
                        (completeAllergenMap[allergen.slug] ?? "UNKNOWN") as never,
                })),
            });

            if (body.foodReview) await saveFoodReview(tx, { menuId: menu.id, shopId: auth.shopId, actorUserId: auth.appUser.id,
                review: body.foodReview, snapshot: foodSnapshot({ name, description, category, ingredients, precaution, imageUrl: imageUrlResult.value }, allergens, completeAllergenMap) });
            if (isPublished) await tx.menuItem.update({ where: { id: menu.id, shopId: auth.shopId }, data: { isPublished: true } });
            await flushMenuPublicationChecks(tx);

            return tx.menuItem.findFirstOrThrow({ where: { id: menu.id, shopId: auth.shopId }, select: { id: true, isPublished: true } });
        });

        await writeAdminAuditLog({
            req,
            actorUserId: auditActorUserId,
            actorShopId: auditShopId,
            action: "menu_create",
            targetType: "menu",
            targetId: created.id,
            success: true,
            metadata: {
                isPublished: created.isPublished,
                hasImage: Boolean(imageUrlResult.value),
            },
        });

        try { if (created.isPublished) {
            revalidatePublicMenuPaths(auth.shopId, created.id);
        } else {
            revalidatePublicShopPaths(auth.shopId);
        } } catch (error) { logOperationalError(error, { operation: "public_menu_refresh_after_commit" }); return NextResponse.json({ id: created.id, publicRefreshPending: true }, { status: 201 }); }

        return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (e) {
        if (operationId && auditShopId && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            const replay = await prisma.menuItem.findFirst({ where: { shopId: auditShopId, creationOperationId: operationId }, select: { id: true, creationRequestHash: true } });
            if (replay) return replay.creationRequestHash === requestHash ? creationReplay(auditShopId, replay.id) : NextResponse.json({ error: "同じ作成操作で異なる入力を再送できません。" }, { status: 409 });
        }
        if (auditShopId) {
            await writeAdminAuditLog({
                req,
                actorUserId: auditActorUserId,
                actorShopId: auditShopId,
                action: "menu_create",
                targetType: "menu",
                targetId: null,
                success: false,
                metadata: { reason: "internal_error" },
            });
        }
        return internalError(e);
    }
});

export const GET = (req: Request) => app.fetch(req);
export const POST = (req: Request) => app.fetch(req);
