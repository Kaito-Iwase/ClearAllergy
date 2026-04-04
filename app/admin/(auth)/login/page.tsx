// このページは管理画面ログインの入口です。
// 未ログインなら Client Component のログインフォームを表示し、
// すでにログイン済みなら登録状態を見て管理画面へ戻します。

import { redirect } from "next/navigation";
import AdminLoginPageClient from "@/components/admin/auth/AdminLoginPageClient";
import { getCurrentAdminContext } from "@/lib/admin-auth";

export default async function AdminLoginPage() {
    // Server Component 側で先にログイン状態を確認しておくと、
    // すでにログイン済みの人へ不要なフォームを見せずに済みます。
    const context = await getCurrentAdminContext();

    if (!context) {
        return <AdminLoginPageClient />;
    }

    if (!context.shop) {
        // Clerk でログイン済みだが店舗未作成の人は、
        // いきなり register へ飛ばすのではなく、理由を説明した上で次の行き先を選べるようにします。
        if (context.authProvider === "clerk") {
            return (
                <AdminLoginPageClient
                    pendingSetupEmail={context.appUser.email}
                />
            );
        }

        redirect("/admin/register");
    }

    redirect("/admin/shop");
}
