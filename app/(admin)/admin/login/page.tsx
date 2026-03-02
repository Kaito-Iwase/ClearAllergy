// app/(admin)/admin/login/page.tsx
// 管理ログインページ（Client Component）

"use client";

import React from "react";
import { signIn } from "next-auth/react";

export default function AdminLoginPage() {
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        // redirect: false にすると結果を受け取れる
        const res = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        setLoading(false);

        if (!res || res.error) {
            setError("ログインに失敗しました（メール/パスワードを確認）");
            return;
        }

        // 成功したら管理一覧へ
        window.location.href = "/admin/menus";
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-md px-4 py-10">
                <h1 className="text-2xl font-bold text-gray-900">
                    管理ログイン
                </h1>

                <form
                    onSubmit={onSubmit}
                    className="mt-6 space-y-4 rounded-2xl bg-white p-6 shadow-sm"
                >
                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="text-sm font-medium text-gray-700">
                            メール
                        </label>
                        <input
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            type="email"
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">
                            パスワード
                        </label>
                        <input
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            type="password"
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        className="w-full rounded-xl bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
                        disabled={loading}
                        type="submit"
                    >
                        {loading ? "ログイン中..." : "ログイン"}
                    </button>
                </form>
            </div>
        </div>
    );
}
