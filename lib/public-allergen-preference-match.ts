import type { AllergenStatus } from "@/lib/allergens";

export type AllergenPreferenceMatch = { slug: string; source: "CONTAINS" | "MAY_CONTAIN" | "STORE_HANDLED" };

// Apply display settings without changing ingredient registrations. The supplement
// must come from the current, publishable public menus before user filtering.
export function getAllergenPreferenceMatches(args: {
    statusBySlug: Readonly<Record<string, AllergenStatus>>;
    slugs: readonly string[];
    includeMayContain: boolean;
    storeHandledAllergenSlugs: readonly string[];
}): AllergenPreferenceMatch[] {
    return [...new Set(args.slugs)].flatMap((slug): AllergenPreferenceMatch[] => {
        const status = args.statusBySlug[slug] ?? "UNKNOWN";
        if (status === "CONTAINS") return [{ slug, source: "CONTAINS" }];
        if (!args.includeMayContain) return [];
        if (status === "MAY_CONTAIN") return [{ slug, source: "MAY_CONTAIN" }];
        if (status === "FREE" && args.storeHandledAllergenSlugs.includes(slug)) return [{ slug, source: "STORE_HANDLED" }];
        return [];
    });
}
