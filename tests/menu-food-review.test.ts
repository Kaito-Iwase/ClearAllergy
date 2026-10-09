import assert from "node:assert/strict";
import test from "node:test";
import { foodSnapshot, foodContentChanged, isFoodReviewCurrent } from "../features/admin/menus/food-review";

const original = { name: "カレー", description: null, category: null, ingredients: "野菜・だし", precaution: null, imageUrl: null };
const master = [{ slug: "egg", nameJa: "卵" }, { slug: "milk", nameJa: "乳" }];
const statuses = { egg: "CONTAINS", milk: "FREE" } as const;

test("食品確認はCONTAINSを含む登録内容に結び付き、価格・画像構図は確認対象を変えない", () => {
    const snapshot = foodSnapshot(original, master, statuses);
    assert.deepEqual(snapshot, { ...original, allergens: [
        { slug: "egg", nameJa: "卵", status: "CONTAINS" },
        { slug: "milk", nameJa: "乳", status: "FREE" },
    ] });
    assert.equal(foodContentChanged(snapshot, foodSnapshot({ ...original, priceYen: 900 }, master, statuses)), false);
});

test("食品・対象識別・注意・状態・マスタ名称の変更は再確認対象になる", () => {
    const before = foodSnapshot(original, master, statuses);
    for (const change of [{ name: "別料理" }, { ingredients: "新しいだし" }, { precaution: "別添" }, { imageUrl: "https://example.test/new" }]) {
        assert.equal(foodContentChanged(before, foodSnapshot({ ...original, ...change }, master, statuses)), true);
    }
    assert.equal(foodContentChanged(before, foodSnapshot(original, master, { ...statuses, milk: "UNKNOWN" })), true);
    assert.equal(foodContentChanged(before, foodSnapshot(original, [{ slug: "egg", nameJa: "別名称" }, master[1]], statuses)), true);
});

test("欠損はUNKNOWNとして記録し、確認対象の並び順だけでは内容が変わらない", () => {
    assert.equal(foodSnapshot(original, master, {}).allergens[0].status, "UNKNOWN");
    assert.deepEqual(foodSnapshot(original, master, statuses), foodSnapshot(original, [...master].reverse(), statuses));
});

test("確認なし・旧版・不正な版から現行確認を導かない", () => {
    for (const reviewedFoodVersion of [null, undefined, 0, -1, NaN]) {
        assert.equal(isFoodReviewCurrent({ foodVersion: 1, reviewedFoodVersion }), false);
    }
    assert.equal(isFoodReviewCurrent({ foodVersion: 1, reviewedFoodVersion: 1 }), true);
    assert.equal(isFoodReviewCurrent({ foodVersion: -1, reviewedFoodVersion: -1 }), false);
});
