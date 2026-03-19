// lib/public-allergen-preferences.ts

export const USER_ALLERGEN_STORAGE_KEY = "clearallergy:user-allergens";
export const USER_ALLERGENS_UPDATED_EVENT =
    "clearallergy:user-allergens-updated";

export type UserAllergenPreferences = {
    selectedSlugs: string[];
};

/**
 * 配列が string[] かどうかをざっくり安全に整える
 * - 配列でなければ []
 * - string 以外は捨てる
 * - 重複は消す
 */
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

/**
 * localStorage から設定を読む
 * - ブラウザ以外では空を返す
 * - JSONが壊れていても空を返す
 */
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

/**
 * localStorage に設定を保存する
 * - string[] に正規化してから保存
 */
export function saveUserAllergenPreferences(
    preferences: UserAllergenPreferences,
): void {
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

/**
 * 保存済み設定を削除する
 */
export function clearUserAllergenPreferences(): void {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.removeItem(USER_ALLERGEN_STORAGE_KEY);
}
