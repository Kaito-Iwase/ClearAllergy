"use client";

// このコンポーネントは管理者ログイン画面の表示と送信処理を担当します。
// app/admin/(auth)/login/page.tsx から呼ばれる Client Component で、
// 既存のメール+パスワード UI のまま Clerk の custom auth flow を使います。

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton, useSignIn } from "@clerk/nextjs";
import AdminGoogleAuthButton from "@/components/admin/auth/AdminGoogleAuthButton";
import BrandLogo from "@/components/layout/BrandLogo";
import { normalizeEmail } from "@/lib/email";
import { extractClerkErrorMessage } from "@/lib/auth/clerkErrors";

type AdminLoginPageClientProps = {
    showGoogleAuthButton?: boolean;
    pendingSetupEmail?: string | null;
    databaseUnavailable?: boolean;
    databaseUnavailableReason?: string | null;
};

export default function AdminLoginPageClient({
    showGoogleAuthButton = false,
    pendingSetupEmail,
    databaseUnavailable = false,
    databaseUnavailableReason = null,
}: AdminLoginPageClientProps) {
    const router = useRouter();
    const { fetchStatus, signIn } = useSignIn();
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [emailCode, setEmailCode] = useState("");
    const [requiresEmailCode, setRequiresEmailCode] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function reportLoginResult(args: {
        email: string;
        success: boolean;
        reason?: string;
    }) {
        await fetch("/api/admin/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                mode: "result",
                email: args.email,
                success: args.success,
                reason: args.reason,
            }),
        }).catch(() => null);
    }

    async function finalizeSignIn() {
        if (!signIn) {
            setError("認証の初期化がまだ完了していません。少し待ってから再度お試しください。");
            return;
        }

        const finalizeResult = await signIn.finalize();

        if (finalizeResult.error) {
            setError(
                extractClerkErrorMessage(
                    finalizeResult.error,
                    "Clerk セッションの確立に失敗しました。",
                ),
            );
            return;
        }

        router.push("/admin/shop");
    }

    async function startEmailCodeStep() {
        if (!signIn) {
            return;
        }

        const supportsEmailCode = signIn.supportedSecondFactors.some(
            (factor) => factor.strategy === "email_code",
        );

        if (!supportsEmailCode) {
            setError(
                "追加認証が必要ですが、この画面では email code 以外の方式には未対応です。",
            );
            return;
        }

        const sendCodeResult = await signIn.mfa.sendEmailCode();

        if (sendCodeResult.error) {
            setError(
                extractClerkErrorMessage(
                    sendCodeResult.error,
                    "確認コードの送信に失敗しました。",
                ),
            );
            return;
        }

        setRequiresEmailCode(true);
        setNotice("確認コードをメールで送信しました。届いたコードを入力してください。");
    }

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setNotice(null);
        setLoading(true);

        try {
            if (databaseUnavailable) {
                setError(
                    "現在データベースへ接続できないため、ログインを開始できません。時間をおいて再度お試しください。",
                );
                return;
            }

            if (!signIn) {
                setError(
                    "認証の初期化がまだ完了していません。少し待ってから再度お試しください。",
                );
                return;
            }

            const normalizedEmail = normalizeEmail(email);
            setEmail(normalizedEmail);

            const precheckResponse = await fetch("/api/admin/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    mode: "precheck",
                    email: normalizedEmail,
                    password,
                }),
            });

            if (!precheckResponse.ok) {
                const data = (await precheckResponse
                    .json()
                    .catch(() => null)) as { message?: string } | null;
                setError(
                    data?.message ??
                        "ログイン前チェックに失敗しました。時間をおいて再度お試しください。",
                );
                return;
            }

            await signIn.reset();

            const passwordResult = await signIn.password({
                emailAddress: normalizedEmail,
                password,
            });

            if (passwordResult.error) {
                await reportLoginResult({
                    email: normalizedEmail,
                    success: false,
                    reason: "password_rejected",
                });
                setError(
                    "ログインに失敗しました。メールアドレスまたはパスワードを確認してください。",
                );
                return;
            }

            if (signIn.status === "complete") {
                await reportLoginResult({
                    email: normalizedEmail,
                    success: true,
                });
                await finalizeSignIn();
                return;
            }

            if (
                signIn.status === "needs_second_factor" ||
                signIn.status === "needs_client_trust"
            ) {
                await startEmailCodeStep();
                return;
            }

            await reportLoginResult({
                email: normalizedEmail,
                success: false,
                reason: "unexpected_status",
            });
            setError("ログインを完了できませんでした。時間をおいて再度お試しください。");
        } catch {
            const normalizedEmail = normalizeEmail(email);
            if (normalizedEmail) {
                await reportLoginResult({
                    email: normalizedEmail,
                    success: false,
                    reason: "client_exception",
                });
            }
            setError(
                "ログインに失敗しました。メールアドレスまたはパスワードを確認してください。",
            );
        } finally {
            setLoading(false);
        }
    };

    const onSubmitEmailCode = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setNotice(null);
        setLoading(true);

        try {
            if (!signIn) {
                setError(
                    "認証の初期化がまだ完了していません。少し待ってから再度お試しください。",
                );
                return;
            }

            const code = emailCode.trim();

            if (!code) {
                setError("確認コードを入力してください。");
                return;
            }

            const verifyResult = await signIn.mfa.verifyEmailCode({ code });

            if (verifyResult.error) {
                const normalizedEmail = normalizeEmail(email);
                if (normalizedEmail) {
                    await reportLoginResult({
                        email: normalizedEmail,
                        success: false,
                        reason: "email_code_rejected",
                    });
                }
                setError("確認コードの検証に失敗しました。");
                return;
            }

            if (signIn.status !== "complete") {
                const normalizedEmail = normalizeEmail(email);
                if (normalizedEmail) {
                    await reportLoginResult({
                        email: normalizedEmail,
                        success: false,
                        reason: "email_code_incomplete",
                    });
                }
                setError("追加認証を完了できませんでした。");
                return;
            }

            const normalizedEmail = normalizeEmail(email);
            if (normalizedEmail) {
                await reportLoginResult({
                    email: normalizedEmail,
                    success: true,
                });
            }
            await finalizeSignIn();
        } catch (err) {
            const normalizedEmail = normalizeEmail(email);
            if (normalizedEmail) {
                await reportLoginResult({
                    email: normalizedEmail,
                    success: false,
                    reason: "email_code_exception",
                });
            }
            setError(
                extractClerkErrorMessage(
                    err,
                    "確認コード送信中にエラーが発生しました。",
                ),
            );
        } finally {
            setLoading(false);
        }
    };

    async function resetLoginFlow() {
        setError(null);
        setNotice(null);
        setEmailCode("");
        setRequiresEmailCode(false);

        if (signIn) {
            await signIn.reset();
        }
    }

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
                        アカウントをお持ちでないですか？
                    </span>

                    <Link
                        href="/admin/register"
                        className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-5 bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/90 transition-colors text-sm font-bold leading-normal tracking-[0.015em]"
                    >
                        <span className="truncate">新規登録</span>
                    </Link>
                </div>
            </header>

            <main className="flex-1 flex items-center justify-center p-4 py-12 lg:py-20">
                <div className="w-full max-w-[480px] bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-[#e5e7eb] dark:border-white/5 overflow-hidden">
                    <div className="p-8 pb-6">
                        <div className="flex flex-col gap-2 mb-8 text-center">
                            <h1 className="text-text-main dark:text-white text-2xl lg:text-3xl font-black leading-tight tracking-[-0.033em]">
                                店舗管理者ログイン
                            </h1>
                            <p className="text-text-sub dark:text-gray-400 text-sm font-normal leading-normal">
                                管理画面へようこそ。メールアドレスとパスワードを入力してください。
                            </p>
                        </div>

                        {pendingSetupEmail ? (
                            <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-900">
                                <p className="font-bold">
                                    ログイン済みですが、店舗作成がまだ完了していません
                                </p>
                                <p className="mt-2 leading-6">
                                    このアカウント
                                    {" "}
                                    <span className="font-semibold">
                                        {pendingSetupEmail}
                                    </span>
                                    {" "}
                                    では、最初の店舗情報をまだ作成していないため、
                                    管理画面へ入る前に初回セットアップが必要です。
                                </p>

                                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                    <Link
                                        href="/admin/register"
                                        className="inline-flex items-center justify-center rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-bold text-black transition hover:bg-[#0db80d]"
                                    >
                                        初回セットアップへ進む
                                    </Link>

                                    <SignOutButton redirectUrl="/admin/login">
                                        <button
                                            type="button"
                                            className="inline-flex items-center justify-center rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-bold text-green-900 transition hover:bg-green-100"
                                        >
                                            別のアカウントでログインし直す
                                        </button>
                                    </SignOutButton>
                                </div>
                            </div>
                        ) : null}

                        {databaseUnavailable ? (
                            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                                <p className="font-bold">
                                    現在データベースへ接続できないため、管理者ログインを一時停止しています。
                                </p>
                                <p className="mt-2 leading-6">
                                    {databaseUnavailableReason ??
                                        "認証フォームではなく、管理者ユーザーと店舗状態の読取に必要なデータベース接続で失敗しています。時間をおいて再度お試しください。"}
                                </p>
                            </div>
                        ) : null}

                        {showGoogleAuthButton && !databaseUnavailable ? (
                            <>
                                <div className="mb-5">
                                    <AdminGoogleAuthButton
                                        label="Google でログイン"
                                        onError={(message) =>
                                            setError(message || null)
                                        }
                                    />
                                    <p className="mt-2 text-center text-xs text-text-sub dark:text-gray-500">
                                        Google アカウントでログインした場合は、Clerk 経由で管理画面に入れます。
                                    </p>
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

                        {requiresEmailCode ? (
                            <form className="flex flex-col gap-5" onSubmit={onSubmitEmailCode}>
                                <div className="flex flex-col gap-2">
                                    <label
                                        className="text-text-main dark:text-white text-sm font-bold leading-normal"
                                        htmlFor="emailCode"
                                    >
                                        メール確認コード
                                    </label>

                                    <input
                                        className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-text-main dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-[#dbe6db] dark:border-white/20 bg-background-light dark:bg-black/20 focus:border-primary h-12 px-4 text-base font-normal leading-normal placeholder:text-text-sub/50 transition-all"
                                        id="emailCode"
                                        name="emailCode"
                                        placeholder="メールで届いたコードを入力"
                                        required
                                        type="text"
                                        value={emailCode}
                                        disabled={databaseUnavailable || loading}
                                        onChange={(e) => setEmailCode(e.target.value)}
                                    />
                                </div>

                                <div className="flex flex-col gap-3 mt-2">
                                    <button
                                        className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-4 bg-primary hover:bg-primary-dark text-black text-base font-bold leading-normal tracking-[0.015em] transition-colors shadow-sm disabled:opacity-60"
                                        type="submit"
                                        disabled={databaseUnavailable || loading}
                                    >
                                        <span className="truncate">
                                            {loading ? "確認中..." : "コードを確認してログイン"}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => void resetLoginFlow()}
                                        className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-4 border border-[#dbe6db] text-base font-bold leading-normal tracking-[0.015em] transition-colors hover:bg-background-light disabled:opacity-60"
                                        disabled={databaseUnavailable || loading}
                                    >
                                        <span className="truncate">メールアドレス入力に戻る</span>
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form className="flex flex-col gap-5" onSubmit={onSubmit}>
                                <div className="flex flex-col gap-2">
                                    <label
                                        className="text-text-main dark:text-white text-sm font-bold leading-normal"
                                        htmlFor="email"
                                    >
                                        メールアドレス
                                    </label>

                                    <div className="relative">
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
                                            disabled={databaseUnavailable || loading}
                                            onChange={(e) =>
                                                setEmail(
                                                    normalizeEmail(e.target.value),
                                                )
                                            }
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <label
                                            className="text-text-main dark:text-white text-sm font-bold leading-normal"
                                            htmlFor="password"
                                        >
                                            パスワード
                                        </label>
                                    </div>

                                    <div className="relative flex w-full items-center">
                                        <input
                                            className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-text-main dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-[#dbe6db] dark:border-white/20 bg-background-light dark:bg-black/20 focus:border-primary h-12 px-4 pr-12 text-base font-normal leading-normal placeholder:text-text-sub/50 transition-all"
                                            id="password"
                                            name="password"
                                            placeholder="パスワードを入力"
                                            required
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            disabled={databaseUnavailable || loading}
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
                                            disabled={databaseUnavailable || loading}
                                        >
                                            <span className="material-symbols-outlined text-[20px]">
                                                {showPassword
                                                    ? "visibility"
                                                    : "visibility_off"}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-2">
                                    <button
                                        className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-4 bg-primary hover:bg-primary-dark text-black text-base font-bold leading-normal tracking-[0.015em] transition-colors shadow-sm disabled:opacity-60"
                                        type="submit"
                                        disabled={
                                            databaseUnavailable ||
                                            loading ||
                                            fetchStatus === "fetching"
                                        }
                                    >
                                        <span className="truncate">
                                            {loading ? "ログイン中..." : "ログイン"}
                                        </span>
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>

                    <div className="bg-background-light dark:bg-black/20 p-4 text-center border-t border-[#e5e7eb] dark:border-white/5">
                        <p className="text-xs text-text-sub dark:text-gray-500">
                            保護された接続でログインしています。
                        </p>
                    </div>
                </div>
            </main>

            <footer className="py-6 text-center">
                <p className="text-xs text-text-sub dark:text-gray-500 font-medium">
                    © 2026 ClearAllergy Project
                </p>
            </footer>
            <div id="clerk-captcha" />
        </div>
    );
}
