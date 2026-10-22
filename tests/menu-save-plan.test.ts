import test from "node:test";
import assert from "node:assert/strict";
import { getMenuSavePlan } from "../features/admin/menus/menu-save-plan";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { isMenuPublicationCurrent, type AllergenStatus } from "../lib/allergens";

const allergens = ALLERGEN_MASTER.map(a => ({ slug: a.slug, nameJa: a.nameJa }));
const defaults = { name: "架空の料理", allergens,
    statusBySlug: Object.fromEntries(allergens.map(a => [a.slug, "FREE"])) as Record<string, AllergenStatus>,
    requestedIsPublished: true, foodChanged: false, publicationCurrent: true, unresolved: false };

test("価格・構図だけの保存は既存公開を維持し、新しい公開操作を推測しない", () => {
    assert.equal(getMenuSavePlan(defaults).willPublish, true);
    assert.equal(getMenuSavePlan({ ...defaults, requestedIsPublished: false }).willPublish, false);
});
test("食品内容変更・文字が同じ変更申告は、公開希望でも非公開保存になる", () => {
    const result = getMenuSavePlan({ ...defaults, foodChanged: true });
    assert.equal(result.willPublish, false);
    assert.equal(result.canPublish, false);
    assert.equal(result.publicationState, "changed");
});
test("未公開の保存と別の公開操作を分け、旧食品確認だけでは公開予定にしない", () => {
    const result = getMenuSavePlan({ ...defaults, publicationCurrent: false });
    assert.equal(result.canPublish, true);
    assert.equal(result.willPublish, false);
    assert.equal(result.publicationState, "required");
});
test("UNKNOWN・不完全マスタ・名前不足は公開不可", () => {
    const bad = [{ ...defaults, statusBySlug: { ...defaults.statusBySlug, [allergens[0].slug]: "UNKNOWN" as const } },
        { ...defaults, allergens: allergens.slice(1) }, { ...defaults, name: " " }];
    for (const input of bad) assert.equal(getMenuSavePlan(input).canPublish, false);
});
test("未解決事項を通常の公開や食品変更で解除しない", () => {
    for (const foodChanged of [true, false]) {
        const result = getMenuSavePlan({ ...defaults, foodChanged, unresolved: true });
        assert.equal(result.canPublish, false); assert.equal(result.willPublish, false);
        assert.equal(result.publicationState, "unresolved");
    }
});
test("公開版判定は食品確認の版を借用せず、欠損・旧版・不正値を拒否する", () => {
    for (const publicationConfirmedFoodVersion of [null, undefined, 0, -1, NaN]) {
        assert.equal(isMenuPublicationCurrent({ foodVersion: 1, publicationConfirmedFoodVersion }), false);
    }
    assert.equal(isMenuPublicationCurrent({ foodVersion: 1, publicationConfirmedFoodVersion: 1 }), true);
    assert.equal(isMenuPublicationCurrent({ foodVersion: -1, publicationConfirmedFoodVersion: -1 }), false);
});
