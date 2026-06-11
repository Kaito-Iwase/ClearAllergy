"use client";

import Link from "next/link";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PREFECTURES } from "@/lib/constants/prefectures";
import {
    loadUserAllergenPreferences,
    USER_ALLERGENS_UPDATED_EVENT,
} from "@/lib/public-allergen-preferences";
import type { GooglePlaceCandidate } from "@/types/google-places";
import PublicShopMap from "@/features/public/shops/components/PublicShopMap";

type AllergenStatus = "CONTAINS" | "FREE" | "MAY_CONTAIN" | "UNKNOWN";

export type PublicShopListShop = {
    id: string;
    name: string;
    description: string | null;
    address: string | null;
    prefecture: string | null;
    city: string | null;
    nearestStation: string | null;
    category: string | null;
    latitude: number | null;
    longitude: number | null;
    googlePlaceId: string | null;
    averageBudgetYen: number | null;
    updatedAt: string;
    menus: Array<{
        priceYen: number | null;
        allergenLinks: Array<{
            status: AllergenStatus;
            allergen: { slug: string };
        }>;
    }>;
    _count: { menus: number };
};

function normalize(value: string | null | undefined) {
    return (value ?? "").toLocaleLowerCase("ja-JP");
}

function getShopPrefecture(shop: PublicShopListShop) {
    if (shop.prefecture?.trim()) return shop.prefecture.trim();
    return PREFECTURES.find((value) => shop.address?.includes(value)) ?? null;
}

function getShopCity(shop: PublicShopListShop) {
    if (shop.city?.trim()) return shop.city.trim();
    const address = shop.address?.trim();
    const prefecture = getShopPrefecture(shop);
    if (!address) return null;

    const areaText =
        prefecture && address.startsWith(prefecture)
            ? address.slice(prefecture.length)
            : address;
    return (
        areaText.match(/^(.+?市.+?区)/)?.[1] ??
        areaText.match(/^(.+?(?:市|区|町|村))/)?.[1] ??
        null
    );
}

function matchesSafeMenu(shop: PublicShopListShop, excludedSlugs: string[]) {
    if (excludedSlugs.length === 0) return true;
    return shop.menus.some((menu) => {
        const statusBySlug = new Map(
            menu.allergenLinks.map((link) => [link.allergen.slug, link.status]),
        );
        return excludedSlugs.every((slug) => statusBySlug.get(slug) === "FREE");
    });
}

function ShopCards({ shops }: { shops: PublicShopListShop[] }) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {shops.map((shop) => (
                <Link
                    id={`shop-${shop.id}`}
                    key={shop.id}
                    href={`/shops/${shop.id}`}
                    className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-green-300 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold text-green-700">
                                {shop.category || "カテゴリ未設定"}
                            </p>
                            <h3 className="mt-1 text-xl font-black text-neutral-900">{shop.name}</h3>
                        </div>
                        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-800">
                            アレルゲン情報あり
                        </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-neutral-600">
                        {shop.description || "説明は未登録です。"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-700">
                        <span className="rounded-full bg-neutral-100 px-3 py-1.5">
                            {shop.address || "住所未設定"}
                        </span>
                        {shop.nearestStation ? (
                            <span className="rounded-full bg-neutral-100 px-3 py-1.5">
                                {shop.nearestStation}
                            </span>
                        ) : null}
                        <span className="rounded-full bg-neutral-100 px-3 py-1.5">
                            公開メニュー {shop._count.menus}件
                        </span>
                    </div>
                </Link>
            ))}
        </div>
    );
}

