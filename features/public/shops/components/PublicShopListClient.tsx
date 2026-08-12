"use client";

import Link from "next/link";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PREFECTURES } from "@/lib/constants/prefectures";
import {
    loadUserAllergenPreferences,
    USER_ALLERGENS_UPDATED_EVENT,
} from "@/lib/public-allergen-preferences";
import PublicShopMap from "@/features/public/shops/components/PublicShopMap";
import UserAllergenPreferenceClient from "@/features/public/shops/components/UserAllergenPreferenceClient";
import {
    filterAndRankShops,
    getCityOptions,
    getDistanceKm,
    type CurrentLocation,
    type PublicShopListShop,
} from "@/features/public/shops/components/public-shop-search";

export type { PublicShopListShop } from "@/features/public/shops/components/public-shop-search";

type LocationStatus = "idle" | "loading" | "active" | "error";
type PublicAllergen = { slug: string; nameJa: string };

function ShopCards({
    shops,
    currentLocation,
}: {
    shops: PublicShopListShop[];
    currentLocation: CurrentLocation | null;
}) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {shops.map((shop) => {
                const distance =
                    currentLocation &&
                    shop.latitude !== null &&
                    shop.longitude !== null
                        ? getDistanceKm(currentLocation, {
                              latitude: shop.latitude,
                              longitude: shop.longitude,
                          })
                        : null;

                return (
                    <Link
                        id={`shop-${shop.id}`}
                        key={shop.id}
                        href={`/shops/${shop.id}`}
                        className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-green-300 hover:shadow-md sm:p-5"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold text-green-700">
                                    {shop.category || "カテゴリ未設定"}
                                </p>
                                <h3 className="mt-1 text-xl font-black text-neutral-900">
                                    {shop.name}
                                </h3>
                            </div>
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-800">
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
                            {distance !== null ? (
                                <span className="rounded-full bg-green-50 px-3 py-1.5 font-bold text-green-800">
                                    現在地から約
                                    {distance < 10
                                        ? distance.toFixed(1)
                                        : Math.round(distance)}
                                    km
                                </span>
                            ) : null}
                            <span className="rounded-full bg-neutral-100 px-3 py-1.5">
                                公開メニュー {shop._count.menus}件
                            </span>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}

export default function PublicShopListClient({
    initialShops,
    allergens,
    isDatabaseAvailable,
}: {
    initialShops: PublicShopListShop[];
    allergens: PublicAllergen[];
    isDatabaseAvailable: boolean;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [area, setArea] = React.useState(searchParams.get("area") ?? "");
    const [keyword, setKeyword] = React.useState(
        searchParams.get("keyword") ?? searchParams.get("q") ?? "",
    );
    const [prefecture, setPrefecture] = React.useState(
        searchParams.get("prefecture") ?? "",
    );
    const [city, setCity] = React.useState(searchParams.get("city") ?? "");
    const [excludedSlugs, setExcludedSlugs] = React.useState<string[]>([]);
    const [includeMayContain, setIncludeMayContain] = React.useState(false);
    const [loadedPreferences, setLoadedPreferences] = React.useState(false);
    const [currentLocation, setCurrentLocation] =
        React.useState<CurrentLocation | null>(null);
    const [locationStatus, setLocationStatus] =
        React.useState<LocationStatus>("idle");
    const [locationMessage, setLocationMessage] = React.useState("");

    React.useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 戻る・進む操作後もURLの検索条件をフォームへ同期します。
        setArea(searchParams.get("area") ?? "");
        setKeyword(searchParams.get("keyword") ?? searchParams.get("q") ?? "");
        setPrefecture(searchParams.get("prefecture") ?? "");
        setCity(searchParams.get("city") ?? "");
    }, [searchParams]);

    React.useEffect(() => {
        function syncPreferences() {
            const next = loadUserAllergenPreferences();
            setExcludedSlugs(next.excludedSlugs);
            setIncludeMayContain(next.includeMayContain);
            setLoadedPreferences(true);
        }

        syncPreferences();
        window.addEventListener(USER_ALLERGENS_UPDATED_EVENT, syncPreferences);
        window.addEventListener("storage", syncPreferences);
        window.addEventListener("focus", syncPreferences);
        return () => {
            window.removeEventListener(
                USER_ALLERGENS_UPDATED_EVENT,
                syncPreferences,
            );
            window.removeEventListener("storage", syncPreferences);
            window.removeEventListener("focus", syncPreferences);
        };
    }, []);

    const cityOptions = React.useMemo(
        () => getCityOptions(initialShops, prefecture),
        [initialShops, prefecture],
    );

    const filtered = React.useMemo(
        () =>
            filterAndRankShops({
                shops: initialShops,
                area,
                keyword,
                prefecture,
                city,
                excludedSlugs,
                includeMayContain,
                loadedPreferences,
                currentLocation,
            }),
        [
            area,
            city,
            currentLocation,
            excludedSlugs,
            includeMayContain,
            initialShops,
            keyword,
            loadedPreferences,
            prefecture,
        ],
    );

    const visibleShops = [...filtered.exact, ...filtered.related];
    const coordinateShopCount = visibleShops.filter(
        (shop) => shop.latitude !== null && shop.longitude !== null,
    ).length;
    const hasExclusionPreference =
        loadedPreferences && excludedSlugs.length > 0;

    function submitSearch(event: React.FormEvent) {
        event.preventDefault();
        const params = new URLSearchParams();
        if (area.trim()) params.set("area", area.trim());
        if (keyword.trim()) params.set("keyword", keyword.trim());
        if (prefecture) params.set("prefecture", prefecture);
        if (city) params.set("city", city);
        router.replace(params.size ? `/shops?${params}` : "/shops");
    }

    // 現在地は並び替えにだけ使い、API や localStorage へ保存・送信しません。
    function findFromCurrentLocation() {
        setLocationMessage("");
        if (!navigator.geolocation) {
            setLocationStatus("error");
            setLocationMessage(
                "このブラウザでは現在地を取得できません。通常の店舗検索をご利用ください。",
            );
            return;
        }

        setLocationStatus("loading");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setCurrentLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
                setLocationStatus("active");
                setLocationMessage(
                    coordinateShopCount > 0
                        ? "座標が登録されている店舗を現在地から近い順に表示しています。"
                        : "現在地を取得しましたが、検索結果に座標登録済みの店舗がありません。",
                );
            },
            () => {
                setCurrentLocation(null);
                setLocationStatus("error");
                setLocationMessage(
                    "現在地を取得できませんでした。位置情報の許可設定を確認してください。",
                );
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        );
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-8">
            <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
                <p className="font-extrabold">判定結果は目安です</p>
                <p className="mt-1 leading-6">
                    調理環境によってはコンタミネーションの可能性があります。必要に応じて、ご利用前に店舗へ直接ご確認ください。
                </p>
            </section>

            <section className="rounded-2xl border border-green-100 bg-white p-4 shadow-sm sm:p-6">
                <h1 className="text-2xl font-black text-neutral-900">
                    エリア・キーワードから店舗を探す
                </h1>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                    例:
                    エリアに「栄」、キーワードに「居酒屋」。ClearAllergy登録済み店舗から検索します。
                </p>
                <form
                    onSubmit={submitSearch}
                    className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_180px_auto]"
                >
                    <input
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        placeholder="エリア・駅名"
                        className="rounded-xl border border-neutral-300 px-4 py-3"
                    />
                    <input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="店舗名・ジャンル・キーワード"
                        className="rounded-xl border border-neutral-300 px-4 py-3"
                    />
                    <select
                        value={prefecture}
                        onChange={(e) => {
                            setPrefecture(e.target.value);
                            setCity("");
                        }}
                        className="rounded-xl border border-neutral-300 px-3 py-3"
                    >
                        <option value="">すべての都道府県</option>
                        {PREFECTURES.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                    <select
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="rounded-xl border border-neutral-300 px-3 py-3"
                    >
                        <option value="">すべての市区町村</option>
                        {cityOptions.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                    <button
                        type="submit"
                        className="rounded-xl bg-[#13ec13] px-5 py-3 font-extrabold text-black"
                    >
                        検索
                    </button>
                </form>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={findFromCurrentLocation}
                        disabled={locationStatus === "loading"}
                        className="min-h-11 rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-extrabold text-green-900 disabled:cursor-wait disabled:opacity-60"
                    >
                        {locationStatus === "loading"
                            ? "現在地を取得中..."
                            : "現在地から探す"}
                    </button>
                    {currentLocation ? (
                        <button
                            type="button"
                            onClick={() => {
                                setCurrentLocation(null);
                                setLocationStatus("idle");
                                setLocationMessage("");
                            }}
                            className="min-h-11 px-2 text-sm font-bold text-neutral-600 underline"
                        >
                            現在地順を解除
                        </button>
                    ) : null}
                </div>
                {locationMessage ? (
                    <p
                        className={`mt-3 rounded-xl px-4 py-3 text-xs font-bold ${
                            locationStatus === "error"
                                ? "bg-amber-50 text-amber-900"
                                : "bg-green-50 text-green-900"
                        }`}
                    >
                        {locationMessage}
                    </p>
                ) : null}
                {allergens.length > 0 ? (
                    <div className="mt-4">
                        <UserAllergenPreferenceClient allergens={allergens} />
                    </div>
                ) : null}
                {hasExclusionPreference ? (
                    <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-xs font-bold text-green-900">
                        除外設定に一致するメニューしかない店舗は非表示になります
                        {includeMayContain
                            ? "（含む可能性ありも対象）"
                            : "（含む可能性ありは対象外）"}
                        。
                        {filtered.excludedCount > 0
                            ? `${filtered.excludedCount}件を非表示にしています。`
                            : ""}
                    </p>
                ) : null}
            </section>

            <section className="mt-6">
                <PublicShopMap
                    shops={visibleShops}
                    locationStatus={locationStatus}
                />
            </section>

            {!isDatabaseAvailable ? (
                <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    現在データベースに接続できないため、登録済み店舗を読み込めません。
                </p>
            ) : null}

            <section className="mt-8">
                <h2 className="text-xl font-black text-neutral-900">
                    条件に一致するClearAllergy登録済み店舗
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                    {filtered.exact.length}件
                </p>
                <div className="mt-4">
                    {filtered.exact.length ? (
                        <ShopCards
                            shops={filtered.exact}
                            currentLocation={currentLocation}
                        />
                    ) : (
                        <p className="rounded-xl border border-dashed p-5 text-sm text-neutral-600">
                            完全一致する登録済み店舗はありません。
                        </p>
                    )}
                </div>
            </section>

            {filtered.related.length > 0 ? (
                <section className="mt-10">
                    <h2 className="text-xl font-black text-neutral-900">
                        条件の一部に一致する店舗
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                        {filtered.related.length}件
                    </p>
                    <div className="mt-4">
                        <ShopCards
                            shops={filtered.related}
                            currentLocation={currentLocation}
                        />
                    </div>
                </section>
            ) : null}
        </main>
    );
}
