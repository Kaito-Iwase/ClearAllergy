// 運営管理者向けの店舗管理者招待 API です。
// Clerk の招待作成とローカル AdminInvite 作成を対応させ、失敗時は Clerk 側も取り消します。

import { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enforceSameOriginAdminMutation } from "@/lib/auth/admin-api-security";
import { requirePlatformAdminApi } from "@/lib/auth/admin-platform-auth";
import { requirePortfolioMutationAccessApi } from "@/lib/auth/portfolio-mode";
import {
    buildInvitationRedirectUrl,
    expirePendingInvitesForEmail,
    expirePendingInvitesForShop,
    getInvitationExpiresAt,
    serializeAdminInvite,
} from "@/lib/auth/invitations";
import { adminInviteCreateSchema } from "@/features/admin/invitations/schemas/admin-invitations";
import {
    createClerkApplicationInvitation,
    findClerkUserByEmail,
    revokeClerkApplicationInvitation,
} from "@/lib/auth/clerkAdminServer";
import { isDatabaseUnavailableError } from "@/lib/db/errors";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { handleUnhandledApiError, logOperationalError } from "@/lib/observability";

type InviteCreateBody = {
    email?: unknown;
    shopId?: unknown;
    shopName?: unknown;
    expiresInDays?: unknown;
};

const app = new Hono();
app.onError(handleUnhandledApiError);

function isUniqueConstraintError(error: unknown) {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
    );
}

app.get("/api/admin/invitations", async () => {
    try {
        const admin = await requirePlatformAdminApi();
        if (!admin.ok) {
            return admin.res;
        }

        const invites = await prisma.adminInvite.findMany({
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
                shop: {
                    select: {
                        id: true,
                        name: true,
                        isActive: true,
                        ownerClerkUserId: true,
                    },
                },
            },
        });

        return NextResponse.json({
            invitations: invites.map(serializeAdminInvite),
        });
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            logOperationalError(error, { operation: "invitation.list", category: "database" });
            return NextResponse.json(
                { message: "現在データベースへ接続できません。" },
                { status: 503 },
            );
        }

        logOperationalError(error, { operation: "invitation.list", category: "unexpected" });
        return NextResponse.json(
            { message: "招待一覧の取得に失敗しました。" },
            { status: 500 },
        );
    }
});

