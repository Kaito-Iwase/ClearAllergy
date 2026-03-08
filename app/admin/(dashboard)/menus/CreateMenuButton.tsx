"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CreateMenuResponse = {
    id?: string;
    error?: string;
};

export default function CreateMenuButton() {
    const router = useRouter();
    const [creating, setCreating] = useState(false);

    async function handleCreateMenu() {
        try {
            setCreating(true);

            const res = await fetch("/api/admin/menus", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });

            const data = (await res
                .json()
                .catch(() => null)) as CreateMenuResponse | null;

            if (!res.ok || !data?.id) {
                throw new Error(
                    data?.error ?? "新規メニューの作成に失敗しました。",
                );
            }

            router.push(`/admin/menus/${data.id}/edit`);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "新規メニューの作成に失敗しました。";

            alert(message);
        } finally {
            setCreating(false);
        }
    }

    return (
        <button
            type="button"
            onClick={handleCreateMenu}
            disabled={creating}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
            {creating ? "作成中..." : "＋ 新規作成"}
        </button>
    );
}
