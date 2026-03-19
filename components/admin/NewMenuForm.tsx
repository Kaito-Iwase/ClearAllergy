"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CreateMenuResponse = { id: string } | { error: string; message?: string };

export default function NewMenuForm() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [priceYen, setPriceYen] = useState<string>("");
    const [category, setCategory] = useState("");
    const [isPublished, setIsPublished] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);

        const trimmed = name.trim();
        if (!trimmed) {
            setError("名前は必須です。");
            return;
        }

        setIsSubmitting(true);

        try {
            const price = priceYen.trim() === "" ? null : Number(priceYen);

            if (priceYen.trim() !== "" && Number.isNaN(price)) {
                setError("価格は数字で入力してください。");
                return;
            }

            const body = {
                name: trimmed,
                priceYen: price,
                category: category.trim() === "" ? null : category.trim(),
                isPublished,
            };

            const res = await fetch("/api/admin/menus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = (await res
                .json()
                .catch(() => ({}))) as CreateMenuResponse;

            if (!res.ok) {
                const msg =
                    "error" in data
                        ? data.error + (data.message ? `: ${data.message}` : "")
                        : `作成に失敗しました（status: ${res.status}）`;
                setError(msg);
                return;
            }

            if (!("id" in data)) {
                setError(
                    "作成は成功したはずですが、idが返ってきませんでした。",
                );
                return;
            }

            router.push(`/admin/menus/${data.id}/edit`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(`予期せぬエラー: ${msg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border p-4">
            {error && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="space-y-1">
                <label className="text-sm font-medium">
                    メニュー名（必須）
                </label>
                <input
                    className="w-full rounded-md border px-3 py-2"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例：季節の野菜カレー"
                />
            </div>

            <div className="space-y-1">
                <label className="text-sm font-medium">価格（円・任意）</label>
                <input
                    className="w-full rounded-md border px-3 py-2"
                    value={priceYen}
                    onChange={(e) => setPriceYen(e.target.value)}
                    placeholder="例：1200"
                    inputMode="numeric"
                />
            </div>

            <div className="space-y-1">
                <label className="text-sm font-medium">カテゴリ（任意）</label>
                <input
                    className="w-full rounded-md border px-3 py-2"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="例：メインディッシュ"
                />
            </div>

            <div className="flex items-center gap-2">
                <input
                    id="isPublished"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                />
                <label htmlFor="isPublished" className="text-sm">
                    公開する（最初はOFF推奨）
                </label>
            </div>

            <div className="flex gap-2">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
                >
                    {isSubmitting ? "作成中..." : "作成して編集へ"}
                </button>

                <button
                    type="button"
                    onClick={() => router.push("/admin/menus")}
                    className="rounded-md border px-4 py-2"
                >
                    一覧に戻る
                </button>
            </div>

            <p className="text-xs text-neutral-500">
                作成後は `/admin/menus/[menuId]/edit`
                に移動して、価格やアレルゲン28品目を続けて編集できます。
            </p>
        </form>
    );
}
