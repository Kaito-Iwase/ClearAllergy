import { z } from "zod";

const text = z.string().nullable();

// 保存済み基準へ取り込む項目は、すべて応答で確認してから使用します。
export const shopResponseSchema = z.object({
    shop: z.object({
        id: z.string().min(1), name: z.string().min(1),
        description: text, address: text, prefecture: text, city: text,
        nearestStation: text, category: text, googlePlaceId: text,
        hours: text, regularHoliday: text, phoneNumber: text, note: text,
        latitude: z.number().finite().min(-90).max(90).nullable(),
        longitude: z.number().finite().min(-180).max(180).nullable(),
        averageBudgetYen: z.number().int().nonnegative().nullable(),
        coverImageUrl: z.string().max(2048).nullable(),
        coverImageFrame: z.enum(["square", "wide"]),
        coverImageFit: z.enum(["cover", "contain"]),
        coverImagePosition: z.enum(["center", "top", "bottom", "left", "right"]),
        coverImageZoom: z.number().int().min(50).max(250),
        coverImagePositionX: z.number().int().min(0).max(100),
        coverImagePositionY: z.number().int().min(0).max(100),
        updatedAt: z.string().datetime({ offset: true }),
    }),
    publicRefreshPending: z.boolean().optional(),
});

export function parseShopSaveResponse(value: unknown, shopId: string, expectedUpdatedAt: string) {
    const result = shopResponseSchema.safeParse(value);
    if (!result.success || result.data.shop.id !== shopId
        || !(Date.parse(result.data.shop.updatedAt) > Date.parse(expectedUpdatedAt))) return null;
    return result.data;
}
