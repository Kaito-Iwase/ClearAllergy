import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { allowedMutation, assertAnchor, stopWithDialog, target } from "../scripts/check-issue118-live-t1-browser.mjs";

test("live runner confines menu mutations to one created fixture and an explicit stage", () => {
    const own = "cfictionalnewfixture";
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        for (const path of ["/api/admin/shop", `/api/admin/menus/${target.anchor}`, "/api/admin/menus/cother/stop"]) {
            assert.equal(allowedMutation(method, path, "NONE", own), false);
            assert.equal(allowedMutation(method, path, "CORRECT", own), false);
        }
    }
    assert.equal(allowedMutation("POST", "/api/admin/menus", "CREATE", null), true);
    assert.equal(allowedMutation("PUT", `/api/admin/menus/${own}`, "CORRECT", own), true);
    assert.equal(allowedMutation("POST", `/api/admin/menus/${own}/stop`, "STOP", own), true);
    assert.equal(allowedMutation("DELETE", `/api/admin/menus/${own}`, "CLEANUP", own), false);
    assert.equal(allowedMutation("POST", "/api/admin/auth/login", "NONE", null), true);
});

test("read-only anchor rejects wrong shop, public state, version or milk", () => {
    const shop = { id: target.shop };
    const menu = { id: target.anchor, name: target.anchorName, isPublished: false, priceYen: 1000,
        foodVersion: 87, publicationConfirmedFoodVersion: 87, allergens: [{ slug: "milk", status: "CONTAINS" }] };
    assertAnchor(shop, menu);
    for (const change of [{ id: "cother" }, { isPublished: true }, { foodVersion: 88 }, { priceYen: 999 },
        { allergens: [{ slug: "milk", status: "UNKNOWN" }] }]) assert.throws(() => assertAnchor(shop, { ...menu, ...change }));
    assert.throws(() => assertAnchor({ id: "other" }, menu));
});

test("real isolated Chromium handles confirm before click without external requests", async () => {
    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const external = [];
    await context.route("**/*", route => { external.push("unexpected request"); return route.abort(); });
    try {
        const page = await context.newPage();
        await page.setContent('<button onclick="document.querySelector(\'output\').textContent=window.confirm(\'架空メニューの公開を停止します\')?\'ACCEPTED\':\'DISMISSED\'">STOP</button><output></output>');
        await stopWithDialog(page, "架空メニュー", () => page.getByRole("button", { name: "STOP", exact: true }).click(), 5000);
        assert.equal(await page.locator("output").innerText(), "ACCEPTED");
        await assert.rejects(stopWithDialog(page, "unrelated", () => page.getByRole("button", { name: "STOP", exact: true }).click(), 5000), /DIALOG_HANDLER_FAILED/);
        assert.equal(await page.locator("output").innerText(), "DISMISSED");
        await assert.rejects(stopWithDialog(page, "架空メニュー", async () => {}, 100), /DIALOG_TIMEOUT/);
        assert.deepEqual(external, []);
    } finally { await context.close(); await browser.close(); }
});
