// このページは管理画面ログインの入口です。
// 未ログインなら Client Component のログインフォームを表示し、
// すでにログイン済みなら登録状態を見て管理画面へ戻します。

import { redirect } from "next/navigation";
import AdminLoginPageClient from "@/components/admin/auth/AdminLoginPageClient";
import { shouldShowAdminGoogleLogin } from "@/lib/auth/clerkAdmin";
import { getCurrentClerkIdentity } from "@/lib/auth/getCurrentAppUser";
import { getCurrentAdminContext } from "@/lib/admin-auth";
import { isDatabaseUnavailableError } from "@/lib/db-errors";

export default async function AdminLoginPage({
    searchParams,
}: {
    searchParams?:
        | Promise<{ database?: string }>
        | { database?: string };
}) {
    // Server Component 側で先にログイン状態を確認しておくと、
    // すでにログイン済みの人へ不要なフォームを見せずに済みます。
    const resolvedSearchParams = (await searchParams) ?? {};
    const showGoogleAuthButton = shouldShowAdminGoogleLogin();
    const databaseUnavailableFromQuery =
        resolvedSearchParams.database === "unavailable";
    let context = null;

    if (!databaseUnavailableFromQuery) {
        try {
            context = await getCurrentAdminContext();
        } catch (error) {
            if (isDatabaseUnavailableError(error)) {
                return (
                    <AdminLoginPageClient
                        showGoogleAuthButton={false}
                        databaseUnavailable
                    />
                );
            }

            throw error;
        }
    } else {
        return (
            <AdminLoginPageClient
                showGoogleAuthButton={false}
                databaseUnavailable
            />
        );
    }

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
