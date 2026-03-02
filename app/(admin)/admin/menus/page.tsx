// app/(admin)/admin/menus/page.tsx
// 管理画面：メニュー一覧
// 目的：店舗のメニュー一覧を表示し、編集ページへ遷移できるようにする

import Link from "next/link";

// APIが返す形
type MenuSummary = {
    id: string;
    name: string;
    isPublished: boolean;
    updatedAt: string;
};

async function fetchMenus(shopId: string): Promise<MenuSummary[]> {
    // 開発中は localhost 固定でOK（本番では環境変数 or Prisma直にする）
    const res = await fetch(
        `http://localhost:3000/api/admin/menus?shopId=${shopId}`,
        { cache: "no-store" },
    );

    if (!res.ok) {
        throw new Error(`Failed to fetch menus: ${res.status}`);
    }

    const data = (await res.json()) as { menus: MenuSummary[] };
    return data.menus;
}

export default async function AdminMenusPage() {
    // いまは仮で固定（次にNextAuthでセッション由来にする）
    const shopId = "cmm8ollib0001wnqcyimmbm6a";

    const menus = await fetchMenus(shopId);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            メニュー一覧
                        </h1>
                        <p className="mt-1 text-gray-600">
                            編集したいメニューを選んでください。
                        </p>
                    </div>

                    {/* 今は作成ページ未実装なのでダミー。後で /admin/menus/new に繋げる */}
                    <div className="text-sm text-gray-500">
                        店舗ID: <span className="font-mono">{shopId}</span>
                    </div>
                </div>

                <div className="mt-6 grid gap-3">
                    {menus.map((m) => {
                        const updated = new Date(m.updatedAt).toLocaleString(
                            "ja-JP",
                        );
                        return (
                            <div
                                key={m.id}
                                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-lg font-semibold text-gray-900">
                                            {m.name}
                                        </div>

                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                            <span
                                                className={`rounded-full px-2 py-1 ${
                                                    m.isPublished
                                                        ? "bg-green-50 text-green-800"
                                                        : "bg-gray-100 text-gray-700"
                                                }`}
                                            >
                                                {m.isPublished
                                                    ? "公開"
                                                    : "非公開"}
                                            </span>

                                            <span className="text-gray-500">
                                                更新: {updated}
                                            </span>

                                            <span className="font-mono text-xs text-gray-400">
                                                {m.id}
                                            </span>
                                        </div>
                                    </div>

                                    <Link
                                        href={`/admin/menus/${m.id}/edit`}
                                        className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                                    >
                                        編集
                                    </Link>
                                </div>
                            </div>
                        );
                    })}

                    {menus.length === 0 && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-gray-600">
                            まだメニューがありません。
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
