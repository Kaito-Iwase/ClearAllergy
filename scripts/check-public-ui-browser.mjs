// Public UI adversarial regression. Fictional loopback fixture only; no DB/auth/Blob writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = new URL(process.env.CLEARALLERGY_BROWSER_BASE_URL || "http://localhost:3101");
assert.ok(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname), "UI regression requires a fictional loopback fixture");
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || join(tmpdir(), "clearallergy-public-ui");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
let groups = 0;
const pass = name => { groups++; console.log(`PASS: ${name}`); };
const visible = locator => locator.filter({ visible: true });
let page;
async function capture(name) {
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
}
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route("**/*", route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error(`Client exception at ${new URL(page.url()).pathname}: ${error.message}`); });
    page.setDefaultTimeout(20000);
    await page.goto(new URL("/shops", base).href);
    const shopLink = page.locator('a[id^="shop-"]').first();
    await shopLink.waitFor();
    const shopHref = await shopLink.getAttribute("href");
    assert.ok(shopHref?.startsWith("/shops/"));
    await shopLink.click();
    await page.waitForURL(new URL(shopHref, base).href);
    const menuArea = page.locator("#public-menus");
    await menuArea.getByRole("link").first().waitFor();
    const menuHref = await menuArea.getByRole("link").first().getAttribute("href");
    assert.ok(menuHref?.startsWith(`${shopHref}/menus/`));

    for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of ["/", "/shops", shopHref, menuHref, "/terms"]) {
            await page.goto(new URL(route, base).href);
            await visible(page.locator("main")).waitFor();
            assert.equal(await visible(page.locator("main")).count(), 1, "One visible main landmark per page");
            await page.evaluate(async () => { await document.fonts.ready; });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px overflow: ${route}`);
            const logo = visible(page.locator('header a[href="/"]')).first();
            assert.equal(await logo.innerText(), "ClearAllergy");
            assert.equal(await logo.locator("span").evaluate(el => getComputedStyle(el).overflow === "hidden"), false, "Wordmark must not crop glyphs");
            if (route === shopHref || route === menuHref) {
                assert.equal(await visible(page.getByRole("searchbox", { name: "この店舗のメニューを検索", exact: true })).count(), 1);
            }
        }
        pass(`${width}px: home/list/shop/detail/terms, no overflow, full wordmark, one active menu search`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(new URL(shopHref, base).href);
    const panel = () => visible(page.getByRole("button", { name: /あなた向けのアレルゲン設定/ }));
    const open = async () => { if (await panel().getAttribute("aria-expanded") !== "true") await panel().click(); };
    const mode = (name, value) => visible(page.getByRole("combobox", { name: `${name}の表示設定`, exact: true })).selectOption(value);
    const apply = () => visible(page.getByRole("button", { name: "変更を適用", exact: true })).click();
    await open();
    await mode("かに", "highlight");
    await mode("えび", "exclude");
    const editorSummary = visible(page.getByLabel("編集中の表示設定", { exact: true }));
    await visible(page.getByRole("searchbox", { name: "アレルゲンを探す", exact: true })).fill("ピスタチオ");
    assert.match(await editorSummary.innerText(), /注目：かに/);
    assert.match(await editorSummary.innerText(), /除外：えび/);
    assert.equal(await menuArea.getByRole("link").count(), 3, "Draft must not filter cards");
    await capture("ui-01-draft-mobile");
    await apply();
    const curry = menuArea.getByRole("link").filter({ has: page.getByRole("heading", { name: "豆乳ベジカレー", exact: true }) });
    await curry.waitFor();
    assert.match(await curry.innerText(), /確認対象：えび・かに/);
    assert.match(await curry.innerText(), /含む可能性あり・要確認/);
    assert.doesNotMatch(await curry.innerText(), /食品安全の保証ではありません/); // Caution must remain a caution, not a FREE summary.
    await capture("ui-02-caution-mobile");
    pass("Filtered-out draft rows remain named; draft is unapplied; exclusion option off preserves MAY_CONTAIN caution");
    await open();
    await visible(page.getByRole("checkbox", { name: /「含む可能性あり」も除外する/ })).check();
    await apply();
    assert.equal(await curry.count(), 0, "MAY_CONTAIN exclusion applies only after saving");
    await open();
    await visible(page.getByRole("button", { name: "すべて設定なしにする（未適用）", exact: true })).click();
    await apply();
    await open();
    await mode("ピスタチオ", "highlight");
    await apply();
    const firstCard = menuArea.getByRole("link").first();
    assert.match(await firstCard.innerText(), /確認対象：ピスタチオ/);
    assert.match(await firstCard.innerText(), /食品安全の保証ではありません/);
    assert.doesNotMatch(await firstCard.innerText(), /安全に食べ|食べられ/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture("ui-03-free-desktop");
    pass("MAY_CONTAIN exclusion on hides matching menu; FREE retains target and guarantee limitation");

    await open();
    await visible(page.getByRole("button", { name: "すべて設定なしにする（未適用）", exact: true })).click();
    await mode("卵", "highlight");
    await apply();
    const pancake = menuArea.getByRole("link").filter({ has: page.getByRole("heading", { name: "米粉パンケーキ", exact: true }) });
    assert.match(await pancake.innerText(), /別の公開メニューに「含む」登録/);
    assert.match(await pancake.innerText(), /交差接触を確認した結果ではありません/);
    await pancake.press("Enter");
    await page.waitForURL(/\/menus\//);
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
    assert.match(await visible(page.locator("main")).innerText(), /別の公開メニューに「含む」登録/);
    await capture("ui-04-store-supplement-desktop");
    pass("FREE with store supplement stays caution across keyboard detail navigation");

    assert.deepEqual(errors, [], "Normal public routes must have no client exceptions");
    const notFoundResponse = await page.goto(new URL("/shops/ui-audit-does-not-exist", base).href);
    const notFoundHtml = await notFoundResponse.text();
    await page.getByRole("heading", { name: "ページが見つかりません", exact: true }).waitFor();
    await page.getByRole("link", { name: "店舗一覧を見る", exact: true }).click();
    await page.waitForURL(new URL("/shops", base).href);
    // Next's streamed notFound may abort Suspense after HTTP 200 has committed.
    // Report this separately; never suppress #419 on normal routes or other errors.
    assert.ok(errors.every(message => message.startsWith("Minified React error #419;") && notFoundHtml.includes('data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"')));
    if (errors.length > 0) console.log(`LIMITATION: streamed notFound recovery reported React #419 (${errors.length}); HTTP ${notFoundResponse.status()}. Normal routes had zero client exceptions.`);
    pass("404 renders recovery link; known streamed notFound fallback accounted for separately");
    await context.close();
    console.log(`Completed: ${groups} UI groups passed`);
} catch (error) {
    console.error(error.stack);
    if (page) await capture("ui-failure").catch(() => {});
    process.exitCode = 1;
} finally { await browser.close(); }
