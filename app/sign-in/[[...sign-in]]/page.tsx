import { redirect } from "next/navigation";

// Clerk の既定サインイン UI は使わず、
// 既存の /admin/login 画面へ寄せる。
export default function SignInPage() {
    redirect("/admin/login");
}
