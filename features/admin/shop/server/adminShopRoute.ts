// このファイルは管理画面の店舗情報 API です。
// /api/admin/shop の GET は表示用取得、PUT は更新を担当します。
// 認証済み管理者の shopId を使い、他店舗の情報が触れないようにします。

import { z } from "zod";
import { Hono } from "hono";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, readJson, requireShopId } from "@/lib/auth/admin-api-utils";
import { enforceSameOriginAdminMutation } from "@/lib/auth/admin-api-security";
import {
    parseAverageBudgetYen,
    toRequiredTrimmedString,
    toTrimmedNullableString,
} from "@/lib/validators/admin-input";
import { validateStoredImageUrl } from "@/lib/storage/image-url-policy";
import { writeAdminAuditLog } from "@/lib/audit-log";
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
import { PREFECTURES } from "@/lib/constants/prefectures";

const app = new Hono();

const optionalText = z.string().nullable().optional();
const shopUpdateSchema = z.object({
    name: z.string(), description: optionalText, address: optionalText,
    prefecture: optionalText, city: optionalText, nearestStation: optionalText,
    category: optionalText, googlePlaceId: optionalText, hours: optionalText,
    regularHoliday: optionalText, phoneNumber: optionalText, note: optionalText,
    coverImageUrl: z.string().max(2048).nullable().optional(),
    latitude: z.number().finite().nullable().optional(),
    longitude: z.number().finite().nullable().optional(),
    averageBudgetYen: z.union([z.number().finite(), z.string().max(32)]).nullable().optional(),
    coverImageFrame: z.enum(["square", "wide"]).optional(),
    coverImageFit: z.enum(["cover", "contain"]).optional(),
    coverImagePosition: z.enum(["center", "top", "bottom", "left", "right"]).optional(),
    coverImageZoom: z.number().int().min(50).max(250).optional(),
    coverImagePositionX: z.number().int().min(0).max(100).optional(),
    coverImagePositionY: z.number().int().min(0).max(100).optional(),
});

function parseCoordinate(
    value: unknown,
    min: number,
    max: number,
): number | null | undefined {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return value >= min && value <= max ? value : undefined;
}

function hasTooLongValue(values: Array<[string | null, number]>) {
    return values.some(([value, max]) => value !== null && value.length > max);
}

app.get("/api/admin/shop", async () => {
    try {
        // GET は現在ログイン中の店舗情報を取得します。
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const shop = await prisma.shop.findUnique({
            where: { id: auth.shopId },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                prefecture: true,
                city: true,
                nearestStation: true,
                category: true,
                latitude: true,
                longitude: true,
                googlePlaceId: true,
                hours: true,
                regularHoliday: true,
                phoneNumber: true,
                note: true,
                averageBudgetYen: true,
                coverImageUrl: true,
                coverImageFrame: true,
                coverImageFit: true,
                coverImagePosition: true,
                coverImageZoom: true,
                coverImagePositionX: true,
                coverImagePositionY: true,
                updatedAt: true,
            },
        });

        if (!shop) {
            return NextResponse.json(
                { error: "shop not found" },
                { status: 404 },
            );
        }

        const sanitizedCoverImageUrl = validateStoredImageUrl(
            shop.coverImageUrl,
            {
                kind: "shop",
                shopId: auth.shopId,
            },
        );

        return NextResponse.json({
            shop: {
                ...shop,
                coverImageUrl: sanitizedCoverImageUrl.ok
                    ? sanitizedCoverImageUrl.value
                    : null,
            },
        });
    } catch (e) {
        return internalError(e);
    }
});

