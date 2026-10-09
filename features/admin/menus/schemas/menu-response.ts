import { z } from "zod";

const revision = z.number().int().nonnegative().max(2147483647);
const reviewSummary = z.object({
    id: z.string().min(1), foodVersion: revision,
    evidenceRefs: z.string().min(1).max(4000), scope: z.string().min(1).max(2000),
    checkedAt: z.string().datetime({ offset: true }), recordedAt: z.string().datetime({ offset: true }),
    unresolvedIssues: z.string().max(2000).nullable(), contentSnapshot: z.unknown(),
});

export const menuCreateResponseSchema = z.object({
    id: z.string().cuid(), publicRefreshPending: z.boolean().optional(),
});

// Validate everything used to replace local state before marking it saved.
export const menuSaveResponseSchema = z.object({
    menu: z.object({
        id: z.string().min(1), version: revision, foodVersion: revision,
        reviewedFoodVersion: revision.nullable(), isPublished: z.boolean(),
        imageUrl: z.string().max(2048).nullable(), foodReviews: z.array(reviewSummary).max(5),
    }),
    publicRefreshPending: z.boolean().optional(),
}).refine(({ menu }) => !menu.isPublished || menu.foodVersion === menu.reviewedFoodVersion);
