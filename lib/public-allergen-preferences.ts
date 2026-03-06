// lib/public-allergen-preferences.ts

export const USER_ALLERGEN_STORAGE_KEY = "clearallergy:user-allergens";

export type UserAllergenPreferences = {
    selectedSlugs: string[];
};

function normalizeSlugs(values: unknown): string[] {
    if (!Array.isArray(values)) {
        return [];
    }

    return Array.from(
        new Set(
            values.filter(
                (value): value is string => typeof value === "string",
            ),
        ),
    );
}

export function loadUserAllergenPreferences(): UserAllergenPreferences {
    if (typeof window === "undefined") {
        return { selectedSlugs: [] };
    }

    try {
        const raw = window.localStorage.getItem(USER_ALLERGEN_STORAGE_KEY);
        if (!raw) {
            return { selectedSlugs: [] };
        }

        const parsed = JSON.parse(raw) as Partial<UserAllergenPreferences>;

        return {
            selectedSlugs: normalizeSlugs(parsed.selectedSlugs),
        };
    } catch {
        return { selectedSlugs: [] };
    }
}

export function saveUserAllergenPreferences(
    preferences: UserAllergenPreferences,
) {
    if (typeof window === "undefined") {
        return;
    }

    const normalized: UserAllergenPreferences = {
        selectedSlugs: normalizeSlugs(preferences.selectedSlugs),
    };

    window.localStorage.setItem(
        USER_ALLERGEN_STORAGE_KEY,
        JSON.stringify(normalized),
    );
}

export function clearUserAllergenPreferences() {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.removeItem(USER_ALLERGEN_STORAGE_KEY);
}
