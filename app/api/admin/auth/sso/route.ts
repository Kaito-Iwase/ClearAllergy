import { NextResponse } from "next/server";
import { adminGoogleSsoAuditSchema } from "@/lib/validators/admin-auth";
import {
    consumeIpAndIdentifierRateLimit,
    enforceSameOriginAdminMutation,
} from "@/lib/admin-api-security";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { getIpFromHeaders } from "@/lib/request-ip";

export async function POST(req: Request) {
    const originError = enforceSameOriginAdminMutation(req);
    if (originError) {
        return originError;
    }

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
                identifier: "google",
                ipLimit: 10,
                identifierLimit: 10,
                windowMs: 10 * 60 * 1000,
            });

            if (!limit.allowed) {
                await writeAdminAuditLog({
                    req,
                    actorUserId: null,
                    actorShopId: null,
                    action: "auth_google_login_failure",
                    targetType: "auth",
                    targetId: null,
                    success: false,
                    metadata: {
                        provider: "google",
                        reason: "rate_limited",
                    },
                });

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

        const action =
            parsed.data.stage === "start"
                ? "auth_google_login_start"
                : parsed.data.stage === "success"
                  ? "auth_google_login_success"
                  : "auth_google_login_failure";

        await writeAdminAuditLog({
            req,
            actorUserId: null,
            actorShopId: null,
            action,
            targetType: "auth",
            targetId: null,
            success: parsed.data.stage !== "failure",
            metadata: {
                provider: "google",
                reason: parsed.data.reason ?? null,
            },
        });

        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json(
            { message: "Google ログイン監査の記録に失敗しました。" },
            { status: 500 },
        );
    }
}
