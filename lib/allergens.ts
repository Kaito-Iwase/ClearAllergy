// このファイルはアレルゲン表示に関する共通ロジックです。
// 管理画面と公開画面の両方から使い、状態ラベルや色、特定原材料の注意文を共通化します。
// UI ごとに判定ロジックがずれないよう、なるべくここへ集めています。

import { ALLERGEN_MASTER } from "@/lib/constants/allergen-master";

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

export type SelectedAllergenStatusGroups = {
    containsSlugs: string[];
    mayContainSlugs: string[];
    freeSlugs: string[];
    unknownSlugs: string[];
};

export type SelectedAllergenSummaryKind =
    | "danger"
    | "caution"
    | "safe"
    | "unknown";

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

// 特定原材料以外は「特定原材料に準ずるもの」として別の注意表示に使います。
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

export function classifySelectedAllergenStatuses(args: {
    statusBySlug: Record<string, AllergenStatus>;
    selectedSlugs: readonly string[];
}): SelectedAllergenStatusGroups {
    const groups: SelectedAllergenStatusGroups = {
        containsSlugs: [],
        mayContainSlugs: [],
        freeSlugs: [],
        unknownSlugs: [],
    };

    for (const slug of args.selectedSlugs) {
        const status = args.statusBySlug[slug] ?? "UNKNOWN";

        if (status === "CONTAINS") {
            groups.containsSlugs.push(slug);
        } else if (status === "MAY_CONTAIN") {
            groups.mayContainSlugs.push(slug);
        } else if (status === "FREE") {
            groups.freeSlugs.push(slug);
        } else {
            groups.unknownSlugs.push(slug);
        }
    }

    return groups;
}

export function buildSelectedAllergenSummary(args: {
    statusBySlug: Record<string, AllergenStatus>;
    selectedSlugs: readonly string[];
    includeMayContain: boolean;
    nameJaBySlug: ReadonlyMap<string, string>;
    rankBySlug: ReadonlyMap<string, number>;
    storeHandledAllergenSlugs?: ReadonlySet<string>;
}): {
    summaryText: string;
    badge: SelectedAllergenSummaryKind;
    containsCount: number;
    mayCount: number;
    unknownCount: number;
    storeHandledCount: number;
} {
    // includeMayContain は除外検索の設定であり、登録済みの状態自体は変えません。
    // この引数の値にかかわらず MAY_CONTAIN は常に注意側へ分類します。
    const groups = classifySelectedAllergenStatuses({
        statusBySlug: args.statusBySlug,
        selectedSlugs: args.selectedSlugs,
    });
    const storeHandledSlugs = groups.freeSlugs.filter((slug) => args.storeHandledAllergenSlugs?.has(slug));
    const byRank = (a: string, b: string) =>
        (args.rankBySlug.get(a) ?? 9999) -
        (args.rankBySlug.get(b) ?? 9999);
    const containsSlugs = [...groups.containsSlugs].sort(byRank);
    const mayContainSlugs = [...groups.mayContainSlugs].sort(byRank);
    const unknownSlugs = [...groups.unknownSlugs].sort(byRank);
    const toName = (slug: string) => args.nameJaBySlug.get(slug) ?? slug;
    const containsNames = containsSlugs.map(toName);
    const mayContainNames = mayContainSlugs.map(toName);
    const unknownNames = unknownSlugs.map(toName);
    const parts: string[] = [];

    if (containsNames.length > 0) {
        parts.push(`${containsNames.join("・")}（含む）`);
    }
    if (mayContainNames.length > 0) {
        parts.push(
            `${mayContainNames.join("・")}（含む可能性あり・要確認）`,
        );
    }
    if (parts.length === 0 && unknownNames.length > 0) {
        parts.push(`${unknownNames.join("・")}（未設定）`);
    } else if (unknownNames.length > 0) {
        parts.push(`未設定 ${unknownNames.length}件`);
    }

    if (storeHandledSlugs.length > 0) {
        parts.push(`${storeHandledSlugs.sort(byRank).map(toName).join("・")}（同店舗の別の公開登録に含む情報あり）`);
    }
    return {
        summaryText:
            parts.length > 0
                ? parts.join(" / ")
                : args.selectedSlugs.length > 0 ? "確認対象は原材料に含まない登録です。食品安全の保証ではありません。" : "確認対象が未設定です",
        badge:
            containsSlugs.length > 0
                ? "danger"
                : mayContainSlugs.length > 0 || storeHandledSlugs.length > 0
                  ? "caution"
                  : unknownSlugs.length > 0 || args.selectedSlugs.length === 0
                    ? "unknown"
                    : "safe",
        containsCount: containsSlugs.length,
        mayCount: mayContainSlugs.length,
        unknownCount: unknownSlugs.length,
        storeHandledCount: storeHandledSlugs.length,
    };
}

