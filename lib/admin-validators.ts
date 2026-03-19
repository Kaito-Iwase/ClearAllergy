const PRISMA_INT_MAX = 2147483647;

export function toTrimmedNullableString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}

export function toRequiredTrimmedString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}

export function toBooleanOrDefault(
    value: unknown,
    defaultValue: boolean,
): boolean {
    return typeof value === "boolean" ? value : defaultValue;
}

export function parsePriceYen(
    value: unknown,
): { ok: true; value: number | null } | { ok: false; message: string } {
    if (value === undefined || value === null || value === "") {
        return { ok: true, value: null };
    }

    let parsed: number;

    if (typeof value === "number") {
        parsed = value;
    } else if (typeof value === "string") {
        const trimmed = value.trim();

        if (trimmed === "") {
            return { ok: true, value: null };
        }

        parsed = Number(trimmed);
    } else {
        return { ok: false, message: "価格は数値で入力してください。" };
    }

    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
        return { ok: false, message: "価格は数値で入力してください。" };
    }

    if (!Number.isInteger(parsed)) {
        return { ok: false, message: "価格は整数で入力してください。" };
    }

    if (parsed < 0) {
        return { ok: false, message: "価格は0以上で入力してください。" };
    }

    if (parsed > PRISMA_INT_MAX) {
        return {
            ok: false,
            message: `価格が大きすぎます。${PRISMA_INT_MAX}円以下で入力してください。`,
        };
    }

    return { ok: true, value: parsed };
}
