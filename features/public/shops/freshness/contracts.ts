import { z } from "zod";
import {
    ALLERGEN_EFFECTIVE_RISK_VALUES,
    ALLERGEN_STATUS_VALUES,
} from "@/lib/allergens";

const text = z.string();
const nullableText = text.nullable();
const nullableNumber = z.number().nullable();
const isoDateTime = z.string().datetime();
const status = z.enum(ALLERGEN_STATUS_VALUES);
const allergen = z.object({ slug: text, nameJa: text }).strict();
const allergenLink = z.object({
    status,
    allergen: z.object({ slug: text }).strict(),
}).strict();

// Only public view props belong here. DB ownership, review records and version
// metadata stay in the server loaders and never enter the refresh response.
export const publicTargetSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("list") }).strict(),
    z.object({ kind: z.literal("shop"), shopId: text.min(1) }).strict(),
    z.object({
        kind: z.literal("menu"), shopId: text.min(1), menuId: text.min(1),
    }).strict(),
]);
export type PublicTarget = z.infer<typeof publicTargetSchema>;

export function targetKey(target: PublicTarget): string {
    if (target.kind === "list") return "/shops";
    const shop = `/shops/${encodeURIComponent(target.shopId)}`;
    return target.kind === "shop" ? shop : `${shop}/menus/${encodeURIComponent(target.menuId)}`;
}

export const publicShopListDataSchema = z.object({
    initialShops: z.array(z.object({
        id: text,
        name: text,
        description: nullableText,
        address: nullableText,
        prefecture: nullableText,
        city: nullableText,
        nearestStation: nullableText,
        category: nullableText,
        latitude: nullableNumber,
        longitude: nullableNumber,
        googlePlaceId: nullableText,
        averageBudgetYen: nullableNumber,
        updatedAt: isoDateTime,
        menus: z.array(z.object({
            name: text,
            priceYen: nullableNumber,
            allergenLinks: z.array(allergenLink),
        }).strict()),
        _count: z.object({ menus: z.number().int().nonnegative() }).strict(),
    }).strict()),
    allergens: z.array(allergen),
    isDatabaseAvailable: z.literal(true),
}).strict();
export type PublicShopListData = z.infer<typeof publicShopListDataSchema>;

export const publicShopDetailDataSchema = z.object({
    shop: z.object({
        id: text,
        name: text,
        description: nullableText,
        address: nullableText,
        nearestStation: nullableText,
        category: nullableText,
        hours: nullableText,
        regularHoliday: nullableText,
        phoneNumber: nullableText,
        note: nullableText,
        averageBudgetYen: nullableNumber,
        updatedAt: isoDateTime,
        coverImageFit: nullableText,
        coverImageZoom: nullableNumber,
        coverImagePositionX: nullableNumber,
        coverImagePositionY: nullableNumber,
    }).strict(),
    safeCoverImageUrl: nullableText,
    menusForClient: z.array(z.object({
        id: text,
        name: text,
        description: nullableText,
        priceYen: nullableNumber,
        category: nullableText,
        precaution: nullableText,
        updatedAt: isoDateTime,
        allergenLinks: z.array(allergenLink),
    }).strict()),
    allergenMaster: z.array(allergen.extend({ sortOrder: z.number() }).strict()),
    storeHandledAllergenSlugs: z.array(text),
}).strict();
export type PublicShopDetailData = z.infer<typeof publicShopDetailDataSchema>;

// App-only representation. The default v1 JSON response stays strict.
export const SHOP_VIEW_MEDIA_TYPE = "application/vnd.clearallergy.shop-view+json";
export const publicMenuImageSchema = z.object({
    updatedAt: isoDateTime,
    safeImageUrl: text,
    imageFrame: nullableText,
    imageFit: nullableText,
    imageZoom: nullableNumber,
    imagePositionX: nullableNumber,
    imagePositionY: nullableNumber,
}).strict();
export type PublicMenuImages = Record<string, z.infer<typeof publicMenuImageSchema>>;

export const publicMenuDetailDataSchema = z.object({
    shopId: text,
    shopName: text,
    menuName: text,
    description: nullableText,
    category: nullableText,
    priceText: text,
    updatedAtText: text,
    safeImageUrl: nullableText,
    imageFrame: nullableText,
    imageFit: nullableText,
    imagePosition: nullableText,
    imageZoom: nullableNumber,
    imagePositionX: nullableNumber,
    imagePositionY: nullableNumber,
    ingredients: nullableText,
    precaution: nullableText,
    allergensForClient: z.array(allergen),
    statusBySlugForClient: z.record(text, status),
    rows: z.array(z.object({
        slug: text,
        nameJa: text,
        status,
        storeHandlesAllergen: z.boolean(),
        effectiveRisk: z.enum(ALLERGEN_EFFECTIVE_RISK_VALUES),
    }).strict()),
    storeHandledAllergenSlugs: z.array(text),
}).strict();
export type PublicMenuDetailData = z.infer<typeof publicMenuDetailDataSchema>;

export const publicResultSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("list"), data: publicShopListDataSchema }).strict(),
    z.object({ kind: z.literal("shop"), data: publicShopDetailDataSchema }).strict(),
    z.object({ kind: z.literal("menu"), data: publicMenuDetailDataSchema }).strict(),
    z.object({ kind: z.literal("not-found") }).strict(),
    z.object({ kind: z.literal("unavailable") }).strict(),
]);
export type PublicResult = z.infer<typeof publicResultSchema>;

export const publicSnapshotSchema = z.object({
    version: z.literal(1),
    targetKey: text,
    requestId: text.uuid(),
    // Request start is transport metadata, not a food-review or safety time.
    startedAt: isoDateTime,
    result: publicResultSchema,
}).strict();
export type PublicSnapshot = z.infer<typeof publicSnapshotSchema>;
export const shopViewSnapshotSchema = publicSnapshotSchema.extend({ menuImages: z.unknown().optional() });
export type PublicViewSnapshot = PublicSnapshot & { menuImages?: PublicMenuImages };
