"use client";

import React from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { GooglePlaceCandidate } from "@/types/google-places";

type MarkerShop = {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
};

export default function PublicShopMap({
    shops,
    places,
}: {
    shops: MarkerShop[];
    places: GooglePlaceCandidate[];
}) {
    const mapElement = React.useRef<HTMLDivElement>(null);
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim();

    React.useEffect(() => {
        if (!apiKey || !mapId || !mapElement.current) return;
        let cancelled = false;

        async function renderMap() {
            setOptions({ key: apiKey, v: "weekly" });
            const [{ Map }, { AdvancedMarkerElement, PinElement }, { LatLngBounds }] =
                await Promise.all([
                    importLibrary("maps"),
                    importLibrary("marker"),
                    importLibrary("core"),
                ]);
            if (cancelled || !mapElement.current) return;

            const map = new Map(mapElement.current, {
                center: { lat: 35.681236, lng: 139.767125 },
                zoom: 5,
                mapId,
                mapTypeControl: false,
                streetViewControl: false,
            });
            const bounds = new LatLngBounds();
            let markerCount = 0;

            for (const shop of shops) {
                if (shop.latitude === null || shop.longitude === null) continue;
                const position = { lat: shop.latitude, lng: shop.longitude };
                const pin = new PinElement({
                    background: "#13ec13",
                    borderColor: "#087b08",
                    glyphColor: "#000000",
                });
                new AdvancedMarkerElement({ map, position, title: shop.name, content: pin });
                bounds.extend(position);
                markerCount += 1;
            }

            for (const place of places) {
                const position = { lat: place.latitude, lng: place.longitude };
                const pin = new PinElement({
                    background: "#d4d4d4",
                    borderColor: "#737373",
                    glyphColor: "#404040",
                });
                new AdvancedMarkerElement({
                    map,
                    position,
                    title: `${place.name}（アレルゲン情報未登録）`,
                    content: pin,
                });
                bounds.extend(position);
                markerCount += 1;
            }

            if (markerCount > 0) map.fitBounds(bounds, 56);
        }

        renderMap().catch(console.error);
        return () => {
            cancelled = true;
        };
    }, [apiKey, mapId, places, shops]);

    if (!apiKey || !mapId) {
        return (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-600">
                地図表示は現在設定されていません。店舗一覧検索はそのまま利用できます。
            </div>
        );
    }

    return <div ref={mapElement} className="h-[380px] w-full rounded-2xl border border-neutral-200 bg-neutral-100" />;
}
