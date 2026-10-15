import assert from "node:assert/strict";
import test from "node:test";
import { parseShopSaveResponse } from "../features/admin/shop/schemas/shop-response";

const before = "2026-10-15T00:00:00.000Z";
const shop = {
    id: "shop-a", name: "架空店舗", description: null, address: null,
    prefecture: null, city: null, nearestStation: null, category: null,
    googlePlaceId: null, hours: null, regularHoliday: null, phoneNumber: null,
    note: null, latitude: null, longitude: null, averageBudgetYen: null,
    coverImageUrl: null, coverImageFrame: "wide", coverImageFit: "cover",
    coverImagePosition: "center", coverImageZoom: 100,
    coverImagePositionX: 50, coverImagePositionY: 50,
    updatedAt: "2026-10-15T00:00:00.001Z",
};

test("店舗成功応答は完全な対象DTOと進んだtokenだけ保存済みへ使える", () => {
    assert.ok(parseShopSaveResponse({ shop }, "shop-a", before));
    assert.equal(parseShopSaveResponse({ shop, publicRefreshPending: true }, "shop-a", before)?.publicRefreshPending, true);
    for (const value of [null, {}, { shop: {} },
        { shop: { ...shop, id: "shop-b" } },
        { shop: { ...shop, updatedAt: before } },
        { shop: { ...shop, updatedAt: "2020-01-01T00:00:00.000Z" } },
        { shop: { ...shop, updatedAt: "invalid" } },
        { shop: { ...shop, note: undefined } },
        { shop: { ...shop, coverImageZoom: "100" } },
        { shop: { ...shop, averageBudgetYen: -1 } },
        { shop, publicRefreshPending: "true" },
    ]) assert.equal(parseShopSaveResponse(value, "shop-a", before), null);
});
