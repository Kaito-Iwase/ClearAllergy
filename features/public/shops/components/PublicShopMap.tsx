type MarkerShop = {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
};

export default function PublicShopMap({
    shops,
    locationStatus,
}: {
    shops: MarkerShop[];
    locationStatus: "idle" | "loading" | "active" | "error";
}) {
    const coordinateShopCount = shops.filter(
        (shop) => shop.latitude !== null && shop.longitude !== null,
    ).length;

    return (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-600">
            <p className="font-bold text-neutral-800">地図表示は今後の対応予定です</p>
            <p className="mt-1 leading-6">
                現在の検索結果 {shops.length}件のうち、座標登録済み店舗は
                {coordinateShopCount}件です。店舗一覧検索はそのまま利用できます。
            </p>
            {locationStatus === "active" ? (
                <p className="mt-2 font-bold text-green-800">
                    現在地を基準に、座標登録済み店舗を近い順で表示中です。
                </p>
            ) : null}
        </div>
    );
}
