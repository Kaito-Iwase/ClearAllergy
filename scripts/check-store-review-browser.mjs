// Real store/menu components and dashboard shell; fictional props and intercepted
// responses only. No DB, Clerk, Blob, Vercel or external HTTP requests.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { require: requireTS } = require("tsx/cjs/api");
const { ALLERGEN_MASTER: fixtureMaster } = requireTS("../lib/constants/allergen-master.ts", import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const fixture = mkdtempSync(join(tmpdir(), "clearallergy-store-review-"));
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || fixture;
mkdirSync(output, { recursive: true });
const loader = "const ts=require(" + JSON.stringify(require.resolve("typescript")) + ");module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;};";
writeFileSync(join(fixture, "loader.cjs"), loader);
writeFileSync(join(fixture, "link.tsx"), "import React from 'react';export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}");
writeFileSync(join(fixture, "image.tsx"), "import React from 'react';export default function Image({fill,priority,sizes,src,...props}){return <img {...props} style={fill?{...props.style,position:'absolute',inset:0,width:'100%',height:'100%'}:props.style} src={typeof src==='string'&&src.startsWith('/images/')?src:'/fixture-image.svg'}/>}");
writeFileSync(join(fixture, "navigation.ts"), "const router={push:href=>location.assign(href),replace:href=>location.replace(href),refresh:()=>{}};export function useRouter(){return router}export function useSearchParams(){return new URLSearchParams(location.search)}");
writeFileSync(join(fixture, "logout.tsx"), "import React from 'react';export default function Logout(){return <button type='button'>ログアウト（架空）</button>}");
const shop = { id: "fictional-shop", name: "架空店舗・編集検証", description: "実店舗・実食品の情報ではありません。", address: "架空住所", prefecture: "", city: null,
    nearestStation: null, category: null, latitude: null, longitude: null, googlePlaceId: null,
    hours: "11:00–15:00", regularHoliday: null, phoneNumber: "000-0000-0000", note: "架空の備考", averageBudgetYen: 1000,
    coverImageUrl: "https://fictional.public.blob.vercel-storage.com/shops/fictional-shop/cover.png",
    coverImageFrame: "wide", coverImageFit: "cover", coverImagePosition: "center", coverImageZoom: 100, coverImagePositionX: 50, coverImagePositionY: 50,
    updatedAt: "2026-10-19T00:00:00.000Z", publishedMenuCount: 1 };
const issueFixture = { id: "fictional-issue", foodVersion: 1, evidenceRefs: "架空の以前の資料", scope: "架空の対象範囲",
    checkedAt: "2026-10-01T00:00:00.000Z", recordedAt: "2026-10-01T00:01:00.000Z", unresolvedIssues: "架空の未解決内容を確認する", contentSnapshot: {} };
writeFileSync(join(fixture, "entry.tsx"), `import React from 'react';import {createRoot} from 'react-dom/client';
import Shell from '@/components/layout/AdminDashboardShell';import Shop from '@/features/admin/shop/components/ShopEditClient';
import Menu from '@/features/admin/menus/components/MenuEditClient';import {ALLERGEN_MASTER} from '@/lib/constants/allergen-master';import {PROTOTYPE_NOTICE} from '@/lib/public-prototype';
const isShop=location.pathname==='/shop';const hasIssue=location.pathname==='/menu-issue';const props={menuId:'fictional-menu',initialVersion:1,initialFoodVersion:1,initialReviewedFoodVersion:1,initialPublicationConfirmedFoodVersion:hasIssue?null:1,
initialName:'架空メニュー',initialDescription:'実食品の確認ではありません。',initialPriceYen:1000,initialCategory:'架空',initialIngredients:'架空材料',initialPrecaution:null,
initialImageUrl:null,initialImageFrame:'wide',initialImageFit:'cover',initialImagePosition:'center',initialImageZoom:100,initialImagePositionX:50,initialImagePositionY:50,
initialIsPublished:!hasIssue,initialFoodReviews:hasIssue?[${JSON.stringify(issueFixture)}]:[],allergens:ALLERGEN_MASTER,initialStatusBySlug:Object.fromEntries(ALLERGEN_MASTER.map(a=>[a.slug,'FREE']))};
createRoot(document.getElementById('root')).render(<><aside aria-label="プロトタイプについて" className="mx-auto max-w-7xl px-4 pt-4"><p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{PROTOTYPE_NOTICE}</p></aside><Shell shopHref="/shop" menusHref="/menu"><div className="space-y-6"><h1 className="text-3xl font-extrabold">{isShop?'店舗情報編集':'メニュー編集'}</h1>{isShop?<Shop initialShop={${JSON.stringify(shop)}}/>:<Menu {...props}/>}</div></Shell></>);`);
const compiler = webpack({ mode: "production", target: "web", entry: join(fixture, "entry.tsx"),
    output: { path: fixture, filename: "bundle.js" }, optimization: { minimize: false },
    module: { rules: [{ test: /\.tsx?$/, use: join(fixture, "loader.cjs") }] },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "http://localhost:3000" }) })],
    resolve: { extensions: [".tsx", ".ts", ".js"], modules: [join(root, "node_modules")], alias: {
        "@/components/layout/AdminLogoutButton$": join(fixture, "logout.tsx"), "@": root,
        "next/link": join(fixture, "link.tsx"), "next/image": join(fixture, "image.tsx"), "next/navigation": join(fixture, "navigation.ts"),
    } },
});
await new Promise((yes, no) => compiler.run((error, stats) => compiler.close(closeError => {
    if (error || closeError || stats?.hasErrors()) no(error || closeError || new Error(stats.toString({ all: false, errors: true })));
    else yes();
})));
const directories = [".next/static/chunks", ".next/static/css"].map(p => join(root, p)).filter(existsSync);
const css = directories.flatMap(p => readdirSync(p).filter(n => n.endsWith(".css")).map(n => readFileSync(join(p, n), "utf8"))).join("\n");
assert.ok(css.length, "Build the same worktree first for its CSS.");
const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const assets = new Map([["/style.css", ["text/css", css]], ["/bundle.js", ["text/javascript", readFileSync(join(fixture, "bundle.js"))]],
    ["/fixture-image.svg", ["image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#cbded0"/><text x="100" y="400" font-size="60">Fictional photo</text></svg>']]]);
if (existsSync(join(output, "material-symbols.css")) && existsSync(join(output, "material-symbols.woff2"))) {
    assets.set("/style.css", ["text/css", css + "\n" + readFileSync(join(output, "material-symbols.css"), "utf8")]);
    assets.set("/material-symbols.woff2", ["font/woff2", readFileSync(join(output, "material-symbols.woff2"))]);
}
for (const file of readdirSync(join(root, "public/images"))) if (file.endsWith(".svg")) assets.set("/images/" + file, ["image/svg+xml", readFileSync(join(root, "public/images", file))]);
const media = join(root, ".next/static/media");
if (existsSync(media)) for (const file of readdirSync(media)) if (file.endsWith(".woff2")) {
    for (const prefix of ["/media/", "/_next/static/media/"]) assets.set(prefix + file, ["font/woff2", readFileSync(join(media, file))]);
}
function asset(path) { return ["/shop", "/menu", "/menu-issue"].includes(path) ? ["text/html", html] : assets.get(path); }
if (process.argv.includes("--serve")) {
    const server = createServer((req, res) => {
        const found = req.method === "GET" ? asset(new URL(req.url, "http://localhost").pathname) : null;
        res.writeHead(found ? 200 : 405, { "Content-Type": found?.[0] || "text/plain" }); res.end(found?.[1] || "Read-only fixture");
    });
    server.listen(0, "127.0.0.1", () => console.log(`READ_ONLY_FIXTURE http://127.0.0.1:${server.address().port}/shop`));
} else {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
    const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const origin = "https://deployed.example";
    const cases = [], measurements = [], errors = [], external = [];
    async function open(path, width = 390, respond) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        const writes = [];
        let savedMenu = { id: "fictional-menu", name: "架空メニュー", description: "実食品の確認ではありません。", priceYen: 1000, category: "架空", ingredients: "架空材料", precaution: null,
            imageUrl: null, imageFrame: "wide", imageFit: "cover", imagePosition: "center", imageZoom: 100, imagePositionX: 50, imagePositionY: 50,
            version: 1, foodVersion: 1, reviewedFoodVersion: 1, publicationConfirmedFoodVersion: path === "/menu-issue" ? null : 1,
            isPublished: path !== "/menu-issue", foodReviews: path === "/menu-issue" ? [issueFixture] : [],
            allergens: [] };
        await context.route("**/*", async route => {
            const req = route.request(), url = new URL(req.url());
            if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
            if (req.method() !== "GET") {
                writes.push(req.postDataJSON());
                const reply = respond ? await respond(writes.at(-1), writes.length) : { status: 400, body: { error: "架空の保存先" } };
                if (reply.body?.menu) {
                    const input = writes.at(-1);
                    savedMenu = { ...savedMenu, ...input, ...reply.body.menu,
                        allergens: (input.allergenStatusBySlug ? Object.entries(input.allergenStatusBySlug).map(([slug, status]) => ({ slug, status })) : savedMenu.allergens) };
                }
                return route.fulfill({ status: reply.status || 200, contentType: "application/json", body: JSON.stringify(reply.body) });
            }
            if (url.pathname === "/api/admin/menus/fictional-menu") {
                return route.fulfill({ json: { menu: { ...savedMenu, allergens: fixtureMaster.map(a => ({ ...a, status: savedMenu.allergens.find(s => s.slug === a.slug)?.status ?? "FREE" })) } } });
            }
            const found = asset(url.pathname);
            return route.fulfill({ status: found ? 200 : 404, contentType: found?.[0] || "text/plain", body: found?.[1] || "Not found" });
        });
        const page = await context.newPage();
        page.on("pageerror", e => errors.push(e.message));
        page.on("dialog", dialog => dialog.accept());
        await page.goto(origin + path);
        await page.getByRole("heading", { name: path === "/shop" ? "店舗情報編集" : "メニュー編集", exact: true }).waitFor();
        return { page, context, writes };
    }
    const reply = (body, n, overrides = {}) => ({ menu: { id: "fictional-menu", version: n + 1, foodVersion: 1, reviewedFoodVersion: 1, publicationConfirmedFoodVersion: 1,
        isPublished: body.publicationAction === "publish" || body.isPublished, imageUrl: body.imageUrl ?? null, foodReviews: [], ...overrides } });
    async function check(name, run) {
        try { await run(); cases.push({ name, passed: true }); console.log("PASS " + name); }
        catch (e) { cases.push({ name, passed: false, error: e.message }); console.error("FAIL " + name + ": " + e.message); }
    }
    try {
        await check("320/390/768/1536/1900: direct dialogs, keyboard focus, continuous canvas and footer clearance", async () => {
            for (const width of [320, 390, 768, 1536, 1900]) {
                const f = await open("/shop", width);
                try {
                    const position = await f.page.getByLabel("店舗名（必須）", { exact: true }).boundingBox();
                    assert.ok(position.y < 844, "Name must appear in first viewport");
                    const state = await f.page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
                        mainOverflow: getComputedStyle(document.querySelector("main")).overflowY }));
                    assert.equal(state.overflow, false); assert.equal(state.mainOverflow, "visible");
                    measurements.push({ width, nameY: position.y, ...state });
                    await f.page.screenshot({ path: join(output, `shop-form-${width}.png`) });
                    const editor = f.page.locator("details").filter({ has: f.page.locator("summary").filter({ hasText: /^店舗画像の見え方調整$/ }) }).first();
                    await editor.locator("summary").first().click();
                    await f.page.getByRole("img", { name: "店舗カバー画像プレビュー", exact: true }).waitFor();
                    await editor.locator("summary").first().click();
                    const preview = f.page.getByRole("button", { name: "公開プレビュー", exact: true });
                    await preview.focus(); await f.page.keyboard.press("Enter");
                    const dialog = f.page.getByRole("dialog");
                    await dialog.waitFor();
                    assert.match(await dialog.innerText(), /編集中・未保存/);
                    await f.page.keyboard.press("Escape");
                    assert.equal(await dialog.count(), 0);
                    assert.equal(await preview.evaluate(e => document.activeElement === e), true);
                    await f.page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
                    const background = await f.page.evaluate(() => ({ bottom: document.querySelector("main").getBoundingClientRect().bottom, height: innerHeight, body: getComputedStyle(document.body).backgroundColor }));
                    assert.ok(background.bottom >= background.height - 1);
                    assert.equal(background.body, "rgb(246, 248, 246)");
                    await f.page.screenshot({ path: join(output, `shop-bottom-${width}.png`) });
                    await f.page.getByLabel("店舗名（必須）", { exact: true }).focus(); await f.page.keyboard.press("Tab");
                    assert.equal(await f.page.getByLabel("お店の説明", { exact: true }).evaluate(e => e === document.activeElement && e.matches(":focus-visible")), true);
                    const save = f.page.getByRole("button", { name: "変更を保存", exact: true }).first();
                    await save.scrollIntoViewIfNeeded();
                    const box = await save.boundingBox();
                    const nav = await f.page.locator("nav.fixed").boundingBox();
                    if (nav) assert.ok(box.y + box.height <= nav.y + 1, "Bottom navigation must not cover the save action");
                } finally { await f.context.close(); }
            }
        });
        await check("public origin with stale localhost: displayed URL, link and QR agree", async () => {
            const f = await open("/shop", 1536);
            try {
                await f.page.getByRole("button", { name: "店舗QRコード印刷", exact: true }).click();
                assert.equal(await f.page.getByRole("link", { name: "公開ページを開く", exact: true }).getAttribute("href"), origin + "/shops/fictional-shop");
                assert.equal((await f.page.locator(".qr-print-url").innerText()).trim(), origin + "/shops/fictional-shop");
                assert.equal(await f.page.locator(".qr-print-area svg").count(), 1);
                await f.page.screenshot({ path: join(output, "shop-qr-public-origin.png") });
            } finally { await f.context.close(); }
        });
        await check("integrated shop QR prints on one A4 page without form-height blanks", async () => {
            const f = await open("/shop", 390);
            try {
                await f.page.getByRole("button", { name: "店舗QRコード印刷", exact: true }).click();
                await f.page.evaluate(() => { window.print = () => {}; });
                await f.page.getByRole("button", { name: "QRを印刷", exact: true }).click();
                assert.equal(await f.page.evaluate(() => document.body.classList.contains("printing-shop-qr")), true);
                await f.page.emulateMedia({ media: "print" });
                await f.page.screenshot({ path: join(output, "shop-qr-print-media.png"), fullPage: true });
                const pdf = await f.page.pdf({ path: join(output, "shop-integrated-qr-a4.pdf"), format: "A4", printBackground: true });
                const pages = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length || 0;
                measurements.push({ integratedQrPrintPages: pages });
                assert.equal(pages, 1, "Only the QR sheet should occupy paper");
                await f.page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
                assert.equal(await f.page.evaluate(() => document.body.classList.contains("printing-shop-qr")), false);
            } finally { await f.context.close(); }
        });
        await check("price-only plan and confirmed response are displayed separately", async () => {
            const f = await open("/menu", 1536, (body, n) => ({ body: { ...reply(body, n, { isPublished: false, reviewedFoodVersion: null, publicationConfirmedFoodVersion: null }), publicRefreshPending: true } }));
            try {
                await f.page.getByLabel("価格（税込・円）", { exact: true }).fill("1200");
                assert.match(await f.page.getByRole("region", { name: "保存後の予定" }).innerText(), /保存後の予定：公開/);
                await f.page.getByRole("button", { name: "保存する", exact: true }).click();
                await f.page.getByText(/保存しました。公開状態：非公開/).waitFor();
                assert.equal(f.writes[0].isPublished, true);
                assert.equal("foodChangeReported" in f.writes[0], false);
                assert.match(await f.page.getByText(/保存しました。公開状態/).innerText(), /公開操作：保存済み内容から別に公開が必要/);
                assert.match(await f.page.getByText(/保存は完了しましたが/).innerText(), /再保存せず/);
                await f.page.screenshot({ path: join(output, "menu-response-confirmed-desktop.png") });
            } finally { await f.context.close(); }
        });
        await check("food change saves unpublished; separate saved-version action publishes without evidence fields", async () => {
            const f = await open("/menu", 390, (body, n) => ({ body: reply(body, n, { foodVersion: 2, reviewedFoodVersion: null,
                publicationConfirmedFoodVersion: body.publicationAction === "publish" ? 2 : null,
                isPublished: body.publicationAction === "publish" }) }));
            try {
                assert.equal(await f.page.getByLabel("根拠資料・製品識別・資料の版", { exact: true }).count(), 0);
                assert.equal(await f.page.getByRole("checkbox", { name: /入力文字が同じでも/ }).count(), 0);
                await f.page.getByLabel("🧺 原材料名", { exact: true }).fill("変更した架空材料");
                const plan = f.page.getByRole("region", { name: "保存後の予定" });
                assert.match(await plan.innerText(), /保存後の予定：非公開/);
                assert.match(await plan.innerText(), /食品内容を変更すると非公開/);
                await plan.screenshot({ path: join(output, "menu-food-change-mobile.png") });
                await f.page.getByRole("button", { name: "保存する", exact: true }).click();
                await f.page.getByText(/保存しました。公開状態：非公開/).waitFor();
                assert.equal(f.writes[0].isPublished, false);
                assert.equal("foodChangeReported" in f.writes[0], false);
                const publish = f.page.getByRole("region", { name: "保存しました", exact: true }).getByRole("button", { name: "この内容で公開", exact: true });
                assert.equal(await publish.isEnabled(), true);
                await publish.click();
                await f.page.getByText(/保存しました。公開状態：公開/).waitFor();
                assert.deepEqual(f.writes[1], { expectedVersion: 2, publicationAction: "publish" });
                assert.equal(f.writes.some(body => "foodReview" in body), false);
                assert.equal(await f.page.getByText(/保存済みの公開設定/).innerText().then(s => s.includes("未保存")), false);
                assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                await f.page.screenshot({ path: join(output, "menu-two-step-published-mobile.png") });
            } finally { await f.context.close(); }
        });
        await check("manual food-change control is absent on mobile/desktop; real allergen changes still save unpublished", async () => {
            for (const width of [390, 1536]) {
                const f = await open("/menu", width, (body, n) => ({ body: reply(body, n, {
                    foodVersion: 2, reviewedFoodVersion: null, publicationConfirmedFoodVersion: null, isPublished: false,
                }) }));
                try {
                    assert.equal(await f.page.getByRole("checkbox", { name: /入力文字が同じでも/ }).count(), 0);
                    assert.equal(await f.page.getByText(/仕入れ仕様・代替使用・調理工程/).count(), 0);
                    const contains = f.page.getByRole("group", { name: "くるみ", exact: true }).getByRole("button", { name: "含む", exact: true });
                    await contains.focus(); await f.page.keyboard.press("Enter");
                    assert.equal(await contains.getAttribute("aria-pressed"), "true");
                    assert.match(await f.page.getByRole("region", { name: "保存後の予定" }).innerText(), /保存後の予定：非公開/);
                    assert.equal(await f.page.getByRole("button", { name: "公開する", exact: true }).count(), 0, "An already-public menu must save its edits before a new publication action");
                    await f.page.getByRole("button", { name: "保存する", exact: true }).click();
                    await f.page.getByText(/保存しました。公開状態：非公開/).waitFor();
                    assert.equal(f.writes[0].allergenStatusBySlug.walnut, "CONTAINS");
                    assert.equal(f.writes[0].isPublished, false);
                    assert.equal("foodChangeReported" in f.writes[0], false);
                    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                    await f.page.screenshot({ path: join(output, `menu-no-manual-change-${width}.png`) });
                } finally { await f.context.close(); }
            }
        });
        await check("shown issue resolves explicitly, preserves history, and publishes separately; food changes expire resolution", async () => {
            const resolvedHistory = [{ ...issueFixture, issueResolutions: [{ foodVersion: 1, resolvedAt: "2026-10-21T00:00:00.000Z" }] }];
            const f = await open("/menu-issue", 390, (body, n) => ({ body: reply(body, n, {
                foodVersion: n > 2 ? 2 : 1, reviewedFoodVersion: null,
                publicationConfirmedFoodVersion: body.publicationAction === "publish" ? 1 : null,
                isPublished: body.publicationAction === "publish", foodReviews: resolvedHistory,
            }) }));
            try {
                const publish = f.page.getByRole("button", { name: "公開する", exact: true });
                assert.equal(await publish.isDisabled(), true);
                const issue = f.page.getByRole("region", { name: "保存済みの未解決事項", exact: true });
                assert.match(await issue.innerText(), /架空の未解決内容を確認する/);
                assert.equal(await f.page.getByLabel("根拠資料・製品識別・資料の版", { exact: true }).count(), 0);
                await issue.getByRole("button", { name: "この内容は解消した", exact: true }).click();
                await f.page.getByText("未解決事項の解消を記録しました。保存済み内容を見直して、別に公開してください。", { exact: true }).waitFor();
                assert.deepEqual(f.writes, [{ expectedVersion: 1, foodIssueResolution: { foodReviewId: issueFixture.id, foodVersion: 1 } }]);
                assert.equal(await publish.isEnabled(), true);
                await f.page.screenshot({ path: join(output, "menu-explicit-resolution-mobile.png") });
                await publish.click();
                await f.page.getByRole("region", { name: "保存済み内容の確認", exact: true }).getByRole("button", { name: "この内容で公開", exact: true }).click();
                await f.page.getByText(/保存しました。公開状態：公開/).waitFor();
                assert.deepEqual(f.writes[1], { expectedVersion: 2, publicationAction: "publish" });
                assert.equal(resolvedHistory[0].unresolvedIssues, issueFixture.unresolvedIssues);
                assert.equal(resolvedHistory[0].checkedAt, issueFixture.checkedAt);
                await f.page.getByLabel("🧺 原材料名", { exact: true }).fill("次の架空の食品版");
                await f.page.getByRole("button", { name: "保存する", exact: true }).click();
                await f.page.getByText(/保存しました。公開状態：非公開/).waitFor();
                await f.page.getByRole("region", { name: "保存しました", exact: true }).getByRole("button", { name: "内容を修正", exact: true }).click();
                assert.equal(await publish.isDisabled(), true);
                assert.match(await issue.innerText(), /架空の未解決内容を確認する/);
                assert.equal(await issue.getByRole("button", { name: "この内容は解消した", exact: true }).isEnabled(), true);
                assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            } finally { await f.context.close(); }
        });
        await check("resolution conflict keeps the displayed issue and cannot enable publication", async () => {
            const f = await open("/menu-issue", 390, () => ({ status: 409, body: { error: "最新の保存内容を確認してください。" } }));
            try {
                await f.page.getByRole("button", { name: "この内容は解消した", exact: true }).click();
                await f.page.getByRole("alert").waitFor();
                assert.equal(await f.page.getByRole("button", { name: "公開する", exact: true }).isDisabled(), true);
                assert.match(await f.page.getByRole("region", { name: "保存済みの未解決事項" }).innerText(), /架空の未解決内容/);
                assert.equal(f.writes.length, 1);
            } finally { await f.context.close(); }
        });
        await check("conflict retains food edits and never shows a confirmed save", async () => {
            const f = await open("/menu", 390, () => ({ status: 409, body: { error: "架空の競合" } }));
            try {
                await f.page.getByLabel("🧺 原材料名", { exact: true }).fill("保持する架空材料");
                await f.page.getByRole("button", { name: "保存する", exact: true }).click();
                await f.page.getByRole("alert").waitFor();
                assert.equal(await f.page.getByLabel("🧺 原材料名", { exact: true }).inputValue(), "保持する架空材料");
                assert.equal(await f.page.getByText(/保存しました。公開状態/).count(), 0);
            } finally { await f.context.close(); }
        });
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
    } finally {
        await browser.close();
        writeFileSync(join(output, "store-review-browser-result.json"), JSON.stringify({ recordedAt: new Date().toISOString(), node: process.version, browser: browser.version(),
            scope: "Real UI and dashboard shell, same-worktree CSS; Next/auth/image adapters and intercepted responses. No DB, Clerk, Blob or deployment verification.", cases, measurements, errors, external }, null, 2));
    }
    if (cases.some(c => !c.passed)) process.exitCode = 1;
    console.log(`Store review: ${cases.filter(c => c.passed).length}/${cases.length} groups passed. Output: ${output}`);
}
