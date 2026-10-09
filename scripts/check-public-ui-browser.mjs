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
async function readablePreference(locator, hue) {
    const appearance = await locator.evaluate(element => {
        const style = getComputedStyle(element);
        const rgb = color => {
            const context = document.createElement("canvas").getContext("2d");
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value / 255);
        };
        return { text: rgb(style.color), background: rgb(style.backgroundColor), border: rgb(style.borderTopColor) };
    });
    const luminance = rgb => rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (left, right) => (Math.max(luminance(left), luminance(right)) + 0.05) / (Math.min(luminance(left), luminance(right)) + 0.05);
    assert.ok(contrast(appearance.text, appearance.background) >= 4.5, `${hue}: readable selected text`);
    assert.ok(contrast(appearance.border, appearance.background) >= 3, `${hue}: visible selected boundary`);
    const [red, green, blue] = appearance.background;
    assert.ok(hue === "yellow" ? red > blue && green > blue : red > green && red > blue, `${hue}: requested hue`);
}
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
    const fontInspector = await context.newCDPSession(page);
    await fontInspector.send("DOM.enable");
    await fontInspector.send("CSS.enable");
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

    const defaultChicken = menuArea.getByRole("link").filter({ has: page.getByRole("heading", { name: "照り焼きチキンプレート", exact: true }) });
    assert.match(await defaultChicken.innerText(), /確認対象：特定原材料（9品目）/);
    assert.match(await defaultChicken.innerText(), /特定原材料：含む/);
    const chickenOther = defaultChicken.getByRole("group", { name: "その他のアレルゲン", exact: true });
    const chickenOtherRows = chickenOther.locator("dl > div");
    assert.match(await chickenOtherRows.filter({ has: page.locator("dt", { hasText: /^含む$/ }) }).innerText(), /大豆・鶏肉\s*（2品目）/);
    assert.match(await chickenOtherRows.filter({ has: page.locator("dt", { hasText: "含む可能性あり・要確認" }) }).innerText(), /ごま\s*（1品目）/);
    // Check the primary counts separately from the other group, so all-29 aggregation cannot pass.
    const primaryText = await defaultChicken.evaluate(card => card.innerText.split("その他のアレルゲン")[0]);
    assert.match(primaryText, /含む\s+卵\s*（1品目）/);
    assert.match(primaryText, /含む可能性あり・要確認\s+小麦・乳\s*（2品目）/);
    const defaultPancake = menuArea.getByRole("link").filter({ has: page.getByRole("heading", { name: "米粉パンケーキ", exact: true }) });
    assert.doesNotMatch(await defaultPancake.innerText(), /特定原材料：含む/);
    assert.match(await defaultPancake.getByRole("group", { name: "その他のアレルゲン", exact: true }).innerText(), /含む\s+大豆\s*（1品目）/);
    pass("Unselected cards classify specified ingredients separately; other CONTAINS/MAY_CONTAIN facts remain visible");

    for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of ["/", "/shops", shopHref, menuHref, "/terms"]) {
            await page.goto(new URL(route, base).href);
            await visible(page.locator("main")).waitFor();
            assert.equal(await visible(page.locator("main")).count(), 1, "One visible main landmark per page");
            await page.evaluate(async () => { await document.fonts.ready; });
            const fonts = await page.evaluate(() => ({
                loaded: [...document.fonts].filter(font => font.status === "loaded").map(font => font.family),
                families: [...document.querySelectorAll("body, main, h1, input, select, button")].map(element => getComputedStyle(element).fontFamily),
            }));
            assert.ok(fonts.loaded.some(font => /Noto[ _]Sans[ _]JP/i.test(font)), "Japanese web font must actually load from the app origin");
            assert.ok(fonts.families.every(font => /Noto[ _]Sans[ _]JP/i.test(font)), "Page and controls share the Japanese font");
            // CSS family names and a loaded Latin shard alone cannot prove Japanese glyph rendering.
            assert.match(await visible(page.locator("main h1")).innerText(), /[\u3040-\u30ff\u3400-\u9fff]/, "Heading includes Japanese glyphs");
            let renderedFonts;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    // Navigation can retain hidden page DOM. Inspect the visible heading only,
                    // and wait for its glyphs rather than a fonts.ready promise from the previous page.
                    await visible(page.locator("main h1")).evaluate(async heading => {
                        document.querySelectorAll("[data-ui-font-heading]").forEach(node => node.removeAttribute("data-ui-font-heading"));
                        heading.setAttribute("data-ui-font-heading", "");
                        await document.fonts.load(getComputedStyle(heading).font, heading.textContent ?? "");
                        await document.fonts.ready;
                        await new Promise(requestAnimationFrame);
                    });
                    const { root } = await fontInspector.send("DOM.getDocument");
                    const { nodeId } = await fontInspector.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-ui-font-heading]" });
                    assert.ok(nodeId, "Inspect a real page heading");
                    ({ fonts: renderedFonts } = await fontInspector.send("CSS.getPlatformFontsForNode", { nodeId }));
                    break;
                } catch (error) {
                    // Hydration can replace a node between CDP calls. Only reacquire a stale node;
                    // failed font assertions, missing headings and other protocol errors still fail.
                    if (attempt === 2 || !error.message.includes("Could not find node with given id")) throw error;
                    console.log("RETRY: font DOM snapshot changed during hydration");
                }
            }
            assert.ok(renderedFonts.length > 0 && renderedFonts.every(font => font.isCustomFont && /Noto\s*Sans\s*JP/i.test(font.familyName)), "Japanese glyphs must render using the self-hosted Noto font, without falling back to an OS font");
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
    await readablePreference(visible(page.getByRole("combobox", { name: "かにの表示設定", exact: true })), "yellow");
    await readablePreference(visible(page.getByRole("combobox", { name: "えびの表示設定", exact: true })), "red");
    assert.match(await panel().innerText(), /未設定/, "Draft selections are not presented as saved preferences");
    pass("Japanese font loaded locally; attention yellow/exclusion red have readable text, visible boundaries and unapplied draft labels");
    const editorSummary = visible(page.getByLabel("編集中の表示設定", { exact: true }));
    await visible(page.getByRole("searchbox", { name: "アレルゲンを探す", exact: true })).fill("ピスタチオ");
    assert.match(await editorSummary.innerText(), /注目：かに/);
    assert.match(await editorSummary.innerText(), /除外：えび/);
    assert.equal(await menuArea.getByRole("link").count(), 3, "Draft must not filter cards");
    await capture("ui-01-draft-mobile");
    await apply();
    const curry = menuArea.getByRole("link").filter({ has: page.getByRole("heading", { name: "豆乳ベジカレー", exact: true }) });
    await curry.waitFor();
    assert.match(await panel().innerText(), /注目：かに/);
    assert.match(await panel().innerText(), /除外：えび/);
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
    await defaultChicken.waitFor();
    assert.match(await defaultChicken.innerText(), /確認対象：特定原材料（9品目）/);
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
