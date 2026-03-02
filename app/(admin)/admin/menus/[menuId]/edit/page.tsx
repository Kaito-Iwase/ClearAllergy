// app/(admin)/admin/menus/[menuId]/edit/page.tsx
// 管理画面：メニュー編集ページ（Server Component）
// 役割：初期データ取得 → Clientへ渡す（操作はClient）

import AdminMenuEditClient from "./AdminMenuEditClient";

type Status = "FREE" | "MAY_CONTAIN" | "CONTAINS";

type Allergen = {
    slug: string;
    nameJa: string;
    nameEn: string;
    sortOrder: number;
};

type MenuDetail = {
    id: string;
    shopId: string;
    name: string;
    isPublished: boolean;
    allergens: Array<{
        slug: string;
        status: Status;
    }>;
};

type PageProps = {
    params: Promise<{ menuId: string }> | { menuId: string };
};

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
    return (await res.json()) as T;
}

export default async function AdminMenuEditPage({ params }: PageProps) {
    const { menuId } = await params;

    const allergensRes = await fetchJson<{ allergens: Allergen[] }>(
        "http://localhost:3000/api/allergens",
    );

    const menuRes = await fetchJson<{ menu: MenuDetail }>(
        `http://localhost:3000/api/menus/${menuId}`,
    );

    const allergens = allergensRes.allergens;
    const menu = menuRes.menu;

    // 28品目をFREEで初期化 → 既存状態で上書き
    const initialStatusBySlug: Record<string, Status> = {};
    for (const a of allergens) initialStatusBySlug[a.slug] = "FREE";
    for (const a of menu.allergens) initialStatusBySlug[a.slug] = a.status;

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <h1 className="text-2xl font-bold text-gray-900">
                    メニュー編集
                </h1>
                <p className="mt-1 text-gray-600">
                    アレルゲン情報を正確に入力してください。お客様の安全に関わります。
                </p>

                <div className="mt-6">
                    <AdminMenuEditClient
                        menuId={menuId}
                        shopId={menu.shopId}
                        initialName={menu.name}
                        initialIsPublished={menu.isPublished}
                        allergens={allergens}
                        initialStatusBySlug={initialStatusBySlug}
                    />
                </div>
            </div>
        </div>
    );
}
