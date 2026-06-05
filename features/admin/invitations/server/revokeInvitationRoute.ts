// 店舗管理者招待の取消 API です。
// ローカルの招待状態と Clerk 側 invitation の両方を取り消します。

import { Hono } from "hono";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enforceSameOriginAdminMutation } from "@/lib/auth/admin-api-security";
import { requirePlatformAdminApi } from "@/lib/auth/admin-platform-auth";
import { requirePortfolioMutationAccessApi } from "@/lib/auth/portfolio-mode";
import { serializeAdminInvite } from "@/lib/auth/invitations";
import { revokeClerkApplicationInvitation } from "@/lib/auth/clerkAdminServer";
import { isDatabaseUnavailableError } from "@/lib/db/errors";

const app = new Hono();

app.post("/api/admin/invitations/:inviteId/revoke", async (c) => {
    const req = c.req.raw;
    const inviteId = c.req.param("inviteId");
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

        const invite = await prisma.adminInvite.findUnique({
            where: { id: inviteId },
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

        if (!invite) {
            return NextResponse.json(
                { message: "招待が見つかりません。" },
                { status: 404 },
            );
        }

        if (invite.status !== "pending") {
            return NextResponse.json({
                message: "この招待はすでに処理済みです。",
                invitation: serializeAdminInvite(invite),
            });
        }

        if (invite.clerkInvitationId) {
            await revokeClerkApplicationInvitation(
                invite.clerkInvitationId,
            ).catch(() => undefined);
        }

        const revoked = await prisma.adminInvite.update({
            where: { id: invite.id },
            data: {
                status: "revoked",
                revokedAt: new Date(),
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

        return NextResponse.json({
            message: "招待を取り消しました。",
            invitation: serializeAdminInvite(revoked),
        });
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            return NextResponse.json(
                { message: "現在データベースへ接続できません。" },
                { status: 503 },
            );
        }

        console.error(error);
        return NextResponse.json(
            { message: "招待の取消に失敗しました。" },
            { status: 500 },
        );
    }
});

export const POST = (req: Request) => app.fetch(req);
