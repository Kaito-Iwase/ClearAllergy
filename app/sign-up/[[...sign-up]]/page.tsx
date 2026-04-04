import { redirect } from "next/navigation";

// Clerk の既定サインアップ UI は使わず、
// 既存の /admin/register 画面へ寄せる。
export default function SignUpPage() {
    redirect("/admin/register");
}
