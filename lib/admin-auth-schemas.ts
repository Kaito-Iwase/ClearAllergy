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

const passwordSchema = z
    .string()
    .min(8, "パスワードは8文字以上で入力してください。")
    .max(128, "パスワードが長すぎます。");

const optionalInviteTokenSchema = z
    .string()
    .trim()
    .min(1)
    .max(256, "招待トークンが長すぎます。")
    .nullable()
    .optional()
    .transform((value) => {
        if (!value) {
            return null;
        }

        return value;
    });

export const adminLoginPrecheckSchema = z.object({
    email: normalizedEmailSchema,
    password: passwordSchema,
});

export const adminLoginAuditSchema = z.object({
    email: normalizedEmailSchema,
    success: z.boolean(),
    reason: z
        .string()
        .trim()
        .max(64, "reason が長すぎます。")
        .optional(),
});

export const adminGoogleSsoAuditSchema = z.object({
    provider: z.literal("google"),
    stage: z.enum(["start", "success", "failure"]),
    reason: z
        .string()
        .trim()
        .max(64, "reason が長すぎます。")
        .optional(),
});

export const adminRegisterSchema = z.object({
    shopName: z
        .string()
        .trim()
        .min(1, "店舗名は必須です。")
        .max(120, "店舗名が長すぎます。"),
    email: normalizedEmailSchema,
    password: passwordSchema,
    inviteToken: optionalInviteTokenSchema,
});

export const adminOnboardingSchema = z.object({
    shopName: z
        .string()
        .trim()
        .min(1, "店舗名は必須です。")
        .max(120, "店舗名が長すぎます。"),
    inviteToken: optionalInviteTokenSchema,
});

export type AdminLoginPrecheckInput = z.infer<typeof adminLoginPrecheckSchema>;
export type AdminLoginAuditInput = z.infer<typeof adminLoginAuditSchema>;
export type AdminRegisterInput = z.infer<typeof adminRegisterSchema>;
export type AdminOnboardingInput = z.infer<typeof adminOnboardingSchema>;
export type AdminGoogleSsoAuditInput = z.infer<typeof adminGoogleSsoAuditSchema>;
