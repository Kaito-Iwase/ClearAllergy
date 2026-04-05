// このファイルはアレルゲン表示に関する共通ロジックです。
// 管理画面と公開画面の両方から使い、状態ラベルや色、特定原材料の注意文を共通化します。
// UI ごとに判定ロジックがずれないよう、なるべくここへ集めています。

export const ALLERGEN_STATUS_VALUES = [
    "UNKNOWN",
    "CONTAINS",
    "FREE",
    "MAY_CONTAIN",
] as const;

export type AllergenStatus = (typeof ALLERGEN_STATUS_VALUES)[number];

// えび・かに・くるみ・小麦・そば・卵・乳・落花生は、
// 公開画面で特に強調して見せたい「特定原材料」として別扱いしています。
export const SPECIFIED_INGREDIENT_SLUGS = [
    "shrimp",
    "crab",
    "walnut",
    "wheat",
    "buckwheat",
    "egg",
    "milk",
    "peanut",
] as const;

export const SPECIFIED_INGREDIENT_LABEL =
    "対象：えび・かに・くるみ・小麦・そば・卵・乳・落花生（ピーナッツ）";

type AllergenLike = {
    slug: string;
};

type AllergenLinkLike = {
    status: string;
    allergen: {
        slug: string;
    };
};

type AllergenWithNamesLike = {
    slug: string;
    nameJa: string;
    nameEn?: string | null;
    sortOrder?: number | null;
};

export function createStatusBySlug(
    allergens: AllergenLike[],
    links: AllergenLinkLike[],
): Record<string, AllergenStatus> {
    // まず全品目を UNKNOWN で埋めてから、DB に保存されている実データで上書きします。
    // こうしておくと、未登録のアレルゲンも画面で必ず表示できます。
    const statusBySlug: Record<string, AllergenStatus> = {};

    for (const allergen of allergens) {
        statusBySlug[allergen.slug] = "UNKNOWN";
    }

    for (const link of links) {
        statusBySlug[link.allergen.slug] = link.status as AllergenStatus;
    }

    return statusBySlug;
}

export function buildAllergenRows(
    allergens: AllergenWithNamesLike[],
    links: AllergenLinkLike[],
) {
    const statusBySlug = createStatusBySlug(allergens, links);

    return allergens.map((allergen, index) => ({
        slug: allergen.slug,
        nameJa: allergen.nameJa,
        nameEn: allergen.nameEn ?? null,
        sortOrder: allergen.sortOrder ?? index + 1,
        status: statusBySlug[allergen.slug] ?? "UNKNOWN",
    }));
}

export function statusLabelJa(status: AllergenStatus): string {
    if (status === "CONTAINS") return "含む";
    if (status === "MAY_CONTAIN") return "含む可能性があります";
    if (status === "UNKNOWN") return "未設定";
    return "含まない";
}

export function statusBadgeClass(status: AllergenStatus): string {
    if (status === "CONTAINS") {
        return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
    }
    if (status === "MAY_CONTAIN") {
        return "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200";
    }
    if (status === "UNKNOWN") {
        return "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200";
    }
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
}

