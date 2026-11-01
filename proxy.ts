import {
    clerkMiddleware,
} from "@clerk/nextjs/server";
import { decodeJwt, hasValidSignature } from "@clerk/backend/jwt";
import { isDevelopmentFromSecretKey } from "@clerk/shared/keys";
import type { NextFetchEvent, NextRequest } from "next/server";
import { callbackDiagnosticHeader, serverCallbackDiagnostic } from "./lib/verification/issue118-callback-diagnostic.mjs";

// Clerk の認証状態は管理画面と Clerk callback だけで読めれば十分です。
// 公開ページを middleware 対象から外し、Clerk handshake / accounts.dev への
// 不要なリダイレクトが初期表示に混ざらないようにします。
// 実際の管理画面アクセス制御は lib/admin-auth.ts 側で
// clerkUserId -> User -> Shop の流れで行います。
const ordinaryMiddleware = clerkMiddleware();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
    if (!request.headers.has(callbackDiagnosticHeader)) return ordinaryMiddleware(request, event);
    return serverCallbackDiagnostic(request, {
        projectId: process.env.VERCEL_PROJECT_ID,
        environment: process.env.VERCEL_ENV,
        branch: process.env.VERCEL_GIT_COMMIT_REF,
        sourceSha: process.env.VERCEL_GIT_COMMIT_SHA,
        deploymentHost: process.env.VERCEL_URL,
    }, {
        getSecretKey: () => process.env.CLERK_SECRET_KEY,
        isDevelopmentFromSecretKey,
        decode: decodeJwt,
        verifySignature: hasValidSignature,
        fetch,
    });
}

export const config = {
    matcher: [
        "/admin/:path*",
        "/api/admin/:path*",
        "/api/invitations/accept",
        "/sign-in/:path*",
        "/sign-up/:path*",
    ],
};
