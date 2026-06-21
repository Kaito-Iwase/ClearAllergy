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

export const ALLERGEN_EFFECTIVE_RISK_VALUES = [
    "CONTAINS",
    "MAY_CONTAIN",
    "STORE_HANDLED",
    "FREE",
    "UNKNOWN",
] as const;

export type AllergenEffectiveRisk =
    (typeof ALLERGEN_EFFECTIVE_RISK_VALUES)[number];

export type AllergenDisplayItem = {
    slug: string;
    nameJa: string;
    status: AllergenStatus;
    storeHandlesAllergen: boolean;
    effectiveRisk: AllergenEffectiveRisk;
};

// えび・かに・くるみ・小麦・そば・卵・乳・落花生・カシューナッツは、
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
    "cashew",
] as const;

export const SPECIFIED_INGREDIENT_LABEL =
    "対象：えび・かに・くるみ・小麦・そば・卵・乳・落花生（ピーナッツ）・カシューナッツ";

// 特定原材料9品目以外は「特定原材料に準ずるもの」として別の注意表示に使います。
// ピスタチオはこの分類に含め、特定原材料側には含めません。
export const RECOMMENDED_INGREDIENT_SLUGS = [
    "almond",
    "abalone",
    "squid",
    "salmon_roe",
    "orange",
    "kiwifruit",
    "beef",
    "sesame",
    "salmon",
    "mackerel",
    "soybean",
    "chicken",
    "banana",
    "pork",
    "macadamia_nut",
    "peach",
    "apple",
    "yam",
    "gelatin",
    "pistachio",
] as const;

export const RECOMMENDED_INGREDIENT_LABEL =
    "対象：アーモンド・あわび・いか・いくら・オレンジ・キウイフルーツ・牛肉・ごま・さけ・さば・大豆・鶏肉・バナナ・豚肉・マカダミアナッツ・もも・りんご・やまいも・ゼラチン・ピスタチオ";

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
    // API や画面で 29 品目を毎回同じ順・同じ件数で扱えるよう、
    // マスタ基準で配列を組み直します。
    const statusBySlug = createStatusBySlug(allergens, links);

    return allergens.map((allergen, index) => ({
        slug: allergen.slug,
        nameJa: allergen.nameJa,
        nameEn: allergen.nameEn ?? null,
        sortOrder: allergen.sortOrder ?? index + 1,
        status: statusBySlug[allergen.slug] ?? "UNKNOWN",
    }));
}

export function getAllergenEffectiveRisk(args: {
    status: AllergenStatus;
    storeHandlesAllergen: boolean;
}): AllergenEffectiveRisk {
    if (args.status === "CONTAINS") return "CONTAINS";
    if (args.status === "MAY_CONTAIN") return "MAY_CONTAIN";
    if (args.status === "UNKNOWN") return "UNKNOWN";
    return args.storeHandlesAllergen ? "STORE_HANDLED" : "FREE";
}

export function buildAllergenDisplayItems(
    rows: Array<{
        slug: string;
        nameJa: string;
        status: AllergenStatus;
    }>,
    storeHandledAllergenSlugs: ReadonlySet<string>,
): AllergenDisplayItem[] {
    return rows.map((row) => {
        const storeHandlesAllergen = storeHandledAllergenSlugs.has(row.slug);

        return {
            slug: row.slug,
            nameJa: row.nameJa,
            status: row.status,
            storeHandlesAllergen,
            effectiveRisk: getAllergenEffectiveRisk({
                status: row.status,
                storeHandlesAllergen,
            }),
        };
    });
}

export function statusLabelJa(status: AllergenStatus): string {
    if (status === "CONTAINS") return "含む";
    if (status === "MAY_CONTAIN") return "含む可能性があります";
    if (status === "UNKNOWN") return "未設定";
    return "含まない";
}

