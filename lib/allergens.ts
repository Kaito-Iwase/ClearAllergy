export const ALLERGEN_STATUS_VALUES = [
    "CONTAINS",
    "FREE",
    "MAY_CONTAIN",
] as const;

export type AllergenStatus = (typeof ALLERGEN_STATUS_VALUES)[number];

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

export function createStatusBySlug(
    allergens: AllergenLike[],
    links: AllergenLinkLike[],
): Record<string, AllergenStatus> {
    const statusBySlug: Record<string, AllergenStatus> = {};

    for (const allergen of allergens) {
        statusBySlug[allergen.slug] = "FREE";
    }

    for (const link of links) {
        statusBySlug[link.allergen.slug] = link.status as AllergenStatus;
    }

    return statusBySlug;
}

export function statusLabelJa(status: AllergenStatus): string {
    if (status === "CONTAINS") return "含む";
    if (status === "MAY_CONTAIN") return "含む可能性があります";
    return "含まない";
}

export function statusBadgeClass(status: AllergenStatus): string {
    if (status === "CONTAINS") {
        return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
    }
    if (status === "MAY_CONTAIN") {
        return "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200";
    }
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
}

export function buildSpecifiedIngredientNotice(args: {
    rows: Array<{ slug: string; nameJa: string; status: AllergenStatus }>;
}) {
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

    if (containsNames.length > 0) {
        return {
            kind: "danger" as const,
            title: "特定原材料を含みます",
            resultText: containsNames.join("・"),
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
            desc: SPECIFIED_INGREDIENT_LABEL,
            boxClass: "border border-yellow-200 bg-yellow-50",
            titleClass: "text-yellow-800",
            textClass: "text-yellow-900/90",
        };
    }

    return {
        kind: "safe" as const,
        title: "特定原材料は含まれていません",
        resultText: "該当なし",
        desc: SPECIFIED_INGREDIENT_LABEL,
        boxClass: "border border-green-200 bg-green-50",
        titleClass: "text-green-800",
        textClass: "text-green-900/90",
    };
}
