import type { AllergenStatus } from "@/lib/allergens";
import type { UserAllergenPreferences } from "@/lib/public-allergen-preferences";
import { getAllergenPreferenceMatches, type AllergenPreferenceMatch } from "@/lib/public-allergen-preference-match";

export default function AllergenPreferenceMatchNotice({ allergens, statusBySlug, storeHandledAllergenSlugs, preferences, showExcluded = false }: {
    allergens: Array<{ slug: string; nameJa: string }>;
    statusBySlug: Record<string, AllergenStatus>;
    storeHandledAllergenSlugs: string[];
    preferences: Pick<UserAllergenPreferences, "highlightSlugs" | "excludedSlugs" | "includeMayContain">;
    showExcluded?: boolean;
}) {
    const match = (slugs: string[]) => getAllergenPreferenceMatches({ statusBySlug, slugs,
        includeMayContain: preferences.includeMayContain, storeHandledAllergenSlugs });
    const highlighted = match(preferences.highlightSlugs);
    const excluded = showExcluded ? match(preferences.excludedSlugs) : [];
    const description = (matches: AllergenPreferenceMatch[]) => allergens.flatMap(allergen => {
        const item = matches.find(value => value.slug === allergen.slug);
        if (!item) return [];
        const label = item.source === "CONTAINS" ? "含む" : item.source === "MAY_CONTAIN" ? "含む可能性あり・要確認" : "別メニューに含む";
        return [`${allergen.nameJa}（${label}）`];
    }).join("・");
    return <>
        {excluded.length > 0 && <section aria-label="一覧の除外設定に一致" className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-bold">このメニューは現在の除外設定に一致しています</p>
            <p className="mt-1 break-words leading-6">{description(excluded)}</p>
            <p className="mt-1 leading-6">一覧では非表示です。直接開いたページでは登録情報を表示しています。</p>
        </section>}
        {highlighted.length > 0 && <section aria-label="注目設定に一致" className="mb-3 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-bold">注目設定に一致</p>
            <p className="mt-1 break-words font-semibold leading-6">{description(highlighted)}</p>
        </section>}
    </>;
}
