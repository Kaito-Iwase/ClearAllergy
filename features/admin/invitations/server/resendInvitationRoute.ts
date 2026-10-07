// 店舗管理者招待の再送 API です。
// 古い招待を失効させてから新しい Clerk 招待と AdminInvite を作り直します。

import { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enforceSameOriginAdminMutation } from "@/lib/auth/admin-api-security";
import { requirePlatformAdminApi } from "@/lib/auth/admin-platform-auth";
import { requirePortfolioMutationAccessApi } from "@/lib/auth/portfolio-mode";
import {
    buildInvitationRedirectUrl,
    getInvitationExpiresAt,
    InvitationError,
    serializeAdminInvite,
} from "@/lib/auth/invitations";
import {
    createClerkApplicationInvitation,
    findClerkUserByEmail,
    revokeClerkApplicationInvitation,
} from "@/lib/auth/clerkAdminServer";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { handleUnhandledApiError, logOperationalError } from "@/lib/observability";
import {
    isDatabaseUnavailableError,
    retryOnceOnDatabaseUnavailable,
} from "@/lib/db/errors";

const app = new Hono();
app.onError(handleUnhandledApiError);

function isUniqueConstraintError(error: unknown) {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
    );
}

app.post("/api/admin/invitations/:inviteId/resend", async (c) => {
    const req = c.req.raw;
    const inviteId = c.req.param("inviteId");
    let newClerkInvitationId: string | null = null;
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

        if (!inviteId) {
            return NextResponse.json(
                { message: "招待IDが指定されていません。" },
                { status: 400 },
            );
        }

        failureCategory = "database";
        const oldInvite = await retryOnceOnDatabaseUnavailable(() =>
            prisma.adminInvite.findUnique({
                where: { id: inviteId },
                include: {
                    shop: {
                        select: {
                            id: true,
                            name: true,
                            ownerClerkUserId: true,
                            isActive: true,
                        },
                    },
                },
            }),
        );

        if (!oldInvite) {
            return NextResponse.json(
                { message: "招待が見つかりません。" },
                { status: 404 },
            );
        }

        if (oldInvite.status !== "pending") {
            return NextResponse.json(
                { message: "再送できるのは未承認の招待だけです。" },
                { status: 409 },
            );
        }

        if (oldInvite.shop.ownerClerkUserId || oldInvite.shop.isActive) {
            return NextResponse.json(
                { message: "この店舗にはすでに管理者が設定されています。" },
                { status: 409 },
            );
        }

        failureCategory = "external_service";
        const existingClerkUser = await findClerkUserByEmail(oldInvite.email);
        if (existingClerkUser) {
            return NextResponse.json(
                {
                    message:
                        "既存のClerkユーザーへの招待は現在サポートしていません。",
                },
                { status: 409 },
            );
        }

        if (oldInvite.clerkInvitationId) {
            await revokeClerkApplicationInvitation(
                oldInvite.clerkInvitationId,
            );
            // 以降の作成が失敗しても、取消済みの外部招待を再度取り消さず再送できます。
            failureCategory = "database";
            const cleared = await prisma.adminInvite.updateMany({
                where: {
                    id: oldInvite.id,
                    status: "pending",
                    clerkInvitationId: oldInvite.clerkInvitationId,
                },
                data: { clerkInvitationId: null },
            });
            if (cleared.count !== 1) {
                throw new InvitationError("招待の状態が変わりました。一覧を更新してください。", 409);
            }
        }

        const expiresInDays = 30;
        failureCategory = "external_service";
        const newClerkInvitation = await createClerkApplicationInvitation({
            email: oldInvite.email,
            expiresInDays,
            redirectUrl: buildInvitationRedirectUrl(req),
            publicMetadata: {
                clearAllergyInvite: true,
            },
        });
        newClerkInvitationId = newClerkInvitation.id;

        failureCategory = "database";
        const newInvite = await prisma.$transaction(async (tx) => {
            const changed = await tx.adminInvite.updateMany({
                where: { id: oldInvite.id, status: "pending" },
                data: {
                    status: "revoked",
                    revokedAt: new Date(),
                },
            });

            if (changed.count !== 1) {
                throw new InvitationError("招待の状態が変わりました。一覧を更新してください。", 409);
            }

            return tx.adminInvite.create({
                data: {
                    email: oldInvite.email,
                    shopId: oldInvite.shopId,
                    status: "pending",
                    clerkInvitationId: newClerkInvitation.id,
                    expiresAt: getInvitationExpiresAt(expiresInDays),
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

        // 以降のレスポンス処理に失敗しても、確定済み招待は補償取消しません。
        newClerkInvitationId = null;
        failureCategory = "unexpected";
        await writeAdminAuditLog({
            req,
            actorUserId: null,
            actorShopId: newInvite.shopId,
            action: "invitation_resend",
            targetType: "invitation",
            targetId: newInvite.id,
            success: true,
            metadata: { actorClerkUserId: admin.clerkUserId },
        });

        return NextResponse.json({
            message: "招待を再送しました。",
            invitation: serializeAdminInvite(newInvite),
            clerkInvitationUrl: newClerkInvitation.url ?? null,
        });
    } catch (error) {
        if (newClerkInvitationId) {
            await revokeClerkApplicationInvitation(
                newClerkInvitationId,
            ).catch((cleanupError: unknown) => {
                logOperationalError(cleanupError, {
                    operation: "invitation.resend.compensate",
                    category: "external_service",
                });
            });
        }

        if (error instanceof InvitationError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }

        if (isUniqueConstraintError(error)) {
            return NextResponse.json(
                { message: "このメールアドレスまたは店舗には未承認の招待があります。" },
                { status: 409 },
            );
        }

        if (isDatabaseUnavailableError(error)) {
            logOperationalError(error, { operation: "invitation.resend", category: "database" });
            return NextResponse.json(
                { message: "現在データベースへ接続できません。" },
                { status: 503 },
            );
        }

        logOperationalError(error, { operation: "invitation.resend", category: failureCategory });
        return NextResponse.json(
            { message: "招待の再送に失敗しました。" },
            { status: 500 },
        );
    }
});

export const POST = (req: Request) => app.fetch(req);
