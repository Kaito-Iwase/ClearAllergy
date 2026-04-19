// このページは管理画面ログインの入口です。
// 未ログインなら Client Component のログインフォームを表示し、
// すでにログイン済みなら登録状態を見て管理画面へ戻します。

import { redirect } from "next/navigation";
import AdminLoginPageClient from "@/components/admin/auth/AdminLoginPageClient";
import { shouldShowAdminGoogleLogin } from "@/lib/auth/clerkAdmin";
import { getCurrentClerkIdentity } from "@/lib/auth/getCurrentAppUser";
import { getCurrentAdminContext } from "@/lib/admin-auth";
import { getCurrentPlatformAdmin } from "@/lib/admin-platform-auth";
import {
    isDatabaseUnavailableError,
    logDatabaseUnavailableError,
} from "@/lib/db-errors";

const DATABASE_UNAVAILABLE_REASON =
    "Clerk のログイン画面自体は表示できますが、ログイン状態判定と user 取得に必要なデータベース読取が失敗しています。Clerk 警告が出ていても、この画面では DB 接続失敗が主因です。";

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
        const platformAdmin = await getCurrentPlatformAdmin();
        if (platformAdmin) {
            redirect("/admin/invitations");
        }

        try {
            context = await getCurrentAdminContext();
        } catch (error) {
            if (isDatabaseUnavailableError(error)) {
                logDatabaseUnavailableError(
                    {
                        scope: "page:admin-login",
                        operation: "getCurrentAdminContext",
                        visibility: "admin",
                    },
                    error,
                );

                return (
                    <AdminLoginPageClient
                        showGoogleAuthButton={false}
                        databaseUnavailable
                        databaseUnavailableReason={DATABASE_UNAVAILABLE_REASON}
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
                databaseUnavailableReason={DATABASE_UNAVAILABLE_REASON}
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
