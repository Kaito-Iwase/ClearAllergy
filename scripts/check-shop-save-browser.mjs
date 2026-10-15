// Real ShopEditClient + React in Chromium, with fictional props and intercepted
// loopback API replies. No app server, DB, Clerk, Google or Blob is contacted.
// Build the app first for its real CSS. Next link/image/navigation are adapters;
// routing, upload persistence and public-cache propagation are outside this test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptSha256 = createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex");
const require = createRequire(join(root, "package.json"));
const { webpack } = require("next/dist/compiled/webpack/webpack");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const fixture = mkdtempSync(join(tmpdir(), "clearallergy-shop-save-"));
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || fixture;
mkdirSync(output, { recursive: true });
const assetRoot = resolve(process.env.CLEARALLERGY_BROWSER_ASSET_ROOT || root);
const cssDirectories = [join(assetRoot, ".next/static/chunks"), join(assetRoot, ".next/static/css")].filter(existsSync);
assert.ok(cssDirectories.length, "Build the app first, or explicitly point CLEARALLERGY_BROWSER_ASSET_ROOT at an existing build for RED only.");
const css = cssDirectories.flatMap(directory => readdirSync(directory).filter(name => name.endsWith(".css")).map(name => readFileSync(join(directory, name), "utf8"))).join("\n");
assert.ok(css.length, "Built CSS is required for viewport and focus checks.");

