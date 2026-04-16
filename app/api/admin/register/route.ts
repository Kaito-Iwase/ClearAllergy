// このファイルは管理画面の新規登録 API です。
// /api/admin/register の POST を担当し、Clerk に認証用ユーザーを作成しつつ、
// ローカル DB には clerkUserId と Shop だけを保存します。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDatabaseUnavailableError } from "@/lib/db-errors";
import { getAdminRegistrationGuard } from "@/lib/admin-registration";
import { enforceSameOriginAdminMutation, consumeIpAndIdentifierRateLimit } from "@/lib/admin-api-security";
import { adminRegisterSchema } from "@/lib/admin-auth-schemas";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { getIpFromHeaders } from "@/lib/request-ip";
import {
    createClerkPasswordUser,
    deleteClerkUser,
    findClerkUserByEmail,
    updateClerkExternalId,
} from "@/lib/auth/clerkAdminServer";
import { extractClerkErrorMessage } from "@/lib/auth/clerkErrors";

type RegisterRequestBody = {
    shopName?: string;
    email?: string;
    password?: string;
    inviteToken?: string;
};

export async function POST(req: Request) {
    let createdClerkUserId: string | null = null;
    let auditEmail: string | null = null;

    try {
        const originError = enforceSameOriginAdminMutation(req);
        if (originError) {
            return originError;
        }

        const ip = getIpFromHeaders(req.headers);

        const body = (await req.json()) as RegisterRequestBody;
        const parsed = adminRegisterSchema.safeParse({
            shopName: body?.shopName,
            email: body?.email,
            password: body?.password,
            inviteToken:
                req.headers.get("x-admin-invite-token") ??
                (typeof body?.inviteToken === "string" ? body.inviteToken : null),
        });

        if (!parsed.success) {
            auditEmail =
                typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
            await writeAdminAuditLog({
                req,
                actorUserId: null,
                actorShopId: null,
                action: "auth_register_failure",
                targetType: "auth",
                targetId: null,
                success: false,
                metadata: {
                    email: auditEmail,
                    reason: "invalid_input",
                },
            });
            return NextResponse.json(
                { message: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" },
                { status: 400 },
            );
        }

        auditEmail = parsed.data.email;
        const rateLimit = consumeIpAndIdentifierRateLimit({
            scope: "admin-register",
            ip,
            identifier: parsed.data.email,
            ipLimit: 5,
            identifierLimit: 3,
            windowMs: 15 * 60 * 1000,
        });

        if (!rateLimit.allowed) {
            await writeAdminAuditLog({
                req,
                actorUserId: null,
                actorShopId: null,
                action: "auth_register_failure",
                targetType: "auth",
                targetId: null,
                success: false,
                metadata: {
                    email: parsed.data.email,
                    reason: "rate_limited",
                },
            });
            return NextResponse.json(
                {
                    message:
                        "登録試行が多すぎます。しばらく待ってから再度お試しください。",
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimit.retryAfterSeconds),
                    },
                },
            );
        }

        await writeAdminAuditLog({
            req,
            actorUserId: null,
            actorShopId: null,
            action: "auth_register_attempt",
            targetType: "auth",
            targetId: null,
            success: true,
            metadata: {
                email: parsed.data.email,
                registrationMode: process.env.ADMIN_REGISTRATION_MODE ?? "disabled",
            },
        });

        const inviteToken = parsed.data.inviteToken;
        const registrationGuard = getAdminRegistrationGuard({ inviteToken });

        if (!registrationGuard.allowed) {
            await writeAdminAuditLog({
                req,
                actorUserId: null,
                actorShopId: null,
                action: "auth_register_failure",
                targetType: "auth",
                targetId: null,
                success: false,
                metadata: {
                    email: parsed.data.email,
                    reason: "registration_guard_denied",
                },
            });
            return NextResponse.json(
                {
                    message: registrationGuard.message,
                },
                { status: 403 },
            );
        }

        const shopName = parsed.data.shopName;
        const email = parsed.data.email;
        const password = parsed.data.password;

        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existingUser) {
            await writeAdminAuditLog({
                req,
                actorUserId: null,
                actorShopId: null,
                action: "auth_register_failure",
                targetType: "auth",
                targetId: existingUser.id,
                success: false,
                metadata: {
                    email,
                    reason: "email_already_registered_locally",
                },
            });
            return NextResponse.json(
                { message: "このメールアドレスはすでに登録されています。" },
                { status: 409 },
            );
        }

        const existingClerkUser = await findClerkUserByEmail(email);

        if (existingClerkUser) {
            await writeAdminAuditLog({
                req,
                actorUserId: null,
                actorShopId: null,
                action: "auth_register_failure",
                targetType: "auth",
                targetId: null,
                success: false,
                metadata: {
                    email,
                    reason: "email_already_registered_in_clerk",
                },
            });
            return NextResponse.json(
                { message: "このメールアドレスはすでに登録されています。" },
                { status: 409 },
            );
        }

        const createdClerkUser = await createClerkPasswordUser({
            email,
            password,
        });
        createdClerkUserId = createdClerkUser.id;

        const createdUser = await prisma.user.create({
            data: {
                email,
                clerkUserId: createdClerkUser.id,
                shop: {
                    create: {
                        name: shopName,
                    },
                },
            },
            select: {
                id: true,
                email: true,
                shop: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        try {
            await updateClerkExternalId({
                clerkUserId: createdClerkUser.id,
                appUserId: createdUser.id,
            });
        } catch (externalIdError) {
            console.warn(
                "Failed to attach Clerk externalId after admin registration.",
                externalIdError,
            );
        }

        await writeAdminAuditLog({
            req,
            actorUserId: createdUser.id,
            actorShopId: createdUser.shop?.id ?? null,
            action: "auth_register_success",
            targetType: "auth",
            targetId: createdUser.id,
            success: true,
            metadata: {
                email: createdUser.email,
                clerkUserId: createdClerkUser.id,
                registrationMode: registrationGuard.mode,
            },
        });

        return NextResponse.json(
            {
                message: "新規登録が完了しました。",
                user: {
                    id: createdUser.id,
                    email: createdUser.email,
                    clerkUserId: createdClerkUser.id,
                },
                shop: createdUser.shop,
            },
            { status: 201 },
        );
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            if (createdClerkUserId) {
                try {
                    await deleteClerkUser(createdClerkUserId);
                } catch {
                    // DB 側だけ失敗した時も Clerk ユーザーはできるだけ巻き戻します。
                }
            }

            return NextResponse.json(
                {
                    message:
                        "現在データベースへ接続できないため、新規登録を完了できません。",
                },
                { status: 503 },
            );
        }

        await writeAdminAuditLog({
            req,
            actorUserId: null,
            actorShopId: null,
            action: "auth_register_failure",
            targetType: "auth",
            targetId: null,
            success: false,
            metadata: {
                email: auditEmail,
                reason: "internal_error",
            },
        });
        if (createdClerkUserId) {
            try {
                await deleteClerkUser(createdClerkUserId);
            } catch {
                // ロールバック失敗はレスポンスを壊さないよう握りつぶし、
                // 運用ログで確認できるよう上位のエラーだけ返します。
            }
        }

        return NextResponse.json(
            {
                message: extractClerkErrorMessage(
                    error,
                    "新規登録中にサーバーエラーが発生しました。",
                ),
            },
            { status: 500 },
        );
    }
}
