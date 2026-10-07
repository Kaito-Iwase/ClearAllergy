import { Hono } from "hono";
import { NextResponse } from "next/server";
import {
    adminLoginAuditSchema,
    adminLoginPrecheckSchema,
} from "@/lib/validators/admin-auth";
import {
    consumeIpAndIdentifierRateLimit,
    enforceSameOriginAdminMutation,
} from "@/lib/auth/admin-api-security";
import { writeAdminAuditLog } from "@/lib/audit-log";
import {
    isDatabaseUnavailableError,
    logDatabaseUnavailableError,
} from "@/lib/db/errors";
import { getIpFromHeaders } from "@/lib/utils/request-ip";
import { enforceAuthAuditRateLimit, recordVerifiedAuthSession } from "@/lib/auth/auth-audit";
import { handleUnhandledApiError, logOperationalError } from "@/lib/observability";

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

const app = new Hono();
app.onError(handleUnhandledApiError);

app.post("/api/admin/auth/login", async (c) => {
    const req = c.req.raw;
    const originError = enforceSameOriginAdminMutation(req);
    if (originError) {
        return originError;
    }
    const requestLimit = enforceAuthAuditRateLimit(req);
    if (requestLimit) return requestLimit;

    try {
        const body = (await req
            .json()
            .catch(() => null)) as LoginAuditRequest | null;
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
                return NextResponse.json(
                    {
                        message:
                            parsed.error.issues[0]?.message ??
                            "入力内容を確認してください。",
                    },
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
        if (body.mode !== "result" || !parsed.success) {
            return NextResponse.json(
                { message: "不正なリクエストです。" },
                { status: 400 },
            );
        }

        if (parsed.data.success) return await recordVerifiedAuthSession(req, "password");

        await writeAdminAuditLog({
            req,
            actorUserId: null,
            actorShopId: null,
            action: "auth_login_failure",
            targetType: "auth",
            targetId: null,
            success: false,
            metadata: {
                source: "client_report",
                entrypoint: "password",
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
                },
                { status: 503 },
            );
        }

        logOperationalError(error, { operation: "auth.login.audit" });
        return NextResponse.json(
            { message: "ログイン監査の記録に失敗しました。" },
            { status: 500 },
        );
    }
});

export const POST = (req: Request) => app.fetch(req);
