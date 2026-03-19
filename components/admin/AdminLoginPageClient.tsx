"use client";

import React, { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function AdminLoginPage() {
    // 1) パスワード表示のON/OFF（UIの状態）
    const [showPassword, setShowPassword] = useState(false);

    // 2) フォーム入力値（メール/パスワード）
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    // 3) 画面表示用の状態（エラー/送信中）
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // 4) 送信時：NextAuth Credentials へログイン要求を投げる
    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        // 5) ブラウザのデフォルト送信（ページ遷移）を止める
        e.preventDefault();

        // 6) 前回のエラーを消して送信開始
        setError(null);
        setLoading(true);

        try {
            // 7) NextAuthにログイン要求
            // redirect:false にすると、成功/失敗を自分で制御できる
            const res = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            // 8) res が null のこともあるので防御
            if (!res) {
                setError("ログイン処理で予期しないエラーが発生しました。");
                return;
            }

            // 9) 認証失敗（authorizeがnullを返す等）
            if (res.error) {
                setError(
                    "ログインに失敗しました。メールアドレスまたはパスワードを確認してください。",
                );
                return;
            }

            // 10) 成功：管理メニュー一覧へ
            window.location.href = "/admin/menus";
        } catch (err) {
            // 11) 例外が起きたとき（ネットワークなど）
            const msg = err instanceof Error ? err.message : String(err);
            setError(`ログイン中にエラーが発生しました: ${msg}`);
        } finally {
            // 12) 送信終了
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

            {/* Main */}
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

                        {error && (
                            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                {error}
                            </div>
                        )}

                        <form
                            className="flex flex-col gap-5"
                            onSubmit={onSubmit}
                        >
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
                                        required
                                        type="email"
                                        value={email}
                                        onChange={(e) =>
                                            setEmail(e.target.value)
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

                            <div className="flex flex-col gap-4 mt-2">
                                <button
                                    className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-4 bg-primary hover:bg-primary-dark text-black text-base font-bold leading-normal tracking-[0.015em] transition-colors shadow-sm disabled:opacity-60"
                                    type="submit"
                                    disabled={loading}
                                >
                                    <span className="truncate">
                                        {loading ? "ログイン中..." : "ログイン"}
                                    </span>
                                </button>

                                <div className="flex justify-center">
                                    <a
                                        className="text-text-sub dark:text-gray-400 hover:text-primary dark:hover:text-primary text-sm font-medium leading-normal underline underline-offset-4 transition-colors"
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            alert("パスワード再発行（未実装）");
                                        }}
                                    >
                                        パスワードをお忘れですか？
                                    </a>
                                </div>
                            </div>
                        </form>
                    </div>

                    <div className="bg-background-light dark:bg-black/20 p-4 text-center border-t border-[#e5e7eb] dark:border-white/5">
                        <p className="text-xs text-text-sub dark:text-gray-500">
                            保護された接続でログインしています。
                            <br />
                            <a className="hover:underline" href="#">
                                プライバシーポリシー
                            </a>{" "}
                            •{" "}
                            <a className="hover:underline" href="#">
                                利用規約
                            </a>
                        </p>
                    </div>
                </div>
            </main>

            <footer className="py-6 text-center">
                <p className="text-xs text-text-sub dark:text-gray-500 font-medium">
                    © 2026 ClearAllergy
                </p>
            </footer>
        </div>
    );
}
