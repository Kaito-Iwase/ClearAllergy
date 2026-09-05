"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type AdminInvitationListItem = {
    id: string;
    email: string;
    status: "pending" | "accepted" | "revoked" | "expired" | "failed";
    expiresAt: string | null;
    createdAt: string;
    shop: {
        id: string;
        name: string;
        isActive: boolean;
        ownerClerkUserId: string | null;
    };
};

type Props = {
    initialInvitations: AdminInvitationListItem[];
};

type InviteResponse = {
    message?: string;
    clerkInvitationUrl?: string | null;
};

function statusLabel(status: AdminInvitationListItem["status"]) {
    switch (status) {
        case "pending":
            return "招待中";
        case "accepted":
            return "承認済み";
        case "revoked":
            return "取消済み";
        case "expired":
            return "期限切れ";
        case "failed":
            return "失敗";
    }
}

function formatDate(value: string | null) {
    if (!value) {
        return "なし";
    }

    return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

export default function AdminInvitationManager({
    initialInvitations,
}: Props) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [shopName, setShopName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionId, setActionId] = useState<string | null>(null);

    async function createInvitation(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setNotice(null);

        const trimmedEmail = email.trim();
        const trimmedShopName = shopName.trim();

        if (!trimmedEmail || !trimmedShopName) {
            setError("メールアドレスと店舗名を入力してください。");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch("/api/admin/invitations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: trimmedEmail,
                    shopName: trimmedShopName,
                }),
            });
            const data = (await response
                .json()
                .catch(() => null)) as InviteResponse | null;

            if (!response.ok) {
                setError(data?.message ?? "招待の作成に失敗しました。");
                return;
            }

            setEmail("");
            setShopName("");
            setNotice(data?.message ?? "招待を作成しました。");
            router.refresh();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`招待の作成中にエラーが発生しました: ${message}`);
        } finally {
            setLoading(false);
        }
    }

    async function runInviteAction(inviteId: string, action: "resend" | "revoke") {
        setError(null);
        setNotice(null);
        setActionId(`${action}:${inviteId}`);

        try {
            const response = await fetch(
                `/api/admin/invitations/${inviteId}/${action}`,
                {
                    method: "POST",
                },
            );
            const data = (await response
                .json()
                .catch(() => null)) as InviteResponse | null;

            if (!response.ok) {
                setError(data?.message ?? "招待操作に失敗しました。");
                return;
            }

            setNotice(data?.message ?? "招待を更新しました。");
            router.refresh();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`招待操作中にエラーが発生しました: ${message}`);
        } finally {
            setActionId(null);
        }
    }

    return (
        <div className="space-y-6">
            <form
                onSubmit={createInvitation}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <label className="block">
                        <span className="text-sm font-bold text-gray-800">
                            招待メールアドレス
                        </span>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-2 h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="owner@example.com"
                            required
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-bold text-gray-800">
                            店舗名
                        </span>
                        <input
                            type="text"
                            value={shopName}
                            onChange={(e) => setShopName(e.target.value)}
                            className="mt-2 h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="Clear Cafe"
                            required
                        />
                    </label>

                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-black transition hover:bg-primary-dark disabled:opacity-60"
                    >
                        {loading ? "作成中..." : "招待を送信"}
                    </button>
                </div>

                {notice ? (
                    <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                        {notice}
                    </p>
                ) : null}

                {error ? (
                    <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                    </p>
                ) : null}
            </form>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-4">
                    <h2 className="text-base font-extrabold text-gray-900">
                        最近の招待
                    </h2>
                </div>

                {initialInvitations.length === 0 ? (
                    <p className="px-6 py-8 text-sm text-gray-600">
                        招待はまだありません。
                    </p>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {initialInvitations.map((invite) => {
                            const isPending = invite.status === "pending";
                            return (
                                <div
                                    key={invite.id}
                                    className="grid gap-4 px-6 py-4 lg:grid-cols-[1fr_auto] lg:items-center"
                                >
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-bold text-gray-900">
                                                {invite.shop.name}
                                            </p>
                                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
                                                {statusLabel(invite.status)}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-gray-600">
                                            {invite.email}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">
                                            作成: {formatDate(invite.createdAt)} / 期限:{" "}
                                            {formatDate(invite.expiresAt)}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            disabled={
                                                !isPending ||
                                                actionId === `resend:${invite.id}`
                                            }
                                            onClick={() =>
                                                runInviteAction(invite.id, "resend")
                                            }
                                            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            {actionId === `resend:${invite.id}`
                                                ? "再送中..."
                                                : "再送"}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={
                                                !isPending ||
                                                actionId === `revoke:${invite.id}`
                                            }
                                            onClick={() =>
                                                runInviteAction(invite.id, "revoke")
                                            }
                                            className="inline-flex h-9 items-center justify-center rounded-lg bg-black px-3 text-sm font-bold text-white transition hover:bg-black/85 disabled:opacity-50"
                                        >
                                            {actionId === `revoke:${invite.id}`
                                                ? "取消中..."
                                                : "取消"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
