// 管理画面で Google / Clerk SSO 導線を開くかどうかを判定します。
// 既定値は OFF にして、本番で意図せず管理者導線が開かないようにします。
export function isClerkAdminAuthEnabled() {
    const raw = process.env.ENABLE_CLERK_ADMIN_AUTH?.trim().toLowerCase();

    return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

// ログイン画面の Google ボタンは、管理向け Clerk SSO を明示的に開いた時だけ表示します。
export function shouldShowAdminGoogleLogin() {
    return isClerkAdminAuthEnabled();
}

// 登録画面の Google ボタンは、Clerk SSO が有効で、かつ現在の登録モードで登録可能な時だけ表示します。
export function shouldShowAdminGoogleRegister(args: {
    canRegister: boolean;
}) {
    return isClerkAdminAuthEnabled() && args.canRegister;
}
