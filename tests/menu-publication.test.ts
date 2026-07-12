import assert from "node:assert/strict";
import test from "node:test";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import {
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
