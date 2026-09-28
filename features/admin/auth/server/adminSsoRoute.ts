import { Hono } from "hono";
import { NextResponse } from "next/server";
import { adminGoogleSsoAuditSchema } from "@/lib/validators/admin-auth";
import {
    consumeIpAndIdentifierRateLimit,
    enforceSameOriginAdminMutation,
} from "@/lib/auth/admin-api-security";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { getIpFromHeaders } from "@/lib/utils/request-ip";
import { enforceAuthAuditRateLimit, recordVerifiedAuthSession } from "@/lib/auth/auth-audit";
import { handleUnhandledApiError, logOperationalError } from "@/lib/observability";

const app = new Hono();
app.onError(handleUnhandledApiError);

app.post("/api/admin/auth/sso", async (c) => {
    const req = c.req.raw;
    const originError = enforceSameOriginAdminMutation(req);
    if (originError) {
        return originError;
    }
    const requestLimit = enforceAuthAuditRateLimit(req);
    if (requestLimit) return requestLimit;

    try {
        const body = await req.json().catch(() => null);
        const parsed = adminGoogleSsoAuditSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { message: "不正なリクエストです。" },
                { status: 400 },
            );
        }

        if (parsed.data.stage === "start") {
            const limit = consumeIpAndIdentifierRateLimit({
                scope: "admin-google-sso",
                ip: getIpFromHeaders(req.headers),
                identifier: getIpFromHeaders(req.headers),
                ipLimit: 10,
                identifierLimit: 10,
                windowMs: 10 * 60 * 1000,
            });

            if (!limit.allowed) {
                return NextResponse.json(
                    {
                        message:
                            "Google ログインの試行が多すぎます。しばらく待ってから再度お試しください。",
                    },
                    {
                        status: 429,
                        headers: {
                            "Retry-After": String(limit.retryAfterSeconds),
                        },
                    },
                );
            }
        }

        if (parsed.data.stage === "success") return await recordVerifiedAuthSession(req, "google");

        const action =
            parsed.data.stage === "start"
                ? "auth_google_login_start"
                : "auth_google_login_failure";

        await writeAdminAuditLog({
            req,
            actorUserId: null,
            actorShopId: null,
            action,
            targetType: "auth",
            targetId: null,
            success: false,
            metadata: {
                source: "client_report",
                entrypoint: "google",
            },
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        logOperationalError(error, { operation: "auth.sso.audit" });
        return NextResponse.json(
            { message: "Google ログイン監査の記録に失敗しました。" },
            { status: 500 },
        );
    }
});

export const POST = (req: Request) => app.fetch(req);
