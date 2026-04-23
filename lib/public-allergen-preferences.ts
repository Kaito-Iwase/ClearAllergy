// このファイルは公開画面向けの「端末内アレルゲン設定」を扱います。
// ログイン不要で localStorage に保存し、メニュー一覧や詳細の警告表示に使います。
// Server Component では localStorage を触れないため、Client Component から呼ばれます。

export const USER_ALLERGEN_STORAGE_KEY = "clearallergy:user-allergens";
export const USER_ALLERGENS_UPDATED_EVENT =
    "clearallergy:user-allergens-updated";

export type UserAllergenPreferences = {
    highlightSlugs: string[];
    excludedSlugs: string[];
    includeMayContain: boolean;
    // 旧形式との互換用。新規保存では highlightSlugs / excludedSlugs を使います。
    selectedSlugs: string[];
};

// localStorage の値は壊れている可能性もあるため、
// string 配列だけを残し、重複も消して安全な形へ整えます。
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
        return {
            highlightSlugs: [],
            excludedSlugs: [],
            includeMayContain: true,
            selectedSlugs: [],
        };
    }

    try {
        const raw = window.localStorage.getItem(USER_ALLERGEN_STORAGE_KEY);

        if (!raw) {
            return {
                highlightSlugs: [],
                excludedSlugs: [],
                includeMayContain: true,
                selectedSlugs: [],
            };
        }

        const parsed = JSON.parse(raw) as Partial<UserAllergenPreferences>;
        const legacySelectedSlugs = normalizeSlugs(parsed.selectedSlugs);
        const highlightSlugs = normalizeSlugs(parsed.highlightSlugs);
        const excludedSlugs = normalizeSlugs(parsed.excludedSlugs);
        const normalizedHighlightSlugs =
            highlightSlugs.length > 0 || excludedSlugs.length > 0
                ? highlightSlugs
                : legacySelectedSlugs;

        return {
            highlightSlugs: normalizedHighlightSlugs,
            excludedSlugs,
            includeMayContain: parsed.includeMayContain !== false,
            selectedSlugs: [
                ...new Set([...normalizedHighlightSlugs, ...excludedSlugs]),
            ],
        };
    } catch {
        return {
            highlightSlugs: [],
            excludedSlugs: [],
            includeMayContain: true,
            selectedSlugs: [],
        };
    }
}

export function saveUserAllergenPreferences(
    preferences: UserAllergenPreferences,
): void {
    if (typeof window === "undefined") {
        return;
    }

    const normalized: UserAllergenPreferences = {
        highlightSlugs: normalizeSlugs(preferences.highlightSlugs),
        excludedSlugs: normalizeSlugs(preferences.excludedSlugs),
        includeMayContain: preferences.includeMayContain !== false,
        selectedSlugs: [
            ...new Set([
                ...normalizeSlugs(preferences.highlightSlugs),
                ...normalizeSlugs(preferences.excludedSlugs),
            ]),
        ],
    };

    window.localStorage.setItem(
        USER_ALLERGEN_STORAGE_KEY,
        JSON.stringify(normalized),
    );
}

export function clearUserAllergenPreferences(): void {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.removeItem(USER_ALLERGEN_STORAGE_KEY);
}
