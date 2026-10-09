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
export type FoodReviewSummary = Omit<FoodReviewDraft, "unresolvedIssues"> & { unresolvedIssues: string | null; id: string; foodVersion: number; recordedAt: string; contentSnapshot: unknown };
export const emptyFoodReviewDraft = (): FoodReviewDraft => ({ evidenceRefs: "", scope: "", checkedAt: "", unresolvedIssues: "" });
export function foodReviewDraftComplete(review: FoodReviewDraft) {
    const time = Date.parse(review.checkedAt);
    return Boolean(review.evidenceRefs.trim() && review.scope.trim() && Number.isFinite(time) && !review.unresolvedIssues.trim());
}