export function buildAllergenRows(
    allergens: AllergenWithNamesLike[],
    links: AllergenLinkLike[],
) {
    // API や画面で現行マスタの全品目を毎回同じ順・同じ件数で扱えるよう、
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
    if (status === "MAY_CONTAIN") return "含む可能性あり・要確認";
    if (status === "UNKNOWN") return "未設定";
    return "原材料に含まない登録";
}

export function effectiveRiskLabelJa(
    effectiveRisk: AllergenEffectiveRisk,
): string {
    if (effectiveRisk === "CONTAINS") return "含む";
    if (effectiveRisk === "MAY_CONTAIN") return "含む可能性あり・要確認";
    if (effectiveRisk === "STORE_HANDLED") {
        return "原材料に含まない登録・同店舗の別の公開登録に含む情報あり";
    }
    if (effectiveRisk === "UNKNOWN") return "未確認";
    return "原材料に含まない登録";
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

export function getAllergenMasterValidationErrors(
    allergens: Array<{ slug: string }>,
): string[] {
    const expectedSlugs = ALLERGEN_MASTER.map((allergen) => allergen.slug);
    const expectedSlugSet = new Set(expectedSlugs);
    const actualSlugs = allergens.map((allergen) => allergen.slug);
    const actualSlugSet = new Set(actualSlugs);
    const seenSlugs = new Set<string>();
    const duplicateSlugSet = new Set<string>();

    for (const slug of actualSlugs) {
        if (seenSlugs.has(slug)) {
            duplicateSlugSet.add(slug);
        }
        seenSlugs.add(slug);
    }

    const missingSlugs = expectedSlugs.filter(
        (slug) => !actualSlugSet.has(slug),
    );
    const extraSlugs = [...actualSlugSet].filter(
        (slug) => !expectedSlugSet.has(slug),
    );
    const errors: string[] = [];

    if (actualSlugs.length !== 29) {
        errors.push(
            `アレルゲンマスタは29件必要です（現在${actualSlugs.length}件）。`,
        );
    }
    if (duplicateSlugSet.size > 0) {
        errors.push(`重複slug: ${[...duplicateSlugSet].join("・")}`);
    }
    if (missingSlugs.length > 0) {
        errors.push(`不足slug: ${missingSlugs.join("・")}`);
    }
    if (extraSlugs.length > 0) {
        errors.push(`余分なslug: ${extraSlugs.join("・")}`);
    }

    return errors;
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

    const allergenMasterErrors = getAllergenMasterValidationErrors(
        args.allergens,
    );
    if (allergenMasterErrors.length > 0) {
        errors.push(
            `アレルゲンマスタがコード上の29品目と一致しないため公開できません。${allergenMasterErrors.join(" ")}`,
        );
    }

    const unknownAllergens = getUnknownAllergenNames({
        allergens: args.allergens,
        statusBySlug: args.statusBySlug,
    });

    if (unknownAllergens.length > 0) {
        // ここで UNKNOWN を止めるのは、
        // 未設定のまま公開されると利用者が安全性を誤解する危険があるためです。
        errors.push(
            `公開するにはアレルゲン${args.allergens.length}品目を確定してください。未設定: ${unknownAllergens.join("・")}`,
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

// 実際に公開可能なメニューの登録だけを補足情報に使用する。
// 不完全な公開フラグ付きデータは、公開UIと同じ条件で除外する。
export function getStoreContainsAllergenSlugs(
    menus: Array<{ name: string; allergenLinks: AllergenLinkLike[] }>,
    allergens: AllergenWithNamesLike[],
): Set<string> {
    const slugs = new Set<string>();
    for (const menu of menus) {
        if (!isMenuPublishable({ name: menu.name, allergens, statusBySlug: createStatusBySlug(allergens, menu.allergenLinks) })) continue;
        for (const link of menu.allergenLinks) {
            if (link.status === "CONTAINS") slugs.add(link.allergen.slug);
        }
    }
    return slugs;
}
