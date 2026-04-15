"use client";

// このコンポーネントは管理者向けの新規登録フォームです。
// app/admin/(auth)/register/page.tsx から呼ばれる Client Component で、
// 既存 UI のまま Clerk ベースの登録と自動ログインを行います。

import React, { useState } from "react";
import Link from "next/link";
import { useSignIn } from "@clerk/nextjs";
import AdminGoogleAuthButton from "@/components/admin/auth/AdminGoogleAuthButton";
import BrandLogo from "@/components/layout/BrandLogo";
import { normalizeEmail } from "@/lib/email";
import { extractClerkErrorMessage } from "@/lib/auth/clerkErrors";

export default function AdminRegisterPageClient({
    showGoogleAuthButton,
    canRegister,
    registrationMode,
    lockMessage,
    inviteToken,
}: {
    showGoogleAuthButton: boolean;
    canRegister: boolean;
    registrationMode: "disabled" | "invite_only" | "open";
    lockMessage: string | null;
    inviteToken: string | null;
}) {
    const { fetchStatus, signIn } = useSignIn();
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [shopName, setShopName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const registerDescription =
        registrationMode === "invite_only"
            ? "この画面は招待制です。招待リンクを受け取った店舗だけが登録できます。"
            : "店舗名・メールアドレス・パスワードを入力して、管理画面を使い始めてください。";
    const submitLabel = !canRegister
        ? registrationMode === "invite_only"
            ? "招待リンクが必要です"
            : "現在は登録できません"
        : loading
          ? "登録中..."
          : "新規登録";

    async function autoSignIn(normalizedEmail: string, rawPassword: string) {
        if (!signIn) {
            throw new Error(
                "登録は完了しましたが、認証の初期化がまだ完了していません。ログイン画面から再度お試しください。",
            );
        }

        await signIn.reset();

        const signInResult = await signIn.password({
            emailAddress: normalizedEmail,
            password: rawPassword,
        });

        if (signInResult.error) {
            throw new Error(
                extractClerkErrorMessage(
                    signInResult.error,
                    "登録は完了しましたが、自動ログインに失敗しました。ログイン画面から再度お試しください。",
                ),
            );
        }

        if (signIn.status === "complete") {
            const finalizeResult = await signIn.finalize();

            if (finalizeResult.error) {
                throw new Error(
                    extractClerkErrorMessage(
                        finalizeResult.error,
                        "登録は完了しましたが、Clerk セッションの確立に失敗しました。ログイン画面から再度お試しください。",
                    ),
                );
            }

            window.location.href = "/admin/shop";
            return;
        }

        throw new Error(
            "登録は完了しました。初回ログインで追加認証が必要なため、ログイン画面から続行してください。",
        );
    }

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setNotice(null);

        if (!canRegister) {
            setError(lockMessage ?? "現在は登録できません。");
            return;
        }

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
            const normalizedEmail = normalizeEmail(email);
            setEmail(normalizedEmail);

            const response = await fetch("/api/admin/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    shopName,
                    email: normalizedEmail,
                    password,
                    inviteToken,
                }),
            });

            const data = (await response.json().catch(() => null)) as {
                message?: string;
            } | null;

            if (!response.ok) {
                setError(data?.message ?? "新規登録に失敗しました。");
                return;
            }

            try {
                await autoSignIn(normalizedEmail, password);
            } catch (autoLoginError) {
                setNotice(
                    extractClerkErrorMessage(
                        autoLoginError,
                        "登録は完了しました。ログイン画面から続行してください。",
                    ),
                );
            }
        } catch (err) {
            setError(
                extractClerkErrorMessage(
                    err,
                    "登録中にエラーが発生しました。",
                ),
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-background-light dark:bg-background-dark text-text-main min-h-screen flex flex-col font-display antialiased selection:bg-primary/30">
            <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-[#e5e7eb] dark:border-white/10 bg-surface-light dark:bg-surface-dark px-6 lg:px-10 py-4 sticky top-0 z-50">
                <Link
                    href="/"
                    className="flex items-center text-text-main dark:text-white"
                >
                    <BrandLogo priority />
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

            <main className="flex-1 flex items-center justify-center p-4 py-12 lg:py-20">
                <div className="w-full max-w-[520px] bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-[#e5e7eb] dark:border-white/5 overflow-hidden">
                    <div className="p-8 pb-6">
                        <div className="flex flex-col gap-2 mb-8 text-center">
                            <h1 className="text-text-main dark:text-white text-2xl lg:text-3xl font-black leading-tight tracking-[-0.033em]">
                                店舗アカウント新規登録
                            </h1>
                            <p className="text-text-sub dark:text-gray-400 text-sm font-normal leading-normal">
                                {registerDescription}
                            </p>
                        </div>

                        {showGoogleAuthButton ? (
                            <>
                                <div className="mb-5">
                                    <AdminGoogleAuthButton
                                        label="Google で新規登録"
                                        onError={(message) =>
                                            setError(message || null)
                                        }
                                    />
                                    <p className="mt-2 text-center text-xs text-text-sub dark:text-gray-500">
                                        Google アカウントを使う場合は、認証後に店舗情報の初期設定へ進みます。
                                    </p>
                                    {registrationMode === "open" ? (
                                        <p className="mt-2 text-center text-xs font-semibold text-amber-700">
                                            公開登録モードでは BOT 登録やスパム店舗作成の危険があります。
                                        </p>
                                    ) : null}
                                </div>

                                <div className="mb-5 flex items-center gap-3">
                                    <div className="h-px flex-1 bg-[#e5e7eb] dark:bg-white/10" />
                                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-text-sub dark:text-gray-500">
                                        または
                                    </span>
                                    <div className="h-px flex-1 bg-[#e5e7eb] dark:bg-white/10" />
                                </div>
                            </>
                        ) : null}

                        {notice ? (
                            <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                                {notice}
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                {error}
                            </div>
                        ) : null}

                        {!canRegister && lockMessage ? (
                            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                {lockMessage}
                            </div>
                        ) : null}

                        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
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
                                    onChange={(e) => setShopName(e.target.value)}
                                />
                            </div>

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
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
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

                            <div className="flex flex-col gap-4 mt-2">
                                <button
                                    className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-4 bg-primary hover:bg-primary-dark text-black text-base font-bold leading-normal tracking-[0.015em] transition-colors shadow-sm disabled:opacity-60"
                                    type="submit"
                                    disabled={
                                        loading ||
                                        !canRegister ||
                                        fetchStatus === "fetching"
                                    }
                                >
                                    <span className="truncate">
                                        {submitLabel}
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

                    <div className="bg-background-light dark:bg-black/20 p-4 text-center border-t border-[#e5e7eb] dark:border-white/5">
                        <p className="text-xs text-text-sub dark:text-gray-500">
                            登録後はこのアカウントで店舗メニューを管理できます。
                        </p>
                    </div>
                </div>
            </main>

            <footer className="py-6 text-center">
                <p className="text-xs text-text-sub dark:text-gray-500 font-medium">
                    © 2026 ClearAllergy
                </p>
            </footer>
            <div id="clerk-captcha" />
        </div>
    );
}
