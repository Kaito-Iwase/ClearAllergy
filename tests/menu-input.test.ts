import assert from "node:assert/strict";
import test from "node:test";
import { menuInputSchema } from "../features/admin/menus/schemas/menu-input";

test("下書きの空objectと部分更新・明示的な空欄を受け付ける", () => {
    assert.equal(menuInputSchema.safeParse({}).success, true);
    assert.equal(menuInputSchema.safeParse({ ingredients: null, precaution: "", isPublished: false }).success, true);
});

test("不正JSON形状・型・文字数・状態を保存前に拒否する", () => {
    for (const body of [null, [], "text", 3, { name: " " }, { ingredients: 123 },
        { precaution: {} }, { isPublished: "true" }, { name: "a".repeat(121) },
        { imageZoom: 999 }, { allergenStatusBySlug: { egg: "SAFE" } }]) {
        assert.equal(menuInputSchema.safeParse(body).success, false, JSON.stringify(body));
    }
});

test("送信された所有者IDは保存データに採用しない", () => {
    const parsed = menuInputSchema.parse({ name: "test", shopId: "another-shop", userId: "another-user" });
    assert.deepEqual(parsed, { name: "test" });
});
