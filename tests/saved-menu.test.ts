import assert from "node:assert/strict";
import test from "node:test";
import { loadSavedMenu, savedMenuEditorProps } from "@/features/admin/menus/saved-menu";
import { savedMenuResponseSchema } from "@/features/admin/menus/schemas/menu-response";

const menu = {
    id: "menu", version: 34, foodVersion: 33, reviewedFoodVersion: null,
    publicationConfirmedFoodVersion: null, isPublished: false, foodReviews: [],
    name: "保存済みの架空料理", description: null, priceYen: 0, category: null,
    ingredients: "保存済み原材料", precaution: "保存済み注意書き\n全文", imageUrl: null,
    imageFrame: "square", imageFit: "cover", imagePosition: "center", imageZoom: 100,
    imagePositionX: 50, imagePositionY: 50,
    allergens: [{ slug: "walnut", nameJa: "くるみ", nameEn: null, sortOrder: 1, status: "UNKNOWN" }],
};

test("保存済みGETの実版・全内容を使用し、欠損やUNKNOWNをFREEに置換しない", async t => {
    t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
        assert.equal(url, "/api/admin/menus/menu"); assert.equal(init?.cache, "no-store");
        return Response.json({ menu });
    });
    const actual = await loadSavedMenu("menu", { version: 34, foodVersion: 33 });
    assert.equal(actual.precaution, menu.precaution);
    const props = savedMenuEditorProps(actual);
    assert.equal(props.initialVersion, 34); assert.equal(props.initialFoodVersion, 33);
    assert.deepEqual(props.initialStatusBySlug, { walnut: "UNKNOWN" });
    assert.equal(props.initialPrecaution, menu.precaution); assert.equal(props.initialPriceYen, 0);
});

for (const changed of [{ id: "other" }, { version: 35 }, { foodVersion: 34 }]) {
    test(`保存応答とGETが不一致なら公開確認に使用しない ${JSON.stringify(changed)}`, async t => {
        t.mock.method(globalThis, "fetch", async () => Response.json({ menu: { ...menu, ...changed } }));
        await assert.rejects(loadSavedMenu("menu", { version: 34, foodVersion: 33 }));
    });
}
test("認可失敗・不正JSON・不正snapshotは正常な保存済み内容と扱わない", async t => {
    for (const response of [Response.json({ error: "アクセスできません" }, { status: 403 }), new Response("not-json"), Response.json({ menu: {} })]) {
        const mock = t.mock.method(globalThis, "fetch", async () => response);
        await assert.rejects(loadSavedMenu("menu")); mock.mock.restore();
    }
});
test("全品目欠損・重複・不正状態・公開版不一致をsnapshot境界で拒否する", () => {
    for (const changed of [{ allergens: [] }, { allergens: [...menu.allergens, ...menu.allergens] },
        { allergens: [{ ...menu.allergens[0], status: "SAFE" }] }, { isPublished: true }]) {
        assert.equal(savedMenuResponseSchema.safeParse({ menu: { ...menu, ...changed } }).success, false);
    }
    assert.equal(savedMenuResponseSchema.safeParse({ menu: { ...menu, allergens: [{ ...menu.allergens[0], status: "MAY_CONTAIN" }] } }).success, true);
});
