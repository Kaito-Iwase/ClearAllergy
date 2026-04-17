// このページは /admin の入口です。
// ログイン状態と店舗作成状況を見て、適切な管理画面へリダイレクトします。
// Server Component なので、認証確認をサーバー側で先に行えます。

import { redirect } from "next/navigation";
import AdminLoginPageClient from "@/components/admin/auth/AdminLoginPageClient";
import { getCurrentClerkIdentity } from "@/lib/auth/getCurrentAppUser";
import { getCurrentAdminContext } from "@/lib/admin-auth";
import { isDatabaseUnavailableError } from "@/lib/db-errors";

const DATABASE_UNAVAILABLE_REASON =
    "Clerk セッションの有無ではなく、管理者ユーザーと店舗状態の照会に必要なデータベース接続が失敗しています。";

// /admin の入口。
// Clerk ログイン済みなら DB の状態を見て、
// まだ店舗未作成なら /admin/register、
// 既に店舗があるなら、最初は店舗情報ページへ送ります。
export default async function AdminIndexPage() {
    // 管理者の認証状態と店舗情報をまとめて取得します。
    let context = null;

    try {
        context = await getCurrentAdminContext();
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            return (
                <AdminLoginPageClient
                    databaseUnavailable
                    databaseUnavailableReason={DATABASE_UNAVAILABLE_REASON}
                />
            );
        }

        throw error;
    }

    if (!context) {
        const clerkIdentity = await getCurrentClerkIdentity();

        if (clerkIdentity) {
            redirect("/admin/register");
        }

        redirect("/admin/login");
    }

    if (!context.shop) {
        redirect("/admin/register");
    }

    redirect("/admin/shop");
}