export function validateAllergenStatusMap(
    value: unknown,
):
    | { ok: true; value: Record<string, AllergenStatus> }
    | { ok: false; message: string } {
    if (value === undefined) {
        return { ok: true, value: {} };
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {
            ok: false,
            message: "allergenStatusBySlug must be an object",
        };
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const statusMap: Record<string, AllergenStatus> = {};

    for (const [slug, status] of entries) {
        if (
            typeof status !== "string" ||
            !ALLERGEN_STATUS_VALUES.includes(status as AllergenStatus)
        ) {
            return {
                ok: false,
                message: `invalid allergen status: ${slug}`,
            };
        }

        statusMap[slug] = status as AllergenStatus;
    }

    return { ok: true, value: statusMap };
}

export function getUnknownAllergenNames(args: {
    allergens: Array<{ slug: string; nameJa: string }>;
    statusBySlug: Record<string, AllergenStatus>;
}) {
    return args.allergens
        .filter(
            (allergen) =>
                (args.statusBySlug[allergen.slug] ?? "UNKNOWN") === "UNKNOWN",
        )
        .map((allergen) => allergen.nameJa);
}

export function getMenuPublishValidationErrors(args: {
    name: string;
    ingredients: string | null;
    precaution: string | null;
    allergens: Array<{ slug: string; nameJa: string }>;
    statusBySlug: Record<string, AllergenStatus>;
}) {
    const errors: string[] = [];

    if (args.name.trim() === "") {
        errors.push("公開するにはメニュー名が必要です。");
    }

    if (!args.ingredients) {
        errors.push("公開するには原材料名の入力が必要です。");
    }

    if (!args.precaution) {
        errors.push("公開するには注意書きの入力が必要です。");
    }

    const unknownAllergens = getUnknownAllergenNames({
        allergens: args.allergens,
        statusBySlug: args.statusBySlug,
    });

    if (unknownAllergens.length > 0) {
        errors.push(
            `公開するにはアレルゲン28品目を確定してください。未設定: ${unknownAllergens.join("・")}`,
        );
    }

    return errors;
}

export function buildSpecifiedIngredientNotice(args: {
    rows: Array<{ slug: string; nameJa: string; status: AllergenStatus }>;
}) {
    // 28品目のうち、特定原材料だけを抜き出して警告 UI 用の文言を作ります。
    const specifiedRows = args.rows.filter((row) =>
        SPECIFIED_INGREDIENT_SLUGS.includes(
            row.slug as (typeof SPECIFIED_INGREDIENT_SLUGS)[number],
        ),
    );

    const containsRows = specifiedRows.filter(
        (row) => row.status === "CONTAINS",
    );
    const mayContainRows = specifiedRows.filter(
        (row) => row.status === "MAY_CONTAIN",
    );

    const containsNames = containsRows.map((row) => row.nameJa);
    const mayContainNames = mayContainRows.map((row) => row.nameJa);
    const unknownNames = specifiedRows
        .filter((row) => row.status === "UNKNOWN")
        .map((row) => row.nameJa);
    const unknownText =
        unknownNames.length > 0 ? `未設定: ${unknownNames.join("・")}` : null;

    if (containsNames.length > 0) {
        return {
            kind: "danger" as const,
            title: "特定原材料を含みます",
            resultText: containsNames.join("・"),
            unknownText,
            desc: SPECIFIED_INGREDIENT_LABEL,
            boxClass: "border border-red-200 bg-red-50",
            titleClass: "text-red-700",
            textClass: "text-red-900/90",
        };
    }

    if (mayContainNames.length > 0) {
        return {
            kind: "caution" as const,
            title: "特定原材料を含む可能性があります",
            resultText: mayContainNames.join("・"),
            unknownText,
            desc: SPECIFIED_INGREDIENT_LABEL,
            boxClass: "border border-yellow-200 bg-yellow-50",
            titleClass: "text-yellow-800",
            textClass: "text-yellow-900/90",
        };
    }

    if (unknownNames.length > 0) {
        return {
            kind: "unknown" as const,
            title: "特定原材料に未設定項目があります",
            resultText: unknownNames.join("・"),
            unknownText,
            desc: SPECIFIED_INGREDIENT_LABEL,
            boxClass: "border border-gray-200 bg-gray-50",
            titleClass: "text-gray-800",
            textClass: "text-gray-900/90",
        };
    }

    return {
        kind: "safe" as const,
        title: "特定原材料は含まれていません",
        resultText: "該当なし",
        unknownText,
        desc: SPECIFIED_INGREDIENT_LABEL,
        boxClass: "border border-green-200 bg-green-50",
        titleClass: "text-green-800",
        textClass: "text-green-900/90",
    };
}