export function effectiveRiskLabelJa(
    effectiveRisk: AllergenEffectiveRisk,
): string {
    if (effectiveRisk === "CONTAINS") return "含む";
    if (effectiveRisk === "MAY_CONTAIN") return "コンタミの可能性あり";
    if (effectiveRisk === "STORE_HANDLED") {
        return "原材料には含まないが、同一店舗内で取扱いあり";
    }
    if (effectiveRisk === "UNKNOWN") return "未確認";
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
    // API 直打ち対策として、runtime でも map の形を検証します。
    // TypeScript の型だけでは外部入力を守れないため、この確認が必要です。
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
    allergens: Array<{ slug: string; nameJa: string }>;
    statusBySlug: Record<string, AllergenStatus>;
}) {
    // この関数は「公開してよいメニューか」をサーバー側で判定します。
    // 画面側の必須表示だけに頼ると、API 直打ちや将来の UI 崩れで簡単に抜けるためです。
    const errors: string[] = [];

    if (args.name.trim() === "") {
        errors.push("公開するにはメニュー名が必要です。");
    }

    const unknownAllergens = getUnknownAllergenNames({
        allergens: args.allergens,
        statusBySlug: args.statusBySlug,
    });

    if (unknownAllergens.length > 0) {
        // ここで UNKNOWN を止めるのは、
        // 未設定のまま公開されると利用者が安全性を誤解する危険があるためです。
        errors.push(
            `公開するにはアレルゲン29品目を確定してください。未設定: ${unknownAllergens.join("・")}`,
        );
    }

    return errors;
}

export function isMenuPublishable(args: {
    name: string;
    allergens: Array<{ slug: string; nameJa: string }>;
    statusBySlug: Record<string, AllergenStatus>;
}) {
    return getMenuPublishValidationErrors(args).length === 0;
}

export type AllergenClassificationNotice = {
    kind: "danger" | "caution" | "unknown" | "safe";
    title: string;
    resultText: string;
    unknownText: string | null;
    desc: string;
    boxClass: string;
    titleClass: string;
    textClass: string;
};

function buildAllergenClassificationNotice(args: {
    rows: Array<{ slug: string; nameJa: string; status: AllergenStatus }>;
    targetSlugs: readonly string[];
    classificationName: string;
    label: string;
}): AllergenClassificationNotice {
    const targetSlugs = new Set(args.targetSlugs);
    const targetRows = args.rows.filter((row) => targetSlugs.has(row.slug));

    const containsRows = targetRows.filter(
        (row) => row.status === "CONTAINS",
    );
    const mayContainRows = targetRows.filter(
        (row) => row.status === "MAY_CONTAIN",
    );

    const containsNames = containsRows.map((row) => row.nameJa);
    const mayContainNames = mayContainRows.map((row) => row.nameJa);
    const unknownNames = targetRows
        .filter((row) => row.status === "UNKNOWN")
        .map((row) => row.nameJa);
    const unknownText =
        unknownNames.length > 0 ? `未設定: ${unknownNames.join("・")}` : null;

    if (containsNames.length > 0) {
        return {
            kind: "danger" as const,
            title: `${args.classificationName}を含みます`,
            resultText: containsNames.join("・"),
            unknownText,
            desc: args.label,
            boxClass: "border border-red-200 bg-red-50",
            titleClass: "text-red-700",
            textClass: "text-red-900/90",
        };
    }

    if (mayContainNames.length > 0) {
        return {
            kind: "caution" as const,
            title: `${args.classificationName}を含む可能性があります`,
            resultText: mayContainNames.join("・"),
            unknownText,
            desc: args.label,
            boxClass: "border border-yellow-200 bg-yellow-50",
            titleClass: "text-yellow-800",
            textClass: "text-yellow-900/90",
        };
    }

    if (unknownNames.length > 0) {
        return {
            kind: "unknown" as const,
            title: `${args.classificationName}に未設定項目があります`,
            resultText: unknownNames.join("・"),
            unknownText,
            desc: args.label,
            boxClass: "border border-gray-200 bg-gray-50",
            titleClass: "text-gray-800",
            textClass: "text-gray-900/90",
        };
    }

    return {
        kind: "safe" as const,
        title: `${args.classificationName}は含まれていません`,
        resultText: "該当なし",
        unknownText,
        desc: args.label,
        boxClass: "border border-green-200 bg-green-50",
        titleClass: "text-green-800",
        textClass: "text-green-900/90",
    };
}

export function buildSpecifiedIngredientNotice(args: {
    rows: Array<{ slug: string; nameJa: string; status: AllergenStatus }>;
}) {
    return buildAllergenClassificationNotice({
        rows: args.rows,
        targetSlugs: SPECIFIED_INGREDIENT_SLUGS,
        classificationName: "特定原材料",
        label: SPECIFIED_INGREDIENT_LABEL,
    });
}

export function buildRecommendedIngredientNotice(args: {
    rows: Array<{ slug: string; nameJa: string; status: AllergenStatus }>;
}) {
    return buildAllergenClassificationNotice({
        rows: args.rows,
        targetSlugs: RECOMMENDED_INGREDIENT_SLUGS,
        classificationName: "特定原材料に準ずるもの",
        label: RECOMMENDED_INGREDIENT_LABEL,
    });
}
