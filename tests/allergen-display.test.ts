import { getSelectedAllergenSlugs } from "../lib/public-allergen-preferences";
import assert from "node:assert/strict";
import test from "node:test";
import {
    buildSelectedAllergenSummary,
    buildDefaultAllergenSummaries,
    SPECIFIED_INGREDIENT_SLUGS,
    buildAllergenDisplayItems,
    buildSpecifiedIngredientNotice,
    getStoreContainsAllergenSlugs,
    getAllergenEffectiveRisk,
    effectiveRiskLabelJa,
    statusBadgeClass,
    statusLabelJa,
    classifySelectedAllergenStatuses,
    type AllergenStatus,
    type AllergenEffectiveRisk,
} from "../lib/allergens";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";

const names = new Map([
    ["wheat", "小麦"],
    ["egg", "卵"],
    ["milk", "乳"],
    ["soybean", "大豆"],
]);
const ranks = new Map([
    ["wheat", 0],
    ["egg", 1],
    ["milk", 2],
    ["soybean", 3],
]);

function defaultSummaries(overrides: Record<string, AllergenStatus>, storeHandled: string[] = []) {
    return buildDefaultAllergenSummaries({
        statusBySlug: { ...Object.fromEntries(ALLERGEN_MASTER.map((item) => [item.slug, "FREE"])), ...overrides },
        nameJaBySlug: new Map(ALLERGEN_MASTER.map((item) => [item.slug, item.nameJa])),
        rankBySlug: new Map(ALLERGEN_MASTER.map((item, index) => [item.slug, index])),
        storeHandledAllergenSlugs: new Set(storeHandled),
    });
}

test("未選択の主判定はカシューナッツを含む特定原材料の全品目を対象にする", () => {
    for (const slug of SPECIFIED_INGREDIENT_SLUGS) {
        const result = defaultSummaries({ [slug]: "CONTAINS" });
        assert.equal(result.specified.badge, "danger", slug);
        assert.equal(result.specified.containsCount, 1);
        assert.equal(result.other.badge, "safe");
    }
});

test("大豆・鶏肉だけを含む場合は特定原材料の主判定に混ぜずその他の注意を保持する", () => {
    const result = defaultSummaries({ soybean: "CONTAINS", chicken: "CONTAINS", sesame: "MAY_CONTAIN" });
    assert.equal(result.specified.badge, "safe");
    assert.equal(result.specified.containsCount, 0);
    assert.equal(result.other.badge, "danger");
    assert.equal(result.otherCount, ALLERGEN_MASTER.length - SPECIFIED_INGREDIENT_SLUGS.length);
    assert.equal(result.other.containsCount, 2);
    assert.match(result.other.summaryText, /大豆.*鶏肉（含む）/);
    assert.match(result.other.summaryText, /ごま（含む可能性あり・要確認）/);
});

test("卵・大豆・鶏肉と可能性ありの登録を特定原材料とその他へ正しく分ける", () => {
    const result = defaultSummaries({ egg: "CONTAINS", soybean: "CONTAINS", chicken: "CONTAINS", wheat: "MAY_CONTAIN", milk: "MAY_CONTAIN", sesame: "MAY_CONTAIN" });
    assert.equal(result.specified.containsCount, 1);
    assert.equal(result.specified.mayCount, 2);
    assert.equal(result.other.containsCount, 2);
    assert.equal(result.other.mayCount, 1);
});

test("両分類で可能性あり・別メニュー由来の補足・未入力を隠さない", () => {
    const may = defaultSummaries({ egg: "MAY_CONTAIN", soybean: "MAY_CONTAIN" });
    assert.equal(may.specified.badge, "caution");
    assert.equal(may.other.badge, "caution");
    const handled = defaultSummaries({}, ["egg", "soybean"]);
    for (const result of [handled.specified, handled.other]) {
        assert.equal(result.badge, "caution");
        assert.equal(result.storeHandledCount, 1);
        assert.match(result.summaryText, /別の公開メニューに「含む」登録/);
    }
    const unknown = defaultSummaries({ egg: "UNKNOWN", soybean: "UNKNOWN" });
    assert.equal(unknown.specified.badge, "unknown");
    assert.equal(unknown.other.badge, "unknown");
});

