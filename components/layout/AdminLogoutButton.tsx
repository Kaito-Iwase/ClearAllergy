"use client";

// このボタンは管理画面共通のログアウト処理です。
// 現在は Clerk セッションのみを閉じます。
// Client Component なのは、クリックイベントと Clerk の client API を使うためです。

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";

export default function AdminLogoutButton() {
    const clerk = useClerk();
    const [loading, setLoading] = useState(false);

    async function handleLogout() {
        // 二重クリックによる二重送信を防ぎます。
        if (loading) {
            return;
        }

        setLoading(true);

        try {
            await clerk.signOut({
                redirectUrl: "/",
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
