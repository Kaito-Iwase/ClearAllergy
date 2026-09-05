import { getSelectedAllergenSlugs } from "../lib/public-allergen-preferences";
import assert from "node:assert/strict";
import test from "node:test";
import {
    buildSelectedAllergenSummary,
    buildAllergenDisplayItems,
    getStoreContainsAllergenSlugs,
    classifySelectedAllergenStatuses,
    type AllergenStatus,
} from "../lib/allergens";

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
    assert.match(result.summaryText, /別の公開登録/);
    const items = buildAllergenDisplayItems([
        { slug: "egg", nameJa: "卵", status: "FREE" }, { slug: "milk", nameJa: "乳", status: "UNKNOWN" },
    ], new Set(["egg", "milk"]));
    assert.equal(items[0].status, "FREE");
    assert.equal(items[0].effectiveRisk, "STORE_HANDLED");
    assert.equal(items[1].effectiveRisk, "UNKNOWN");
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
