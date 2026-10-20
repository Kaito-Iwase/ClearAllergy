import { getMenuPublishValidationErrors, type AllergenStatus } from "@/lib/allergens";
import { foodReviewDraftComplete, isFoodReviewTimeValid, type FoodReviewDraft } from "./food-review";

export function getMenuSavePlan(input: {
    name: string;
    allergens: Array<{ slug: string; nameJa: string }>;
    statusBySlug: Record<string, AllergenStatus>;
    requestedIsPublished: boolean;
    foodChanged: boolean;
    reviewCurrent: boolean;
    recordingReview: boolean;
    foodReview: FoodReviewDraft;
}, now = Date.now()) {
    const publishErrors = getMenuPublishValidationErrors(input);
    const reviewInputInvalid = input.recordingReview && (!input.foodReview.evidenceRefs.trim() ||
        !input.foodReview.scope.trim() || !isFoodReviewTimeValid(input.foodReview.checkedAt, now));
    const reviewReady = input.recordingReview
        ? foodReviewDraftComplete(input.foodReview, now)
        : input.reviewCurrent && !input.foodChanged;
    const canPublish = publishErrors.length === 0 && reviewReady;
    const foodReviewState = input.recordingReview
        ? reviewInputInvalid ? "incomplete" : input.foodReview.unresolvedIssues.trim() ? "unresolved" : "recording"
        : input.foodChanged ? "changed" : input.reviewCurrent ? "current" : "required";
    return {
        canPublish, willPublish: input.requestedIsPublished && canPublish,
        reviewInputInvalid, publishErrors, foodReviewState,
    } as const;
}
