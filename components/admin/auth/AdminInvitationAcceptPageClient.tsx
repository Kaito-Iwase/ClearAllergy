"use client";

import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import BrandLogo from "@/components/layout/BrandLogo";

type Props = {
    email: string | null;
};

type AcceptResponse = {
    message?: string;
    shop?: {
        id: string;
        name: string;
    };
};

export default function AdminInvitationAcceptPageClient({ email }: Props) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onAccept() {
        setError(null);
        setLoading(true);

        try {
            const response = await fetch("/api/invitations/accept", {
                method: "POST",
            });
            const data = (await response
                .json()
                .catch(() => null)) as AcceptResponse | null;

            if (!response.ok) {
                setError(data?.message ?? "招待の承認に失敗しました。");
                return;
            }

            router.push("/admin/shop");
            router.refresh();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`招待の承認中にエラーが発生しました: ${message}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen flex-col bg-background-light text-text-main antialiased">
            <header className="flex items-center justify-between border-b border-[#e5e7eb] bg-surface-light px-6 py-4 lg:px-10">
                <Link href="/" className="inline-flex items-center">
                    <BrandLogo priority />
                </Link>

                <SignOutButton redirectUrl="/admin/login">
                    <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-bold text-white transition hover:bg-black/85"
                    >
                        別のアカウントでやり直す
                    </button>
                </SignOutButton>
            </header>

            <main className="flex flex-1 items-center justify-center p-4 py-12 lg:py-20">
                <section className="w-full max-w-[520px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-surface-light shadow-sm">
                    <div className="p-8">
                        <div className="mb-8 text-center">
                            <h1 className="text-2xl font-black leading-tight lg:text-3xl">
                                招待を確認
                            </h1>
                            <p className="mt-3 text-sm leading-7 text-text-sub">
                                ログイン中のメールアドレスに届いている店舗管理者招待を確認します。
                            </p>
                            <p className="mt-2 text-xs text-text-sub">
                                ログイン中のメール: {email ?? "未確認"}
                            </p>
                        </div>

                        {error ? (
                            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                {error}
                            </div>
                        ) : null}

                        <button
                            type="button"
                            disabled={loading}
                            onClick={onAccept}
                            className="flex h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-base font-bold text-black transition hover:bg-primary-dark disabled:opacity-60"
                        >
                            {loading ? "確認中..." : "招待を承認して管理画面へ進む"}
                        </button>

                        <p className="mt-5 text-center text-xs leading-6 text-text-sub">
                            有効な招待が見つからない場合は、運営から届いた招待メールの宛先と同じClerkアカウントでログインしてください。
                        </p>

                        <div className="mt-4 flex justify-center">
                            <SignOutButton redirectUrl="/admin/login">
                                <button
                                    type="button"
                                    className="text-sm font-bold text-neutral-700 underline underline-offset-4 transition hover:text-black"
                                >
                                    別のメールアドレスでログインし直す
                                </button>
                            </SignOutButton>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
