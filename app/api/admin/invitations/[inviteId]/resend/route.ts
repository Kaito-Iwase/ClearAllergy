// 店舗管理者招待の再送 API です。
// 古い招待を失効させてから新しい Clerk 招待と AdminInvite を作り直します。

import { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enforceSameOriginAdminMutation } from "@/lib/admin-api-security";
import { requirePlatformAdminApi } from "@/lib/admin-platform-auth";
import { requirePortfolioMutationAccessApi } from "@/lib/portfolio-mode";
import {
    buildInvitationRedirectUrl,
    getInvitationExpiresAt,
    serializeAdminInvite,
} from "@/lib/invitations";
import {
    createClerkApplicationInvitation,
    findClerkUserByEmail,
    revokeClerkApplicationInvitation,
} from "@/lib/auth/clerkAdminServer";
import { extractClerkErrorMessage } from "@/lib/auth/clerkErrors";
import {
    isDatabaseUnavailableError,
    retryOnceOnDatabaseUnavailable,
} from "@/lib/db-errors";

const app = new Hono();

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
        }

        const expiresInDays = 30;
        const newClerkInvitation = await createClerkApplicationInvitation({
            email: oldInvite.email,
            expiresInDays,
            redirectUrl: buildInvitationRedirectUrl(req),
            publicMetadata: {
                clearAllergyInvite: true,
            },
        });
        newClerkInvitationId = newClerkInvitation.id;

        const newInvite = await prisma.$transaction(async (tx) => {
            await tx.adminInvite.update({
                where: { id: oldInvite.id },
                data: {
                    status: "revoked",
                    revokedAt: new Date(),
                },
            });

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

        return NextResponse.json({
            message: "招待を再送しました。",
            invitation: serializeAdminInvite(newInvite),
            clerkInvitationUrl: newClerkInvitation.url ?? null,
        });
    } catch (error) {
        if (newClerkInvitationId) {
            await revokeClerkApplicationInvitation(
                newClerkInvitationId,
            ).catch(() => undefined);
        }

        if (isUniqueConstraintError(error)) {
            return NextResponse.json(
                { message: "このメールアドレスまたは店舗には未承認の招待があります。" },
                { status: 409 },
            );
        }

        if (isDatabaseUnavailableError(error)) {
            return NextResponse.json(
                { message: "現在データベースへ接続できません。" },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                message: extractClerkErrorMessage(
                    error,
                    "招待の再送に失敗しました。",
                ),
            },
            { status: 500 },
        );
    }
});

export const POST = (req: Request) => app.fetch(req);
