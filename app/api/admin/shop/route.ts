// このファイルは管理画面の店舗情報 API です。
// /api/admin/shop の GET は表示用取得、PUT は更新を担当します。
// 認証済み管理者の shopId を使い、他店舗の情報が触れないようにします。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, readJson, requireShopId } from "@/app/api/admin/_utils";
import {
    parseAverageBudgetYen,
    toRequiredTrimmedString,
    toTrimmedNullableString,
} from "@/lib/admin-validators";
import { validateStoredImageUrl } from "@/lib/image-url-policy";
import { writeAdminAuditLog } from "@/lib/audit-log";

type ShopUpdateBody = {
    name?: unknown;
    description?: unknown;
    address?: unknown;
    hours?: unknown;
    averageBudgetYen?: unknown;
    coverImageUrl?: unknown;
};

export async function GET() {
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
                hours: true,
                averageBudgetYen: true,
                coverImageUrl: true,
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
}

export async function PUT(req: Request) {
    let auditActorUserId: string | null = null;
    let auditShopId: string | null = null;
    try {
        // PUT は編集フォームから送られた店舗情報の保存です。
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }
        auditActorUserId = auth.appUser.id;
        auditShopId = auth.shopId;

        // JSON が壊れている場合は 400 を返し、DB 更新まで進ませません。
        const body = await readJson<ShopUpdateBody>(req);
        if (!body) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        const existing = await prisma.shop.findUnique({
            where: { id: auth.shopId },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                hours: true,
                averageBudgetYen: true,
                coverImageUrl: true,
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
        const hours = toTrimmedNullableString(body.hours);
        const averageBudgetResult = parseAverageBudgetYen(body.averageBudgetYen);
        const coverImageUrl = toTrimmedNullableString(body.coverImageUrl);
        const coverImageUrlResult = validateStoredImageUrl(coverImageUrl, {
            kind: "shop",
            shopId: auth.shopId,
        });

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
                hours,
                averageBudgetYen: averageBudgetResult.value,
                coverImageUrl: coverImageUrlResult.value,
            },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                hours: true,
                averageBudgetYen: true,
                coverImageUrl: true,
                updatedAt: true,
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
                    existing.hours !== hours ? "hours" : null,
                    existing.averageBudgetYen !== averageBudgetResult.value
                        ? "averageBudgetYen"
                        : null,
                    existing.coverImageUrl !== coverImageUrlResult.value
                        ? "coverImageUrl"
                        : null,
                ].filter(Boolean),
            },
        });

        return NextResponse.json({ shop });
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
}
