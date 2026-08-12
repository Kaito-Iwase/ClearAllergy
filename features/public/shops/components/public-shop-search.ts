import type { AllergenStatus } from "@/lib/allergens";
import { PREFECTURES } from "@/lib/constants/prefectures";

export type CurrentLocation = { latitude: number; longitude: number };

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

type ShopSearchResult = {
    exact: PublicShopListShop[];
    related: PublicShopListShop[];
    excludedCount: number;
};

function normalizeSearchText(value: string | null | undefined): string {
    return (value ?? "").toLocaleLowerCase("ja-JP");
}

function splitSearchTerms(value: string): string[] {
    return value.trim().split(/\s+/).filter(Boolean).map(normalizeSearchText);
}

export function getShopPrefecture(shop: PublicShopListShop): string | null {
    if (shop.prefecture?.trim()) {
        return shop.prefecture.trim();
    }

    return PREFECTURES.find((value) => shop.address?.includes(value)) ?? null;
}

export function getShopCity(shop: PublicShopListShop): string | null {
    if (shop.city?.trim()) {
        return shop.city.trim();
    }

    const address = shop.address?.trim();
    const prefecture = getShopPrefecture(shop);
    if (!address) {
        return null;
    }

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

function isMenuExcludedByPreference(
    menu: PublicShopListShop["menus"][number],
    excludedSlugs: string[],
    includeMayContain: boolean,
): boolean {
    if (excludedSlugs.length === 0) {
        return false;
    }

    const statusByExcludedSlug = new Map(
        menu.allergenLinks
            .filter((link) => excludedSlugs.includes(link.allergen.slug))
            .map((link) => [link.allergen.slug, link.status]),
    );

    return excludedSlugs.some((slug) => {
        const status = statusByExcludedSlug.get(slug);
        return (
            status === "CONTAINS" ||
            (includeMayContain && status === "MAY_CONTAIN")
        );
    });
}

function isShopExcludedByPreference(args: {
    shop: PublicShopListShop;
    excludedSlugs: string[];
    includeMayContain: boolean;
    loadedPreferences: boolean;
}): boolean {
    if (!args.loadedPreferences || args.excludedSlugs.length === 0) {
        return false;
    }

    // 選べるメニューが1件でも残る店舗を、店舗単位で誤って非表示にしないためです。
    return (
        args.shop.menus.length > 0 &&
        args.shop.menus.every((menu) =>
            isMenuExcludedByPreference(
                menu,
                args.excludedSlugs,
                args.includeMayContain,
            ),
        )
    );
}

export function getDistanceKm(
    first: CurrentLocation,
    second: CurrentLocation,
): number {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const latitudeDifference = toRadians(second.latitude - first.latitude);
    const longitudeDifference = toRadians(second.longitude - first.longitude);
    const firstLatitude = toRadians(first.latitude);
    const secondLatitude = toRadians(second.latitude);
    const haversineValue =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(firstLatitude) *
            Math.cos(secondLatitude) *
            Math.sin(longitudeDifference / 2) ** 2;

    return (
        earthRadiusKm *
        2 *
        Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue))
    );
}

function getShopDistance(
    shop: PublicShopListShop,
    currentLocation: CurrentLocation,
): number {
    if (shop.latitude === null || shop.longitude === null) {
        return Number.POSITIVE_INFINITY;
    }

    return getDistanceKm(currentLocation, {
        latitude: shop.latitude,
        longitude: shop.longitude,
    });
}

function sortShopsByDistance(
    shops: PublicShopListShop[],
    currentLocation: CurrentLocation | null,
): PublicShopListShop[] {
    if (!currentLocation) {
        return shops;
    }

    return [...shops].sort(
        (firstShop, secondShop) =>
            getShopDistance(firstShop, currentLocation) -
            getShopDistance(secondShop, currentLocation),
    );
}

export function getCityOptions(
    shops: PublicShopListShop[],
    selectedPrefecture: string,
): string[] {
    const cities = shops
        .filter(
            (shop) =>
                !selectedPrefecture ||
                getShopPrefecture(shop) === selectedPrefecture,
        )
        .map(getShopCity)
        .filter((city): city is string => Boolean(city));

    return Array.from(new Set(cities)).sort();
}

export function filterAndRankShops(args: {
    shops: PublicShopListShop[];
    area: string;
    keyword: string;
    prefecture: string;
    city: string;
    excludedSlugs: string[];
    includeMayContain: boolean;
    loadedPreferences: boolean;
    currentLocation: CurrentLocation | null;
}): ShopSearchResult {
    const areaTerms = splitSearchTerms(args.area);
    const keywordTerms = splitSearchTerms(args.keyword);
    const searchTermCount = areaTerms.length + keywordTerms.length;

    const candidates = args.shops
        .filter(
            (shop) =>
                !args.prefecture ||
                getShopPrefecture(shop) === args.prefecture,
        )
        .filter((shop) => !args.city || getShopCity(shop) === args.city)
        .map((shop) => {
            const areaSearchText = [
                shop.address,
                shop.prefecture,
                getShopPrefecture(shop),
                getShopCity(shop),
                shop.city,
                shop.nearestStation,
            ]
                .map(normalizeSearchText)
                .join(" ");
            const keywordSearchText = [
                shop.name,
                shop.description,
                shop.category,
            ]
                .map(normalizeSearchText)
                .join(" ");
            const matchedTermCount =
                areaTerms.filter((term) => areaSearchText.includes(term))
                    .length +
                keywordTerms.filter((term) =>
                    keywordSearchText.includes(term),
                ).length;

            return {
                shop,
                matchedTermCount,
                matchesAllTerms:
                    searchTermCount === 0 ||
                    matchedTermCount === searchTermCount,
            };
        })
        .filter(
            (candidate) =>
                searchTermCount === 0 || candidate.matchedTermCount > 0,
        );

    const visibleCandidates = candidates.filter(
        (candidate) =>
            !isShopExcludedByPreference({
                shop: candidate.shop,
                excludedSlugs: args.excludedSlugs,
                includeMayContain: args.includeMayContain,
                loadedPreferences: args.loadedPreferences,
            }),
    );

    const exactMatches = visibleCandidates
        .filter((candidate) => candidate.matchesAllTerms)
        .map((candidate) => candidate.shop);
    const relatedMatches = visibleCandidates
        .filter((candidate) => !candidate.matchesAllTerms)
        .sort(
            (firstCandidate, secondCandidate) =>
                secondCandidate.matchedTermCount -
                firstCandidate.matchedTermCount,
        )
        .map((candidate) => candidate.shop);

    return {
        exact: sortShopsByDistance(exactMatches, args.currentLocation),
        related: sortShopsByDistance(relatedMatches, args.currentLocation),
        excludedCount: candidates.length - visibleCandidates.length,
    };
}
