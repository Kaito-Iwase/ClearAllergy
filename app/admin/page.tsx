import { redirect } from "next/navigation";
import { getCurrentAdminContext } from "@/lib/admin-auth";

// /admin の入口。
// Clerk ログイン済みなら DB の状態を見て、
// まだ店舗未作成なら /admin/register、
// 既に店舗があるなら /admin/menus へ送る。
export default async function AdminIndexPage() {
    const context = await getCurrentAdminContext();

    if (!context) {
        redirect("/admin/login");
    }

    if (!context.shop) {
        redirect("/admin/register");
    }

    redirect("/admin/menus");
}
