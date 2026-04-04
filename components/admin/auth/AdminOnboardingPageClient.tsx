"use client";

// このコンポーネントは Clerk ログイン直後の初回店舗作成画面です。
// app/admin/(auth)/register/page.tsx から呼ばれる Client Component で、
// Shop がまだ無い appUser に対して最小限の店舗情報だけ作成します。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
    email: string | null;
};

type OnboardingResponse = {
    message?: string;
    shop?: {
        id: string;
        name: string;
    };
};

export default function AdminOnboardingPageClient({ email }: Props) {
    // 入力値、エラー、送信中状態を画面側で持ちます。
    const router = useRouter();
    const [shopName, setShopName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        // フォーム既定の再読み込みを止め、結果メッセージを画面内で扱います。
        e.preventDefault();
        setError(null);

        // 必須の店舗名が空なら API を呼ばずに止めます。
        const trimmedShopName = shopName.trim();
        if (!trimmedShopName) {
            setError("店舗名を入力してください。");
            return;
        }

        setLoading(true);

        try {
            // Clerk ログイン後の初回店舗作成 API を呼びます。
            const response = await fetch("/api/admin/onboarding", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    shopName: trimmedShopName,
                }),
            });

            const data = (await response
                .json()
                .catch(() => null)) as OnboardingResponse | null;

            if (!response.ok) {
                setError(data?.message ?? "店舗の初期設定に失敗しました。");
                return;
            }

            // 正常完了したら管理画面トップへ進めます。
            router.push("/admin/menus");
            router.refresh();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`店舗の初期設定中にエラーが発生しました: ${message}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="bg-background-light text-text-main min-h-screen flex flex-col font-display antialiased selection:bg-primary/30">
            <header className="flex items-center justify-between border-b border-[#e5e7eb] bg-surface-light px-6 py-4 lg:px-10">
                <div>
                    <Link href="/" className="inline-block">
                        <h1 className="text-xl font-bold tracking-tight">
                            ClearAllergy
                        </h1>
                    </Link>
                    <p className="mt-1 text-sm text-text-sub">
                        Clerk ログイン後の初回セットアップ
                    </p>
                </div>
            </header>

            <main className="flex flex-1 items-center justify-center p-4 py-12 lg:py-20">
                <div className="w-full max-w-[520px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-surface-light shadow-sm">
                    <div className="p-8 pb-6">
                        <div className="mb-8 flex flex-col gap-2 text-center">
                            <h2 className="text-2xl font-black leading-tight tracking-[-0.033em] lg:text-3xl">
                                店舗情報を作成
                            </h2>
                            <p className="text-sm leading-normal text-text-sub">
                                最初の 1 回だけ、Clerk アカウントに紐づく店舗を作成します。
                            </p>
                            <p className="text-xs leading-normal text-text-sub">
                                ログイン中のメール:
                                {" "}
                                {email ?? "Clerk のメールアドレス未設定"}
                            </p>
                        </div>

                        {error ? (
                            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                {error}
                            </div>
                        ) : null}

                        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
                            <div className="flex flex-col gap-2">
                                <label
                                    className="text-sm font-bold leading-normal"
                                    htmlFor="shopName"
                                >
                                    店舗名
                                </label>
                                <input
                                    id="shopName"
                                    name="shopName"
                                    type="text"
                                    required
                                    value={shopName}
                                    onChange={(e) =>
                                        setShopName(e.target.value)
                                    }
                                    className="form-input flex h-12 w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg border border-[#dbe6db] bg-background-light px-4 text-base font-normal leading-normal placeholder:text-text-sub/50 focus:border-primary focus:outline-0 focus:ring-2 focus:ring-primary/50"
                                    placeholder="例: Clear Cafe"
                                />
                            </div>

                            <div className="mt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex h-12 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-primary px-4 text-base font-bold leading-normal tracking-[0.015em] text-black transition-colors hover:bg-primary-dark disabled:opacity-60"
                                >
                                    <span className="truncate">
                                        {loading ? "作成中..." : "店舗を作成して管理画面へ進む"}
                                    </span>
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="border-t border-[#e5e7eb] bg-background-light p-4 text-center">
                        <p className="text-xs text-text-sub">
                            1 ユーザー 1 店舗の前提はそのまま維持されます。
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
