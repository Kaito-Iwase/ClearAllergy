"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import { SignOutButton, useSignUp, useUser } from "@clerk/nextjs";
import { useState } from "react";
import BrandLogo from "@/components/layout/BrandLogo";
import { extractClerkErrorMessage } from "@/lib/auth/clerkErrors";

type Props = {
    ticket: string | null;
};

export default function AdminInvitationSignUpPageClient({ ticket }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { isSignedIn, user } = useUser();
    const { fetchStatus, signUp } = useSignUp();
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const currentUrl = `${pathname}${
        searchParams.toString() ? `?${searchParams.toString()}` : ""
    }`;

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (!ticket) {
            setError("招待リンクが無効です。運営から届いた最新の招待メールを開いてください。");
            return;
        }

        if (!signUp) {
            setError("認証の初期化中です。少し待ってから再度お試しください。");
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
            await signUp.reset();

            const result = await signUp.create({
                strategy: "ticket",
                ticket,
                password,
                locale: "ja-JP",
            });

            if (result.error) {
                setError(
                    extractClerkErrorMessage(
                        result.error,
                        "アカウント作成に失敗しました。",
                    ),
                );
                return;
            }

            if (signUp.status !== "complete") {
                setError(
                    "アカウント作成を完了できませんでした。招待リンクの期限切れ、または追加設定が必要な可能性があります。",
                );
                return;
            }

            const finalizeResult = await signUp.finalize({
                navigate: async ({ session, decorateUrl }) => {
                    if (session?.currentTask) {
                        setError("追加の認証タスクが必要です。Clerk設定を確認してください。");
                        return;
                    }

                    const url = decorateUrl("/admin/register");
                    if (url.startsWith("http")) {
                        window.location.assign(url);
                    } else {
                        router.push(url);
                    }
                },
            });

            if (finalizeResult.error) {
                setError(
                    extractClerkErrorMessage(
                        finalizeResult.error,
                        "セッションの作成に失敗しました。",
                    ),
                );
            }
        } catch (err) {
            setError(
                extractClerkErrorMessage(
                    err,
                    "アカウント作成中にエラーが発生しました。",
                ),
            );
        } finally {
            setLoading(false);
        }
    }

    const disabled = loading || fetchStatus === "fetching" || !ticket;

    if (isSignedIn) {
        return (
            <div className="flex min-h-screen flex-col bg-background-light text-text-main">
                <header className="flex items-center justify-between border-b border-[#e5e7eb] bg-surface-light px-6 py-4 lg:px-10">
                    <Link href="/" className="inline-flex items-center">
                        <BrandLogo priority />
                    </Link>
                    <Link
                        href="/admin/register"
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-900 transition hover:bg-gray-50"
                    >
                        招待確認へ
                    </Link>
                </header>

                <main className="flex flex-1 items-center justify-center p-4 py-12">
                    <section className="w-full max-w-[520px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-surface-light shadow-sm">
                        <div className="p-8 text-center">
                            <h1 className="text-2xl font-black leading-tight lg:text-3xl">
                                別のアカウントでログイン中です
                            </h1>
                            <p className="mt-3 text-sm leading-7 text-text-sub">
                                現在ログイン中のメール:
                                {" "}
                                {user?.primaryEmailAddress?.emailAddress ?? "未確認"}
                            </p>
                            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm leading-7 text-amber-900">
                                招待メールの宛先と同じメールアドレスのClerkアカウントで続行してください。違うアカウントでログイン中の場合は、一度ログアウトしてから招待リンクを開き直します。
                            </div>

                            <SignOutButton redirectUrl={currentUrl}>
                                <button
                                    type="button"
                                    className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-black px-4 text-base font-bold text-white transition hover:bg-black/85"
                                >
                                    ログアウトして招待リンクを続行する
                                </button>
                            </SignOutButton>
                        </div>
                    </section>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background-light text-text-main">
            <header className="flex items-center justify-between border-b border-[#e5e7eb] bg-surface-light px-6 py-4 lg:px-10">
                <Link href="/" className="inline-flex items-center">
                    <BrandLogo priority />
                </Link>
                <Link
                    href="/admin/login"
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-900 transition hover:bg-gray-50"
                >
                    ログイン
                </Link>
            </header>

            <main className="flex flex-1 items-center justify-center p-4 py-12">
                <section className="w-full max-w-[520px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-surface-light shadow-sm">
                    <div className="p-8">
                        <div className="mb-8 text-center">
                            <h1 className="text-2xl font-black leading-tight lg:text-3xl">
                                店舗管理者アカウント作成
                            </h1>
                            <p className="mt-3 text-sm leading-7 text-text-sub">
                                招待されたメールアドレスで使うパスワードを設定してください。
                            </p>
                        </div>

                        {!ticket ? (
                            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                招待リンクが見つかりません。運営から届いた招待メールのリンクを開いてください。
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                {error}
                            </div>
                        ) : null}

                        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
                            <div className="flex flex-col gap-2">
                                <label
                                    className="text-sm font-bold leading-normal"
                                    htmlFor="password"
                                >
                                    パスワード
                                </label>
                                <div className="relative flex w-full items-center">
                                    <input
                                        id="password"
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        required
                                        minLength={8}
                                        value={password}
                                        disabled={disabled}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="form-input h-12 w-full rounded-lg border border-[#dbe6db] bg-background-light px-4 pr-12 text-base focus:border-primary focus:outline-0 focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                                        placeholder="8文字以上で入力"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((value) => !value)}
                                        disabled={disabled}
                                        className="absolute right-0 top-0 flex h-full items-center justify-center px-3 text-text-sub transition hover:text-text-main disabled:opacity-60"
                                        aria-label="パスワード表示を切り替え"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">
                                            {showPassword ? "visibility" : "visibility_off"}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label
                                    className="text-sm font-bold leading-normal"
                                    htmlFor="passwordConfirm"
                                >
                                    パスワード（確認）
                                </label>
                                <div className="relative flex w-full items-center">
                                    <input
                                        id="passwordConfirm"
                                        name="passwordConfirm"
                                        type={showPasswordConfirm ? "text" : "password"}
                                        required
                                        minLength={8}
                                        value={passwordConfirm}
                                        disabled={disabled}
                                        onChange={(e) =>
                                            setPasswordConfirm(e.target.value)
                                        }
                                        className="form-input h-12 w-full rounded-lg border border-[#dbe6db] bg-background-light px-4 pr-12 text-base focus:border-primary focus:outline-0 focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                                        placeholder="もう一度入力"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowPasswordConfirm((value) => !value)
                                        }
                                        disabled={disabled}
                                        className="absolute right-0 top-0 flex h-full items-center justify-center px-3 text-text-sub transition hover:text-text-main disabled:opacity-60"
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

                            <div id="clerk-captcha" />

                            <button
                                type="submit"
                                disabled={disabled}
                                className="mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-base font-bold text-black transition hover:bg-primary-dark disabled:opacity-60"
                            >
                                {loading || fetchStatus === "fetching"
                                    ? "作成中..."
                                    : "アカウントを作成する"}
                            </button>
                        </form>

                        <p className="mt-5 text-center text-xs leading-6 text-text-sub">
                            作成後、招待を承認して店舗管理画面へ進みます。
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}
