// このページは /admin の入口です。
// ログイン状態と店舗作成状況を見て、適切な管理画面へリダイレクトします。
// Server Component なので、認証確認をサーバー側で先に行えます。

import { redirect } from "next/navigation";
import { getCurrentClerkIdentity } from "@/lib/auth/getCurrentAppUser";
import { getCurrentAdminContext } from "@/lib/admin-auth";

// /admin の入口。
// Clerk ログイン済みなら DB の状態を見て、
// まだ店舗未作成なら /admin/register、
// 既に店舗があるなら、最初は店舗情報ページへ送ります。
export default async function AdminIndexPage() {
    // 管理者の認証状態と店舗情報をまとめて取得します。
    const context = await getCurrentAdminContext();

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
