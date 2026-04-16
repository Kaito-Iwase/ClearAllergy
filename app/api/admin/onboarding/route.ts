// このファイルは Clerk ログイン後の初回店舗作成 API です。
// Google ログインなどで appUser はあるが Shop がまだ無い時に使われます。
// 1ユーザー1店舗の前提を守るため、既存 Shop がある場合は新規作成しません。

import { NextResponse } from "next/server";
import {
    getCurrentAppUser,
    getCurrentClerkIdentity,
    provisionCurrentAppUserFromClerk,
} from "@/lib/auth/getCurrentAppUser";
import { isClerkAdminAuthEnabled } from "@/lib/auth/clerkAdmin";
import { adminOnboardingSchema } from "@/lib/admin-auth-schemas";
import {
    consumeIpAndIdentifierRateLimit,
    enforceSameOriginAdminMutation,
} from "@/lib/admin-api-security";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { isDatabaseUnavailableError } from "@/lib/db-errors";
import { getAdminRegistrationGuard } from "@/lib/admin-registration";
import { getIpFromHeaders } from "@/lib/request-ip";

type OnboardingBody = {
    shopName?: unknown;
    inviteToken?: unknown;
};

export async function POST(req: Request) {
    try {
        const originError = enforceSameOriginAdminMutation(req);
        if (originError) {
            return originError;
        }

        // 初回セットアップでは店舗名だけ受け取り、最小構成で Shop を作ります。
        const body = (await req.json().catch(() => null)) as OnboardingBody | null;
        const parsed = adminOnboardingSchema.safeParse({
            shopName: body?.shopName,
            inviteToken:
                typeof body?.inviteToken === "string" ? body.inviteToken : null,
        });

        if (!parsed.success) {
            return NextResponse.json(
                { message: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" },
                { status: 400 },
            );
        }

        const clerkIdentity = await getCurrentClerkIdentity();
        const rateLimit = consumeIpAndIdentifierRateLimit({
            scope: "admin-onboarding",
            ip: getIpFromHeaders(req.headers),
            identifier: clerkIdentity?.email ?? "anonymous",
            ipLimit: 5,
            identifierLimit: 3,
            windowMs: 15 * 60 * 1000,
        });

        if (!rateLimit.allowed) {
            return NextResponse.json(
                {
                    message:
                        "初回セットアップの試行が多すぎます。しばらく待ってから再度お試しください。",
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimit.retryAfterSeconds),
                    },
                },
            );
        }

        const registrationGuard = getAdminRegistrationGuard({
            inviteToken: parsed.data.inviteToken,
        });

        if (!registrationGuard.allowed) {
            await writeAdminAuditLog({
                req,
                actorUserId: null,
                actorShopId: null,
                action: "auth_onboarding_failure",
                targetType: "auth",
                targetId: null,
                success: false,
                metadata: {
                    email: clerkIdentity?.email ?? null,
                    reason: "registration_guard_denied",
                },
            });
            return NextResponse.json(
                { message: registrationGuard.message },
                { status: 403 },
            );
        }

        const shopName = parsed.data.shopName;

        // まずは read-only で既存の appUser を確認します。
        let appUser = await getCurrentAppUser();

        // 既に店舗があるなら重複作成せず、その情報を返します。
        if (appUser?.shop) {
            await writeAdminAuditLog({
                req,
                actorUserId: appUser.id,
                actorShopId: appUser.shop.id,
                action: "auth_onboarding_failure",
                targetType: "auth",
                targetId: appUser.id,
                success: false,
                metadata: {
                    email: appUser.email,
                    reason: "shop_already_exists",
                },
            });
            return NextResponse.json(
                {
                    message: "このアカウントにはすでに店舗が作成されています。",
                    shop: {
                        id: appUser.shop.id,
                        name: appUser.shop.name,
                    },
                },
                { status: 409 },
            );
        }

        // Clerk 管理導線を明示的に有効化している時だけ、初回 provision を許可します。
        if (!appUser) {
            if (!isClerkAdminAuthEnabled()) {
                await writeAdminAuditLog({
                    req,
                    actorUserId: null,
                    actorShopId: null,
                    action: "auth_onboarding_failure",
                    targetType: "auth",
                    targetId: null,
                    success: false,
                    metadata: {
                        email: clerkIdentity?.email ?? null,
                        reason: "clerk_admin_auth_disabled",
                    },
                });
                return NextResponse.json(
                    {
                        message:
                            "現在、Google / Clerk 経由の管理画面セットアップは無効化されています。",
                    },
                    { status: 403 },
                );
            }

            appUser = await provisionCurrentAppUserFromClerk();
        }

        if (!appUser) {
            await writeAdminAuditLog({
                req,
                actorUserId: null,
                actorShopId: null,
                action: "auth_onboarding_failure",
                targetType: "auth",
                targetId: null,
                success: false,
                metadata: {
                    email: clerkIdentity?.email ?? null,
                    reason: "unauthorized",
                },
            });
            return NextResponse.json(
                { message: "認証が必要です。" },
                { status: 401 },
            );
        }

        // userId に appUser.id を使い、今ログイン中のアプリユーザーへ店舗をひも付けます。
        const shop = await prisma.shop.create({
            data: {
                userId: appUser.id,
                name: shopName,
            },
            select: {
                id: true,
                name: true,
            },
        });

        await writeAdminAuditLog({
            req,
            actorUserId: appUser.id,
            actorShopId: shop.id,
            action: "auth_onboarding_success",
            targetType: "auth",
            targetId: appUser.id,
            success: true,
            metadata: {
                email: appUser.email,
                shopId: shop.id,
            },
        });

        return NextResponse.json(
            {
                message: "店舗の初期設定が完了しました。",
                shop,
            },
            { status: 201 },
        );
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            return NextResponse.json(
                {
                    message:
                        "現在データベースへ接続できないため、店舗の初期設定を完了できません。",
                },
                { status: 503 },
            );
        }

        const clerkIdentity = await getCurrentClerkIdentity().catch(() => null);
        await writeAdminAuditLog({
            req,
            actorUserId: null,
            actorShopId: null,
            action: "auth_onboarding_failure",
            targetType: "auth",
            targetId: null,
            success: false,
            metadata: {
                email: clerkIdentity?.email ?? null,
                reason: "internal_error",
            },
        });
        return NextResponse.json(
            {
                message: "店舗の初期設定中にサーバーエラーが発生しました。",
            },
            { status: 500 },
        );
    }
}