test("特定原材料のマスタ・リンク欠損を含まないという判定にしない", () => {
    const result = buildDefaultAllergenSummaries({ statusBySlug: {}, nameJaBySlug: new Map(), rankBySlug: new Map() });
    assert.equal(result.specified.badge, "unknown");
    assert.equal(result.specified.unknownCount, SPECIFIED_INGREDIENT_SLUGS.length);
    assert.doesNotMatch(result.specified.summaryText, /含まない/);
    const staleStatus = buildDefaultAllergenSummaries({
        statusBySlug: Object.fromEntries(ALLERGEN_MASTER.map((item) => [item.slug, "FREE"])),
        nameJaBySlug: new Map(ALLERGEN_MASTER.filter((item) => item.slug !== "cashew").map((item) => [item.slug, item.nameJa])),
        rankBySlug: new Map(),
    });
    assert.equal(staleStatus.specified.badge, "unknown");
    assert.equal(staleStatus.specified.unknownCount, 1);
});

function summary(
    statusBySlug: Record<string, AllergenStatus>,
    selectedSlugs: string[],
    includeMayContain: boolean,
) {
    return buildSelectedAllergenSummary({
        statusBySlug,
        selectedSlugs,
        includeMayContain,
        nameJaBySlug: names,
        rankBySlug: ranks,
    });
}

test("選択アレルゲンの単一状態を危険度どおりに表示する", () => {
    assert.equal(summary({ wheat: "CONTAINS" }, ["wheat"], false).badge, "danger");
    assert.equal(summary({ wheat: "MAY_CONTAIN" }, ["wheat"], false).badge, "caution");
    assert.equal(summary({ wheat: "FREE" }, ["wheat"], false).badge, "safe");
    assert.equal(summary({ wheat: "UNKNOWN" }, ["wheat"], false).badge, "unknown");
});

test("MAY_CONTAINはincludeMayContainの値にかかわらず注意表示になる", () => {
    for (const includeMayContain of [true, false]) {
        const result = summary(
            { wheat: "MAY_CONTAIN" },
            ["wheat"],
            includeMayContain,
        );

        assert.equal(result.badge, "caution");
        assert.equal(result.mayCount, 1);
        assert.match(result.summaryText, /含む可能性あり・要確認/);
        assert.doesNotMatch(result.summaryText, /含まない/);
    }
});

test("複数状態では危険側を優先しつつ状態別の事実を保持する", () => {
    const containsAndMay = summary(
        { wheat: "CONTAINS", egg: "MAY_CONTAIN" },
        ["wheat", "egg"],
        false,
    );
    assert.equal(containsAndMay.badge, "danger");
    assert.equal(containsAndMay.containsCount, 1);
    assert.equal(containsAndMay.mayCount, 1);
    assert.match(containsAndMay.summaryText, /含む可能性あり・要確認/);

    const mayAndFree = summary(
        { wheat: "MAY_CONTAIN", egg: "FREE" },
        ["wheat", "egg"],
        false,
    );
    assert.equal(mayAndFree.badge, "caution");

    const unknownAndFree = summary(
        { wheat: "UNKNOWN", egg: "FREE" },
        ["wheat", "egg"],
        false,
    );
    assert.equal(unknownAndFree.badge, "unknown");
});

test("一覧と詳細が共有する分類は全状態を同時に保持する", () => {
    const groups = classifySelectedAllergenStatuses({
        statusBySlug: {
            wheat: "CONTAINS",
            egg: "MAY_CONTAIN",
            milk: "FREE",
            soybean: "UNKNOWN",
        },
        selectedSlugs: ["wheat", "egg", "milk", "soybean"],
    });

    assert.deepEqual(groups, {
        containsSlugs: ["wheat"],
        mayContainSlugs: ["egg"],
        freeSlugs: ["milk"],
        unknownSlugs: ["soybean"],
    });
});

test("強調FREEと除外MAY_CONTAINの組合せでも一覧と詳細の確認対象を一致させる", () => {
    const selected = getSelectedAllergenSlugs({ highlightSlugs: ["egg"], excludedSlugs: ["wheat"] });
    const result = summary({ egg: "FREE", wheat: "MAY_CONTAIN" }, selected, false);
    assert.equal(result.badge, "caution");
    assert.equal(result.mayCount, 1);
    assert.doesNotMatch(result.summaryText, /含まない/);
    assert.deepEqual(getSelectedAllergenSlugs({ highlightSlugs: [], excludedSlugs: ["wheat"] }), ["wheat"]);
});


