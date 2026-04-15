// このページは管理画面ログインの入口です。
// 未ログインなら Client Component のログインフォームを表示し、
// すでにログイン済みなら登録状態を見て管理画面へ戻します。

import { redirect } from "next/navigation";
import AdminLoginPageClient from "@/components/admin/auth/AdminLoginPageClient";
import { shouldShowAdminGoogleLogin } from "@/lib/auth/clerkAdmin";
import { getCurrentClerkIdentity } from "@/lib/auth/getCurrentAppUser";
import { getCurrentAdminContext } from "@/lib/admin-auth";

export default async function AdminLoginPage() {
    // Server Component 側で先にログイン状態を確認しておくと、
    // すでにログイン済みの人へ不要なフォームを見せずに済みます。
    const context = await getCurrentAdminContext();
    const showGoogleAuthButton = shouldShowAdminGoogleLogin();

    if (!context) {
        const clerkIdentity = await getCurrentClerkIdentity();

        if (clerkIdentity) {
            return (
                <AdminLoginPageClient
                    showGoogleAuthButton={showGoogleAuthButton}
                    pendingSetupEmail={clerkIdentity.email}
                />
            );
        }

        return (
            <AdminLoginPageClient showGoogleAuthButton={showGoogleAuthButton} />
        );
    }

    if (!context.shop) {
        return (
            <AdminLoginPageClient
                showGoogleAuthButton={showGoogleAuthButton}
                pendingSetupEmail={context.appUser.email}
            />
        );
    }

    redirect("/admin/shop");
}
