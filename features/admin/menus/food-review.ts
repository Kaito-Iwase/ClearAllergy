import { ALLERGEN_STATUS_VALUES, type AllergenStatus } from "@/lib/allergens";

type FoodContent = { name: string; description?: string | null; category?: string | null; ingredients?: string | null; precaution?: string | null; imageUrl?: string | null };
const nullable = (value: string | null | undefined) => value?.trim() || null;

// 食品・対象識別に関わる内容。価格と画像の構図は含めない。
export function foodSnapshot<T extends FoodContent>(content: T, allergens: Array<{ slug: string; nameJa: string }>, statuses: Record<string, AllergenStatus>) {
    return {
        name: content.name.trim(), description: nullable(content.description), category: nullable(content.category),
        ingredients: nullable(content.ingredients), precaution: nullable(content.precaution), imageUrl: nullable(content.imageUrl),
        allergens: [...allergens].sort((a, b) => a.slug.localeCompare(b.slug)).map(({ slug, nameJa }) => ({
            slug, nameJa, status: ALLERGEN_STATUS_VALUES.includes(statuses[slug]) ? statuses[slug] : "UNKNOWN" as const,
        })),
    };
}
export function foodContentChanged(before: ReturnType<typeof foodSnapshot>, after: ReturnType<typeof foodSnapshot>) {
    return JSON.stringify(before) !== JSON.stringify(after);
}
export { isFoodReviewCurrent } from "@/lib/allergens";

export type FoodReviewDraft = { evidenceRefs: string; scope: string; checkedAt: string; unresolvedIssues: string };
export type FoodReviewSummary = Omit<FoodReviewDraft, "unresolvedIssues"> & { unresolvedIssues: string | null; id: string; foodVersion: number; recordedAt: string; contentSnapshot: unknown; issueResolutions?: Array<{ foodVersion: number; resolvedAt: string }> };
export const emptyFoodReviewDraft = (): FoodReviewDraft => ({ evidenceRefs: "", scope: "", checkedAt: "", unresolvedIssues: "" });
export function isFoodReviewTimeValid(checkedAt: string, now = Date.now()) {
    const time = Date.parse(checkedAt);
    return Number.isFinite(time) && time <= now + 5 * 60_000;
}
export function foodReviewDraftComplete(review: FoodReviewDraft, now = Date.now()) {
    return Boolean(review.evidenceRefs.trim() && review.scope.trim() && isFoodReviewTimeValid(review.checkedAt, now) && !review.unresolvedIssues.trim());
}

// Resolution is specific to both this review and the saved food version.
export function hasUnresolvedFoodIssue(foodVersion: number, latest: {
    unresolvedIssues: string | null;
    issueResolutions?: ReadonlyArray<{ foodVersion: number }>;
} | undefined) {
    return Boolean(latest?.unresolvedIssues?.trim()) && !latest?.issueResolutions?.some(resolution => resolution.foodVersion === foodVersion);
}
