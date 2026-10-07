import { createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { consumeRateLimit } from "@/lib/utils/rate-limit";
import { getIpFromHeaders } from "@/lib/utils/request-ip";

const WINDOW_MS = 10 * 60 * 1000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

// Apply before parsing, authentication lookup, or audit DB writes. Invalid and
// rejected notifications consume the same budget as successful notifications.
export function enforceAuthAuditRateLimit(req: Request) {
    const result = consumeRateLimit({
        key: `auth-audit:ip:${digest(getIpFromHeaders(req.headers))}`,
        limit: 30,
        windowMs: WINDOW_MS,
    });
    return result.allowed ? null : NextResponse.json(
        { message: "リクエストが多すぎます。しばらく待ってから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
}

// entrypoint identifies the notification route, not a proven login strategy or
// the time that authentication originally happened.
export async function recordVerifiedAuthSession(req: Request, entrypoint: "password" | "google") {
    const { userId, sessionId } = await auth();
    if (!userId || !sessionId) {
        return NextResponse.json({ message: "認証済みセッションを確認できません。" }, { status: 401 });
    }

    // This is bounded best-effort deduplication per process, not a durable
    // once-per-session guarantee. Session tokens/IDs never enter the audit log.
    const notification = consumeRateLimit({
        key: `auth-audit:session:${digest(`${userId}:${sessionId}`)}`,
        limit: 1,
        windowMs: WINDOW_MS,
    });
    if (!notification.allowed) return new NextResponse(null, { status: 204 });

    const appUser = await getCurrentAppUser();
    await writeAdminAuditLog({
        req,
        actorUserId: appUser?.id ?? null,
        actorShopId: appUser?.shop?.id ?? null,
        action: "auth_session_verified",
        targetType: "auth",
        targetId: appUser?.id ?? null,
        success: true,
        metadata: {
            source: "server_session",
            entrypoint,
            ...(appUser ? {} : { actorClerkUserId: userId }),
        },
    });
    return new NextResponse(null, { status: 204 });
}
