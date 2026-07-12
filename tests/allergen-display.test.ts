import assert from "node:assert/strict";
import test from "node:test";
import {
    buildSelectedAllergenSummary,
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
        assert.match(result.summaryText, /含む可能性があります/);
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
    assert.match(containsAndMay.summaryText, /含む可能性があります/);

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
