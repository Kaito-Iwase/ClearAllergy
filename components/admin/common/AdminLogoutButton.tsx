"use client";

// このボタンは管理画面共通のログアウト処理です。
// Clerk ログイン中か、旧 NextAuth ログイン中かを判定して、適切な signOut を呼び分けます。
// Client Component なのは、クリックイベントと認証ライブラリの client API を使うためです。

import { useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { signOut as nextAuthSignOut } from "next-auth/react";

export default function AdminLogoutButton() {
    // userId があれば Clerk ログイン中と判断できます。
    const { userId } = useAuth();
    const clerk = useClerk();
    const [loading, setLoading] = useState(false);

    async function handleLogout() {
        // 二重クリックによる二重送信を防ぎます。
        if (loading) {
            return;
        }

        setLoading(true);

        try {
            // Clerk 側でログインしている時は Clerk の signOut を使います。
            if (userId) {
                await clerk.signOut({
                    redirectUrl: "/",
                });
                return;
            }

            // それ以外は旧認証のセッションを閉じます。
            await nextAuthSignOut({
                callbackUrl: "/",
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
            <span className="material-symbols-outlined text-lg">logout</span>
            {loading ? "ログアウト中..." : "ログアウト"}
        </button>
    );
}