app.post("/api/admin/invitations", async (c) => {
    const req = c.req.raw;
    let clerkInvitationId: string | null = null;
    let failureCategory: "database" | "external_service" | "unexpected" = "unexpected";

    try {
        const originError = enforceSameOriginAdminMutation(req);
        if (originError) {
            return originError;
        }

        const admin = await requirePlatformAdminApi();
        if (!admin.ok) {
            return admin.res;
        }

        const portfolioAccess = await requirePortfolioMutationAccessApi();
        if (!portfolioAccess.ok) {
            return portfolioAccess.res;
        }

        const body = (await req.json().catch(() => null)) as InviteCreateBody | null;
        const parsed = adminInviteCreateSchema.safeParse({
            email: body?.email,
            shopId:
                typeof body?.shopId === "string" ? body.shopId : undefined,
            shopName:
                typeof body?.shopName === "string" ? body.shopName : undefined,
            expiresInDays:
                typeof body?.expiresInDays === "number"
                    ? body.expiresInDays
                    : undefined,
        });

        if (!parsed.success) {
            return NextResponse.json(
                {
                    message:
                        parsed.error.issues[0]?.message ??
                        "入力内容を確認してください。",
                },
                { status: 400 },
            );
        }

        const { email, shopId, shopName, expiresInDays } = parsed.data;
        failureCategory = "database";
        await expirePendingInvitesForEmail(email);
        if (shopId) {
            await expirePendingInvitesForShop(shopId);
        }

        const pendingInvite = await prisma.adminInvite.findFirst({
            where: {
                email,
                status: "pending",
            },
            select: { id: true },
        });

        if (pendingInvite) {
            return NextResponse.json(
                { message: "このメールアドレスには未承認の招待があります。" },
                { status: 409 },
            );
        }

        failureCategory = "external_service";
        const existingClerkUser = await findClerkUserByEmail(email);
        if (existingClerkUser) {
            return NextResponse.json(
                {
                    message:
                        "既存のClerkユーザーへの招待は現在サポートしていません。",
                },
                { status: 409 },
            );
        }

        if (shopId) {
            failureCategory = "database";
            const existingShop = await prisma.shop.findUnique({
                where: { id: shopId },
                select: {
                    id: true,
                    ownerClerkUserId: true,
                    isActive: true,
                    adminInvites: {
                        where: { status: "pending" },
                        select: { id: true },
                        take: 1,
                    },
                },
            });

            if (!existingShop) {
                return NextResponse.json(
                    { message: "招待対象の店舗が見つかりません。" },
                    { status: 404 },
                );
            }

            if (existingShop.ownerClerkUserId || existingShop.isActive) {
                return NextResponse.json(
                    { message: "この店舗にはすでに管理者が設定されています。" },
                    { status: 409 },
                );
            }

            if (existingShop.adminInvites.length > 0) {
                return NextResponse.json(
                    { message: "この店舗には未承認の招待があります。" },
                    { status: 409 },
                );
            }
        }

        failureCategory = "external_service";
        const clerkInvitation = await createClerkApplicationInvitation({
            email,
            expiresInDays,
            redirectUrl: buildInvitationRedirectUrl(req),
            publicMetadata: {
                clearAllergyInvite: true,
            },
        });
        clerkInvitationId = clerkInvitation.id;

        const expiresAt = getInvitationExpiresAt(expiresInDays);
        failureCategory = "database";
        const invite = await prisma.$transaction(async (tx) => {
            const shop = shopId
                ? await tx.shop.findUniqueOrThrow({
                      where: { id: shopId },
                      select: {
                          id: true,
                          ownerClerkUserId: true,
                          isActive: true,
                      },
                  })
                : await tx.shop.create({
                      data: {
                          name: shopName ?? "",
                      },
                      select: {
                          id: true,
                          ownerClerkUserId: true,
                          isActive: true,
                      },
                  });

            if (shop.ownerClerkUserId || shop.isActive) {
                throw new Error("shop_already_owned");
            }

            return tx.adminInvite.create({
                data: {
                    email,
                    shopId: shop.id,
                    status: "pending",
                    clerkInvitationId: clerkInvitation.id,
                    expiresAt,
                    invitedByClerkUserId: admin.clerkUserId,
                },
                include: {
                    shop: {
                        select: {
                            id: true,
                            name: true,
                            isActive: true,
                            ownerClerkUserId: true,
                        },
                    },
                },
            });
        });

        clerkInvitationId = null;
        failureCategory = "unexpected";
        await writeAdminAuditLog({
            req,
            actorUserId: null,
            actorShopId: invite.shopId,
            action: "invitation_create",
            targetType: "invitation",
            targetId: invite.id,
            success: true,
            metadata: { actorClerkUserId: admin.clerkUserId },
        });

        return NextResponse.json(
            {
                message: "招待を作成しました。",
                invitation: serializeAdminInvite(invite),
                clerkInvitationUrl: clerkInvitation.url ?? null,
            },
            { status: 201 },
        );
    } catch (error) {
        if (clerkInvitationId) {
            await revokeClerkApplicationInvitation(clerkInvitationId).catch(
                (cleanupError: unknown) => {
                    logOperationalError(cleanupError, {
                        operation: "invitation.create.compensate",
                        category: "external_service",
                    });
                },
            );
        }

        if (isUniqueConstraintError(error)) {
            return NextResponse.json(
                { message: "このメールアドレスまたは店舗には未承認の招待があります。" },
                { status: 409 },
            );
        }

        if (isDatabaseUnavailableError(error)) {
            logOperationalError(error, { operation: "invitation.create", category: "database" });
            return NextResponse.json(
                { message: "現在データベースへ接続できません。" },
                { status: 503 },
            );
        }

        if (error instanceof Error && error.message === "shop_already_owned") {
            return NextResponse.json(
                { message: "この店舗にはすでに管理者が設定されています。" },
                { status: 409 },
            );
        }

        logOperationalError(error, { operation: "invitation.create", category: failureCategory });
        return NextResponse.json(
            { message: "招待の作成に失敗しました。" },
            { status: 500 },
        );
    }
});

export const GET = (req: Request) => app.fetch(req);
export const POST = (req: Request) => app.fetch(req);
