import assert from "node:assert/strict";
import test from "node:test";
import { getMenuReviewMessage } from "../features/admin/menus/publication-review";

test("公開前・原材料変更時は確認し、通常の下書き保存には追加確認を要求しない", () => {
    assert.equal(getMenuReviewMessage({ name: "架空", willPublish: false, ingredientsChanged: false }), null);
    assert.match(getMenuReviewMessage({ name: "架空", willPublish: true, ingredientsChanged: false })!, /公開する前に/);
    assert.match(getMenuReviewMessage({ name: "架空", willPublish: false, ingredientsChanged: true })!, /原材料を変更/);
    assert.match(getMenuReviewMessage({ name: "架空", willPublish: false, ingredientsChanged: true })!, /非公開のまま/);
});