app.put("/api/admin/shop", async (c) => {
    const req = c.req.raw;
    let auditActorUserId: string | null = null;
    let auditShopId: string | null = null;
    try {
        const originError = enforceSameOriginAdminMutation(req);
        if (originError) {
            return originError;
        }

        // PUT は編集フォームから送られた店舗情報の保存です。
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

        // JSON が壊れている場合は 400 を返し、DB 更新まで進ませません。
        const parsedBody = shopUpdateSchema.safeParse(await readJson<unknown>(req));
        if (!parsedBody.success) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        const body = parsedBody.data;
        const existing = await prisma.shop.findUnique({
            where: { id: auth.shopId },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                prefecture: true,
                city: true,
                nearestStation: true,
                category: true,
                latitude: true,
                longitude: true,
                googlePlaceId: true,
                hours: true,
                regularHoliday: true,
                phoneNumber: true,
                note: true,
                averageBudgetYen: true,
                coverImageUrl: true,
                coverImageFrame: true,
                coverImageFit: true,
                coverImagePosition: true,
                coverImageZoom: true,
                coverImagePositionX: true,
                coverImagePositionY: true,
            },
        });
        if (!existing) {
            return NextResponse.json(
                { error: "shop not found" },
                { status: 404 },
            );
        }

        // 店舗名は必須なので、空文字や空白だけはここで弾きます。
        const name = toRequiredTrimmedString(body.name);
        if (!name) {
            await writeAdminAuditLog({
                req,
                actorUserId: auditActorUserId,
                actorShopId: auditShopId,
                action: "shop_update",
                targetType: "shop",
                targetId: auth.shopId,
                success: false,
                metadata: { reason: "bad request: name is required" },
            });
            return NextResponse.json(
                { error: "bad request: name is required" },
                { status: 400 },
            );
        }

        // 文字列項目は空なら null に寄せて保存し、DB の扱いを揃えます。
        const description = toTrimmedNullableString(body.description);
        const address = toTrimmedNullableString(body.address);
        const prefecture = toTrimmedNullableString(body.prefecture);
        const city = toTrimmedNullableString(body.city);
        const nearestStation = toTrimmedNullableString(body.nearestStation);
        const category = toTrimmedNullableString(body.category);
        const latitude = parseCoordinate(body.latitude, -90, 90);
        const longitude = parseCoordinate(body.longitude, -180, 180);
        const googlePlaceId = toTrimmedNullableString(body.googlePlaceId);
        const hours = toTrimmedNullableString(body.hours);
        const regularHoliday = toTrimmedNullableString(body.regularHoliday);
        const phoneNumber = toTrimmedNullableString(body.phoneNumber);
        const note = toTrimmedNullableString(body.note);
        const averageBudgetResult = parseAverageBudgetYen(body.averageBudgetYen);
        const coverImageUrl = toTrimmedNullableString(body.coverImageUrl);
        const coverImageUrlResult = validateStoredImageUrl(coverImageUrl, {
            kind: "shop",
            shopId: auth.shopId,
        });
        const coverImageFrame =
            body.coverImageFrame === undefined
                ? parseMenuImageFrame(existing.coverImageFrame)
                : parseMenuImageFrame(body.coverImageFrame);
        const coverImageFit =
            body.coverImageFit === undefined
                ? parseMenuImageFit(existing.coverImageFit)
                : parseMenuImageFit(body.coverImageFit);
        const coverImagePosition =
            body.coverImagePosition === undefined
                ? parseMenuImagePosition(existing.coverImagePosition)
                : parseMenuImagePosition(body.coverImagePosition);
        const coverImageZoom =
            body.coverImageZoom === undefined
                ? parseMenuImageZoom(existing.coverImageZoom)
                : parseMenuImageZoom(body.coverImageZoom);
        const coverImagePositionX =
            body.coverImagePositionX === undefined
                ? parseMenuImagePositionPercent(existing.coverImagePositionX)
                : parseMenuImagePositionPercent(body.coverImagePositionX);
        const coverImagePositionY =
            body.coverImagePositionY === undefined
                ? parseMenuImagePositionPercent(existing.coverImagePositionY)
                : parseMenuImagePositionPercent(body.coverImagePositionY);

        if (
            hasTooLongValue([
                [name, 120],
                [description, 2000],
                [address, 500],
                [prefecture, 20],
                [city, 120],
                [nearestStation, 120],
                [category, 120],
                [hours, 1000],
                [regularHoliday, 500],
                [phoneNumber, 50],
                [note, 2000],
                [googlePlaceId, 255],
            ])
        ) {
            return NextResponse.json(
                { error: "bad request: input is too long" },
                { status: 400 },
            );
        }

        if (
            latitude === undefined ||
            longitude === undefined ||
            (latitude === null) !== (longitude === null) ||
            (googlePlaceId === null) !== (latitude === null) ||
            (prefecture !== null &&
                !PREFECTURES.includes(prefecture as (typeof PREFECTURES)[number]))
        ) {
            return NextResponse.json(
                { error: "bad request: invalid Google place location" },
                { status: 400 },
            );
        }

        if (!averageBudgetResult.ok) {
            await writeAdminAuditLog({
                req,
                actorUserId: auditActorUserId,
                actorShopId: auditShopId,
                action: "shop_update",
                targetType: "shop",
                targetId: auth.shopId,
                success: false,
                metadata: { reason: averageBudgetResult.message },
            });
            return NextResponse.json(
                { error: averageBudgetResult.message },
                { status: 400 },
            );
        }
        if (!coverImageUrlResult.ok) {
            // 店舗画像も外部 URL の自由入力は許可せず、
            // 自前アップロード由来の URL だけ保存できるようにします。
            await writeAdminAuditLog({
                req,
                actorUserId: auditActorUserId,
                actorShopId: auditShopId,
                action: "shop_update",
                targetType: "shop",
                targetId: auth.shopId,
                success: false,
                metadata: { reason: coverImageUrlResult.message },
            });
            return NextResponse.json(
                { error: coverImageUrlResult.message },
                { status: 400 },
            );
        }

        // where に auth.shopId を使うことで、必ず本人の店舗だけ更新します。
        const shop = await prisma.shop.update({
            where: { id: auth.shopId },
            data: {
                name,
                description,
                address,
                prefecture,
                city,
                nearestStation,
                category,
                latitude,
                longitude,
                googlePlaceId,
                hours,
                regularHoliday,
                phoneNumber,
                note,
                averageBudgetYen: averageBudgetResult.value,
                coverImageUrl: coverImageUrlResult.value,
                coverImageFrame,
                coverImageFit,
                coverImagePosition,
                coverImageZoom,
                coverImagePositionX,
                coverImagePositionY,
            },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                prefecture: true,
                city: true,
                nearestStation: true,
                category: true,
                latitude: true,
                longitude: true,
                googlePlaceId: true,
                hours: true,
                regularHoliday: true,
                phoneNumber: true,
                note: true,
                averageBudgetYen: true,
                coverImageUrl: true,
                coverImageFrame: true,
                coverImageFit: true,
                coverImagePosition: true,
                coverImageZoom: true,
                coverImagePositionX: true,
                coverImagePositionY: true,
                updatedAt: true,
                menus: {
                    where: { isPublished: true },
                    select: { id: true },
                },
            },
        });

        await writeAdminAuditLog({
            req,
            actorUserId: auditActorUserId,
            actorShopId: auditShopId,
            action: "shop_update",
            targetType: "shop",
            targetId: shop.id,
            success: true,
            metadata: {
                changedFields: [
                    existing.name !== name ? "name" : null,
                    existing.description !== description ? "description" : null,
                    existing.address !== address ? "address" : null,
                    existing.prefecture !== prefecture ? "prefecture" : null,
                    existing.city !== city ? "city" : null,
                    existing.nearestStation !== nearestStation
                        ? "nearestStation"
                        : null,
                    existing.category !== category ? "category" : null,
                    existing.latitude !== latitude ? "latitude" : null,
                    existing.longitude !== longitude ? "longitude" : null,
                    existing.googlePlaceId !== googlePlaceId
                        ? "googlePlaceId"
                        : null,
                    existing.hours !== hours ? "hours" : null,
                    existing.regularHoliday !== regularHoliday
                        ? "regularHoliday"
                        : null,
                    existing.phoneNumber !== phoneNumber
                        ? "phoneNumber"
                        : null,
                    existing.note !== note ? "note" : null,
                    existing.averageBudgetYen !== averageBudgetResult.value
                        ? "averageBudgetYen"
                        : null,
                    existing.coverImageUrl !== coverImageUrlResult.value
                        ? "coverImageUrl"
                        : null,
                    existing.coverImageFrame !== coverImageFrame
                        ? "coverImageFrame"
                        : null,
                    existing.coverImageFit !== coverImageFit
                        ? "coverImageFit"
                        : null,
                    existing.coverImagePosition !== coverImagePosition
                        ? "coverImagePosition"
                        : null,
                    existing.coverImageZoom !== coverImageZoom
                        ? "coverImageZoom"
                        : null,
                    existing.coverImagePositionX !== coverImagePositionX
                        ? "coverImagePositionX"
                        : null,
                    existing.coverImagePositionY !== coverImagePositionY
                        ? "coverImagePositionY"
                        : null,
                ].filter(Boolean),
            },
        });

        const { menus, ...shopResponse } = shop;

        revalidatePublicShopPaths(auth.shopId);
        for (const menu of menus) {
            revalidatePublicMenuPaths(auth.shopId, menu.id);
        }

        return NextResponse.json({ shop: shopResponse });
    } catch (e) {
        if (auditShopId) {
            await writeAdminAuditLog({
                req,
                actorUserId: auditActorUserId,
                actorShopId: auditShopId,
                action: "shop_update",
                targetType: "shop",
                targetId: auditShopId,
                success: false,
                metadata: { reason: "internal_error" },
            });
        }
        return internalError(e);
    }
});

export const GET = (req: Request) => app.fetch(req);
export const PUT = (req: Request) => app.fetch(req);
