type MenuPublishButtonState = {
    readOnly: boolean;
    isPublished: boolean;
    canPublish: boolean;
};

export function normalizeOptionalMenuText(value: string): string | null {
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
}

export function parseMenuPriceYenInput(priceYenInput: string): number | null {
    const trimmedPrice = priceYenInput.trim();

    if (trimmedPrice === "") {
        return null;
    }

    const priceYen = Number(trimmedPrice);

    if (!Number.isFinite(priceYen) || Number.isNaN(priceYen)) {
        throw new Error("価格は数字で入力してください。");
    }

    if (!Number.isInteger(priceYen)) {
        throw new Error("価格は整数（円）で入力してください。");
    }

    if (priceYen < 0) {
        throw new Error("価格は0円以上で入力してください。");
    }

    return priceYen;
}

export function getMenuPublishButtonLabel({
    readOnly,
    isPublished,
    canPublish,
}: MenuPublishButtonState): string {
    if (isPublished) {
        return readOnly ? "公開中（デモ）" : "公開中";
    }

    if (canPublish) {
        return readOnly ? "非公開（デモ）" : "非公開";
    }

    return readOnly ? "公開不可（デモ）" : "公開不可";
}

export function getMenuPublishButtonColorClass({
    isPublished,
    canPublish,
}: Pick<MenuPublishButtonState, "isPublished" | "canPublish">): string {
    if (isPublished) {
        return "bg-green-600";
    }

    return canPublish ? "bg-gray-900" : "bg-amber-600";
}
