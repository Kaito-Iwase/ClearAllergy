import assert from "node:assert/strict";
import test from "node:test";
import {
    getMenuPublishButtonColorClass,
    getMenuPublishButtonLabel,
    normalizeOptionalMenuText,
    parseMenuPriceYenInput,
} from "../features/admin/menus/components/menu-form-values";
import {
    getMenuMutationAuditAction,
    mergeIncomingAllergenStatuses,
} from "../features/admin/menus/server/menu-update-helpers";
import {
    filterAndRankShops,
    getCityOptions,
    type PublicShopListShop,
} from "../features/public/shops/components/public-shop-search";

test("メニューフォームの入力正規化は作成・編集で同じ値を返す", () => {
    assert.equal(normalizeOptionalMenuText("  説明  "), "説明");
    assert.equal(normalizeOptionalMenuText("   "), null);
    assert.equal(parseMenuPriceYenInput(" 1200 "), 1200);
    assert.equal(parseMenuPriceYenInput(""), null);
    assert.throws(
        () => parseMenuPriceYenInput("12.5"),
        /価格は整数（円）で入力してください。/,
    );
    assert.throws(
        () => parseMenuPriceYenInput("-1"),
        /価格は0円以上で入力してください。/,
    );
});

test("公開ボタンの文言と色は公開・公開可能・公開不可を区別する", () => {
    assert.equal(
        getMenuPublishButtonLabel({
            readOnly: false,
            isPublished: true,
            canPublish: true,
        }),
        "公開中",
    );
    assert.equal(
        getMenuPublishButtonLabel({
            readOnly: true,
            isPublished: false,
            canPublish: true,
        }),
        "非公開（デモ）",
    );
    assert.equal(
        getMenuPublishButtonLabel({
            readOnly: true,
            isPublished: false,
            canPublish: false,
        }),
        "公開不可（デモ）",
    );
    assert.equal(
        getMenuPublishButtonColorClass({
            isPublished: false,
            canPublish: false,
        }),
        "bg-amber-600",
    );
});

test("メニュー公開状態の変化を監査アクションへ変換する", () => {
    assert.equal(getMenuMutationAuditAction(false, false), "menu_update");
    assert.equal(getMenuMutationAuditAction(true, true), "menu_update");
    assert.equal(getMenuMutationAuditAction(false, true), "menu_publish");
    assert.equal(getMenuMutationAuditAction(true, false), "menu_unpublish");
});

test("受信したアレルゲン状態だけを現行マスタの既存状態へ重ねる", () => {
    const currentStatusBySlug = {
        egg: "FREE",
        milk: "UNKNOWN",
    } as const;
    const mergedStatusBySlug = mergeIncomingAllergenStatuses({
        allergens: [{ slug: "egg" }, { slug: "milk" }],
        currentStatusBySlug,
        incomingStatusBySlug: {
            milk: "MAY_CONTAIN",
            outsideMaster: "CONTAINS",
        },
    });

    assert.deepEqual(mergedStatusBySlug, {
        egg: "FREE",
        milk: "MAY_CONTAIN",
    });
    assert.equal(currentStatusBySlug.milk, "UNKNOWN");
});

function createShop(
    overrides: Partial<PublicShopListShop> &
        Pick<PublicShopListShop, "id" | "name">,
): PublicShopListShop {
    return {
        description: null,
        address: null,
        prefecture: null,
        city: null,
        nearestStation: null,
        category: null,
        latitude: null,
        longitude: null,
        googlePlaceId: null,
        averageBudgetYen: null,
        updatedAt: "2026-07-12T00:00:00.000Z",
        menus: [],
        _count: { menus: 0 },
        ...overrides,
    };
}

const tokyoCafe = createShop({
    id: "tokyo-cafe",
    name: "渋谷カフェ",
    address: "東京都渋谷区神南1-1",
    category: "カフェ",
    latitude: 35.66,
    longitude: 139.7,
    menus: [
        {
            priceYen: 1000,
            allergenLinks: [
                { status: "FREE", allergen: { slug: "egg" } },
            ],
        },
    ],
    _count: { menus: 1 },
});

const tokyoRestaurant = createShop({
    id: "tokyo-restaurant",
    name: "渋谷食堂",
    prefecture: "東京都",
    city: "渋谷区",
    category: "定食",
    latitude: 35.67,
    longitude: 139.7,
    menus: [
        {
            priceYen: 900,
            allergenLinks: [
                { status: "CONTAINS", allergen: { slug: "egg" } },
            ],
        },
    ],
    _count: { menus: 1 },
});

const osakaCafe = createShop({
    id: "osaka-cafe",
    name: "大阪カフェ",
    address: "大阪府大阪市北区梅田1-1",
    category: "カフェ",
    menus: [
        {
            priceYen: 800,
            allergenLinks: [
                { status: "FREE", allergen: { slug: "egg" } },
            ],
        },
    ],
    _count: { menus: 1 },
});

test("公開店舗検索は完全一致、部分一致、除外件数を分ける", () => {
    const result = filterAndRankShops({
        shops: [tokyoCafe, tokyoRestaurant, osakaCafe],
        area: "東京都 渋谷区",
        keyword: "カフェ",
        prefecture: "",
        city: "",
        excludedSlugs: ["egg"],
        includeMayContain: false,
        loadedPreferences: true,
        currentLocation: null,
    });

    assert.deepEqual(
        result.exact.map((shop) => shop.id),
        ["tokyo-cafe"],
    );
    assert.deepEqual(
        result.related.map((shop) => shop.id),
        ["osaka-cafe"],
    );
    assert.equal(result.excludedCount, 1);
});

test("公開店舗検索は現在地がある時だけ距離順へ並べる", () => {
    const result = filterAndRankShops({
        shops: [osakaCafe, tokyoRestaurant, tokyoCafe],
        area: "",
        keyword: "",
        prefecture: "",
        city: "",
        excludedSlugs: [],
        includeMayContain: false,
        loadedPreferences: false,
        currentLocation: { latitude: 35.665, longitude: 139.7 },
    });

    assert.deepEqual(
        result.exact.map((shop) => shop.id),
        ["tokyo-restaurant", "tokyo-cafe", "osaka-cafe"],
    );
});

test("市区町村候補は住所のフォールバックを使い重複を除く", () => {
    assert.deepEqual(
        getCityOptions([tokyoCafe, tokyoRestaurant, osakaCafe], "東京都"),
        ["渋谷区"],
    );
});
