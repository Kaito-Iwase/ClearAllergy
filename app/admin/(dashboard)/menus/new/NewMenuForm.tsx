"use client";

// app/(admin)/admin/menus/new/NewMenuForm.tsx

import { useRouter } from "next/navigation";
import { useState } from "react";

type CreateMenuResponse = { id: string } | { error: string; message?: string };

export default function NewMenuForm() {
    // 1) 画面遷移（redirect）に使う
    const router = useRouter();

    // 2) 入力値（最低限は name だけ）
    const [name, setName] = useState("");

    // 3) 追加で入れても良い（最初は任意）
    const [priceYen, setPriceYen] = useState<string>("");
    const [category, setCategory] = useState("");

    // 4) 公開状態（最初は false 推奨）
    const [isPublished, setIsPublished] = useState(false);

    // 5) 送信中/エラー表示
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 6) 送信処理
    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        // 7) フォーム送信のデフォルト動作（ページ遷移）を止める
        e.preventDefault();

        // 8) 前回エラーが残ってたら消す
        setError(null);

        // 9) 最低限のバリデーション（入力チェック）
        const trimmed = name.trim();
        if (!trimmed) {
            setError("名前は必須です。");
            return;
        }

        // 10) 二重送信防止
        setIsSubmitting(true);

        try {
            // 11) priceYenは空ならnull、数値ならnumberへ
            const price = priceYen.trim() === "" ? null : Number(priceYen);

            // 12) 数値にできない入力（例：abc）を弾く
            if (priceYen.trim() !== "" && Number.isNaN(price)) {
                setError("価格は数字で入力してください。");
                return;
            }

            // 13) APIに送るbodyを作る（shopIdは送らない）
            const body = {
                name: trimmed,
                priceYen: price,
                category: category.trim() === "" ? null : category.trim(),
                isPublished,
            };

            // 14) POSTで新規作成
            const res = await fetch("/api/admin/menus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            // 15) JSONを読む（失敗しても落ちないようにする）
            const data = (await res
                .json()
                .catch(() => ({}))) as CreateMenuResponse;

            // 16) 失敗ならエラーを表示
            if (!res.ok) {
                const msg =
                    "error" in data
                        ? data.error + (data.message ? `: ${data.message}` : "")
                        : `作成に失敗しました（status: ${res.status}）`;
                setError(msg);
                return;
            }

            // 17) 成功したら id を取り出す
            if (!("id" in data)) {
                setError(
                    "作成は成功したはずですが、idが返ってきませんでした。",
                );
                return;
            }

            // 18) 編集画面へ遷移（設計どおり /admin/menus/{id}/edit）
            router.push(`/admin/menus/${data.id}/edit`);
        } catch (err) {
            // 19) 予期せぬ例外
            const msg = err instanceof Error ? err.message : String(err);
            setError(`予期せぬエラー: ${msg}`);
        } finally {
            // 20) 送信状態を戻す
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border p-4">
            {/* 21) エラー表示 */}
            {error && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 22) 名前（必須） */}
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

            {/* 23) 価格（任意） */}
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

            {/* 24) カテゴリ（任意） */}
            <div className="space-y-1">
                <label className="text-sm font-medium">カテゴリ（任意）</label>
                <input
                    className="w-full rounded-md border px-3 py-2"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="例：メインディッシュ"
                />
            </div>

            {/* 25) 公開状態（任意） */}
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

            {/* 26) ボタン */}
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
        </form>
    );
}
