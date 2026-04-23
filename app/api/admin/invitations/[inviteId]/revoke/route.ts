// 店舗管理者招待の取消 API です。
// ローカルの招待状態と Clerk 側 invitation の両方を取り消します。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enforceSameOriginAdminMutation } from "@/lib/admin-api-security";
import { requirePlatformAdminApi } from "@/lib/admin-platform-auth";
import { requirePortfolioMutationAccessApi } from "@/lib/portfolio-mode";
import { serializeAdminInvite } from "@/lib/invitations";
import { revokeClerkApplicationInvitation } from "@/lib/auth/clerkAdminServer";
import { isDatabaseUnavailableError } from "@/lib/db-errors";

type Context = {
    params?: { inviteId?: string } | Promise<{ inviteId?: string }>;
};

async function getInviteId(req: Request, context: Context) {
    const params = context.params ? await context.params : undefined;
    if (params?.inviteId) {
        return params.inviteId;
    }

    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 2];
}

export async function POST(req: Request, context: Context) {
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

        const inviteId = await getInviteId(req, context);
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
}
