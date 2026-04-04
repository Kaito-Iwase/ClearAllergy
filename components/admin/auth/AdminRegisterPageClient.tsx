"use client";

// このコンポーネントは旧認証向けの新規登録フォームです。
// app/admin/(auth)/register/page.tsx から呼ばれる Client Component で、
// 登録 API 呼び出しから自動ログインまでを 1 画面で行います。

import React, { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import AdminGoogleAuthButton from "@/components/admin/auth/AdminGoogleAuthButton";
import { normalizeEmail } from "@/lib/email";

export default function AdminRegisterPageClient() {
    // state（画面の状態）として、入力値と UI 表示状態を保持します。
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    // 2) 入力値
    const [shopName, setShopName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");

    // 3) 画面状態
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // フォーム送信時に旧認証の登録 API を呼び、その後で自動ログインします。
    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        // フォーム既定の再読み込みを止めて、エラー表示を自前で制御します。
        e.preventDefault();

        setError(null);

        // API を呼ぶ前に、画面側で分かりやすい入力エラーを先に出します。
        if (!shopName.trim()) {
            setError("店舗名を入力してください。");
            return;
        }

        if (!email.trim()) {
            setError("メールアドレスを入力してください。");
            return;
        }

        if (password.length < 8) {
            setError("パスワードは8文字以上で入力してください。");
            return;
        }

        if (password !== passwordConfirm) {
            setError("確認用パスワードが一致しません。");
            return;
        }

        setLoading(true);

        try {
            // email の揺れを減らすため、送信前に正規化します。
            const normalizedEmail = normalizeEmail(email);
            setEmail(normalizedEmail);

            // 登録そのものは API に任せ、DB 更新ロジックはサーバー側へ寄せます。
            const response = await fetch("/api/admin/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    shopName,
                    email: normalizedEmail,
                    password,
                }),
            });

            const data = (await response.json()) as {
                message?: string;
            };

            // 7) API失敗時
            if (!response.ok) {
                setError(data.message ?? "新規登録に失敗しました。");
                return;
            }

            // 登録直後に再入力させないため、そのまま自動ログインします。
            const signInResult = await signIn("credentials", {
                email: normalizedEmail,
                password,
                redirect: false,
            });

            if (!signInResult) {
                setError(
                    "登録は完了しましたが、自動ログイン結果を取得できませんでした。ログイン画面から再度お試しください。",
                );
                return;
            }

            if (signInResult.error) {
                setError(
                    "登録は完了しましたが、自動ログインに失敗しました。ログイン画面から再度お試しください。",
                );
                return;
            }

            // 9) 成功したら管理画面へ
            window.location.href = "/admin/shop";
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(`登録中にエラーが発生しました: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-background-light dark:bg-background-dark text-text-main min-h-screen flex flex-col font-display antialiased selection:bg-primary/30">
            {/* Header */}
            <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-[#e5e7eb] dark:border-white/10 bg-surface-light dark:bg-surface-dark px-6 lg:px-10 py-4 sticky top-0 z-50">
                <Link
                    href="/"
                    className="flex items-center gap-3 text-text-main dark:text-white"
                >
                    <div className="size-8 text-primary">
                        <span className="material-symbols-outlined text-3xl">
                            local_florist
                        </span>
                    </div>
                    <h2 className="text-text-main dark:text-white text-xl font-bold leading-tight tracking-[-0.015em]">
                        ClearAllergy
                    </h2>
                </Link>

                <div className="flex items-center gap-4">
                    <span className="hidden sm:block text-sm font-medium text-text-sub dark:text-gray-400">
                        すでにアカウントをお持ちですか？
                    </span>

                    <Link
                        href="/admin/login"
                        className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-5 bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/90 transition-colors text-sm font-bold leading-normal tracking-[0.015em]"
                    >
                        <span className="truncate">ログイン</span>
                    </Link>
                </div>
            </header>

            {/* Main */}
            <main className="flex-1 flex items-center justify-center p-4 py-12 lg:py-20">
                <div className="w-full max-w-[520px] bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-[#e5e7eb] dark:border-white/5 overflow-hidden">
                    <div className="p-8 pb-6">
                        <div className="flex flex-col gap-2 mb-8 text-center">
                            <h1 className="text-text-main dark:text-white text-2xl lg:text-3xl font-black leading-tight tracking-[-0.033em]">
                                店舗アカウント新規登録
                            </h1>
                            <p className="text-text-sub dark:text-gray-400 text-sm font-normal leading-normal">
                                店舗名・メールアドレス・パスワードを入力して、管理画面を使い始めてください。
                            </p>
                        </div>

                        <div className="mb-5">
                            {/* Google 登録は Clerk を使うが、画面自体は既存 UI を維持します。 */}
                            <AdminGoogleAuthButton
                                label="Google で新規登録"
                                onError={(message) =>
                                    setError(message || null)
                                }
                            />
                            <p className="mt-2 text-center text-xs text-text-sub dark:text-gray-500">
                                Google アカウントを使う場合は、認証後に店舗情報の初期設定へ進みます。
                            </p>
                        </div>

                        <div className="mb-5 flex items-center gap-3">
                            <div className="h-px flex-1 bg-[#e5e7eb] dark:bg-white/10" />
                            <span className="text-xs font-medium uppercase tracking-[0.2em] text-text-sub dark:text-gray-500">
                                または
                            </span>
                            <div className="h-px flex-1 bg-[#e5e7eb] dark:bg-white/10" />
                        </div>

                        {error && (
                            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                {error}
                            </div>
                        )}

                        <form
                            className="flex flex-col gap-5"
                            onSubmit={onSubmit}
                        >
                            {/* 店舗名 */}
                            <div className="flex flex-col gap-2">
                                <label
                                    className="text-text-main dark:text-white text-sm font-bold leading-normal"
                                    htmlFor="shopName"
                                >
                                    店舗名
                                </label>

                                <input
                                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-text-main dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-[#dbe6db] dark:border-white/20 bg-background-light dark:bg-black/20 focus:border-primary h-12 px-4 text-base font-normal leading-normal placeholder:text-text-sub/50 transition-all"
                                    id="shopName"
                                    name="shopName"
                                    placeholder="例: Clear Cafe"
                                    required
                                    type="text"
                                    value={shopName}
                                    onChange={(e) =>
                                        setShopName(e.target.value)
                                    }
                                />
                            </div>

                            {/* メールアドレス */}
                            <div className="flex flex-col gap-2">
                                <label
                                    className="text-text-main dark:text-white text-sm font-bold leading-normal"
                                    htmlFor="email"
                                >
                                    メールアドレス
                                </label>

                                <input
                                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-text-main dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-[#dbe6db] dark:border-white/20 bg-background-light dark:bg-black/20 focus:border-primary h-12 px-4 text-base font-normal leading-normal placeholder:text-text-sub/50 transition-all"
                                    id="email"
                                    name="email"
                                    placeholder="manager@example.com"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    required
                                    spellCheck={false}
                                    type="email"
                                    value={email}
                                    onChange={(e) =>
                                        setEmail(
                                            normalizeEmail(e.target.value),
                                        )
                                    }
                                />
                            </div>

                            {/* パスワード */}
                            <div className="flex flex-col gap-2">
                                <label
                                    className="text-text-main dark:text-white text-sm font-bold leading-normal"
                                    htmlFor="password"
                                >
                                    パスワード
                                </label>

                                <div className="relative flex w-full items-center">
                                    <input
                                        className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-text-main dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-[#dbe6db] dark:border-white/20 bg-background-light dark:bg-black/20 focus:border-primary h-12 px-4 pr-12 text-base font-normal leading-normal placeholder:text-text-sub/50 transition-all"
                                        id="password"
                                        name="password"
                                        placeholder="8文字以上で入力"
                                        required
                                        type={
                                            showPassword ? "text" : "password"
                                        }
                                        value={password}
                                        onChange={(e) =>
                                            setPassword(e.target.value)
                                        }
                                    />

                                    <button
                                        className="absolute right-0 top-0 h-full px-3 text-text-sub hover:text-text-main dark:text-gray-400 dark:hover:text-white transition-colors flex items-center justify-center"
                                        type="button"
                                        onClick={() =>
                                            setShowPassword((v) => !v)
                                        }
                                        aria-label="パスワード表示を切り替え"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">
                                            {showPassword
                                                ? "visibility"
                                                : "visibility_off"}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* パスワード確認 */}
                            <div className="flex flex-col gap-2">
                                <label
                                    className="text-text-main dark:text-white text-sm font-bold leading-normal"
                                    htmlFor="passwordConfirm"
                                >
                                    パスワード（確認）
                                </label>

                                <div className="relative flex w-full items-center">
                                    <input
                                        className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-text-main dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-[#dbe6db] dark:border-white/20 bg-background-light dark:bg-black/20 focus:border-primary h-12 px-4 pr-12 text-base font-normal leading-normal placeholder:text-text-sub/50 transition-all"
                                        id="passwordConfirm"
                                        name="passwordConfirm"
                                        placeholder="もう一度入力"
                                        required
                                        type={
                                            showPasswordConfirm
                                                ? "text"
                                                : "password"
                                        }
                                        value={passwordConfirm}
                                        onChange={(e) =>
                                            setPasswordConfirm(e.target.value)
                                        }
                                    />

                                    <button
                                        className="absolute right-0 top-0 h-full px-3 text-text-sub hover:text-text-main dark:text-gray-400 dark:hover:text-white transition-colors flex items-center justify-center"
                                        type="button"
                                        onClick={() =>
                                            setShowPasswordConfirm((v) => !v)
                                        }
                                        aria-label="確認用パスワード表示を切り替え"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">
                                            {showPasswordConfirm
                                                ? "visibility"
                                                : "visibility_off"}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* 送信 */}
                            <div className="flex flex-col gap-4 mt-2">
                                <button
                                    className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-4 bg-primary hover:bg-primary-dark text-black text-base font-bold leading-normal tracking-[0.015em] transition-colors shadow-sm disabled:opacity-60"
                                    type="submit"
                                    disabled={loading}
                                >
                                    <span className="truncate">
                                        {loading ? "登録中..." : "新規登録"}
                                    </span>
                                </button>

                                <div className="flex justify-center">
                                    <Link
                                        href="/admin/login"
                                        className="text-text-sub dark:text-gray-400 hover:text-primary dark:hover:text-primary text-sm font-medium leading-normal underline underline-offset-4 transition-colors"
                                    >
                                        ログイン画面へ戻る
                                    </Link>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* 下部 */}
                    <div className="bg-background-light dark:bg-black/20 p-4 text-center border-t border-[#e5e7eb] dark:border-white/5">
                        <p className="text-xs text-text-sub dark:text-gray-500">
                            登録後はこのアカウントで店舗メニューを管理できます。
                        </p>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 text-center">
                <p className="text-xs text-text-sub dark:text-gray-500 font-medium">
                    © 2026 ClearAllergy
                </p>
            </footer>
        </div>
    );
}
