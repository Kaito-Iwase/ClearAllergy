import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentClerkIdentity } from "@/lib/auth/getCurrentAppUser";
import { enforceSameOriginAdminMutation } from "@/lib/admin-api-security";
import {
    acceptPendingInviteForCurrentUser,
    InvitationError,
    isInviteLockError,
    serializeAdminInvite,
} from "@/lib/invitations";
import { isDatabaseUnavailableError } from "@/lib/db-errors";

function isUniqueConstraintConflict(error: unknown) {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
    );
}

export async function POST(req: Request) {
    try {
        const originError = enforceSameOriginAdminMutation(req);
        if (originError) {
            return originError;
        }

        const identity = await getCurrentClerkIdentity();

        if (!identity) {
            return NextResponse.json(
                { message: "認証が必要です。" },
                { status: 401 },
            );
        }

        if (!identity.email) {
            return NextResponse.json(
                { message: "Clerkのプライマリメールアドレスを確認できません。" },
                { status: 400 },
            );
        }

        const result = await acceptPendingInviteForCurrentUser({
            clerkUserId: identity.clerkUserId,
            email: identity.email,
        });

        return NextResponse.json({
            message: "招待を承認しました。",
            shop: result.shop,
            invitation: serializeAdminInvite(result.invite),
        });
    } catch (error) {
        if (isInviteLockError(error)) {
            return NextResponse.json(
                {
                    message:
                        "この招待は現在処理中です。少し待ってから再度お試しください。",
                },
                { status: 409 },
            );
        }

        if (error instanceof InvitationError) {
            return NextResponse.json(
                { message: error.message },
                { status: error.status },
            );
        }

        if (isUniqueConstraintConflict(error)) {
            return NextResponse.json(
                {
                    message:
                        "この店舗またはアカウントにはすでに管理者が設定されています。",
                },
                { status: 409 },
            );
        }

        if (isDatabaseUnavailableError(error)) {
            return NextResponse.json(
                { message: "現在データベースへ接続できません。" },
                { status: 503 },
            );
        }

        console.error(error);
        return NextResponse.json(
            { message: "招待の承認に失敗しました。" },
            { status: 500 },
        );
    }
}
