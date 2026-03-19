"use client";

import { signOut } from "next-auth/react";

export default function AdminLogoutButton() {
    return (
        <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
            <span className="material-symbols-outlined text-lg">logout</span>
            ログアウト
        </button>
    );
}
