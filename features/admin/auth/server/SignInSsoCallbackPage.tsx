import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import AdminGoogleSsoAuditBeacon from "@/features/admin/auth/components/AdminGoogleSsoAuditBeacon";

// Clerk の custom OAuth flow 用 callback 受け口。
// 実際のログイン UI は使わず、Google ログイン完了後の遷移処理だけ Clerk に任せる。
export default function SignInSsoCallbackPage() {
    return (
        <>
            <AdminGoogleSsoAuditBeacon />
            <AuthenticateWithRedirectCallback
                signInUrl="/admin/login"
                signUpUrl="/admin/register"
                signInFallbackRedirectUrl="/admin"
                signUpFallbackRedirectUrl="/admin"
            />
            <div id="clerk-captcha" />
        </>
    );
}
