// 公開側の端末内設定。保存に成功した状態だけを全コンポーネントで共有します。
import { ALLERGEN_MASTER } from "@/lib/constants/allergen-master";

export const USER_ALLERGEN_STORAGE_KEY = "clearallergy:user-allergens";
export const USER_ALLERGENS_UPDATED_EVENT = "clearallergy:user-allergens-updated";

export type UserAllergenPreferences = {
    highlightSlugs: string[];
    excludedSlugs: string[];
    includeMayContain: boolean;
    selectedSlugs: string[];
};

const knownSlugs = new Set<string>(ALLERGEN_MASTER.map(({ slug }) => slug));
const emptyPreferences: UserAllergenPreferences = {
    highlightSlugs: [], excludedSlugs: [], includeMayContain: false, selectedSlugs: [],
};
export const SERVER_PREFERENCE_SNAPSHOT = {
    loaded: false, preferences: emptyPreferences, storageError: "",
};
let cachedReadable = false;
let cachedRaw: string | null | undefined;
let cachedSnapshot = SERVER_PREFERENCE_SNAPSHOT;

function normalizeSlugs(values: unknown): string[] {
    return Array.isArray(values)
        ? [...new Set(values.filter((value): value is string =>
            typeof value === "string" && knownSlugs.has(value)))]
        : [];
}

export function normalizeUserAllergenPreferences(value: unknown): UserAllergenPreferences {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ...emptyPreferences };
    }
    const parsed = value as Record<string, unknown>;
    const excludedSlugs = normalizeSlugs(parsed.excludedSlugs);
    // 新形式で空にした設定を旧 selectedSlugs から復活させないよう、キーの有無で判定します。
    const highlights = normalizeSlugs(
        "highlightSlugs" in parsed || "excludedSlugs" in parsed
            ? parsed.highlightSlugs : parsed.selectedSlugs,
    );
    const highlightSlugs = highlights.filter((slug) => !excludedSlugs.includes(slug));
    return {
        highlightSlugs, excludedSlugs,
        includeMayContain: parsed.includeMayContain === true,
        selectedSlugs: [...new Set([...highlightSlugs, ...excludedSlugs])],
    };
}

export function getUserAllergenPreferenceSnapshot() {
    if (typeof window === "undefined") return SERVER_PREFERENCE_SNAPSHOT;
    try {
        const raw = window.localStorage.getItem(USER_ALLERGEN_STORAGE_KEY);
        if (!cachedReadable || raw !== cachedRaw) {
            let preferences = emptyPreferences;
            let storageError = "";
            if (raw !== null) {
                try {
                    preferences = normalizeUserAllergenPreferences(JSON.parse(raw));
                } catch {
                    storageError = "保存済み設定を読み込めません。設定を選び直してください。";
                }
            }
            cachedReadable = true;
            cachedRaw = raw;
            cachedSnapshot = { loaded: true, preferences, storageError };
        }
    } catch {
        cachedReadable = false;
        const storageError = "ブラウザ内の設定を読み書きできません。保存済みの設定を確認できないため、一覧・詳細で各項目を確認してください。";
        if (!cachedSnapshot.loaded || cachedSnapshot.storageError !== storageError) {
            cachedSnapshot = { loaded: true, preferences: emptyPreferences, storageError };
        }
    }
    return cachedSnapshot;
}

export function loadUserAllergenPreferences(): UserAllergenPreferences {
    return getUserAllergenPreferenceSnapshot().preferences;
}

export function subscribeUserAllergenPreferences(onChange: () => void) {
    window.addEventListener("storage", onChange);
    window.addEventListener("focus", onChange);
    window.addEventListener(USER_ALLERGENS_UPDATED_EVENT, onChange);
    return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener("focus", onChange);
        window.removeEventListener(USER_ALLERGENS_UPDATED_EVENT, onChange);
    };
}

export type PreferenceWriteResult = { ok: true } | { ok: false; message: string };

function writePreferences(preferences: UserAllergenPreferences | null): PreferenceWriteResult {
    if (typeof window === "undefined") return { ok: false, message: "ブラウザで設定してください。" };
    try {
        if (preferences === null) window.localStorage.removeItem(USER_ALLERGEN_STORAGE_KEY);
        else window.localStorage.setItem(USER_ALLERGEN_STORAGE_KEY,
            JSON.stringify(normalizeUserAllergenPreferences(preferences)));
        window.dispatchEvent(new Event(USER_ALLERGENS_UPDATED_EVENT));
        return { ok: true };
    } catch {
        return { ok: false, message: "設定を保存できませんでした。変更は適用されていません。ブラウザの保存設定を確認してください。" };
    }
}

export function saveUserAllergenPreferences(preferences: UserAllergenPreferences): PreferenceWriteResult {
    return writePreferences(preferences);
}

export function clearUserAllergenPreferences(): PreferenceWriteResult {
    return writePreferences(null);
}

// 強調と除外は表示方法の設定であり、確認対象から注意情報を落とす理由にしない。
export function getSelectedAllergenSlugs(preferences: Pick<UserAllergenPreferences, "highlightSlugs" | "excludedSlugs">) {
    return [...new Set([...preferences.highlightSlugs, ...preferences.excludedSlugs])];
}
