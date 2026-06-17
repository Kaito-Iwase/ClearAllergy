import "server-only";
import type { GooglePlaceCandidate } from "@/types/google-places";

type GooglePlaceResponse = {
    places?: unknown;
};

export function isGooglePlacesConfigured() {
    return Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim());
}

function normalizePlace(value: unknown): GooglePlaceCandidate | null {
    if (!value || typeof value !== "object") return null;
    const place = value as Record<string, unknown>;
    const displayName =
        place.displayName && typeof place.displayName === "object"
            ? (place.displayName as Record<string, unknown>).text
            : null;
    const location =
        place.location && typeof place.location === "object"
            ? (place.location as Record<string, unknown>)
            : null;

    if (
        typeof place.id !== "string" ||
        typeof displayName !== "string" ||
        typeof place.formattedAddress !== "string" ||
        typeof location?.latitude !== "number" ||
        typeof location.longitude !== "number"
    ) {
        return null;
    }

    let googleMapsUri: string | null = null;
    if (typeof place.googleMapsUri === "string") {
        try {
            const parsed = new URL(place.googleMapsUri);
            if (
                parsed.protocol === "https:" &&
                (parsed.hostname === "maps.google.com" ||
                    parsed.hostname.endsWith(".google.com"))
            ) {
                googleMapsUri = parsed.toString();
            }
        } catch {
            googleMapsUri = null;
        }
    }

    return {
        placeId: place.id,
        name: displayName,
        address: place.formattedAddress,
        latitude: location.latitude,
        longitude: location.longitude,
        primaryType:
            typeof place.primaryType === "string" ? place.primaryType : null,
        googleMapsUri,
    };
}

export async function searchGooglePlaces(
    query: string,
    options?: { limit?: number },
): Promise<GooglePlaceCandidate[]> {
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
    if (!apiKey) {
        return [];
    }

    const response = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask":
                    "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.googleMapsUri",
            },
            body: JSON.stringify({
                textQuery: query,
                languageCode: "ja",
                regionCode: "JP",
                pageSize: Math.min(Math.max(options?.limit ?? 10, 1), 10),
                includePureServiceAreaBusinesses: false,
            }),
            cache: "no-store",
        },
    );

    if (!response.ok) {
        throw new Error(`Google Places search failed: ${response.status}`);
    }

    const data = (await response.json()) as GooglePlaceResponse;
    if (!Array.isArray(data.places)) return [];
    return data.places.map(normalizePlace).filter((place) => place !== null);
}
