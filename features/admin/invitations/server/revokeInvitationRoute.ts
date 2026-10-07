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
import { writeAdminAuditLog } from "@/lib/audit-log";
import { handleUnhandledApiError, logOperationalError } from "@/lib/observability";

const app = new Hono();
app.onError(handleUnhandledApiError);

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

        if (invite.status !== "pending" && invite.status !== "revoked") {
            return NextResponse.json({
                message: "この招待はすでに処理済みです。",
                invitation: serializeAdminInvite(invite),
            });
        }

        // 受諾側の行ロックと競合した場合も、pending のままの招待だけ取り消します。
        // 外部APIより先にDBで拒否状態を確定し、Clerk障害中も受諾させません。
        if (invite.status === "pending") {
            const changed = await prisma.adminInvite.updateMany({
                where: { id: invite.id, status: "pending" },
                data: { status: "revoked", revokedAt: new Date() },
            });
            if (changed.count !== 1) {
                return NextResponse.json(
                    { message: "招待の状態が変わりました。一覧を更新してください。" },
                    { status: 409 },
                );
            }

            await writeAdminAuditLog({
                req,
                actorUserId: null,
                actorShopId: invite.shopId,
                action: "invitation_revoke",
                targetType: "invitation",
                targetId: invite.id,
                success: true,
                metadata: { actorClerkUserId: admin.clerkUserId },
            });
        }

        const revoked = await prisma.adminInvite.findUniqueOrThrow({
            where: { id: invite.id },
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

        if (revoked.clerkInvitationId) {
            try {
                await revokeClerkApplicationInvitation(revoked.clerkInvitationId);
            } catch (error) {
                logOperationalError(error, {
                    operation: "invitation.revoke.clerk",
                    category: "external_service",
                });
                return NextResponse.json(
                    { message: "招待の受諾は停止しましたが、招待メールの無効化に失敗しました。取消を再試行してください。" },
                    { status: 502 },
                );
            }

            // IDが残っている取消済み行は外部取消の再試行対象です。
            await prisma.adminInvite.updateMany({
                where: { id: revoked.id, status: "revoked", clerkInvitationId: revoked.clerkInvitationId },
                data: { clerkInvitationId: null },
            });
            revoked.clerkInvitationId = null;
        }

        return NextResponse.json({
            message: "招待を取り消しました。",
            invitation: serializeAdminInvite(revoked),
        });
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            logOperationalError(error, { operation: "invitation.revoke", category: "database" });
            return NextResponse.json(
                { message: "現在データベースへ接続できません。" },
                { status: 503 },
            );
        }

        logOperationalError(error, { operation: "invitation.revoke" });
        return NextResponse.json(
            { message: "招待の取消に失敗しました。" },
            { status: 500 },
        );
    }
});

export const POST = (req: Request) => app.fetch(req);
