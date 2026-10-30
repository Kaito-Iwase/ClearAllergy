// Real React components + built CSS. All requests, including mutations, are
// intercepted fictional responses; this runner never connects to an app or DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { webpack } = require("next/dist/compiled/webpack/webpack");
const fixture = mkdtempSync(join(tmpdir(), "clearallergy-saved-publication-"));
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || fixture;
mkdirSync(output, { recursive: true });
writeFileSync(join(fixture, "loader.cjs"), `const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=function(s){return ts.transpileModule(s,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText};`);
writeFileSync(join(fixture, "navigation.ts"), "const router={push:href=>location.assign(href),refresh:()=>{}};export function useRouter(){return router}");
writeFileSync(join(fixture, "image.tsx"), "import React from 'react';export default function Image({fill,priority,sizes,src,...p}){return <img {...p} src='/image.svg'/>}");
writeFileSync(join(fixture, "entry.tsx"), `import React from 'react';import {createRoot} from 'react-dom/client';import Edit from '@/features/admin/menus/components/MenuEditClient';import New from '@/features/admin/menus/components/NewMenuForm';import {savedMenuEditorProps} from '@/features/admin/menus/saved-menu';const menu=window.__MENU__;createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl space-y-6 p-4"><h1 className="text-2xl font-bold">保存・公開の架空検証</h1>{location.pathname==='/new'?<New allergens={menu.allergens}/>:<Edit {...savedMenuEditorProps(menu)}/>}</main>);`);
const compiler = webpack({ mode: "production", target: "web", entry: join(fixture, "entry.tsx"), output: { path: fixture, filename: "bundle.js" }, optimization: { minimize: false },
    module: { rules: [{ test: /\.tsx?$/, use: join(fixture, "loader.cjs") }] },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "production" }) })],
    resolve: { extensions: [".tsx", ".ts", ".js"], modules: [join(root, "node_modules")], alias: { "@": root, "next/navigation": join(fixture, "navigation.ts"), "next/image": join(fixture, "image.tsx") } },
});
await new Promise((yes, no) => compiler.run((e, stats) => compiler.close(c => e || c || stats?.hasErrors() ? no(e || c || Error(stats.toString({ all: false, errors: true }))) : yes())));
const css = [".next/static/chunks", ".next/static/css"].map(p => join(root, p)).filter(existsSync).flatMap(p => readdirSync(p).filter(n => n.endsWith(".css")).map(n => readFileSync(join(p, n), "utf8"))).join("\n");
assert.ok(css.length, "Build this worktree first");
const { require: requireTS } = require("tsx/cjs/api");
const { ALLERGEN_MASTER } = requireTS("../lib/constants/allergen-master.ts", import.meta.url);
const origin = "https://publication-fixture.example";
const id = "cmmmmmmmm0000mmmmmmmmmmmm";
const base = { id, version: 30, foodVersion: 29, reviewedFoodVersion: null, publicationConfirmedFoodVersion: null, isPublished: false,
    name: "架空メニュー", description: "架空の説明", priceYen: 400, category: "架空", ingredients: "架空の材料", precaution: "架空の注意書き\n省略せず全文を表示します。",
    imageUrl: null, imageFrame: "square", imageFit: "cover", imagePosition: "center", imageZoom: 100, imagePositionX: 50, imagePositionY: 50,
    foodReviews: [], allergens: ALLERGEN_MASTER.map(a => ({ ...a, status: "FREE" })) };
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const cases = [], errors = [], external = [];
async function open({ width = 390, menu = {}, path = "/edit", intercept, acceptDialogs = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const f = { state: structuredClone({ ...base, ...menu }), writes: [], reads: 0, dialogs: [] };
    await context.route("**/*", async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
        if (url.pathname.startsWith("/api/")) {
            const method = req.method(), body = method === "GET" || url.pathname === "/api/admin/upload-menu-image" ? null : req.postDataJSON();
            if (method === "GET") f.reads++; else f.writes.push({ method, body, path: url.pathname });
            const overridden = intercept ? await intercept({ method, body, f, path: url.pathname }) : null;
            if (overridden?.abort) return route.abort();
            if (overridden) return route.fulfill({ status: overridden.status || 200, contentType: overridden.contentType || "application/json", body: overridden.rawBody ?? JSON.stringify(overridden.body) });
            if (method === "GET") return route.fulfill({ json: { menu: f.state } });
            if (method === "POST") {
                f.state = { ...f.state, ...body, allergens: f.state.allergens.map(a => ({ ...a, status: body.allergenStatusBySlug[a.slug] ?? "UNKNOWN" })) };
                return route.fulfill({ status: 201, json: { id } });
            }
            if (body.publicationAction) {
                assert.equal(body.expectedVersion, f.state.version);
                f.state.isPublished = true; f.state.publicationConfirmedFoodVersion = f.state.foodVersion;
            } else {
                f.state = { ...f.state, ...body, foodVersion: f.state.foodVersion + 1,
                    allergens: f.state.allergens.map(a => ({ ...a, status: body.allergenStatusBySlug[a.slug] ?? "UNKNOWN" })) };
            }
            f.state.version++;
            return route.fulfill({ json: { menu: f.state } });
        }
        if (["/new", "/edit"].includes(url.pathname)) return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script>window.__MENU__=${JSON.stringify(f.state)}</script><script src="/bundle.js"></script></body></html>` });
        if (url.pathname === "/bundle.js") return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(fixture, "bundle.js")) });
        if (url.pathname === "/style.css") return route.fulfill({ contentType: "text/css", body: css });
        if (url.pathname === "/image.svg") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="gray"/></svg>' });
        return route.fulfill({ status: 404, body: "Fixture asset not found" });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => { f.dialogs.push(d.type()); return acceptDialogs ? d.accept() : d.dismiss(); });
    await page.goto(origin + path); await page.getByRole("heading", { name: "保存・公開の架空検証" }).waitFor();
    return { ...f, page, context, get state() { return f.state; }, get reads() { return f.reads; } };
}
const panel = f => f.page.getByRole("region", { name: "保存しました", exact: true });
const save = f => f.page.getByRole("button", { name: "保存する", exact: true }).click();
async function check(name, run) { try { await run(); cases.push({ name, passed: true }); console.log("PASS " + name); } catch (e) { cases.push({ name, passed: false, error: e.message }); console.error("FAIL " + name + ": " + e.message); } }
try {
    await check("empty, invalid JSON, 500 or lost image upload response prevents menu creation and save", async () => {
        const failures = [
            { status: 500, body: { error: "fictional upload failure" } },
            { rawBody: "not-json" },
            { body: {} },
            { body: { url: "" } },
            { abort: true },
        ];
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
        for (const path of ["/new", "/edit"]) for (const failure of failures) {
            const f = await open({ path, intercept: ({ path: requestPath }) => requestPath === "/api/admin/upload-menu-image" ? failure : null });
            try {
                const prefix = path === "/new" ? "new" : "edit";
                const name = f.page.locator(`#${prefix}-menu-field-1`);
                await name.fill("Fictional upload draft");
                await f.page.locator(`#${prefix}-menu-field-7`).setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: png });
                if (path === "/new") await f.page.locator("form").evaluate(form => form.requestSubmit());
                else await save(f);
                await f.page.getByRole("alert").waitFor();
                assert.deepEqual(f.writes.map(write => write.path), ["/api/admin/upload-menu-image"]);
                assert.equal(await name.inputValue(), "Fictional upload draft");
                assert.equal(await f.page.locator(`#${prefix}-menu-field-7`).evaluate(input => input.files.length), 1);
                assert.equal(await panel(f).count(), 0);
                assert.equal(f.state.version, base.version);
                assert.equal(f.state.isPublished, false);
            } finally { await f.context.close(); }
        }
    });
    await check("valid image upload reaches the separate menu write", async () => {
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
        const uploaded = "https://fixture.public.blob.vercel-storage.com/menu-images/fixture/photo.png";
        for (const path of ["/new", "/edit"]) {
            const f = await open({ path, intercept: ({ path: requestPath }) => requestPath === "/api/admin/upload-menu-image" ? { body: { url: uploaded } } : null });
            try {
                const prefix = path === "/new" ? "new" : "edit";
                await f.page.locator(`#${prefix}-menu-field-1`).fill("Fictional upload control");
                await f.page.locator(`#${prefix}-menu-field-7`).setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: png });
                if (path === "/new") await f.page.locator("form").evaluate(form => form.requestSubmit());
                else await save(f);
                await panel(f).waitFor();
                assert.equal(f.writes.length, 2);
                assert.equal(f.writes[0].path, "/api/admin/upload-menu-image");
                assert.equal(f.writes[1].path, path === "/new" ? "/api/admin/menus" : `/api/admin/menus/${id}`);
                assert.equal(f.writes[1].body.imageUrl, uploaded);
            } finally { await f.context.close(); }
        }
    });
    await check("cancelling STOP preserves unsaved input without a request", async () => {
        const f = await open({ menu: { isPublished: true, publicationConfirmedFoodVersion: 29 } });
        try {
            const description = f.page.getByLabel("説明", { exact: true });
            await description.fill("取り消し後も保持する入力");
            await f.page.getByRole("button", { name: "公開を停止する", exact: true }).click();
            assert.deepEqual(f.dialogs, ["confirm"]); assert.equal(f.writes.length, 0);
            assert.equal(f.state.isPublished, true); assert.equal(await description.inputValue(), "取り消し後も保持する入力");
        } finally { await f.context.close(); }
    });
    await check("STOP saved with pending public refresh does not claim public propagation", async () => {
        const f = await open({ menu: { isPublished: true, publicationConfirmedFoodVersion: 29 }, acceptDialogs: true,
            intercept: ({ method, path, f }) => {
                if (method === "POST" && path === `/api/admin/menus/${id}/stop`) {
                    f.state.isPublished = false; f.state.version++;
                    return { body: { ok: true, menu: { id, isPublished: false, version: f.state.version }, publicRefreshPending: true } };
                }
                return null;
            } });
        try {
            await f.page.getByRole("button", { name: "公開を停止する", exact: true }).click();
            await f.page.getByText("公開停止を保存しましたが、公開表示の更新処理が未完了です。", { exact: true }).waitFor();
            assert.equal(f.state.isPublished, false); assert.equal(f.writes.length, 1);
            assert.equal(f.writes[0].path, `/api/admin/menus/${id}/stop`);
        } finally { await f.context.close(); }
    });
    await check("STOP keeps dirty input and its old revision; a stale save cannot overwrite the stopped menu", async () => {
        const f = await open({ menu: { isPublished: true, publicationConfirmedFoodVersion: 29 }, acceptDialogs: true,
            intercept: ({ method, path, f }) => {
                if (method === "POST" && path === `/api/admin/menus/${id}/stop`) {
                    f.state.isPublished = false; f.state.version++;
                    return { body: { ok: true, menu: { id, isPublished: false, version: f.state.version } } };
                }
                if (method === "PUT") return { status: 409, body: { error: "別の変更が保存されています。入力を保持したまま、最新内容を確認してください。" } };
                return null;
            } });
        try {
            const description = f.page.getByLabel("説明", { exact: true });
            await description.fill("未保存の架空説明");
            await f.page.getByRole("button", { name: "公開を停止する", exact: true }).click();
            await f.page.getByText("公開停止を保存しました。編集を続ける前に最新内容を確認してください。", { exact: true }).waitFor();
            assert.deepEqual(f.dialogs, ["confirm"]);
            assert.equal(f.writes.length, 1); assert.equal(f.writes[0].path, `/api/admin/menus/${id}/stop`);
            assert.equal(f.writes[0].body, null); assert.equal(f.state.isPublished, false);
            assert.equal(await description.inputValue(), "未保存の架空説明");
            await save(f);
            await f.page.getByRole("alert").getByText(/別の変更が保存されています/).waitFor();
            assert.equal(f.writes.length, 2); assert.equal(f.writes[1].method, "PUT");
            assert.equal(f.writes[1].body.expectedVersion, 30);
            assert.equal(f.state.version, 31); assert.equal(f.state.description, base.description);
            assert.equal(await description.inputValue(), "未保存の架空説明");
        } finally { await f.context.close(); }
    });
    await check("STOP response loss after a simulated commit remains unknown and never repeats the write", async () => {
        const f = await open({ menu: { isPublished: true, publicationConfirmedFoodVersion: 29 }, acceptDialogs: true,
            intercept: ({ method, path, f }) => {
                if (method === "POST" && path === `/api/admin/menus/${id}/stop`) {
                    f.state.isPublished = false; f.state.version++;
                    return { abort: true };
                }
                return null;
            } });
        try {
            const description = f.page.getByLabel("説明", { exact: true });
            await description.fill("保持する未保存入力");
            await f.page.getByRole("button", { name: "公開を停止する", exact: true }).click();
            await f.page.getByRole("alert").getByText("公開停止の結果を確認できません。最新の公開状態を確認してください。", { exact: true }).waitFor();
            assert.equal(f.state.isPublished, false); assert.equal(f.state.version, 31);
            assert.equal(f.writes.length, 1); assert.equal(f.writes[0].path, `/api/admin/menus/${id}/stop`);
            assert.equal(await description.inputValue(), "保持する未保存入力");
            assert.equal(await f.page.getByText(/公開停止を保存しました/).count(), 0);
        } finally { await f.context.close(); }
    });
    await check("STOP error or invalid success response never displays confirmed success", async () => {
        for (const response of [{ status: 500, body: { error: "架空の停止エラー" } }, { body: { ok: false } }]) {
            const f = await open({ menu: { isPublished: true, publicationConfirmedFoodVersion: 29 }, acceptDialogs: true,
                intercept: ({ method, path }) => method === "POST" && path === `/api/admin/menus/${id}/stop` ? response : null });
            try {
                const description = f.page.getByLabel("説明", { exact: true });
                await description.fill("エラー後も保持する入力");
                await f.page.getByRole("button", { name: "公開を停止する", exact: true }).click();
                await f.page.getByRole("alert").waitFor();
                assert.equal(f.writes.length, 1); assert.equal(f.writes[0].path, `/api/admin/menus/${id}/stop`);
                assert.equal(await f.page.getByText(/公開停止を保存しました/).count(), 0);
                assert.equal(await description.inputValue(), "エラー後も保持する入力");
            } finally { await f.context.close(); }
        }
    });
    await check("blank names and negative prices never submit; zero and empty prices remain distinct", async () => {
        for (const price of ["0", ""]) {
            const f = await open();
            try {
                await f.page.getByLabel("メニュー名", { exact: true }).fill(" ");
                await save(f); await f.page.getByRole("alert").getByText("メニュー名は必須です。", { exact: true }).waitFor();
                assert.equal(f.writes.length, 0);
                await f.page.getByLabel("メニュー名", { exact: true }).fill("境界値の架空メニュー");
                await f.page.getByLabel("価格（税込・円）", { exact: true }).fill("-1");
                await save(f); await f.page.getByRole("alert").waitFor();
                assert.equal(f.writes.length, 0);
                await f.page.getByLabel("価格（税込・円）", { exact: true }).fill(price);
                await save(f); await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).waitFor();
                assert.equal(f.writes.length, 1); assert.equal(f.writes[0].body.priceYen, price === "0" ? 0 : null);
            } finally { await f.context.close(); }
        }
    });
    await check("saved snapshot, explicit publish, no native dialog, no forced navigation, duplicate-click protection", async () => {
        const f = await open({ intercept: async ({ method }) => { if (method === "PUT") await new Promise(r => setTimeout(r, 80)); } });
        try {
            await f.page.getByLabel("🧺 原材料名", { exact: true }).fill("変更した架空材料");
            await f.page.getByRole("group", { name: "くるみ", exact: true }).getByRole("button", { name: "含む", exact: true }).click();
            await f.page.getByRole("group", { name: "小麦", exact: true }).getByRole("button", { name: "含む可能性あり・要確認", exact: true }).click();
            await f.page.getByRole("button", { name: "保存する", exact: true }).evaluate(b => { b.click(); b.click(); });
            await panel(f).getByText("この内容で公開しますか？", { exact: true }).waitFor();
            assert.match(await panel(f).innerText(), /くるみ/); assert.match(await panel(f).innerText(), /小麦/);
            assert.ok((await panel(f).innerText()).includes(base.precaution));
            assert.equal(f.writes.length, 1); assert.equal(f.page.url(), origin + "/edit");
            assert.equal(await f.page.getByLabel("メニュー名", { exact: true }).isDisabled(), true);
            await panel(f).screenshot({ path: join(output, "saved-publication-default-390.png") });
            await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).evaluate(b => { b.click(); b.click(); });
            await f.page.getByText("保存済み内容を公開しました。", { exact: true }).waitFor();
            assert.deepEqual(f.writes[1].body, { expectedVersion: 31, publicationAction: "publish" });
            assert.equal(f.writes.length, 2); assert.deepEqual(f.dialogs, []);
        } finally { await f.context.close(); }
    });
    await check("保存 / close / Escape finish already-saved private content without extra writes; edit returns focus", async () => {
        for (const action of ["保存", "公開の確認を閉じる", "Escape", "内容を修正"]) {
            const f = await open();
            try {
                await save(f); await panel(f).getByText("この内容で公開しますか？").waitFor();
                assert.match(await panel(f).innerText(), /公開せずに保存します/);
                if (action === "Escape") { await panel(f).getByRole("heading").focus(); await f.page.keyboard.press("Escape"); }
                else await panel(f).getByRole("button", { name: action, exact: true }).click();
                await panel(f).waitFor({ state: "detached" });
                assert.equal(f.writes.length, 1); assert.equal(f.state.isPublished, false);
                if (action === "内容を修正") assert.equal(await f.page.getByLabel("メニュー名", { exact: true }).evaluate(e => e === document.activeElement), true);
            } finally { await f.context.close(); }
        }
    });
    await check("save failure retains input and never claims successful save", async () => {
        const f = await open({ intercept: ({ method }) => method === "PUT" ? { status: 500, body: { error: "架空の保存失敗" } } : null });
        try { await f.page.getByLabel("メニュー名", { exact: true }).fill("保持する名前"); await save(f); await f.page.getByRole("alert").waitFor(); assert.equal(await panel(f).count(), 0); assert.equal(await f.page.getByLabel("メニュー名", { exact: true }).inputValue(), "保持する名前"); }
        finally { await f.context.close(); }
    });
    await check("HTML save/publish failures keep the operation guidance and input, without showing proxy markup", async () => {
        for (const action of ["save", "publish"]) {
            const f = await open({ intercept: ({ method, body }) => method === "PUT" && (action === "save" || body?.publicationAction)
                ? { status: 502, contentType: "text/html; charset=utf-8", rawBody: "<HTML><BODY>proxy-error-marker</BODY></HTML>" } : null });
            try {
                await f.page.getByLabel("メニュー名", { exact: true }).fill("障害時に保持する架空入力");
                await save(f);
                if (action === "publish") await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).click();
                const alert = action === "publish" ? panel(f).getByRole("alert") : f.page.getByRole("alert");
                await alert.waitFor();
                assert.doesNotMatch(await alert.innerText(), /proxy-error-marker|<HTML>/);
                assert.match(await alert.innerText(), action === "publish" ? /公開結果を確認できません。保存済み内容は保持されています/ : /保存/);
                assert.equal(await f.page.getByLabel("メニュー名", { exact: true }).inputValue(), "障害時に保持する架空入力");
                assert.equal(f.state.isPublished, false);
                assert.equal(f.writes.length, action === "publish" ? 2 : 1);
                if (action === "save") assert.equal(await panel(f).count(), 0);
            } finally { await f.context.close(); }
        }
    });
    await check("publish error retains saved snapshot; retry uses same saved version without saving again", async () => {
        let failures = 1;
        const f = await open({ intercept: ({ body }) => body?.publicationAction && failures-- > 0 ? { status: 500, body: {} } : null });
        try { await save(f); await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).click(); await panel(f).getByRole("alert").waitFor(); assert.match(await panel(f).getByRole("alert").innerText(), /公開結果を確認できません。保存済み内容は保持されています/); assert.equal(f.state.isPublished, false);
            await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).click(); await f.page.getByText("保存済み内容を公開しました。", { exact: true }).waitFor();
            assert.equal(f.writes.length, 3); assert.deepEqual(f.writes[1].body, f.writes[2].body);
        } finally { await f.context.close(); }
    });
    await check("concurrent publish 409 disables stale confirmation; auth/eligibility failures do not publish", async () => {
        for (const status of [400, 401, 403, 409]) {
            const f = await open({ intercept: ({ body }) => body?.publicationAction ? { status, body: { error: `架空の公開拒否 ${status}` } } : null });
            try { await save(f); await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).click(); await panel(f).getByRole("alert").waitFor(); assert.equal(f.state.isPublished, false); assert.equal(f.writes.length, 2); if (status === 409) assert.equal(await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).count(), 0); }
            finally { await f.context.close(); }
        }
    });
    await check("GET mismatch / malformed / forbidden / disconnect never permit publication; retry only reads", async () => {
        for (const problem of ["id", "version", "foodVersion", "malformed", "forbidden", "network"]) {
            const f = await open({ intercept: ({ method, f }) => method !== "GET" ? null : problem === "network" ? { abort: true } : problem === "forbidden" ? { status: 403, body: { error: "架空の読取拒否" } } : { body: { menu: problem === "malformed" ? {} : { ...f.state, [problem]: problem === "id" ? "other-menu" : 999 } } } });
            try { await save(f); await panel(f).getByRole("alert").waitFor(); assert.equal(await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).count(), 0); await panel(f).getByRole("button", { name: "保存済み内容を再確認する", exact: true }).click(); await panel(f).getByRole("alert").waitFor(); assert.equal(f.writes.length, 1); assert.equal(f.reads, 2); }
            finally { await f.context.close(); }
        }
    });
    await check("one/multiple/all UNKNOWN are privately saved, named and counted; correction requires a new save", async () => {
        for (const count of [1, 3, ALLERGEN_MASTER.length]) {
            const allergens = base.allergens.map((a, i) => ({ ...a, status: i < count ? "UNKNOWN" : "FREE" }));
            const f = await open({ menu: { allergens } });
            try { await save(f); await panel(f).getByText(`未設定が${count}品目あるため公開できません。`, { exact: true }).waitFor(); assert.equal(await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).count(), 0);
                for (const a of allergens.slice(0, count)) assert.ok((await panel(f).innerText()).includes(a.nameJa));
                await panel(f).getByRole("button", { name: "未設定項目を入力する", exact: true }).click();
                const first = f.page.getByRole("group", { name: allergens[0].nameJa, exact: true });
                assert.equal(await first.getByRole("button", { name: "未設定", exact: true }).evaluate(e => e === document.activeElement), true);
                for (const a of allergens.slice(0, count)) await f.page.getByRole("group", { name: a.nameJa, exact: true }).getByRole("button", { name: "原材料に含まない登録", exact: true }).click();
                assert.equal(await panel(f).count(), 0); await save(f); await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).waitFor(); assert.equal(f.writes.length, 2);
            } finally { await f.context.close(); }
        }
    });
    await check("MAY_CONTAIN remains visible and publishable; unresolved issue remains blocked", async () => {
        const f = await open({ menu: { allergens: base.allergens.map(a => ({ ...a, status: "MAY_CONTAIN" })) } });
        try { await save(f); await panel(f).getByRole("button", { name: "この内容で公開", exact: true }).waitFor(); assert.equal(await panel(f).getByText(/未設定が/).count(), 0); }
        finally { await f.context.close(); }
        const issue = { id: "issue", foodVersion: 29, evidenceRefs: "架空資料", scope: "架空対象", checkedAt: "2026-10-01T00:00:00Z", recordedAt: "2026-10-01T00:00:00Z", unresolvedIssues: "保持する未解決", contentSnapshot: {} };
        const g = await open({ menu: { foodReviews: [issue] } });
        try { await save(g); await panel(g).getByText("保存済みの未解決事項があるため公開できません。", { exact: true }).waitFor(); assert.equal(await panel(g).getByRole("button", { name: "この内容で公開", exact: true }).count(), 0); }
        finally { await g.context.close(); }
    });
    await check("new POST is not duplicated after GET failure; same page correction updates acknowledged ID via PUT", async () => {
        let failures = 1;
        const f = await open({ path: "/new", intercept: ({ method }) => method === "GET" && failures-- > 0 ? { status: 500, body: { error: "架空の読込失敗" } } : null });
        try { await f.page.getByLabel("メニュー名", { exact: true }).fill("新しい架空メニュー"); await f.page.getByRole("button", { name: "メニューを登録する", exact: true }).click();
            await f.page.getByRole("alert").waitFor(); await f.page.getByRole("button", { name: "保存済み内容を再確認する", exact: true }).click();
            await panel(f).getByText(`未設定が${ALLERGEN_MASTER.length}品目あるため公開できません。`, { exact: true }).waitFor();
            assert.equal(f.writes.length, 1); assert.equal(f.writes[0].method, "POST"); assert.equal(f.page.url(), origin + "/new");
            await panel(f).getByRole("button", { name: "内容を修正", exact: true }).click(); await f.page.getByLabel("メニュー名", { exact: true }).fill("修正した架空メニュー"); await save(f);
            await panel(f).getByText("修正した架空メニュー", { exact: true }).waitFor(); assert.equal(f.writes[1].method, "PUT"); assert.equal(f.writes.length, 2);
        } finally { await f.context.close(); }
    });
    await check("a legitimately still-public save is not called private or forced through confirmation", async () => {
        const f = await open({ menu: { isPublished: true, publicationConfirmedFoodVersion: 29 }, intercept: ({ method, body, f }) => {
            if (method !== "PUT") return null;
            f.state = { ...f.state, ...body, version: 31 }; return { body: { menu: f.state } };
        } });
        try { await f.page.getByLabel("価格（税込・円）", { exact: true }).fill("450"); await save(f); await f.page.getByText(/保存しました。公開状態：公開/).waitFor(); assert.equal(await panel(f).count(), 0); assert.equal(f.reads, 0); assert.deepEqual(f.dialogs, []); }
        finally { await f.context.close(); }
    });
    await check("320/390/768/1536 responsive layout, keyboard entry/exit, all-state details and long notes", async () => {
        for (const width of [320, 390, 768, 1536]) {
            const f = await open({ width, menu: { name: "長い架空メニュー名".repeat(10), precaution: "架空の長い注意です。".repeat(100), allergens: base.allergens.map((a, i) => ({ ...a, status: ["CONTAINS", "FREE", "MAY_CONTAIN"][i % 3] })) } });
            try { await save(f); const heading = panel(f).getByRole("heading", { name: "保存しました", exact: true }); await heading.waitFor();
                await panel(f).getByText(/その他の登録内容/).focus(); await f.page.keyboard.press("Enter"); await panel(f).getByText(/原材料に含まない登録/).first().waitFor();
                assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
                await f.page.screenshot({ path: join(output, `saved-publication-${width}.png`), fullPage: true });
                await heading.focus(); await f.page.keyboard.press("Tab"); assert.equal(await panel(f).getByRole("button", { name: "公開の確認を閉じる", exact: true }).evaluate(e => e === document.activeElement), true);
                await f.page.keyboard.press("Escape"); await panel(f).waitFor({ state: "detached" }); assert.equal(f.writes.length, 1);
            } finally { await f.context.close(); }
        }
    });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
} finally {
    const version = browser.version(); await browser.close();
    writeFileSync(join(output, "saved-publication-browser-result.json"), JSON.stringify({ recordedAt: new Date().toISOString(), browser: version,
        scope: "Real components and built CSS; fictional intercepted API only. No DB, auth, Blob, production writes or user browser.", cases, errors, external }, null, 2));
}
console.log(`${cases.filter(c => c.passed).length}/${cases.length} groups passed; output ${output}`);
if (cases.some(c => !c.passed)) process.exitCode = 1;
