// このファイルは管理画面 API の入力値を整える helper 集です。
// request.json() で受け取った unknown を、そのまま DB に入れないために使います。
// 文字列の trim や価格の数値判定を共通化し、各 API で同じルールを保ちます。

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
    // 価格は空欄を許しつつ、入る時は「0以上の整数」に限定します。
    // Prisma の Int 上限も超えないようここで先に弾きます。
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

export function parseAverageBudgetYen(
    value: unknown,
): { ok: true; value: number | null } | { ok: false; message: string } {
    // 平均予算も価格と同じく、空欄を許しつつ 0 以上の整数だけ受け付けます。
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
        return {
            ok: false,
            message: "平均予算は数値で入力してください。",
        };
    }

    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
        return {
            ok: false,
            message: "平均予算は数値で入力してください。",
        };
    }

    if (!Number.isInteger(parsed)) {
        return {
            ok: false,
            message: "平均予算は整数で入力してください。",
        };
    }

    if (parsed < 0) {
        return {
            ok: false,
            message: "平均予算は0以上で入力してください。",
        };
    }

    if (parsed > PRISMA_INT_MAX) {
        return {
            ok: false,
            message: `平均予算が大きすぎます。${PRISMA_INT_MAX}円以下で入力してください。`,
        };
    }

    return { ok: true, value: parsed };
}