const initialUpdatedAt = "2026-10-15T00:00:00.000Z";
const nextUpdatedAt = "2026-10-15T00:00:00.001Z";
const laterUpdatedAt = "2026-10-15T00:00:00.002Z";
const shopId = "fictional-shop";
const uploadedImageUrl = `https://fictional.public.blob.vercel-storage.com/shops/${shopId}/cover-browser.png`;
const initialShop = {
    id: shopId, name: "架空店舗・保存回帰専用", description: "実店舗・実食品の情報ではありません。",
    address: "架空住所", prefecture: "", city: null, nearestStation: null, category: null,
    latitude: null, longitude: null, googlePlaceId: null, hours: "11:00–15:00", regularHoliday: null,
    phoneNumber: "000-0000-0000", note: "変更前の架空備考", averageBudgetYen: 1000,
    coverImageUrl: null, coverImageFrame: "wide", coverImageFit: "cover", coverImagePosition: "center",
    coverImageZoom: 100, coverImagePositionX: 50, coverImagePositionY: 50,
    updatedAt: initialUpdatedAt, publishedMenuCount: 0,
};
const clientPath = join(root, "features/admin/shop/components/ShopEditClient.tsx");
const clientSha256 = createHash("sha256").update(readFileSync(clientPath)).digest("hex");
writeFileSync(join(fixture, "loader.cjs"), "const ts=require(" + JSON.stringify(require.resolve("typescript")) + ");module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;};", "utf8");
writeFileSync(join(fixture, "link.tsx"), "import React from 'react';export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}", "utf8");
// Remote image URLs stay visible in the real input but render as local fixture pixels.
writeFileSync(join(fixture, "image.tsx"), "import React from 'react';export default function Image({fill,priority,src,...props}){return <img {...props} src={typeof src==='string'&&src.startsWith('blob:')?src:'/image.svg'}/>}", "utf8");
writeFileSync(join(fixture, "navigation.ts"), "const router={push:href=>location.assign(href),replace:href=>location.replace(href),refresh:()=>{}};export function useRouter(){return router}export function useSearchParams(){return new URLSearchParams(location.search)}", "utf8");
writeFileSync(join(fixture, "entry.tsx"), [
    "import React from 'react';import {createRoot} from 'react-dom/client';import ShopEditClient from '@/features/admin/shop/components/ShopEditClient';",
    `const shop=${JSON.stringify(initialShop)};`,
    "createRoot(document.getElementById('root')).render(<><a id='fixture-navigation' href='/leave'>架空の離脱先</a><ShopEditClient initialShop={shop}/></>);",
].join("\n"), "utf8");
const compiler = webpack({
    mode: "production", target: "web", entry: join(fixture, "entry.tsx"),
    output: { path: fixture, filename: "bundle.js" }, optimization: { minimize: false },
    module: { rules: [{ test: /\.tsx?$/, use: join(fixture, "loader.cjs") }] },
    plugins: [new webpack.DefinePlugin({ "process.env": `(${JSON.stringify({ NODE_ENV: "production" })})` })],
    resolve: { extensions: [".tsx", ".ts", ".js"], modules: [join(root, "node_modules")], alias: {
        "@": root, "next/link": join(fixture, "link.tsx"), "next/image": join(fixture, "image.tsx"), "next/navigation": join(fixture, "navigation.ts"),
    } },
});
await new Promise((resolveBuild, reject) => compiler.run((error, stats) => compiler.close(closeError => {
    if (error || closeError || stats?.hasErrors()) reject(error || closeError || new Error(stats.toString({ all: false, errors: true })));
    else resolveBuild();
})));
assert.equal(createHash("sha256").update(readFileSync(clientPath)).digest("hex"), clientSha256, "Client changed during fixture compilation; rerun after edits settle.");
const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="padding:12px"><main style="max-width:1400px;margin:auto"><div id="root"></div></main><script src="/bundle.js"></script></body></html>';
const assets = new Map([
    ["/style.css", ["text/css", css]], ["/bundle.js", ["text/javascript", readFileSync(join(fixture, "bundle.js"))]],
    ["/image.svg", ["image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="lightgreen"/></svg>']],
]);
const media = join(assetRoot, ".next/static/media");
if (existsSync(media)) for (const name of readdirSync(media)) if (name.endsWith(".woff2")) {
    for (const prefix of ["/media/", "/_next/static/media/"]) assets.set(prefix + name, ["font/woff2", readFileSync(join(media, name))]);
}
let unexpectedServerWrites = 0;
const server = createServer((request, response) => {
    if (request.method !== "GET") unexpectedServerWrites++;
    const path = new URL(request.url, "http://localhost").pathname;
    const asset = assets.get(path) || (["/", "/leave", "/admin/shop"].includes(path) ? ["text/html", html] : null);
    response.writeHead(asset ? 200 : 404, { "Content-Type": asset?.[0] || "text/plain" });
    response.end(asset?.[1] || "Not found");
});

const measurements = [];
const cases = [];
const pageErrors = [];
const blockedExternal = [];
let browser;
let base;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1kAAAAASUVORK5CYII=", "base64");
function shopReply(body, updatedAt = nextUpdatedAt) {
    const shop = { ...initialShop, ...body, updatedAt };
    delete shop.expectedUpdatedAt;
    delete shop.publishedMenuCount;
    for (const key of ["description", "address", "prefecture", "city", "nearestStation", "category", "hours", "regularHoliday", "phoneNumber", "note", "coverImageUrl"]) if (shop[key] === "") shop[key] = null;
    shop.averageBudgetYen = shop.averageBudgetYen === "" ? null : Number(shop.averageBudgetYen);
    return { shop };
}
async function check(name, run) {
    try { await run(); cases.push({ name, passed: true }); console.log("PASS: " + name); }
    catch (error) { cases.push({ name, passed: false, error: error.message }); console.error("FAIL: " + name + ": " + error.message); }
}
async function openFixture(width = 390, respond = () => ({ status: 409, json: { error: "架空の保存競合" } }), upload = async () => {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const writes = [];
    let uploads = 0;
    await context.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== base) { blockedExternal.push(url.origin); return route.abort(); }
        if (url.pathname === "/api/admin/upload-shop-image" && request.method() === "POST") {
            uploads++;
            const reply = await upload(uploads);
            if (reply?.abort) return route.abort("failed");
            if (reply) return route.fulfill(reply);
            return route.fulfill({ status: 200, json: { url: uploadedImageUrl } });
        }
        if (url.pathname === "/api/admin/shop" && request.method() === "PUT") {
            const body = request.postDataJSON();
            writes.push(body);
            const reply = await respond(body, writes.length);
            if (reply.abort) return route.abort("failed");
            return route.fulfill(reply);
        }
        if (request.method() !== "GET") throw new Error("Unexpected fixture write");
        return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(base);
    await page.locator("#shop-name").waitFor();
    const save = () => page.locator("form").getByRole("button", { name: "変更を保存", exact: true });
    const note = page.locator("#shop-note");
    async function edit(withFile = false) {
        await note.fill("保存前に保持する架空の訂正");
        if (withFile) await page.locator("#shop-cover-image-file").setInputFiles({ name: "fictional-cover.png", mimeType: "image/png", buffer: png });
    }
    async function submit() {
        await save().click();
        await save().waitFor();
        await page.waitForFunction(() => !document.querySelector("form fieldset").disabled);
    }
    return { context, page, note, save, edit, submit, writes, uploads: () => uploads };
}
async function assertInputPreserved(fixtureState, { unknown = false } = {}) {
    const { page, note } = fixtureState;
    assert.equal(await note.inputValue(), "保存前に保持する架空の訂正");
    assert.equal(await page.getByRole("status").filter({ hasText: "未保存の変更があります。" }).count(), 1, "Unsaved baseline must remain");
    assert.doesNotMatch(await page.locator("form").innerText(), /店舗情報を保存しました/);
    if (unknown) assert.match(await page.getByRole("alert").innerText(), /保存結果.*確認でき|結果.*不明/);
    let confirmations = 0;
    const dismiss = async dialog => { confirmations++; await dialog.dismiss(); };
    page.on("dialog", dismiss);
    await page.locator("#fixture-navigation").click();
    page.off("dialog", dismiss);
    assert.equal(confirmations, 1, "Actual unsaved hook must still guard navigation");
    assert.equal(new URL(page.url()).pathname, "/");
}
async function assertSaveButtonsLocked(page) {
    const buttons = page.getByRole("button", { name: /^(保存する|変更を保存)$/ });
    assert.ok(await buttons.count(), "Fixture must contain actual save buttons");
    assert.equal(await buttons.evaluateAll(nodes => nodes.every(node => node.disabled)), true, "Every save button must block blind retries");
}

try {
    await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const malformed = [
        ["empty body", () => ({ status: 200, contentType: "application/json", body: "" })],
        ["empty object", () => ({ status: 200, json: {} })],
        ["wrong shop", body => ({ status: 200, json: { shop: { ...shopReply(body).shop, id: "another-fictional-shop" } } })],
        ["missing field", body => { const reply = shopReply(body); delete reply.shop.description; return { status: 200, json: reply }; }],
        ["unchanged timestamp", body => ({ status: 200, json: shopReply(body, initialUpdatedAt) })],
        ["invalid timestamp", body => ({ status: 200, json: shopReply(body, "invalid") })],
        ["invalid pending flag", body => ({ status: 200, json: { ...shopReply(body), publicRefreshPending: "true" } })],
    ];
    for (const [name, reply] of malformed) await check(`Malformed 200 (${name}) preserves draft and selected image preview while blocking blind retry`, async () => {
        const f = await openFixture(390, (body, attempt) => attempt === 1 ? reply(body) : { status: 409, json: { error: "架空の保存競合" } });
        try {
            await f.edit(true); await f.submit();
            await f.page.screenshot({ path: join(output, `shop-save-malformed-${name.replaceAll(" ", "-")}.png`), fullPage: true });
            await assertInputPreserved(f, { unknown: true });
            assert.ok(await f.page.locator('img[src^="blob:"]').count(), "Unconfirmed save must keep the selected File preview");
            await assertSaveButtonsLocked(f.page);
            await f.page.locator("form").evaluate(form => form.requestSubmit());
            assert.equal(f.uploads(), 1, "Unconfirmed save must not upload again blindly");
            assert.equal(f.writes.length, 1, "Unconfirmed save must not resend blindly");
            assert.equal(f.writes[0].expectedUpdatedAt, initialUpdatedAt);
        } finally { await f.context.close(); }
    });
    for (const status of [409, 428]) await check(`${status} keeps typed inputs and exposes a separate latest-content tab`, async () => {
        const f = await openFixture(390, () => ({ status, json: { error: "架空の保存競合。入力を保持したまま最新内容を確認してください。" } }));
        try {
            await f.edit(true); await f.submit(); await assertInputPreserved(f);
            const latest = f.page.getByRole("link", { name: /最新.*別タブ/ });
            assert.equal(await latest.count(), 1);
            assert.equal(await latest.getAttribute("target"), "_blank");
            assert.match(await latest.getAttribute("rel"), /noopener/);
            assert.equal(new URL(await latest.getAttribute("href"), base).pathname, "/admin/shop");
            await latest.focus(); await f.page.keyboard.press("Shift+Tab"); await f.page.keyboard.press("Tab");
            assert.equal(await latest.evaluate(node => node === document.activeElement && node.matches(":focus-visible")), true);
            const popupPromise = f.page.waitForEvent("popup");
            await f.page.keyboard.press("Enter");
            const popup = await popupPromise; await popup.waitForLoadState();
            assert.equal(new URL(popup.url()).pathname, "/admin/shop");
            assert.equal(await f.note.inputValue(), "保存前に保持する架空の訂正");
            await popup.close();
            assert.ok(await f.page.locator('img[src^="blob:"]').count(), "Conflict must retain selected File preview");
            await assertSaveButtonsLocked(f.page);
            await f.page.locator("form").evaluate(form => form.requestSubmit());
            assert.equal(f.uploads(), 1);
            assert.equal(f.writes.length, 1);
            assert.equal(f.writes[0].expectedUpdatedAt, initialUpdatedAt);
            await f.page.screenshot({ path: join(output, `shop-save-${status}-mobile.png`), fullPage: true });
        } finally { await f.context.close(); }
    });
    for (const kind of ["network", "500"]) await check(`${kind} cannot claim a failed DB commit and retains the draft`, async () => {
        const f = await openFixture(390, () => kind === "network" ? { abort: true } : { status: 500, json: { error: "架空の一般化した障害" } });
        try {
            await f.edit(true); await f.submit(); await assertInputPreserved(f, { unknown: true });
            await assertSaveButtonsLocked(f.page);
            assert.ok(await f.page.locator('img[src^="blob:"]').count());
        }
        finally { await f.context.close(); }
    });
    await check("Known 400 validation rejection retains inputs and permits a corrected submission", async () => {
        const f = await openFixture(390, (body, attempt) => attempt === 1
            ? { status: 400, json: { error: "架空の入力検証エラー" } }
            : { status: 200, json: shopReply(body) });
        try {
            await f.edit(); await f.submit(); await assertInputPreserved(f);
            assert.equal(await f.save().isEnabled(), true);
            await f.page.locator("#shop-phone-number").fill("000-9999-9999"); await f.submit();
            assert.equal(f.writes.length, 2);
            assert.equal(f.writes[1].expectedUpdatedAt, initialUpdatedAt);
            assert.match(await f.page.getByRole("status").innerText(), /店舗情報を保存しました/);
        } finally { await f.context.close(); }
    });
    await check("Upload failure makes no shop PUT and keeps the File for an explicit retry", async () => {
        const f = await openFixture(390, body => ({ status: 200, json: shopReply(body) }),
            attempt => attempt === 1 ? { status: 500, json: { error: "架空の画像送信失敗" } } : undefined);
        try {
            await f.edit(true); await f.submit();
            await assertInputPreserved(f);
            assert.match(await f.page.getByRole("alert").innerText(), /店舗情報の保存は要求していません/);
            assert.equal(f.writes.length, 0);
            assert.equal(await f.save().isEnabled(), true);
            await f.submit();
            assert.equal(f.uploads(), 2);
            assert.equal(f.writes.length, 1);
            assert.equal(f.writes[0].expectedUpdatedAt, initialUpdatedAt);
            assert.match(await f.page.getByRole("status").innerText(), /店舗情報を保存しました/);
        } finally { await f.context.close(); }
    });
    await check("Validated success advances token and clears selected File only after confirmation", async () => {
        const f = await openFixture(1440, (body, attempt) => ({ status: 200, json: shopReply(body, attempt === 1 ? nextUpdatedAt : laterUpdatedAt) }));
        try {
            await f.edit(true); await f.submit();
            assert.match(await f.page.getByRole("status").innerText(), /店舗情報を保存しました/);
            assert.equal(await f.page.getByRole("status").filter({ hasText: "未保存の変更" }).count(), 0);
            assert.equal(f.writes[0].expectedUpdatedAt, initialUpdatedAt);
            await f.page.locator("#shop-phone-number").fill("000-9999-9999"); await f.submit();
            assert.equal(f.writes[1].expectedUpdatedAt, nextUpdatedAt);
            assert.equal(f.uploads(), 1, "Confirmed File must not upload again on a later edit");
            assert.equal(await f.page.getByRole("status").filter({ hasText: "未保存の変更" }).count(), 0);
            await f.page.screenshot({ path: join(output, "shop-save-confirmed-desktop.png"), fullPage: true });
        } finally { await f.context.close(); }
    });
    await check("Post-commit public refresh pending is saved with a pending notice", async () => {
        const f = await openFixture(390, body => ({ status: 200, json: { ...shopReply(body), publicRefreshPending: true } }));
        try {
            await f.edit(); await f.submit();
            assert.equal(await f.page.getByRole("alert").count(), 0);
            assert.match(await f.page.getByRole("status").innerText(), /保存.*(?:公開.*反映|反映.*待)/);
            assert.equal(await f.page.getByRole("status").filter({ hasText: "未保存の変更" }).count(), 0);
            await f.page.screenshot({ path: join(output, "shop-save-refresh-pending-mobile.png"), fullPage: true });
        } finally { await f.context.close(); }
    });
    await check("All fieldsets remain disabled while PUT is pending; keyboard cannot double-submit", async () => {
        let release;
        const pending = new Promise(resolveReply => { release = resolveReply; });
        const f = await openFixture(390, async body => { await pending; return { status: 200, json: shopReply(body) }; });
        try {
            await f.edit(); await f.save().click();
            await f.page.waitForFunction(() => document.querySelector("form fieldset").disabled);
            assert.equal(await f.page.locator("input:not(:disabled),textarea:not(:disabled),select:not(:disabled)").count(), 0);
            assert.equal(await f.page.locator("fieldset").evaluateAll(nodes => nodes.every(node => node.disabled)), true);
            await f.page.keyboard.press("Enter");
            await f.page.locator("form").evaluate(form => form.requestSubmit());
            assert.equal(f.writes.length, 1);
            release(); await f.page.waitForFunction(() => !document.querySelector("form fieldset").disabled);
            assert.match(await f.page.getByRole("status").innerText(), /店舗情報を保存しました/);
        } finally { release(); await f.context.close(); }
    });
    await check("Image upload keeps all fieldsets busy through the following PUT", async () => {
        let release;
        const pending = new Promise(resolveUpload => { release = resolveUpload; });
        const f = await openFixture(390, body => ({ status: 200, json: shopReply(body) }), () => pending);
        try {
            await f.edit(true); await f.save().click();
            await f.page.waitForFunction(() => document.querySelector("form fieldset").disabled);
            assert.equal(await f.page.locator("input:not(:disabled),textarea:not(:disabled),select:not(:disabled)").count(), 0);
            assert.equal(await f.page.locator("fieldset").evaluateAll(nodes => nodes.every(node => node.disabled)), true);
            assert.equal(f.writes.length, 0);
            await f.page.locator("form").evaluate(form => form.requestSubmit());
            assert.equal(f.uploads(), 1);
            release(); await f.page.waitForFunction(() => !document.querySelector("form fieldset").disabled);
            assert.equal(f.writes.length, 1);
            assert.match(await f.page.getByRole("status").innerText(), /店舗情報を保存しました/);
        } finally { release(); await f.context.close(); }
    });
    await check("390/1440px preserve form layout, associated labels and visible keyboard focus", async () => {
        const f = await openFixture();
        try {
            for (const width of [390, 1440]) {
                await f.page.setViewportSize({ width, height: 1000 });
                const overflow = await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
                measurements.push({ width, overflow });
                assert.equal(overflow, false, `${width}px horizontal overflow`);
                const name = f.page.getByLabel("店舗名（必須）", { exact: true });
                await name.focus(); await f.page.keyboard.press("Tab");
                const description = f.page.getByLabel("お店の説明", { exact: true });
                assert.equal(await description.evaluate(node => node === document.activeElement && node.matches(":focus-visible")), true);
                assert.equal(await description.evaluate(node => { const css = getComputedStyle(node); return css.boxShadow !== "none" || (css.outlineStyle !== "none" && parseFloat(css.outlineWidth) > 0); }), true);
                await f.page.screenshot({ path: join(output, `shop-save-form-${width}.png`), fullPage: true });
            }
        } finally { await f.context.close(); }
    });
    assert.deepEqual(pageErrors, [], "React/browser runtime errors");
    assert.equal(unexpectedServerWrites, 0, "All writes must stay intercepted");
    assert.deepEqual(blockedExternal, [], "Fixture must not attempt external service calls");
} finally {
    await browser?.close();
    await new Promise(resolveClose => server.close(resolveClose));
    const result = {
        recordedAt: new Date().toISOString(), clientSha256, scriptSha256,
        cssSha256: createHash("sha256").update(css).digest("hex"), nodeVersion: process.version,
        browserVersion: browser?.version(),
        playwrightVersion: require((process.env.PLAYWRIGHT_MODULE_PATH || "playwright") + "/package.json").version,
        cssFromSameWorktree: assetRoot === root,
        scope: "Real ShopEditClient/React in Chromium; loopback intercepted replies; Next adapters; no app layout or external icon font; no DB/Clerk/Blob/public propagation or latest DB contents in the popup proved",
        cases, measurements, pageErrors, blockedExternal, unexpectedServerWrites,
    };
    writeFileSync(join(output, "shop-save-browser-result.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
}
const failures = cases.filter(test => !test.passed);
console.log(`Shop save browser: ${cases.length - failures.length}/${cases.length} groups passed.`);
if (failures.length) process.exitCode = 1;
