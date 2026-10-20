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
writeFileSync(join(fixture, "entry.tsx"), `import React from 'react';import {createRoot} from 'react-dom/client';
import Shell from '@/components/layout/AdminDashboardShell';import Shop from '@/features/admin/shop/components/ShopEditClient';
import Menu from '@/features/admin/menus/components/MenuEditClient';import {ALLERGEN_MASTER} from '@/lib/constants/allergen-master';import {PROTOTYPE_NOTICE} from '@/lib/public-prototype';
const isShop=location.pathname==='/shop';const props={menuId:'fictional-menu',initialVersion:1,initialFoodVersion:1,initialReviewedFoodVersion:1,
initialName:'架空メニュー',initialDescription:'実食品の確認ではありません。',initialPriceYen:1000,initialCategory:'架空',initialIngredients:'架空材料',initialPrecaution:null,
initialImageUrl:null,initialImageFrame:'wide',initialImageFit:'cover',initialImagePosition:'center',initialImageZoom:100,initialImagePositionX:50,initialImagePositionY:50,
initialIsPublished:true,allergens:ALLERGEN_MASTER,initialStatusBySlug:Object.fromEntries(ALLERGEN_MASTER.map(a=>[a.slug,'FREE']))};
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
for (const file of readdirSync(join(root, "public/images"))) if (file.endsWith(".svg")) assets.set("/images/" + file, ["image/svg+xml", readFileSync(join(root, "public/images", file))]);
const media = join(root, ".next/static/media");
if (existsSync(media)) for (const file of readdirSync(media)) if (file.endsWith(".woff2")) {
    for (const prefix of ["/media/", "/_next/static/media/"]) assets.set(prefix + file, ["font/woff2", readFileSync(join(media, file))]);
}
function asset(path) { return ["/shop", "/menu"].includes(path) ? ["text/html", html] : assets.get(path); }
if (process.argv.includes("--serve")) {
    const server = createServer((req, res) => {
        const found = req.method === "GET" ? asset(new URL(req.url, "http://localhost").pathname) : null;
        res.writeHead(found ? 200 : 405, { "Content-Type": found?.[0] || "text/plain" }); res.end(found?.[1] || "Read-only fixture");
    });
    server.listen(0, "127.0.0.1", () => console.log(`READ_ONLY_FIXTURE http://127.0.0.1:${server.address().port}/shop`));
} else {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
    const browser = await chromium.launch({ headless: true });
    const origin = "https://deployed.example";
    const cases = [], measurements = [], errors = [], external = [];
    async function open(path, width = 390, respond) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        const writes = [];
        await context.route("**/*", async route => {
            const req = route.request(), url = new URL(req.url());
            if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
            if (req.method() !== "GET") {
                writes.push(req.postDataJSON());
                const reply = respond ? await respond(writes.at(-1), writes.length) : { status: 400, body: { error: "架空の保存先" } };
                return route.fulfill({ status: reply.status || 200, contentType: "application/json", body: JSON.stringify(reply.body) });
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
    const reply = (body, n, overrides = {}) => ({ menu: { id: "fictional-menu", version: n + 1, foodVersion: 1, reviewedFoodVersion: 1,
        isPublished: body.isPublished, imageUrl: body.imageUrl, foodReviews: [], ...overrides } });
    async function check(name, run) {
        try { await run(); cases.push({ name, passed: true }); console.log("PASS " + name); }
        catch (e) { cases.push({ name, passed: false, error: e.message }); console.error("FAIL " + name + ": " + e.message); }
    }
    try {
        await check("390/768/1536: form first, document scroll, supplements and footer clearance", async () => {
            for (const width of [390, 768, 1536]) {
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
                await f.page.locator("summary").filter({ hasText: /^店舗QRコード印刷$/ }).click();
                assert.equal(await f.page.getByRole("link", { name: "公開ページを開く", exact: true }).getAttribute("href"), origin + "/shops/fictional-shop");
                assert.equal((await f.page.locator(".qr-print-url").innerText()).trim(), origin + "/shops/fictional-shop");
                assert.equal(await f.page.locator(".qr-print-area svg").count(), 1);
                await f.page.screenshot({ path: join(output, "shop-qr-public-origin.png") });
            } finally { await f.context.close(); }
        });
        await check("integrated shop QR prints on one A4 page without form-height blanks", async () => {
            const f = await open("/shop", 390);
            try {
                await f.page.locator("summary").filter({ hasText: /^店舗QRコード印刷$/ }).click();
                await f.page.evaluate(() => { window.print = () => {}; });
                await f.page.getByRole("button", { name: "QRを印刷", exact: true }).click();
                assert.equal(await f.page.evaluate(() => document.body.classList.contains("printing-shop-qr")), true);
                await f.page.emulateMedia({ media: "print" });
                const pdf = await f.page.pdf({ path: join(output, "shop-integrated-qr-a4.pdf"), format: "A4", printBackground: true });
                const pages = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length || 0;
                measurements.push({ integratedQrPrintPages: pages });
                assert.equal(pages, 1, "Only the QR sheet should occupy paper");
                await f.page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
                assert.equal(await f.page.evaluate(() => document.body.classList.contains("printing-shop-qr")), false);
            } finally { await f.context.close(); }
        });
        await check("price-only plan and confirmed response are displayed separately", async () => {
            const f = await open("/menu", 1536, (body, n) => ({ body: { ...reply(body, n, { isPublished: false, reviewedFoodVersion: null }), publicRefreshPending: true } }));
            try {
                await f.page.getByLabel("価格（税込・円）", { exact: true }).fill("1200");
                assert.match(await f.page.getByRole("region", { name: "保存後の予定" }).innerText(), /保存後の予定：公開/);
                await f.page.getByRole("button", { name: "保存する", exact: true }).click();
                await f.page.getByText(/保存しました。公開状態：非公開/).waitFor();
                assert.equal(f.writes[0].isPublished, true);
                assert.match(await f.page.getByText(/保存しました。公開状態/).innerText(), /食品確認：再確認が必要/);
                assert.match(await f.page.getByText(/保存は完了しましたが/).innerText(), /再保存せず/);
                await f.page.screenshot({ path: join(output, "menu-response-confirmed-desktop.png") });
            } finally { await f.context.close(); }
        });
        await check("food change stops publication; new complete review can publish without stale dirty state", async () => {
            const f = await open("/menu", 390, (body, n) => ({ body: reply(body, n, { foodVersion: 2, reviewedFoodVersion: body.foodReview ? 2 : null }) }));
            try {
                await f.page.getByLabel("🧺 原材料名", { exact: true }).fill("変更した架空材料");
                const plan = f.page.getByRole("region", { name: "保存後の予定" });
                assert.match(await plan.innerText(), /保存後の予定：非公開/);
                assert.match(await plan.innerText(), /食品内容の変更/);
                await plan.screenshot({ path: join(output, "menu-food-change-mobile.png") });
                await f.page.getByRole("button", { name: "保存する", exact: true }).click();
                await f.page.getByText(/保存しました。公開状態：非公開/).waitFor();
                assert.equal(f.writes[0].isPublished, false);
                await f.page.getByLabel("今回の提供内容と原資料を照合した記録を保存する", { exact: true }).check();
                await f.page.getByLabel("根拠資料・製品識別・資料の版", { exact: true }).fill("架空資料の版2");
                await f.page.getByLabel("確認した提供内容・バリエーション・構成品・対象アレルゲンの範囲", { exact: true }).fill("架空の全提供内容");
                await f.page.getByLabel("食品根拠を確認した日時", { exact: true }).fill("2026-10-01T12:00");
                await f.page.getByRole("button", { name: "保存時に非公開にする", exact: true }).click();
                assert.match(await plan.innerText(), /保存後の予定：公開/);
                await f.page.getByRole("button", { name: "保存する", exact: true }).click();
                await f.page.getByText(/保存しました。公開状態：公開/).waitFor();
                assert.equal(f.writes[1].isPublished, true);
                assert.match(await plan.innerText(), /食品内容の変更はなく/);
                assert.equal(await f.page.getByText(/保存済みの公開設定/).innerText().then(s => s.includes("未保存")), false);
                await f.page.screenshot({ path: join(output, "menu-review-confirmed-mobile.png") });
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
