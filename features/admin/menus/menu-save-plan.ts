import { getMenuPublishValidationErrors, type AllergenStatus } from "@/lib/allergens";

export function getMenuSavePlan(input: {
    name: string;
    allergens: Array<{ slug: string; nameJa: string }>;
    statusBySlug: Record<string, AllergenStatus>;
    requestedIsPublished: boolean;
    foodChanged: boolean;
    publicationCurrent: boolean;
    unresolved: boolean;
}) {
    const publishErrors = getMenuPublishValidationErrors(input);
    const canPublish = publishErrors.length === 0 && !input.foodChanged && !input.unresolved;
    return {
        canPublish, willPublish: input.requestedIsPublished && input.publicationCurrent && canPublish,
        publishErrors,
        publicationState: input.unresolved ? "unresolved" : input.foodChanged ? "changed" : input.publicationCurrent ? "current" : "required",
    } as const;
}
