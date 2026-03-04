import { headers } from "next/headers";

type AllergenStatus = "CONTAINS" | "FREE" | "MAY_CONTAIN";

type MenuResponse = {
    id: string;
    name: string;
    description: string | null;
    priceYen: number | null;
    category: string | null;
    ingredients: string | null;
    precaution: string | null;
    imageUrl: string | null;
    isPublished: boolean;
    allergenStatusBySlug: Record<string, AllergenStatus>;
};

function formatPrice(priceYen: number | null) {
    if (priceYen == null) return null;
    return new Intl.NumberFormat("ja-JP").format(priceYen) + "円";
}

export default async function PublicMenuPage({
    params,
}: {
    params: { shopId: string; menuId: string };
}) {
    // 1) URLのパラメータを取り出す（この構成なら両方必ず入る）
    const { shopId, menuId } = params;

    // 2) Server Component から /api を叩くときは絶対URLにする（相対URL事故を潰す）
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    const baseUrl = `${proto}://${host}`;

    // 3) 公開APIへ（menuIdだけで取得。非公開は404の設計）
    const res = await fetch(`${baseUrl}/api/menus/${menuId}`, {
        cache: "no-store",
    });

    // 4) 404なら「見つかりません」（非公開 or 削除）
    if (res.status === 404) {
        return (
            <div className="mx-auto max-w-3xl p-6">
                <h1 className="text-2xl font-bold">メニューが見つかりません</h1>
                <p className="mt-2 text-sm opacity-80">
                    非公開、または削除された可能性があります。
                </p>
                <p className="mt-2 text-xs opacity-70">shopId: {shopId}</p>
            </div>
        );
    }

    // 5) その他エラー
    if (!res.ok) {
        return (
            <div className="mx-auto max-w-3xl p-6">
                <h1 className="text-2xl font-bold">読み込みに失敗しました</h1>
                <p className="mt-2 text-sm opacity-80">
                    ステータス: {res.status}
                </p>
                <p className="mt-2 text-xs opacity-70">shopId: {shopId}</p>
            </div>
        );
    }

    // 6) JSONを読む
    const menu = (await res.json()) as MenuResponse;

    // 7) 警告判定
    const statuses = Object.values(menu.allergenStatusBySlug);
    const hasContains = statuses.includes("CONTAINS");
    const hasMayContain = statuses.includes("MAY_CONTAIN");

    // 8) 表示用キー一覧
    const slugs = Object.keys(menu.allergenStatusBySlug);

    return (
        <div className="mx-auto max-w-3xl p-6 space-y-6">
            <header className="space-y-2">
                <h1 className="text-3xl font-bold">{menu.name}</h1>
                <div className="text-sm opacity-80 flex flex-wrap gap-3">
                    {menu.category && <span>カテゴリ: {menu.category}</span>}
                    {formatPrice(menu.priceYen) && (
                        <span>価格: {formatPrice(menu.priceYen)}</span>
                    )}
                </div>
                {menu.description && (
                    <p className="text-sm opacity-90">{menu.description}</p>
                )}
            </header>

            {hasContains && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="font-bold text-red-700">
                        ⚠ アレルゲンを含む可能性があります
                    </div>
                    <div className="mt-1 text-sm text-red-700/90">
                        「含む」に設定された項目があります。安全のため必ずご確認ください。
                    </div>
                </div>
            )}

            {!hasContains && hasMayContain && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                    <div className="font-bold text-yellow-800">
                        注意（混入の可能性）
                    </div>
                    <div className="mt-1 text-sm text-yellow-800/90">
                        「注意」に設定された項目があります。必要に応じて店舗へ確認してください。
                    </div>
                </div>
            )}

            {menu.precaution && (
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                    <h2 className="font-bold">注意書き</h2>
                    <p className="mt-2 text-sm opacity-90 whitespace-pre-wrap">
                        {menu.precaution}
                    </p>
                </section>
            )}

            <section className="rounded-xl border border-gray-200 bg-white p-4">
                <h2 className="font-bold">アレルゲン（28品目）</h2>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {slugs.map((slug) => {
                        const st = menu.allergenStatusBySlug[slug];
                        const badge =
                            st === "CONTAINS"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : st === "MAY_CONTAIN"
                                  ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                                  : "border-gray-200 bg-gray-50 text-gray-700";

                        const label =
                            st === "CONTAINS"
                                ? "含む"
                                : st === "MAY_CONTAIN"
                                  ? "注意"
                                  : "含まない";

                        return (
                            <div
                                key={slug}
                                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                            >
                                <div className="text-sm font-medium">
                                    {slug}
                                </div>
                                <div
                                    className={`text-xs font-bold px-2 py-1 rounded-full border ${badge}`}
                                >
                                    {label}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {menu.ingredients && (
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                    <h2 className="font-bold">原材料</h2>
                    <p className="mt-2 text-sm opacity-90 whitespace-pre-wrap">
                        {menu.ingredients}
                    </p>
                </section>
            )}
        </div>
    );
}
