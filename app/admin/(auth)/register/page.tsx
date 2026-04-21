// このページは管理者向け新規登録の入口です。
// メール+パスワード登録フォームと、Clerk ログイン後の初回店舗作成画面をここで振り分けます。
// Server Component なので、ログイン状態に応じた分岐を先に行えます。

import { redirect } from "next/navigation";
import AdminRegisterPageClient from "@/components/admin/auth/AdminRegisterPageClient";
import AdminInvitationAcceptPageClient from "@/components/admin/auth/AdminInvitationAcceptPageClient";
import {
    getCurrentAppUser,
    getCurrentClerkIdentity,
} from "@/lib/auth/getCurrentAppUser";
import { shouldShowAdminGoogleRegister } from "@/lib/auth/clerkAdmin";
import { getCurrentAdminContext } from "@/lib/admin-auth";
import { getAdminRegistrationGuard } from "@/lib/admin-registration";
import { isDatabaseUnavailableError } from "@/lib/db-errors";

type RegisterSearchParams = Record<string, string | string[] | undefined>;

function hasClerkInvitationParams(searchParams: RegisterSearchParams) {
    return (
        typeof searchParams.__clerk_ticket === "string" ||
        typeof searchParams.__clerk_invitation_token === "string"
    );
}

function buildSignUpUrl(searchParams: RegisterSearchParams) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(searchParams)) {
        if (typeof value === "string") {
            params.set(key, value);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                params.append(key, item);
            }
        }
    }

    const query = params.toString();
    return query ? `/sign-up?${query}` : "/sign-up";
}

export default async function AdminRegisterPage({
    searchParams,
}: {
    searchParams?: Promise<RegisterSearchParams> | RegisterSearchParams;
}) {
    const resolvedSearchParams = (await searchParams) ?? {};
    const inviteToken =
        typeof resolvedSearchParams.invite === "string"
            ? resolvedSearchParams.invite
            : null;
    const registrationGuard = getAdminRegistrationGuard({ inviteToken });
    const showGoogleAuthButton = shouldShowAdminGoogleRegister({
        canRegister: registrationGuard.allowed,
    });
    let appUser = null;
    let clerkIdentity = null;

    // Clerk ログイン済みでまだ Shop が無い場合だけ、初回セットアップ画面を出します。
    try {
        appUser = await getCurrentAppUser();
        clerkIdentity = await getCurrentClerkIdentity();
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            return (
                <AdminRegisterPageClient
                    showGoogleAuthButton={false}
                    canRegister={registrationGuard.allowed}
                    registrationMode={registrationGuard.mode}
                    lockMessage={registrationGuard.allowed ? null : registrationGuard.message}
                    inviteToken={inviteToken}
                    databaseUnavailable
                />
            );
        }

        throw error;
    }

    if (!clerkIdentity && hasClerkInvitationParams(resolvedSearchParams)) {
        redirect(buildSignUpUrl(resolvedSearchParams));
    }

    // 管理者状態を確認し、店舗がある人は管理画面へ戻します。
    let context = null;

    try {
        context = await getCurrentAdminContext();
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            return (
                <AdminRegisterPageClient
                    showGoogleAuthButton={false}
                    canRegister={registrationGuard.allowed}
                    registrationMode={registrationGuard.mode}
                    lockMessage={registrationGuard.allowed ? null : registrationGuard.message}
                    inviteToken={inviteToken}
                    databaseUnavailable
                />
            );
        }

        throw error;
    }

    if (context?.shop) {
        redirect("/admin/shop");
    }

    if (appUser && !context?.shop) {
        return <AdminInvitationAcceptPageClient email={appUser.email} />;
    }

    if (clerkIdentity && !appUser) {
        return <AdminInvitationAcceptPageClient email={clerkIdentity.email} />;
    }

    return (
        <AdminRegisterPageClient
            showGoogleAuthButton={showGoogleAuthButton}
            canRegister={registrationGuard.allowed}
            registrationMode={registrationGuard.mode}
            lockMessage={registrationGuard.allowed ? null : registrationGuard.message}
            inviteToken={inviteToken}
        />
    );
}
