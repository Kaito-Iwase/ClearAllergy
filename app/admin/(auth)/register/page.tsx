// このページは管理者向け新規登録の入口です。
// 旧認証の登録フォームと、Clerk ログイン後の初回店舗作成画面をここで振り分けます。
// Server Component なので、ログイン方式に応じた分岐を先に行えます。

import { redirect } from "next/navigation";
import AdminRegisterPageClient from "@/components/admin/auth/AdminRegisterPageClient";
import AdminOnboardingPageClient from "@/components/admin/auth/AdminOnboardingPageClient";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";
import { getCurrentAdminContext } from "@/lib/admin-auth";
import { getAdminRegistrationGuard } from "@/lib/admin-registration";

export default async function AdminRegisterPage({
    searchParams,
}: {
    searchParams?: Promise<{ invite?: string }> | { invite?: string };
}) {
    const resolvedSearchParams = (await searchParams) ?? {};
    const inviteToken =
        typeof resolvedSearchParams.invite === "string"
            ? resolvedSearchParams.invite
            : null;
    const registrationGuard = getAdminRegistrationGuard({ inviteToken });

    // Clerk ログイン済みでまだ Shop が無い場合だけ、初回セットアップ画面を出します。
    const appUser = await getCurrentAppUser();

    if (appUser && !appUser.shop) {
        return (
            <AdminOnboardingPageClient
                email={appUser.email}
                canRegister={registrationGuard.allowed}
                lockMessage={registrationGuard.allowed ? null : registrationGuard.message}
                inviteToken={inviteToken}
            />
        );
    }

    // 旧認証も含めた管理者状態を確認し、店舗がある人は管理画面へ戻します。
    const context = await getCurrentAdminContext();

    if (context?.shop) {
        redirect("/admin/shop");
    }

    return (
        <AdminRegisterPageClient
            canRegister={registrationGuard.allowed}
            registrationMode={registrationGuard.mode}
            lockMessage={registrationGuard.allowed ? null : registrationGuard.message}
            inviteToken={inviteToken}
        />
    );
}
