export function formatDateTimeJa(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleString("ja-JP");
}

export function formatPriceYen(priceYen: number | null): string {
    if (typeof priceYen !== "number") {
        return "価格未設定";
    }

    return `¥${priceYen.toLocaleString("ja-JP")}`;
}

export function formatPriceYenLabel(priceYen: number | null): string {
    if (typeof priceYen !== "number") {
        return "価格未設定";
    }

    return `${priceYen.toLocaleString("ja-JP")}円`;
}
