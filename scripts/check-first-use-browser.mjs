// 既存Playwrightランナーで公開画面と保存しないデモを確認する。DBは更新しない。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.CLEARALLERGY_BROWSER_BASE_URL || "http://localhost:3101";
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || "/tmp/clearallergy-first-use-20260912";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const errors = [];
let groups = 0;
let activePage;
const pass = (message) => { groups++; console.log("PASS: " + message); };
const visible = (locator) => locator.filter({ visible: true });
async function screenshot(page, name) {
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); await new Promise(requestAnimationFrame); });
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(20000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/shops");
    await page.getByRole("heading", { name: "条件に一致するClearAllergy登録済み店舗", exact: true }).waitFor();
    const firstShop = page.locator('a[id^="shop-"]').first();
    const shopHref = await firstShop.getAttribute("href");
    assert.ok(shopHref, "専用テスト環境に公開店舗が必要です");
    await firstShop.click();
    await page.waitForURL(base + shopHref, { waitUntil: "domcontentloaded" });
    const search = visible(page.getByRole("searchbox", { name: "この店舗のメニューを検索", exact: true }));
    await search.waitFor();
    await screenshot(page, "03-shop-after-mobile");
    await search.fill("一致しない検証用メニュー");
    await search.press("Enter");
    await page.getByText("検索条件に一致する公開メニューがありません。", { exact: true }).waitFor();
    await screenshot(page, "04-empty-search-after");
    await page.getByRole("button", { name: "メニュー検索を解除", exact: true }).click();
    await page.waitForURL(base + shopHref, { waitUntil: "domcontentloaded" });
    await page.locator('article[role="button"]').first().waitFor();
    assert.equal(await search.inputValue(), "");
    await search.fill("カレー");
    await search.press("Enter");
    await page.waitForURL(base + shopHref + "?q=" + encodeURIComponent("カレー"), { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "豆乳ベジカレー", exact: true }).waitFor();
    assert.equal(await page.locator('article[role="button"]').count(), 1);
    await visible(page.getByRole("button", { name: "検索をクリア", exact: true })).click();
    await page.waitForURL(base + shopHref, { waitUntil: "domcontentloaded" });
    pass("390pxの店舗内検索・Enter送信・0件からの解除・通常検索からの解除");

    await visible(page.getByRole("button", { name: /あなた向けのアレルゲン設定/ })).click();
    await visible(page.getByRole("button", { name: "卵", exact: true })).click();
    await visible(page.getByRole("button", { name: /^強調する/ })).click();
    await visible(page.getByRole("button", { name: "えび", exact: true })).click();
    await visible(page.getByRole("button", { name: /^除外する/ })).click();
    await visible(page.getByRole("button", { name: "卵 強調", exact: true })).click();
    await visible(page.getByRole("button", { name: "選択した設定を解除", exact: true })).click();
    const preferences = () => page.evaluate(() => JSON.parse(localStorage.getItem("clearallergy:user-allergens")));
    assert.deepEqual((await preferences()).highlightSlugs, []);
    assert.deepEqual((await preferences()).excludedSlugs, ["shrimp"]);
    await screenshot(page, "05-preferences-after-mobile");
    await page.reload();
    await visible(page.getByRole("button", { name: /あなた向けのアレルゲン設定/ })).click();
    await visible(page.getByRole("button", { name: "えび 除外", exact: true })).waitFor();
    pass("選択した設定だけ解除し、他の除外設定を保持して再読込に反映");

    const second = await context.newPage();
    await second.goto(base + shopHref);
    await second.evaluate(() => localStorage.setItem("clearallergy:user-allergens", JSON.stringify({
        highlightSlugs: ["milk"], excludedSlugs: ["shrimp"], includeMayContain: true })));
    await visible(page.getByRole("button", { name: "乳 強調", exact: true })).waitFor();
    await visible(page.getByRole("button", { name: "えび 除外", exact: true })).click();
    await page.evaluate(() => {
        window.__originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new DOMException("disabled", "QuotaExceededError"); };
    });
    await visible(page.getByRole("button", { name: "選択した設定を解除", exact: true })).click();
    await visible(page.getByRole("status").filter({ hasText: "設定を保存できませんでした" })).waitFor();
    assert.deepEqual((await preferences()).excludedSlugs, ["shrimp"]);
    assert.equal(await visible(page.getByRole("button", { name: "えび 除外", exact: true })).getAttribute("aria-pressed"), "true");
    await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
    await visible(page.getByRole("button", { name: "選択した設定を解除", exact: true })).click();
    assert.deepEqual((await preferences()).highlightSlugs, ["milk"]);
    assert.deepEqual((await preferences()).excludedSlugs, []);
    assert.equal((await preferences()).includeMayContain, true);
    await second.close();
    pass("別タブの最新設定を保持し、保存失敗時は未適用・選択保持、再試行で復帰");

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await visible(page.getByRole("searchbox", { name: "この店舗のメニューを検索", exact: true })).count(), 1);
        await screenshot(page, `03-shop-after-${width}`);
    }
    await page.locator('article[role="button"]').first().press("Enter");
    await page.waitForURL(/\/menus\//, { waitUntil: "domcontentloaded" });
    await visible(page.getByRole("button", { name: /あなた向けのアレルゲン設定/ })).click();
    await visible(page.getByRole("button", { name: "乳 強調", exact: true })).click();
    await visible(page.getByRole("button", { name: "選択した設定を解除", exact: true })).press("Enter");
    assert.deepEqual((await preferences()).highlightSlugs, []);
    await screenshot(page, "05-detail-preferences-after");
    await visible(page.getByRole("searchbox", { name: "この店舗のメニューを検索", exact: true })).fill("カレー");
    await visible(page.getByRole("searchbox", { name: "この店舗のメニューを検索", exact: true })).press("Enter");
    await page.waitForURL(base + shopHref + "?q=" + encodeURIComponent("カレー"), { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "豆乳ベジカレー", exact: true }).waitFor();
    pass("390/1440pxの横幅・検索欄の重複なし・詳細でもキーボードで設定解除して店舗内検索へ戻る");

    await page.goto(base + shopHref);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "この店舗のURLを共有", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), base + shopHref);
    pass("店舗URLの共有ボタンから正しい公開URLをコピー");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/admin/demo/menus/new");
    const name = page.getByLabel("メニュー名", { exact: true });
    await name.fill("未保存の検証入力");
    let confirmations = 0;
    const reject = async (dialog) => { confirmations++; await dialog.dismiss(); };
    page.on("dialog", reject);
    await page.getByRole("button", { name: "一覧に戻る", exact: true }).click();
    assert.equal(confirmations, 1);
    assert.equal(await name.inputValue(), "未保存の検証入力");
    await visible(page.locator('a[href="/admin/demo/menus"]')).first().click();
    assert.equal(confirmations, 2);
    assert.equal(new URL(page.url()).pathname, "/admin/demo/menus/new");
    const reloadDialog = page.waitForEvent("dialog");
    const reloadAttempt = page.reload().catch(() => null);
    assert.equal((await reloadDialog).type(), "beforeunload");
    await reloadAttempt;
    assert.equal(await name.inputValue(), "未保存の検証入力");
    assert.equal(confirmations, 3);
    assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))), true);
    await screenshot(page, "06-unsaved-after-mobile");
    page.off("dialog", reject);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "一覧に戻る", exact: true }).click();
    await page.waitForURL(base + "/admin/demo/menus", { waitUntil: "domcontentloaded" });
    await page.goto(base + "/admin/demo/menus/new");
    assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))), false);
    pass("新規入力の破棄をボタン・リンク・再読込で保護し、キャンセルで保持、承認で移動、未入力は警告なし");

    await page.goto(base + "/admin/demo/menus");
    await page.locator('a[href$="/edit"]').first().click();
    await page.waitForURL(/\/edit$/, { waitUntil: "domcontentloaded" });
    const editName = page.getByLabel("メニュー名", { exact: true });
    const savedName = await editName.inputValue();
    await editName.fill(savedName + "変更");
    page.on("dialog", reject);
    const beforeCount = confirmations;
    await visible(page.locator('a[href="/admin/demo/menus"]')).first().click();
    assert.equal(confirmations, beforeCount + 1);
    await editName.fill(savedName);
    await visible(page.locator('a[href="/admin/demo/menus"]')).first().click();
    await page.waitForURL(base + "/admin/demo/menus", { waitUntil: "domcontentloaded" });
    assert.equal(confirmations, beforeCount + 1);
    page.off("dialog", reject);
    assert.equal((await context.request.get(base + "/api/admin/menus")).status(), 401);
    pass("既存メニュー編集の入力保持・元の値に戻すと警告解除・匿名管理APIは401");
    assert.deepEqual(errors, []);
    pass("全フローでクライアント例外なし");
    await context.close();
    console.log(`Completed: ${groups} groups passed`);
} catch (error) {
    console.error(error.stack);
    if (activePage) { console.error("Current URL:", activePage.url()); await screenshot(activePage, "failure").catch(() => {}); }
    process.exitCode = 1;
} finally {
    await browser.close();
}
