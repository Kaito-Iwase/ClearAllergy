import {
    clerkMiddleware,
} from "@clerk/nextjs/server";

// Clerk の認証状態を全体で読めるようにします。
// 実際の管理画面アクセス制御は lib/admin-auth.ts 側で
// clerkUserId -> User -> Shop の流れで行います。
export default clerkMiddleware();

export const config = {
    matcher: [
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        "/(api|trpc)(.*)",
    ],
};
