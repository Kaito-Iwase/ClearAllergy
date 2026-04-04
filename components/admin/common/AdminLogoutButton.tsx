"use client";

import { useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { signOut as nextAuthSignOut } from "next-auth/react";

export default function AdminLogoutButton() {
    const { userId } = useAuth();
    const clerk = useClerk();
    const [loading, setLoading] = useState(false);

    async function handleLogout() {
        if (loading) {
            return;
        }

        setLoading(true);

        try {
            if (userId) {
                await clerk.signOut({
                    redirectUrl: "/",
                });
                return;
            }

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
