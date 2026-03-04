"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QuickCreateMenu() {
    const router = useRouter();

    // 1) 入力：メニュー名（必須）
    const [name, setName] = useState("");

    // 2) 入力：公開/非公開（任意）
    const [isPublished, setIsPublished] = useState(false);

    // 3) 送信中（連打防止）
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 4) エラー表示
    const [error, setError] = useState<string | null>(null);

    // 5) 送信
    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);

        // 6) name必須
        if (name.trim().length === 0) {
            setError("メニュー名は必須です。");
            return;
        }

        setIsSubmitting(true);

        try {
            // 7) APIへPOST（shopIdは送らない）
            const res = await fetch("/api/admin/menus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    isPublished,
                }),
            });

            // 8) 失敗（401/400/500等）
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setError(
                    data?.message ?? `作成に失敗しました（${res.status}）`,
                );
                return;
            }

            // 9) 成功：{id} を受け取る
            const created: { id?: string } = await res.json();

            // 10) idが無いのは設計ミスなのでエラー
            if (!created?.id) {
                setError(
                    "作成結果に id がありません。APIの返り値を確認してください。",
                );
                return;
            }

            // 11) 即 edit へ
            router.push(`/admin/menus/${created.id}/edit`);
        } catch {
            // 12) ネットワーク障害
            setError("通信エラーが発生しました。");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={onSubmit} className="space-y-5">
            {/* メニュー名 */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">
                    メニュー名 <span className="text-red-500">*</span>
                </label>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: 季節の野菜カレー"
                    className="w-full rounded-lg border-gray-200 bg-gray-50 p-3 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none"
                />
            </div>

            {/* 公開 */}
            <div className="flex items-center gap-3">
                <input
                    id="isPublished"
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="h-4 w-4"
                />
                <label htmlFor="isPublished" className="text-sm">
                    公開する（OFFなら非公開）
                </label>
            </div>

            {/* エラー */}
            {error && (
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* ボタン */}
            <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 rounded-lg bg-primary text-green-950 text-sm font-bold hover:bg-green-400 shadow-lg shadow-green-500/20 transition-all inline-flex items-center gap-2 disabled:opacity-60"
            >
                <span className="material-symbols-outlined text-lg">
                    arrow_forward
                </span>
                {isSubmitting ? "作成中..." : "作成して編集へ"}
            </button>
        </form>
    );
}