test("別の公開登録による補足があるFREEを安心側の要約にしない", () => {
    const result = buildSelectedAllergenSummary({ statusBySlug: { egg: "FREE" }, selectedSlugs: ["egg"],
        includeMayContain: false, nameJaBySlug: names, rankBySlug: ranks, storeHandledAllergenSlugs: new Set(["egg"]) });
    assert.equal(result.badge, "caution");
    assert.equal(result.storeHandledCount, 1);
    assert.equal(result.mayCount, 0);
    assert.match(result.summaryText, /別の公開メニューに「含む」登録/);
    const items = buildAllergenDisplayItems([
        { slug: "egg", nameJa: "卵", status: "FREE" }, { slug: "milk", nameJa: "乳", status: "UNKNOWN" },
    ], new Set(["egg", "milk"]));
    assert.equal(items[0].status, "FREE");
    assert.equal(items[0].effectiveRisk, "STORE_HANDLED");
    assert.equal(items[1].effectiveRisk, "UNKNOWN");
});

test("一覧用の品目名は登録状態と別メニューの補足を分け、混在する未確認も名前で保持する", () => {
    const result = buildSelectedAllergenSummary({
        statusBySlug: { wheat: "CONTAINS", egg: "MAY_CONTAIN", milk: "UNKNOWN", soybean: "FREE" },
        selectedSlugs: ["soybean", "milk", "egg", "wheat"],
        includeMayContain: false,
        nameJaBySlug: names,
        rankBySlug: ranks,
        storeHandledAllergenSlugs: new Set(["soybean"]),
    });
    assert.deepEqual(result.containsNames, ["小麦"]);
    assert.deepEqual(result.mayContainNames, ["卵"]);
    assert.deepEqual(result.unknownNames, ["乳"]);
    assert.deepEqual(result.storeHandledNames, ["大豆"]);
    assert.equal(result.mayCount, 1, "別メニューの補足を可能性ありの件数に加えない");
    assert.doesNotMatch(result.registrationSummaryText, /大豆|別の公開メニュー|含まない/);
});

test("原材料に含まない登録と自動補足は別々に表示でき、補足がなくても安全とは要約しない", () => {
    for (const storeHandledAllergenSlugs of [new Set<string>(), new Set(["egg"])]) {
        const result = buildSelectedAllergenSummary({ statusBySlug: { egg: "FREE" }, selectedSlugs: ["egg"],
            includeMayContain: false, nameJaBySlug: names, rankBySlug: ranks, storeHandledAllergenSlugs });
        assert.match(result.registrationSummaryText, /原材料に含まないと登録/);
        assert.match(result.registrationSummaryText, /食品安全の保証ではありません/);
        assert.deepEqual(result.storeHandledNames, storeHandledAllergenSlugs.size ? ["卵"] : []);
        assert.equal(result.mayCount, 0);
    }
});

test("不完全なメニューは同店舗の補足に使わない", () => {
    assert.equal(getStoreContainsAllergenSlugs([{ name: "未確認メニュー", allergenLinks: [
        { status: "CONTAINS", allergen: { slug: "egg" } },
    ] }], [{ slug: "egg", nameJa: "卵" }]).size, 0);
});


test("含む登録が3品目以上あっても他の含む・要確認情報を一覧要約から落とさない", () => {
    const result = summary({ wheat: "CONTAINS", egg: "CONTAINS", milk: "CONTAINS", soybean: "MAY_CONTAIN" }, [...names.keys()], false);
    assert.match(result.summaryText, /大豆（含む可能性あり・要確認）/);
    const allContains = summary({ wheat: "CONTAINS", egg: "CONTAINS", milk: "CONTAINS", soybean: "CONTAINS" }, [...names.keys()], false);
    for (const name of names.values()) assert.ok(allContains.summaryText.includes(name));
});

test("不正状態をFREEや安心側の表示に変換しない", () => {
    for (const value of ["UNRECOGNIZED", "", null, undefined]) {
        const invalid = value as AllergenStatus;
        const [item] = buildAllergenDisplayItems(
            [{ slug: "egg", nameJa: "卵", status: invalid }],
            new Set(["egg"]),
        );

        assert.equal(item.status, "UNKNOWN");
        assert.equal(item.effectiveRisk, "UNKNOWN");
        assert.equal(getAllergenEffectiveRisk({ status: invalid, storeHandlesAllergen: false }), "UNKNOWN");
        assert.equal(getAllergenEffectiveRisk({ status: invalid, storeHandlesAllergen: true }), "UNKNOWN");
        assert.equal(statusLabelJa(invalid), statusLabelJa("UNKNOWN"));
        assert.equal(statusBadgeClass(invalid), statusBadgeClass("UNKNOWN"));
        assert.equal(
            effectiveRiskLabelJa("UNRECOGNIZED" as AllergenEffectiveRisk),
            effectiveRiskLabelJa("UNKNOWN"),
        );
        assert.equal(
            buildSpecifiedIngredientNotice({
                rows: [{ slug: "egg", nameJa: "卵", status: invalid }],
            }).kind,
            "unknown",
        );
    }
});
