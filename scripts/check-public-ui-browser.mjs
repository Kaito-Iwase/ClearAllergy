// Public UI adversarial regression. Fictional loopback fixture only; no DB/auth/Blob writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { observeUIErrors } from "./ui-error-observer.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = new URL(process.env.CLEARALLERGY_BROWSER_BASE_URL || "http://localhost:3101");
assert.ok(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname), "UI regression requires a fictional loopback fixture");
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || join(tmpdir(), "clearallergy-public-ui");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
let groups = 0;
const fontChecks = { normal: [], fallback: [] };
const errorChecks = [];
let completed = false;
const pass = name => { groups++; console.log(`CHECK: ${name}`); };
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
    const normalErrors = await observeUIErrors(context, { label: "normal" });
    errorChecks.push(normalErrors.report);
    page = await context.newPage();
    const fontInspector = await context.newCDPSession(page);
    await fontInspector.send("DOM.enable");
    await fontInspector.send("CSS.enable");
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
    // The redundant top badge was removed; verify the primary registration rows exactly.
    const chickenPrimaryRows = defaultChicken.getByRole("group", { name: "店舗が登録したアレルゲン", exact: true }).first().locator("dl > div");
    assert.deepEqual(await chickenPrimaryRows.evaluateAll(rows => rows.map(row => [
        row.querySelector("dt").textContent,
        row.querySelector("dd").textContent.replace(/\s+/g, ""),
    ])), [["含む", "卵（1品目）"], ["含む可能性あり・要確認", "小麦・乳（2品目）"]]);
    const chickenOther = defaultChicken.getByRole("group", { name: "その他のアレルゲン", exact: true });
    const chickenOtherRows = chickenOther.locator("dl > div");
    assert.match(await chickenOtherRows.filter({ has: page.locator("dt", { hasText: /^含む$/ }) }).innerText(), /大豆・鶏肉\s*（2品目）/);
    assert.match(await chickenOtherRows.filter({ has: page.locator("dt", { hasText: "含む可能性あり・要確認" }) }).innerText(), /ごま\s*（1品目）/);
    // Check the primary counts separately from the other group, so all-29 aggregation cannot pass.
    const primaryText = await defaultChicken.evaluate(card => card.innerText.split("その他のアレルゲン")[0]);
    assert.match(primaryText, /含む\s+卵\s*（1品目）/);
    assert.match(primaryText, /含む可能性あり・要確認\s+小麦・乳\s*（2品目）/);
    const defaultPancake = menuArea.getByRole("link").filter({ has: page.getByRole("heading", { name: "米粉パンケーキ", exact: true }) });
    assert.equal(await defaultPancake.getByRole("group", { name: "店舗が登録したアレルゲン", exact: true }).first().innerText(),
        "確認対象は原材料に含まないと登録されています。食品安全の保証ではありません。");
    assert.match(await defaultPancake.getByRole("group", { name: "その他のアレルゲン", exact: true }).innerText(), /含む\s+大豆\s*（1品目）/);
    pass("Unselected cards classify specified ingredients separately; other CONTAINS/MAY_CONTAIN facts remain visible");

    const normalText = new Map();
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
                    const loadedFaces = await visible(page.locator("main h1")).evaluate(async heading => {
                        document.querySelectorAll("[data-ui-font-heading]").forEach(node => node.removeAttribute("data-ui-font-heading"));
                        heading.setAttribute("data-ui-font-heading", "");
                        const style = getComputedStyle(heading);
                        // Load the primary app font, not every optional OS fallback in the CSS stack.
                        const family = style.fontFamily.split(",")[0].trim();
                        const faces = await document.fonts.load(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${family}`, heading.textContent ?? "");
                        await document.fonts.ready;
                        await new Promise(requestAnimationFrame);
                        return faces.map(face => ({ family: face.family.replace(/["']/g, ""), status: face.status }));
                    });
                    assert.ok(loadedFaces.length > 0 && loadedFaces.every(face => /^Noto[ _]Sans[ _]JP$/i.test(face.family) && face.status === "loaded"), "Primary Japanese web-font faces must load for the actual heading text");
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
            fontChecks.normal.push({ width, route, renderedFonts });
            normalText.set(`${width}:${route}`, await visible(page.locator("main")).textContent());
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

    // Exercise optional OS fallback separately, without requiring a specific installed font.
    const normalPage = page;
    const fallbackContext = await browser.newContext();
    let blockedFonts = 0;
    await fallbackContext.route("**/*", route => {
        if (route.request().resourceType() === "font") { blockedFonts++; return route.abort(); }
        return new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort();
    });
    const fallbackErrors = await observeUIErrors(fallbackContext, { label: "font-fallback" });
    errorChecks.push(fallbackErrors.report);
    page = await fallbackContext.newPage();
    const fallbackInspector = await fallbackContext.newCDPSession(page);
    await fallbackInspector.send("DOM.enable");
    await fallbackInspector.send("CSS.enable");
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const zoom of [1, 2]) {
            for (const route of ["/", "/shops", shopHref, menuHref, "/terms"]) {
                await page.goto(new URL(route, base).href);
                const heading = visible(page.locator("main h1"));
                await heading.waitFor();
                await page.evaluate(async scale => {
                    document.documentElement.style.zoom = String(scale);
                    await document.fonts.ready;
                    await new Promise(requestAnimationFrame);
                }, zoom);
                assert.equal(await visible(page.locator("main")).count(), 1);
                assert.equal(await visible(page.locator("main")).textContent(), normalText.get(`${width}:${route}`), "Font failure must retain the full main text");
                const glyphs = await heading.evaluate(element => {
                    element.setAttribute("data-ui-fallback-heading", "");
                    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                    let japanese = 0;
                    let visibleGlyphs = true;
                    while (walker.nextNode()) {
                        const node = walker.currentNode;
                        for (let i = 0; i < node.textContent.length; i++) {
                            if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(node.textContent[i])) continue;
                            japanese++;
                            const range = document.createRange();
                            range.setStart(node, i); range.setEnd(node, i + 1);
                            const box = range.getBoundingClientRect();
                            visibleGlyphs &&= box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= innerWidth + 1;
                        }
                    }
                    return { japanese, visibleGlyphs };
                });
                assert.ok(glyphs.japanese > 0 && glyphs.visibleGlyphs, "Fallback Japanese characters must have visible in-width glyph boxes");
                const { root } = await fallbackInspector.send("DOM.getDocument");
                const { nodeId } = await fallbackInspector.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-ui-fallback-heading]" });
                const { fonts } = await fallbackInspector.send("CSS.getPlatformFontsForNode", { nodeId });
                assert.ok(fonts.length > 0 && fonts.every(font => !font.isCustomFont && font.glyphCount > 0), "Blocked web fonts must fall back to actual OS glyph rendering");
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px ${zoom}x fallback overflow: ${route}`);
                assert.equal(await visible(page.locator('header a[href="/"]')).first().innerText(), "ClearAllergy");
                fontChecks.fallback.push({ width, zoom, route, glyphs, renderedFonts: fonts });
                if (route === shopHref) await capture(`ui-font-fallback-${width}-${zoom}x`);
            }
        }
    }
    assert.ok(blockedFonts > 0, "Fallback regression must actually block font requests");
    await fallbackErrors.closeAndVerify();
    page = normalPage;
    pass("Blocked web fonts retain Japanese OS glyphs, complete text and layout at 390/1440px and 1x/2x CSS zoom");

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
    await visible(page.getByRole("checkbox", { name: /含む可能性があるものを除外・強調/ })).check();
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
    await visible(page.getByRole("checkbox", { name: /含む可能性があるものを除外・強調/ })).check();
    await apply();
    const pancake = menuArea.getByRole("link").filter({ has: page.getByRole("heading", { name: "米粉パンケーキ", exact: true }) });
    assert.match(await pancake.innerText(), /別メニューに含む/);
    assert.match(await menuArea.getByRole("region", { name: "店舗全体の登録情報", exact: true }).innerText(), /交差接触を確認した結果ではありません/);
    await pancake.press("Enter");
    await page.waitForURL(/\/menus\//);
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
    assert.match(await visible(page.locator("main")).innerText(), /別メニューに含む/);
    await capture("ui-04-store-supplement-desktop");
    pass("FREE with store supplement stays caution across keyboard detail navigation");

    await normalErrors.closeAndVerify();
    // A separate context prevents a 404 allowance from excusing normal-route errors.
    const notFoundUrl = new URL("/shops/ui-audit-does-not-exist", base).href;
    const recoveryContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await recoveryContext.route("**/*", route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    const recoveryErrors = await observeUIErrors(recoveryContext, { label: "404-recovery", notFoundUrl });
    errorChecks.push(recoveryErrors.report);
    page = await recoveryContext.newPage();
    page.setDefaultTimeout(20000);
    const notFoundResponse = await page.goto(notFoundUrl);
    const notFoundHtml = await notFoundResponse.text();
    writeFileSync(join(output, "not-found-response.html"), notFoundHtml, "utf8");
    recoveryErrors.confirmNotFoundResponse({ page, url: notFoundResponse.url(), status: notFoundResponse.status(), html: notFoundHtml });
    await page.getByRole("heading", { name: "ページが見つかりません", exact: true }).waitFor();
    await page.getByRole("link", { name: "店舗一覧を見る", exact: true }).click();
    await page.waitForURL(new URL("/shops", base).href);
    await visible(page.getByRole("heading", { name: "エリア・キーワードから店舗を探す", exact: true })).waitFor();
    await visible(page.locator('a[id^="shop-"]')).first().waitFor();
    const recovery = await recoveryErrors.closeAndVerify();
    console.log(`LIMITATION: streamed notFound recovery reported React #419 (${recovery.streamedNotFound419}); HTTP ${notFoundResponse.status()}. Other client exceptions: 0.`);
    pass("404 renders recovery link; digest-matched streamed notFound fallback accounted for through context closure");
    completed = true;
} catch (error) {
    console.error(error.stack);
    if (page) await capture("ui-failure").catch(() => {});
    process.exitCode = 1;
} finally {
    try {
        writeFileSync(join(output, "font-checks.json"), JSON.stringify(fontChecks, null, 2));
        writeFileSync(join(output, "client-error-checks.json"), JSON.stringify(errorChecks, null, 2));
    }
    finally { await browser.close(); }
}

if (completed) console.log(`Completed: ${groups} UI groups passed; all client error observations closed and verified`);
