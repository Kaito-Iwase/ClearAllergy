import { z } from "zod";
import { normalizeEmail } from "@/lib/email";

const normalizedEmailSchema = z
    .string()
    .trim()
    .max(320, "メールアドレスが長すぎます。")
    .email("メールアドレスの形式が正しくありません。")
    .transform((value) => normalizeEmail(value))
    .refine((value) => value.length > 0, {
        message: "メールアドレスは必須です。",
    });

const optionalShopIdSchema = z
    .string()
    .trim()
    .min(1)
    .max(128, "店舗IDが長すぎます。")
    .optional();

const optionalShopNameSchema = z
    .string()
    .trim()
    .min(1, "店舗名は必須です。")
    .max(120, "店舗名が長すぎます。")
    .optional();

export const adminInviteCreateSchema = z
    .object({
        email: normalizedEmailSchema,
        shopId: optionalShopIdSchema,
        shopName: optionalShopNameSchema,
        expiresInDays: z
            .number()
            .int()
            .min(1)
            .max(90)
            .optional()
            .default(30),
    })
    .refine((value) => Boolean(value.shopId || value.shopName), {
        message: "店舗IDまたは店舗名を指定してください。",
        path: ["shopName"],
    });

export type AdminInviteCreateInput = z.infer<typeof adminInviteCreateSchema>;
