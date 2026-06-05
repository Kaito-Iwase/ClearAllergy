"use client";

// このボタンは既存の日本語 UI の中から Google OAuth を始めるための部品です。
// Clerk の既定サインイン画面は使わず、必要な認証開始処理だけをここで呼びます。
// login / register の両画面から使えるよう、文言だけ props で受け取ります。

import { useSignIn } from "@clerk/nextjs";

type AdminGoogleAuthButtonProps = {
    label: string;
    onError?: (message: string) => void;
};

export default function AdminGoogleAuthButton({
    label,
    onError,
}: AdminGoogleAuthButtonProps) {
    const { fetchStatus, signIn } = useSignIn();

    async function handleGoogleSignIn() {
        // 初期化途中では signIn がまだ使えないことがあるため、先に確認します。
        if (!signIn) {
            onError?.("認証の初期化がまだ完了していません。少し待ってから再度お試しください。");
            return;
        }

        onError?.("");

        try {
            const precheckResponse = await fetch("/api/admin/auth/sso", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    provider: "google",
                    stage: "start",
                }),
            });

            if (!precheckResponse.ok) {
                const data = (await precheckResponse
                    .json()
                    .catch(() => null)) as { message?: string } | null;
                onError?.(
                    data?.message ??
                        "Google ログインを開始できませんでした。時間をおいて再度お試しください。",
                );
                return;
            }

            // 既定 UI ではなく、直接 Google の SSO フローを開始します。
            await signIn.sso({
                strategy: "oauth_google",
                redirectUrl: "/admin",
                redirectCallbackUrl: "/sign-in/sso-callback",
            });
        } catch (error) {
            const fallbackMessage =
                "Google ログインの開始に失敗しました。時間をおいて再度お試しください。";

            await fetch("/api/admin/auth/sso", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    provider: "google",
                    stage: "failure",
                    reason: "client_exception",
                }),
            }).catch(() => null);

            // Clerk 独自のエラー構造があれば、なるべくそのまま利用者へ返します。
            if (
                typeof error === "object" &&
                error !== null &&
                "errors" in error &&
                Array.isArray(error.errors) &&
                error.errors.length > 0 &&
                typeof error.errors[0]?.longMessage === "string"
            ) {
                onError?.(error.errors[0].longMessage);
                return;
            }

            if (error instanceof Error && error.message) {
                onError?.(error.message);
                return;
            }

            onError?.(fallbackMessage);
        }
    }

    return (
        <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={!signIn || fetchStatus === "fetching"}
            className="flex h-12 w-full items-center justify-center gap-3 overflow-hidden rounded-lg border border-[#dbe6db] bg-white px-4 text-base font-bold leading-normal text-text-main transition-colors hover:bg-[#f7faf7] disabled:cursor-not-allowed disabled:opacity-60"
        >
            <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
            >
                <path
                    d="M21.805 10.023h-9.783v3.955h5.608c-.241 1.27-.966 2.346-2.057 3.068v2.548h3.329c1.948-1.793 3.07-4.435 3.07-7.571 0-.672-.06-1.318-.167-2.0Z"
                    fill="#4285F4"
                />
                <path
                    d="M12.022 22c2.772 0 5.099-.917 6.798-2.478l-3.329-2.548c-.926.62-2.111.987-3.469.987-2.666 0-4.925-1.8-5.733-4.22H2.848v2.627A10.27 10.27 0 0 0 12.022 22Z"
                    fill="#34A853"
                />
                <path
                    d="M6.289 13.741a6.175 6.175 0 0 1-.321-1.941c0-.674.116-1.327.321-1.941V7.232H2.848A10.271 10.271 0 0 0 1.75 11.8c0 1.645.394 3.205 1.098 4.568l3.441-2.627Z"
                    fill="#FBBC05"
                />
                <path
                    d="M12.022 5.639c1.507 0 2.859.519 3.922 1.538l2.939-2.939C17.117 2.594 14.79 1.6 12.022 1.6a10.271 10.271 0 0 0-9.174 5.632l3.441 2.627c.808-2.42 3.067-4.22 5.733-4.22Z"
                    fill="#EA4335"
                />
            </svg>
            <span>{label}</span>
        </button>
    );
}
