// 既存Playwrightランナーで公開画面と保存しないデモを確認する。DBは更新しない。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.CLEARALLERGY_BROWSER_BASE_URL || "http://localhost:3101";
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || join(tmpdir(), "clearallergy-first-use");
const baseUrl = new URL(base);
assert.ok(baseUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(baseUrl.hostname), "ブラウザ回帰はローカルの架空データ環境だけで実行してください");
// next startの起動を待つ。店舗データの成否はこの後の画面内容で確認する。
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(base + "/shops", { signal: AbortSignal.timeout(3000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(ready, "ローカルアプリが起動しませんでした");
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
    if (process.env.CLEARALLERGY_BROWSER_BLOCK_EXTERNAL === "true") {
        await context.route("**/*", route => new URL(route.request().url()).origin === baseUrl.origin ? route.continue() : route.abort());
    }
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

    const panelButton = () => visible(page.getByRole("button", { name: /あなた向けのアレルゲン設定/ }));
    const openPreferences = async () => { if (await panelButton().getAttribute("aria-expanded") !== "true") await panelButton().click(); };
    const setMode = (name, mode) => visible(page.getByRole("combobox", { name: name + "の表示設定", exact: true })).selectOption(mode);
    const apply = () => visible(page.getByRole("button", { name: "変更を適用", exact: true })).click();
    const preferences = () => page.evaluate(() => JSON.parse(localStorage.getItem("clearallergy:user-allergens")));
    await openPreferences();
    await setMode("卵", "highlight");
    await apply();
    assert.deepEqual((await preferences()).highlightSlugs, ["egg"]);
    await openPreferences();
    await setMode("乳", "highlight");
    await setMode("えび", "exclude");
    await visible(page.getByRole("checkbox", { name: /「含む可能性あり」も除外する/ })).check();
    assert.deepEqual((await preferences()).highlightSlugs, ["egg"]);
    assert.equal((await preferences()).includeMayContain, false);
    assert.equal(await page.getByText("変更を適用しました。", { exact: true }).count(), 0);
    await panelButton().click();
    await page.getByText("未適用の変更あり", { exact: true }).waitFor();
    await openPreferences();
    await visible(page.getByRole("button", { name: "キャンセル", exact: true })).click();
    assert.deepEqual((await preferences()).highlightSlugs, ["egg"]);
    await openPreferences();
    await setMode("乳", "highlight");
    await setMode("えび", "exclude");
    await apply();
    assert.deepEqual((await preferences()).highlightSlugs, ["egg", "milk"]);
    assert.deepEqual((await preferences()).excludedSlugs, ["shrimp"]);
    await openPreferences();
    await setMode("卵", "none");
    await apply();
    assert.deepEqual((await preferences()).highlightSlugs, ["milk"]);
    await page.reload();
    await openPreferences();
    assert.equal(await visible(page.getByRole("combobox", { name: "えびの表示設定", exact: true })).inputValue(), "exclude");
    await screenshot(page, "05-preferences-after-mobile");
    pass("1件保存後の複数追加・一部解除・オプションも一括適用・折りたたみ中の未適用表示・キャンセル・再読み込み");

    const second = await context.newPage();
    await second.goto(base + shopHref);
    await second.evaluate(() => localStorage.setItem("clearallergy:user-allergens", JSON.stringify({
        highlightSlugs: ["milk", "walnut"], excludedSlugs: ["shrimp"], includeMayContain: true })));
    await page.waitForFunction(() => document.querySelector('select[aria-label="くるみの表示設定"]')?.value === "highlight");
    await setMode("えび", "none");
    await second.evaluate(() => localStorage.setItem("clearallergy:user-allergens", JSON.stringify({
        highlightSlugs: ["milk", "walnut", "egg"], excludedSlugs: ["shrimp"], includeMayContain: true })));
    await visible(page.getByRole("alert").filter({ hasText: "別の画面で設定が変更されました" })).waitFor();
    assert.equal(await visible(page.getByRole("button", { name: "変更を適用", exact: true })).isDisabled(), true);
    await visible(page.getByRole("button", { name: "編集を破棄して最新の設定を読み直す", exact: true })).click();
    await setMode("えび", "none");
    await page.evaluate(() => {
        window.__originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new DOMException("disabled", "QuotaExceededError"); };
    });
    await apply();
    await visible(page.getByRole("status").filter({ hasText: "設定を保存できませんでした" })).waitFor();
    assert.deepEqual((await preferences()).excludedSlugs, ["shrimp"]);
    assert.equal(await visible(page.getByRole("combobox", { name: "えびの表示設定", exact: true })).inputValue(), "none");
    await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
    await apply();
    assert.deepEqual((await preferences()).highlightSlugs, ["milk", "walnut", "egg"]);
    assert.deepEqual((await preferences()).excludedSlugs, []);
    assert.equal((await preferences()).includeMayContain, true);
    await second.close();
    pass("別タブ同期・編集中の競合による上書き防止・保存失敗で入力保持・再試行");

    // 除外設定中もヒーロー導線は現在の一覧を指し、表示件数は実カード数に一致する。
    await openPreferences();
    await setMode("卵", "exclude");
    await apply();
    await page.getByRole("link", { name: "公開メニューを見る", exact: true }).click();
    await page.waitForURL(base + shopHref + "#public-menus");
    assert.equal(new URL(page.url()).pathname, shopHref);
    assert.equal(new URL(page.url()).hash, "#public-menus");
    await page.getByText("表示 2件 / 検索対象 3件", { exact: true }).waitFor();
    assert.equal(await page.locator('article[role="button"]').count(), 2);
    pass("除外後の公開メニュー導線と表示件数が現在の一覧に一致");

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await visible(page.getByRole("searchbox", { name: "この店舗のメニューを検索", exact: true })).count(), 1);
        await screenshot(page, `03-shop-after-${width}`);
    }
    await page.locator('article[role="button"]').first().press("Enter");
    await page.waitForURL(/\/menus\//, { waitUntil: "domcontentloaded" });
    await page.getByText("確認対象 3件：くるみ・卵・乳", { exact: true }).waitFor();
    await page.getByText("選択中アレルゲンの登録状態", { exact: true }).waitFor();
    await openPreferences();
    await setMode("乳", "none");
    await visible(page.getByRole("button", { name: "変更を適用", exact: true })).press("Enter");
    assert.deepEqual((await preferences()).highlightSlugs, ["walnut"]);
    await screenshot(page, "05-detail-preferences-after");
    await visible(page.getByRole("searchbox", { name: "この店舗のメニューを検索", exact: true })).fill("カレー");
    await visible(page.getByRole("searchbox", { name: "この店舗のメニューを検索", exact: true })).press("Enter");
    await page.waitForURL(base + shopHref + "?q=" + encodeURIComponent("カレー"), { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "豆乳ベジカレー", exact: true }).waitFor();
    pass("390/1440pxの横幅・検索欄の重複なし・詳細でもキーボードで設定解除して店舗内検索へ戻る");

    await page.goto(base + shopHref);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    // OSの共有ダイアログを開かず、コピーへのフォールバックを検証する。
    await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
    await page.getByRole("button", { name: "この店舗のURLを共有", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "店舗URLをコピーしました。" }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), base + shopHref);
    pass("店舗URLの共有ボタンから正しい公開URLをコピー");

    if (process.env.CLEARALLERGY_BROWSER_PUBLIC_ONLY !== "true") {
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
    // 店舗編集もデモ内に戻り、未保存入力を保護する。
    await page.goto(base + "/admin/demo");
    const shopName = page.getByLabel("店舗名（必須）", { exact: true });
    const originalShopName = await shopName.inputValue();
    await shopName.fill(originalShopName + "変更");
    page.on("dialog", reject);
    const beforeShop = confirmations;
    await page.getByRole("link", { name: "メニュー管理へ戻る", exact: true }).click();
    assert.equal(confirmations, beforeShop + 1);
    assert.equal(await shopName.inputValue(), originalShopName + "変更");
    await shopName.fill(originalShopName);
    await page.getByRole("link", { name: "メニュー管理へ戻る", exact: true }).click();
    await page.waitForURL(base + "/admin/demo/menus");
    page.off("dialog", reject);
    await page.goto(base + "/admin/demo/menus/new");
    await page.getByRole("button", { name: "次の未設定項目へ", exact: true }).first().click();
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[role="group"]')?.getAttribute("aria-label")), "えび");
    await page.getByRole("group", { name: "えび", exact: true }).getByRole("button", { name: "含む", exact: true }).click();
    await page.getByRole("button", { name: "次の未設定項目へ", exact: true }).first().click();
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[role="group"]')?.getAttribute("aria-label")), "かに");
    pass("店舗の未保存保護・デモへの戻り先・未設定の次項目へのフォーカス");
    }
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
