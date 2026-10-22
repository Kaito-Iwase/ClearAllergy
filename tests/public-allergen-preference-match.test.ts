import assert from "node:assert/strict";
import test from "node:test";
import { getAllergenPreferenceMatches } from "../lib/public-allergen-preference-match";
import { normalizeUserAllergenPreferences } from "../lib/public-allergen-preferences";
import { filterAndRankShops, type PublicShopListShop } from "../features/public/shops/components/public-shop-search";
import type { AllergenStatus } from "../lib/allergens";

for (const includeMayContain of [false, true]) {
    for (const status of ["CONTAINS", "MAY_CONTAIN", "FREE", "UNKNOWN", undefined] as const) {
        test(`preference match: ${status ?? "missing"}, possibility=${includeMayContain}`, () => {
            const statusBySlug: Record<string, AllergenStatus> = status ? { walnut: status } : {};
            const original = { ...statusBySlug };
            const matches = getAllergenPreferenceMatches({ statusBySlug, slugs: ["walnut", "walnut"], includeMayContain,
                storeHandledAllergenSlugs: ["walnut"] });
            const source = status === "CONTAINS" ? "CONTAINS"
                : includeMayContain && status === "MAY_CONTAIN" ? "MAY_CONTAIN"
                : includeMayContain && status === "FREE" ? "STORE_HANDLED" : null;
            assert.deepEqual(matches, source ? [{ slug: "walnut", source }] : []);
            assert.deepEqual(statusBySlug, original);
        });
    }
}

test("FREE without a public source does not match, and each selected item keeps its own source", () => {
    assert.deepEqual(getAllergenPreferenceMatches({ statusBySlug: { walnut: "FREE", milk: "MAY_CONTAIN", peanut: "CONTAINS", orange: "FREE" },
        slugs: ["walnut", "milk", "peanut", "orange"], includeMayContain: true, storeHandledAllergenSlugs: ["walnut"] }), [
        { slug: "walnut", source: "STORE_HANDLED" }, { slug: "milk", source: "MAY_CONTAIN" }, { slug: "peanut", source: "CONTAINS" },
    ]);
});

test("existing stored preferences preserve the toggle and each independent mode", () => {
    const preferences = normalizeUserAllergenPreferences(JSON.parse(JSON.stringify({
        highlightSlugs: ["milk", "walnut"], excludedSlugs: ["orange"], includeMayContain: true,
    })));
    assert.deepEqual(preferences.highlightSlugs, ["milk", "walnut"]);
    assert.deepEqual(preferences.excludedSlugs, ["orange"]);
    assert.equal(preferences.includeMayContain, true);
});

const links = (status: AllergenStatus) => [{ status, allergen: { slug: "walnut" } }];
const shop: PublicShopListShop = {
    id: "fictional", name: "Fictional", description: null, address: null, prefecture: null, city: null,
    nearestStation: null, category: null, latitude: null, longitude: null, googlePlaceId: null,
    averageBudgetYen: null, updatedAt: "2026-10-23T00:00:00.000Z", _count: { menus: 2 },
    menus: [{ priceYen: null, allergenLinks: links("FREE") }, { priceYen: null, allergenLinks: links("CONTAINS") }],
};
const search = (shops: PublicShopListShop[], includeMayContain: boolean, loadedPreferences = true) => filterAndRankShops({
    shops, area: "", keyword: "", prefecture: "", city: "", currentLocation: null,
    excludedSlugs: ["walnut"], includeMayContain, loadedPreferences,
});

test("shop search uses the whole public menu source before filtering; OFF retains FREE, ON excludes", () => {
    assert.equal(search([shop], false).exact.length, 1);
    assert.equal(search([shop], true).exact.length, 0);
    assert.equal(search([shop], true).excludedCount, 1);
    assert.equal(search([shop], true, false).exact.length, 1);
});

test("removing the public source restores the FREE candidate, without inventing MAY_CONTAIN", () => {
    const withoutSource = { ...shop, menus: shop.menus.slice(0, 1) };
    assert.equal(search([withoutSource], true).exact.length, 1);
    assert.equal(withoutSource.menus[0].allergenLinks[0].status, "FREE");
    const mayOnly = { ...shop, menus: [{ priceYen: null, allergenLinks: links("MAY_CONTAIN") }] };
    assert.equal(search([mayOnly], false).exact.length, 1);
    assert.equal(search([mayOnly], true).exact.length, 0);
});
