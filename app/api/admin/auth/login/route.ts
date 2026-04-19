import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";
import {
    adminLoginAuditSchema,
    adminLoginPrecheckSchema,
} from "@/lib/validators/admin-auth";
import {
    consumeIpAndIdentifierRateLimit,
    enforceSameOriginAdminMutation,
} from "@/lib/admin-api-security";
import { writeAdminAuditLog } from "@/lib/audit-log";
import {
    getDatabaseConnectionDiagnostics,
    isDatabaseUnavailableError,
    logDatabaseUnavailableError,
} from "@/lib/db-errors";
import { getIpFromHeaders } from "@/lib/request-ip";

type LoginAuditRequest =
    | {
          mode: "precheck";
          email: string;
          password: string;
      }
    | {
          mode: "result";
          email: string;
          success: boolean;
          reason?: string;
      };

export async function POST(req: Request) {
    const originError = enforceSameOriginAdminMutation(req);
    if (originError) {
        return originError;
    }

    try {
        const body = (await req.json().catch(() => null)) as LoginAuditRequest | null;
        if (!body || typeof body !== "object" || !("mode" in body)) {
            return NextResponse.json(
                { message: "不正なリクエストです。" },
                { status: 400 },
            );
        }

        const ip = getIpFromHeaders(req.headers);

        if (body.mode === "precheck") {
            const parsed = adminLoginPrecheckSchema.safeParse(body);

            if (!parsed.success) {
                const emailForAudit =
                    typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
                await writeAdminAuditLog({
                    req,
                    actorUserId: null,
                    actorShopId: null,
                    action: "auth_login_failure",
                    targetType: "auth",
                    targetId: null,
                    success: false,
                    metadata: {
                        phase: "precheck",
                        email: emailForAudit,
                        reason: "invalid_input",
                    },
                });

                return NextResponse.json(
                    { message: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" },
                    { status: 400 },
                );
            }

            const limit = consumeIpAndIdentifierRateLimit({
                scope: "admin-login",
                ip,
                identifier: parsed.data.email,
                ipLimit: 10,
                identifierLimit: 5,
                windowMs: 10 * 60 * 1000,
            });

            if (!limit.allowed) {
                await writeAdminAuditLog({
                    req,
                    actorUserId: null,
                    actorShopId: null,
                    action: "auth_login_failure",
                    targetType: "auth",
                    targetId: null,
                    success: false,
                    metadata: {
                        phase: "precheck",
                        email: parsed.data.email,
                        reason: "rate_limited",
                    },
                });

                return NextResponse.json(
                    {
                        message:
                            "ログイン試行が多すぎます。しばらく待ってから再度お試しください。",
                    },
                    {
                        status: 429,
                        headers: {
                            "Retry-After": String(limit.retryAfterSeconds),
                        },
                    },
                );
            }

            return new NextResponse(null, { status: 204 });
        }

        const parsed = adminLoginAuditSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { message: "不正なリクエストです。" },
                { status: 400 },
            );
        }

        const appUser = parsed.data.success ? await getCurrentAppUser() : null;

        await writeAdminAuditLog({
            req,
            actorUserId: appUser?.id ?? null,
            actorShopId: appUser?.shop?.id ?? null,
            action: parsed.data.success
                ? "auth_login_success"
                : "auth_login_failure",
            targetType: "auth",
            targetId: appUser?.id ?? null,
            success: parsed.data.success,
            metadata: {
                email: parsed.data.email,
                reason: parsed.data.reason ?? null,
            },
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            logDatabaseUnavailableError(
                {
                    scope: "api:admin-auth-login",
                    operation: "POST",
                    visibility: "admin",
                },
                error,
            );

            return NextResponse.json(
                {
                    error: "database_unavailable",
                    message:
                        "現在データベースへ接続できないため、ログイン前チェックまたは監査記録を完了できません。",
                    diagnosis: getDatabaseConnectionDiagnostics().diagnosis,
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            { message: "ログイン監査の記録に失敗しました。" },
            { status: 500 },
        );
    }
}