export default function PublicShopListClient({
    initialShops,
    isDatabaseAvailable,
}: {
    initialShops: PublicShopListShop[];
    isDatabaseAvailable: boolean;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [query, setQuery] = React.useState(searchParams.get("q") ?? "");
    const [prefecture, setPrefecture] = React.useState(searchParams.get("prefecture") ?? "");
    const [city, setCity] = React.useState(searchParams.get("city") ?? "");
    const [excludedSlugs, setExcludedSlugs] = React.useState<string[]>([]);
    const [places, setPlaces] = React.useState<GooglePlaceCandidate[]>([]);
    const [placesError, setPlacesError] = React.useState("");
    const [placesLoading, setPlacesLoading] = React.useState(false);
    const lastPlacesQueryRef = React.useRef("");
    const placesRequestRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
        setQuery(searchParams.get("q") ?? "");
        setPrefecture(searchParams.get("prefecture") ?? "");
        setCity(searchParams.get("city") ?? "");
    }, [searchParams]);

    React.useEffect(() => {
        const sync = () => setExcludedSlugs(loadUserAllergenPreferences().excludedSlugs);
        sync();
        window.addEventListener(USER_ALLERGENS_UPDATED_EVENT, sync as EventListener);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(USER_ALLERGENS_UPDATED_EVENT, sync as EventListener);
            window.removeEventListener("storage", sync);
        };
    }, []);

    const cityOptions = React.useMemo(
        () => Array.from(new Set(initialShops
            .filter((shop) => !prefecture || getShopPrefecture(shop) === prefecture)
            .map(getShopCity)
            .filter((value): value is string => Boolean(value)))).sort(),
        [initialShops, prefecture],
    );

    const filtered = React.useMemo(() => {
        const keywords = query.trim().split(/\s+/).filter(Boolean).map(normalize);
        const results = initialShops
            .filter((shop) => !prefecture || getShopPrefecture(shop) === prefecture)
            .filter((shop) => !city || getShopCity(shop) === city)
            .filter((shop) => matchesSafeMenu(shop, excludedSlugs))
            .map((shop) => {
                const haystack = [
                    shop.name, shop.description, shop.address, shop.prefecture,
                    getShopPrefecture(shop), getShopCity(shop),
                    shop.city, shop.nearestStation, shop.category,
                ].map(normalize).join(" ");
                const matched = keywords.filter((keyword) => haystack.includes(keyword)).length;
                return { shop, matched, all: keywords.length === 0 || matched === keywords.length };
            })
            .filter((result) => query.trim() === "" || result.matched > 0);
        return {
            exact: results.filter((result) => result.all).map((result) => result.shop),
            related: results.filter((result) => !result.all).sort((a, b) => b.matched - a.matched).map((result) => result.shop),
        };
    }, [city, excludedSlugs, initialShops, prefecture, query]);

    const registeredPlaceIds = React.useMemo(
        () => new Set(initialShops.map((shop) => shop.googlePlaceId).filter(Boolean)),
        [initialShops],
    );
    const unregisteredPlaces = places.filter((place) => !registeredPlaceIds.has(place.placeId));
    const visibleShops = [...filtered.exact, ...filtered.related];

    async function submitSearch(event: React.FormEvent) {
        event.preventDefault();
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (prefecture) params.set("prefecture", prefecture);
        if (city) params.set("city", city);
        router.replace(params.size ? `/shops?${params}` : "/shops");

        const placesQuery = [query.trim(), city, prefecture].filter(Boolean).join(" ");
        setPlaces([]);
        setPlacesError("");
        if (placesQuery.length < 2) return;
        if (placesQuery === lastPlacesQueryRef.current) return;
        lastPlacesQueryRef.current = placesQuery;
        placesRequestRef.current?.abort();
        const controller = new AbortController();
        placesRequestRef.current = controller;
        setPlacesLoading(true);
        try {
            const response = await fetch(
                `/api/places/search?q=${encodeURIComponent(placesQuery)}`,
                { signal: controller.signal },
            );
            const data = (await response.json().catch(() => null)) as {
                places?: GooglePlaceCandidate[];
                error?: string;
                message?: string;
                available?: boolean;
            } | null;
            if (!response.ok) throw new Error(data?.error ?? "周辺店舗検索に失敗しました。");
            setPlaces(data?.places ?? []);
            if (data?.available === false) {
                setPlacesError(
                    data.message ??
                        "Google Places検索は現在設定されていません。",
                );
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            lastPlacesQueryRef.current = "";
            setPlacesError(error instanceof Error ? error.message : String(error));
        } finally {
            if (placesRequestRef.current === controller) {
                placesRequestRef.current = null;
                setPlacesLoading(false);
            }
        }
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <section className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
                <h1 className="text-2xl font-black text-neutral-900">エリア・キーワードから店舗を探す</h1>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                    例: 「栄 居酒屋」「名古屋駅 ラーメン」。登録済み店舗のアレルゲン情報を優先して表示します。
                </p>
                <form onSubmit={submitSearch} className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="場所名・駅名・ジャンル・店舗名" className="rounded-xl border border-neutral-300 px-4 py-3" />
                    <select value={prefecture} onChange={(e) => { setPrefecture(e.target.value); setCity(""); }} className="rounded-xl border border-neutral-300 px-3 py-3">
                        <option value="">すべての都道府県</option>
                        {PREFECTURES.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-xl border border-neutral-300 px-3 py-3">
                        <option value="">すべての市区町村</option>
                        {cityOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <button type="submit" className="rounded-xl bg-[#13ec13] px-5 py-3 font-extrabold text-black">
                        {placesLoading ? "検索中..." : "検索"}
                    </button>
                </form>
                {excludedSlugs.length > 0 ? (
                    <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-xs font-bold text-green-900">
                        保存済み除外設定に対して、すべてFREEの公開メニューがある店舗だけを表示中です。
                    </p>
                ) : null}
            </section>

            <section className="mt-6">
                <PublicShopMap shops={visibleShops} places={unregisteredPlaces} />
            </section>

            {!isDatabaseAvailable ? (
                <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    現在データベースに接続できないため、登録済み店舗を読み込めません。
                </p>
            ) : null}

            <section className="mt-8">
                <h2 className="text-xl font-black text-neutral-900">条件に一致するClearAllergy登録済み店舗</h2>
                <p className="mt-1 text-sm text-neutral-500">{filtered.exact.length}件</p>
                <div className="mt-4">
                    {filtered.exact.length ? <ShopCards shops={filtered.exact} /> : <p className="rounded-xl border border-dashed p-5 text-sm text-neutral-600">完全一致する登録済み店舗はありません。</p>}
                </div>
            </section>

            {filtered.related.length > 0 ? (
                <section className="mt-10">
                    <h2 className="text-xl font-black text-neutral-900">条件の一部に一致する店舗</h2>
                    <p className="mt-1 text-sm text-neutral-500">{filtered.related.length}件</p>
                    <div className="mt-4"><ShopCards shops={filtered.related} /></div>
                </section>
            ) : null}

            <section className="mt-10 border-t border-neutral-200 pt-8">
                <h2 className="text-xl font-black text-neutral-900">アレルゲン情報未登録の周辺店舗</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                    Google Places由来の場所情報です。安全候補には含めず、アレルゲン情報の確認には利用できません。
                </p>
                {placesError ? <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{placesError}</p> : null}
                {unregisteredPlaces.length > 0 ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {unregisteredPlaces.map((place) => (
                            <article key={place.placeId} className="rounded-2xl border border-neutral-300 bg-neutral-50 p-5">
                                <span className="rounded-full bg-neutral-200 px-3 py-1 text-xs font-bold text-neutral-700">未登録</span>
                                <h3 className="mt-3 text-lg font-black text-neutral-900">{place.name}</h3>
                                <p className="mt-2 text-sm text-neutral-600">{place.address}</p>
                                <p className="mt-3 text-xs font-bold text-red-700">この店舗はClearAllergyにアレルゲン情報が登録されていません。</p>
                                {place.googleMapsUri ? <a href={place.googleMapsUri} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-bold text-blue-700 underline">Google Mapsで確認</a> : null}
                            </article>
                        ))}
                    </div>
                ) : !placesLoading && !placesError ? (
                    <p className="mt-4 text-sm text-neutral-500">検索確定後に周辺店舗候補を表示します。</p>
                ) : null}
            </section>
        </main>
    );
}
