import assert from "node:assert/strict";
import test from "node:test";
import { getPublicShopUrl } from "../features/admin/shop/public-shop-url";

const deployed = "https://clear-allergy.vercel.app";
test("public pages never use a stale localhost or loopback QR base", () => {
    for (const base of ["http://localhost:3000", "http://LOCALHOST.:3000", "http://demo.localhost", "http://127.1:3000", "http://127.255.255.255", "http://[::1]:3000", "http://[::ffff:127.0.0.1]", "http://0.0.0.0", "http://[::]"]) {
        assert.equal(getPublicShopUrl("shop", deployed, base), `${deployed}/shops/shop`, base);
    }
});
test("a valid public canonical origin remains available", () => {
    assert.equal(getPublicShopUrl("shop", deployed, " https://clearallergy.example/ "), "https://clearallergy.example/shops/shop");
    assert.equal(getPublicShopUrl("shop", "https://127.example.com", "http://localhost:3000"), "https://127.example.com/shops/shop");
});
test("missing, invalid or non-origin settings fall back to the observed origin", () => {
    for (const base of [undefined, "", "   ", "not a URL", "javascript:alert(1)", "file:///tmp", "https://user:password@example.com", "https://example.com/base", "https://example.com/?target=other", "https://example.com/#other"]) {
        assert.equal(getPublicShopUrl("shop", deployed, base), `${deployed}/shops/shop`);
    }
});
test("local development keeps its origin or an explicit local base", () => {
    assert.equal(getPublicShopUrl("shop", "http://localhost:3100"), "http://localhost:3100/shops/shop");
    assert.equal(getPublicShopUrl("shop", "http://127.0.0.1:3100", "http://localhost:3000/"), "http://localhost:3000/shops/shop");
});
test("invalid current origins do not create a fabricated link and IDs remain one path segment", () => {
    assert.equal(getPublicShopUrl("shop", "null", deployed), null);
    assert.equal(getPublicShopUrl("", deployed), null);
    assert.equal(getPublicShopUrl("../a?b#c", deployed), `${deployed}/shops/..%2Fa%3Fb%23c`);
});
