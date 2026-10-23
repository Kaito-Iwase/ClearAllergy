import { z } from "zod";

const revision = z.number().int().nonnegative().max(2147483647);
const reviewSummary = z.object({
    id: z.string().min(1), foodVersion: revision,
    evidenceRefs: z.string().min(1).max(4000), scope: z.string().min(1).max(2000),
    checkedAt: z.string().datetime({ offset: true }), recordedAt: z.string().datetime({ offset: true }),
    unresolvedIssues: z.string().max(2000).nullable(), contentSnapshot: z.unknown(),
    issueResolutions: z.array(z.object({ foodVersion: revision, resolvedAt: z.string().datetime({ offset: true }) })).max(1).optional(),
});

export const menuCreateResponseSchema = z.object({
    id: z.string().cuid(), publicRefreshPending: z.boolean().optional(),
});

// Validate everything used to replace local state before marking it saved.
export const menuSaveResponseSchema = z.object({
    menu: z.object({
        id: z.string().min(1), version: revision, foodVersion: revision,
        reviewedFoodVersion: revision.nullable(), publicationConfirmedFoodVersion: revision.nullable(), isPublished: z.boolean(),
        imageUrl: z.string().max(2048).nullable(), foodReviews: z.array(reviewSummary).max(5),
    }),
    publicRefreshPending: z.boolean().optional(),
}).refine(({ menu }) => !menu.isPublished || menu.foodVersion === menu.publicationConfirmedFoodVersion);

// Owner-only GET: confirmation uses current persisted values, never a draft or old review.
export const savedMenuResponseSchema = z.object({
    menu: z.object({
        id: z.string().min(1), name: z.string().min(1).max(120),
        description: z.string().max(2000).nullable(), priceYen: revision.nullable(),
        category: z.string().max(120).nullable(), ingredients: z.string().max(5000).nullable(),
        precaution: z.string().max(2000).nullable(), imageUrl: z.string().max(2048).nullable(),
        imageFrame: z.enum(["square", "wide"]), imageFit: z.enum(["cover", "contain"]),
        imagePosition: z.enum(["center", "top", "bottom", "left", "right"]),
        imageZoom: z.number().min(50).max(250), imagePositionX: z.number().min(0).max(100), imagePositionY: z.number().min(0).max(100),
        version: revision, foodVersion: revision, reviewedFoodVersion: revision.nullable(),
        publicationConfirmedFoodVersion: revision.nullable(), isPublished: z.boolean(),
        foodReviews: z.array(reviewSummary).max(5),
        allergens: z.array(z.object({
            slug: z.string().min(1), nameJa: z.string().min(1), nameEn: z.string().nullable(),
            sortOrder: z.number().int(), status: z.enum(["UNKNOWN", "CONTAINS", "FREE", "MAY_CONTAIN"]),
        })).min(1),
    }),
}).refine(({ menu }) => new Set(menu.allergens.map(a => a.slug)).size === menu.allergens.length)
    .refine(({ menu }) => !menu.isPublished || menu.foodVersion === menu.publicationConfirmedFoodVersion);

export type SavedMenu = z.infer<typeof savedMenuResponseSchema>["menu"];
