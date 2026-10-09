import assert from "node:assert/strict";
import test from "node:test";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import {
    createStatusBySlug,
    getAllergenMasterValidationErrors,
    getMenuPublishValidationErrors,
    isMenuPublishable,
    type AllergenStatus,
} from "../lib/allergens";

const masterRows = ALLERGEN_MASTER.map((allergen) => ({
    slug: allergen.slug,
    nameJa: allergen.nameJa,
}));

function statusMap(status: AllergenStatus = "FREE") {
    return Object.fromEntries(
        ALLERGEN_MASTER.map((allergen) => [allergen.slug, status]),
    );
}

test("卵の識別子に小麦の表示名を結び付けたマスタでは公開できない", () => {
    assert.equal(ALLERGEN_MASTER.find(row => row.slug === "egg")?.nameJa, "卵");
    assert.equal(ALLERGEN_MASTER.find(row => row.slug === "milk")?.nameJa, "乳");
    const rows = masterRows.map(row => row.slug === "egg" ? { ...row, nameJa: "小麦" } : row);
    assert.equal(isMenuPublishable({ name: "確認例", allergens: rows, statusBySlug: statusMap() }), false);
});

test("正常な29品目マスタは公開検証を通過する", () => {
    assert.deepEqual(getAllergenMasterValidationErrors(masterRows), []);
    assert.equal(
        isMenuPublishable({
            name: "テストメニュー",
            allergens: masterRows,
            statusBySlug: statusMap(),
        }),
        true,
    );
});

test("28品目は件数不一致と不足slugで公開を拒否する", () => {
    const rows = masterRows.slice(0, -1);
    const errors = getAllergenMasterValidationErrors(rows);

    assert.ok(errors.some((error) => error.includes("28件")));
    assert.ok(errors.some((error) => error.includes("不足slug")));
    assert.equal(
        isMenuPublishable({
            name: "テストメニュー",
            allergens: rows,
            statusBySlug: statusMap(),
        }),
        false,
    );
});

test("30品目は件数不一致と余分なslugで公開を拒否する", () => {
    const rows = [...masterRows, { slug: "unexpected", nameJa: "余分" }];
    const errors = getAllergenMasterValidationErrors(rows);

    assert.ok(errors.some((error) => error.includes("30件")));
    assert.ok(errors.some((error) => error.includes("余分なslug")));
});

test("29品目でもslug集合が異なれば不足と余分の両方で拒否する", () => {
    const rows = [
        ...masterRows.slice(0, -1),
        { slug: "unexpected", nameJa: "差し替え" },
    ];
    const errors = getAllergenMasterValidationErrors(rows);

    assert.ok(errors.some((error) => error.includes("不足slug")));
    assert.ok(errors.some((error) => error.includes("余分なslug")));
});

test("0品目は公開を拒否する", () => {
    const errors = getAllergenMasterValidationErrors([]);

    assert.ok(errors.some((error) => error.includes("0件")));
    assert.ok(errors.some((error) => error.includes("不足slug")));
    assert.equal(
        isMenuPublishable({
            name: "テストメニュー",
            allergens: [],
            statusBySlug: {},
        }),
        false,
    );
});

test("重複slugは件数29でも公開を拒否する", () => {
    const rows = [
        ...masterRows.slice(0, -1),
        { ...masterRows[0] },
    ];
    const errors = getAllergenMasterValidationErrors(rows);

    assert.ok(errors.some((error) => error.includes("重複slug")));
    assert.ok(errors.some((error) => error.includes("不足slug")));
});

test("未設定状態または空のメニュー名は公開条件を満たさない", () => {
    const withUnknown = statusMap();
    withUnknown.wheat = "UNKNOWN";

    assert.ok(
        getMenuPublishValidationErrors({
            name: "テストメニュー",
            allergens: masterRows,
            statusBySlug: withUnknown,
        }).some((error) => error.includes("未設定")),
    );
    assert.equal(
        isMenuPublishable({
            name: "  ",
            allergens: masterRows,
            statusBySlug: statusMap(),
        }),
        false,
    );
});

test("DB由来の不正・空状態はUNKNOWNとして扱い公開しない", () => {
    for (const invalidStatus of ["UNRECOGNIZED", "", null, undefined]) {
        const links = masterRows.map((allergen) => ({
            allergen: { slug: allergen.slug },
            status: allergen.slug === "egg" ? invalidStatus as string : "FREE",
        }));
        const statusBySlug = createStatusBySlug(masterRows, links);

        assert.equal(statusBySlug.egg, "UNKNOWN");
        assert.equal(
            isMenuPublishable({
                name: "テストメニュー",
                allergens: masterRows,
                statusBySlug,
            }),
            false,
        );
    }
});

test("アレルゲンリンク欠損はUNKNOWNで補完し公開を拒否する", () => {
    const links = masterRows.filter((a) => a.slug !== "egg").map((allergen) => ({
        allergen: { slug: allergen.slug }, status: "FREE",
    }));
    const statusBySlug = createStatusBySlug(masterRows, links);
    assert.equal(statusBySlug.egg, "UNKNOWN");
    assert.equal(isMenuPublishable({ name: "架空メニュー", allergens: masterRows, statusBySlug }), false);
});

test("有効4状態の公開条件は維持する", () => {
    for (const status of ["CONTAINS", "FREE", "MAY_CONTAIN", "UNKNOWN"] as const) {
        assert.equal(isMenuPublishable({
            name: "架空メニュー", allergens: masterRows, statusBySlug: statusMap(status),
        }), status !== "UNKNOWN");
    }
});

test("公開判定へ直接渡された不正状態も拒否する", () => {
    const statuses = statusMap();
    statuses.egg = "UNRECOGNIZED" as AllergenStatus;

    assert.ok(getMenuPublishValidationErrors({
        name: "テストメニュー",
        allergens: masterRows,
        statusBySlug: statuses,
    }).some((error) => error.includes("卵")));
});
