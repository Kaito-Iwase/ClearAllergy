import {
    clerkMiddleware,
} from "@clerk/nextjs/server";

// Clerk の認証状態は管理画面と Clerk callback だけで読めれば十分です。
// 公開ページを middleware 対象から外し、Clerk handshake / accounts.dev への
// 不要なリダイレクトが初期表示に混ざらないようにします。
// 実際の管理画面アクセス制御は lib/admin-auth.ts 側で
// clerkUserId -> User -> Shop の流れで行います。
export default clerkMiddleware();

export const config = {
    matcher: [
        "/admin/:path*",
        "/api/admin/:path*",
        "/api/invitations/accept",
        "/sign-in/:path*",
        "/sign-up/:path*",
    ],
};
