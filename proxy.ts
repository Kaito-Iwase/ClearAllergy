import {
    clerkMiddleware,
} from "@clerk/nextjs/server";

// 段階移行中は Clerk の認証状態を全体で読めるようにするだけに留める。
// 実際のアクセス制御は lib/admin-auth.ts 側で
// 「Clerk or 旧 NextAuth session」の両対応で行う。
export default clerkMiddleware();

export const config = {
    matcher: [
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        "/(api|trpc)(.*)",
    ],
};
