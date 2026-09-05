import { z } from "zod";
import { ALLERGEN_STATUS_VALUES } from "@/lib/allergens";
import {
    MENU_IMAGE_FIT_VALUES, MENU_IMAGE_FRAME_VALUES, MENU_IMAGE_POSITION_VALUES,
} from "@/lib/utils/menu-image-display";

export const MENU_TEXT_LIMITS = {
    name: 120, description: 2000, category: 120, ingredients: 5000, precaution: 2000,
} as const;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalNumber = z.union([z.number().finite(), z.string().max(32)]).nullable().optional();

// 省略は既存の下書き・部分更新の契約を維持し、指定された値の型不正は拒否します。
export const menuInputSchema = z.object({
    name: z.string().trim().min(1, "メニュー名は必須です。").max(MENU_TEXT_LIMITS.name).optional(),
    description: optionalText(MENU_TEXT_LIMITS.description),
    category: optionalText(MENU_TEXT_LIMITS.category),
    ingredients: optionalText(MENU_TEXT_LIMITS.ingredients),
    precaution: optionalText(MENU_TEXT_LIMITS.precaution),
    priceYen: optionalNumber,
    isPublished: z.boolean().optional(),
    imageUrl: optionalText(2048),
    imageFrame: z.enum(MENU_IMAGE_FRAME_VALUES).optional(),
    imageFit: z.enum(MENU_IMAGE_FIT_VALUES).optional(),
    imagePosition: z.enum(MENU_IMAGE_POSITION_VALUES).optional(),
    imageZoom: z.number().int().min(50).max(250).optional(),
    imagePositionX: z.number().int().min(0).max(100).optional(),
    imagePositionY: z.number().int().min(0).max(100).optional(),
    allergenStatusBySlug: z.record(z.string(), z.enum(ALLERGEN_STATUS_VALUES)).optional(),
});
